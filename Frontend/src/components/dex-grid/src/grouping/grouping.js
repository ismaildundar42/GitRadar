// Row grouping, aggregation and pivoting on top of the Community client-side row model.
//
// How it works: while grouping (or pivot mode) is active the grid holds every
// leaf row plus one synthetic row per group (data = { __dexGroup: meta,
// ...aggregated fields }). AG Grid filters and sorts that flat list as usual;
// postSortRows then rebuilds the display list depth-first from the group tree:
// leaves that passed the filters, the groups above them (even if a group row
// itself failed a filter), and only the children of expanded groups. Aggregates
// are computed there from the passing leaves only.
//
// Group nodes are ordinary rows: node.group is false, node.data.__dexGroup is
// set. Use api.isGroupNode(node) when iterating with forEachNode.
//
// Pivot mode shows group rows only (a grand-total row when there are no row
// groups) and replaces the user columns with generated pivot result columns,
// one per pivot key path and value column. Pivot result columns are generated
// from all rows, so filtering changes the values but not the column set.
//
// Options: groupDefaultExpanded, isGroupOpenByDefault, autoGroupColumnDef,
// rowGroupPanelShow ("always" | "onlyWhenGrouping" | "never"), aggFuncs,
// suppressAggFuncInHeader, suppressGroupChangesColumnVisibility, pivotMode,
// onColumnRowGroupChanged, onColumnValueChanged, onColumnPivotChanged,
// onColumnPivotModeChanged.
// colDef: rowGroup, rowGroupIndex, enableRowGroup, aggFunc, enableValue,
// allowedAggFuncs, defaultAggFunc, enablePivot, pivot, pivotIndex.

import { attachMethods } from "../core/api.js";
import { dexColDef } from "../core/colDefs.js";
import { buildTree, aggregate, flatten, allGroups, groupKey, pivotKeyPaths, aggregatePivot, PIVOT_KEY_SEP } from "./groupModel.js";
import { DexGroupCellRenderer } from "./groupCellRenderer.js";
import { renderGroupZones, renderGroupPanel } from "./groupZones.js";

// Not "ag-Grid-AutoColumn": AG Grid reserves that id and drops sorts applied to it.
export const AUTO_COL_ID = "dex-auto-group";
export const PIVOT_COL_PREFIX = "dexpivot_";
const ROOT_ID = "dex-group-root";

const OPTIONS = [
  "rowData",
  "groupDefaultExpanded",
  "isGroupOpenByDefault",
  "autoGroupColumnDef",
  "groupDisplayType",
  "rowGroupPanelShow",
  "aggFuncs",
  "suppressAggFuncInHeader",
  "suppressGroupChangesColumnVisibility",
  "pivotMode",
  "onColumnRowGroupChanged",
  "onColumnValueChanged",
  "onColumnPivotChanged",
  "onColumnPivotModeChanged",
];
const COLDEF_KEYS = ["rowGroup", "rowGroupIndex", "enableRowGroup", "aggFunc", "enableValue", "allowedAggFuncs", "defaultAggFunc", "enablePivot", "pivot", "pivotIndex", "initialRowGroup", "initialRowGroupIndex", "initialAggFunc", "initialPivot", "initialPivotIndex"];

// ----- data access ----------------------------------------------------------

export function readPath(data, field) {
  if (data == null || field == null) return undefined;
  if (!String(field).includes(".")) return data[field];
  return String(field).split(".").reduce((o, k) => (o == null ? undefined : o[k]), data);
}

function writePath(data, field, value) {
  const parts = String(field).split(".");
  let o = data;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] ??= {};
  o[parts[parts.length - 1]] = value;
}

function leafColDefs(defs, out = []) {
  for (const d of defs ?? []) {
    if (Array.isArray(d.children)) leafColDefs(d.children, out);
    else out.push(d);
  }
  return out;
}

function colIdOf(def) {
  return def.colId ?? def.field;
}

function plain(v) {
  return v !== null && typeof v === "object" && typeof v.toNumber === "function" ? v.toNumber() : v;
}

const isActive = (s) => s.groupCols.length > 0 || s.pivotMode;

// ----- feature --------------------------------------------------------------

export const groupingFeature = {
  name: "grouping",
  gridOptions: OPTIONS,
  colDefKeys: COLDEF_KEYS,

  prepare(options, ctx) {
    const s = (ctx.state.grouping = {
      leaves: ctx.options.rowData ?? [],
      groupCols: [],
      valueCols: new Map(),
      pivotCols: [],
      pivotMode: !!ctx.options.pivotMode,
      pivotPaths: [],
      expandState: new Map(),
      hiddenByUs: new Set(),
      groupData: new Map(),
      tree: null,
      lastPassing: new Set(),
      lastLeafOrder: new Map(),
      leafLevel: new WeakMap(),
    });
    initFromColDefs(s, ctx.userColumnDefs);
    if (s.pivotMode) ctx.state.columnDefsFrozen = true;

    const userGetRowId = options.getRowId;
    const autoIds = new WeakMap();
    let next = 0;
    s.getRowId = (p) => {
      const meta = p.data?.__dexGroup;
      if (meta) return meta.id;
      if (userGetRowId) return userGetRowId(p);
      if (!autoIds.has(p.data)) autoIds.set(p.data, `dex-${next++}`);
      return autoIds.get(p.data);
    };
    const userPostSort = options.postSortRows;
    const userRowClass = options.getRowClass;
    const userDblClick = options.onRowDoubleClicked;
    const userKeyDown = options.onCellKeyDown;
    const notGroup = (inner) => (node) => (node.data?.__dexGroup ? false : inner ? inner(node) : true);
    const out = {
      ...options,
      getRowId: s.getRowId,
      rowData: isActive(s) ? buildRowData(ctx) : s.leaves,
      postSortRows: (p) => {
        userPostSort?.(p);
        if (isActive(s)) rebuildDisplay(ctx, p);
      },
      getRowClass: (p) => {
        const own = userRowClass?.(p);
        const meta = p.data?.__dexGroup;
        if (!meta) return own;
        const cls = ["dex-group-row", `dex-group-level-${meta.level}`];
        return own ? [].concat(own, cls) : cls;
      },
      onRowDoubleClicked: (e) => {
        userDblClick?.(e);
        const meta = e.data?.__dexGroup;
        if (meta && !meta.noChildren && !e.event?.target?.closest?.(".dex-group-toggle")) e.api.setGroupExpanded(meta.id, !isExpanded(ctx, meta.group));
      },
      onCellKeyDown: (e) => {
        userKeyDown?.(e);
        const meta = e.data?.__dexGroup;
        if (meta && !meta.noChildren && e.event?.key === "Enter" && e.column?.getColId?.() === AUTO_COL_ID) e.api.setGroupExpanded(meta.id, !isExpanded(ctx, meta.group));
      },
      components: { dexGroupCellRenderer: DexGroupCellRenderer, ...options.components },
    };
    // With the rowSelection object API, isRowSelectable lives inside it and the
    // top-level option is deprecated; guard whichever the application uses.
    if (options.rowSelection && typeof options.rowSelection === "object") {
      out.rowSelection = {
        // Group rows are not selectable; hide their disabled checkboxes unless the app chose otherwise.
        hideDisabledCheckboxes: true,
        ...options.rowSelection,
        isRowSelectable: notGroup(options.rowSelection.isRowSelectable),
      };
    } else {
      out.isRowSelectable = notGroup(options.isRowSelectable);
    }
    return out;
  },

  transformColumnDefs(defs, ctx) {
    const s = ctx.state.grouping;
    if (!s) return defs;
    if (!isActive(s) && !s.valueCols.size && !s.restoringFromPivot) return defs;
    return transformDefs(ctx, defs);
  },

  attach(api, ctx) {
    const s = ctx.state.grouping;
    const raw = ctx.raw;
    const rawApply = api.applyTransaction.bind(api);
    const rawApplyAsync = api.applyTransactionAsync?.bind(api);
    const resolveIds = (cols) => (cols ?? []).map((c) => (typeof c === "string" ? c : c.getColId())).filter((id) => api.getColumn(id) || ctx.userColumnDefs && leafColDefs(ctx.userColumnDefs).some((d) => colIdOf(d) === id));

    /** Re-applies rows and columns after any grouping/pivot state change. */
    const apply = (wasActive) => {
      const nowActive = isActive(s);
      if (!wasActive && nowActive) s.leaves = collectLeaves(api);
      // Rows first: pivot result columns are derived from the pivot key paths.
      const rows = nowActive ? buildRowData(ctx) : s.leaves;
      ctx.refreshColumnDefs();
      raw.setGridOption("rowData", rows);
      ctx.emit("groupingChanged");
    };

    const setGroupCols = (ids, source = "api") => {
      const before = s.groupCols;
      if (before.length === ids.length && before.every((x, i) => x === ids[i])) return;
      const wasActive = isActive(s);
      s.groupCols = ids;
      if (!ctx.options.suppressGroupChangesColumnVisibility && !s.pivotMode) {
        const added = ids.filter((id) => !before.includes(id));
        const removed = before.filter((id) => !ids.includes(id));
        const toHide = added.filter((id) => api.getColumn(id)?.isVisible());
        toHide.forEach((id) => s.hiddenByUs.add(id));
        if (toHide.length) api.setColumnsVisible(toHide, false);
        const toShow = removed.filter((id) => s.hiddenByUs.delete(id));
        if (toShow.length) api.setColumnsVisible(toShow, true);
      }
      apply(wasActive);
      ctx.options.onColumnRowGroupChanged?.({ type: "columnRowGroupChanged", columns: ids.map((id) => api.getColumn(id)), source, api });
    };

    const setValueCols = (entries, source = "api") => {
      s.valueCols = new Map(entries);
      if (s.pivotMode) apply(true);
      else {
        ctx.refreshColumnDefs();
        if (isActive(s)) api.refreshClientSideRowModel("sort");
        ctx.emit("groupingChanged");
      }
      ctx.options.onColumnValueChanged?.({ type: "columnValueChanged", columns: [...s.valueCols.keys()].map((id) => api.getColumn(id)), source, api });
    };

    const setPivotCols = (ids, source = "api") => {
      s.pivotCols = ids;
      if (s.pivotMode) apply(true);
      else ctx.emit("groupingChanged");
      ctx.options.onColumnPivotChanged?.({ type: "columnPivotChanged", columns: ids.map((id) => api.getColumn(id)), source, api });
    };

    const setPivotMode = (on) => {
      on = !!on;
      if (s.pivotMode === on) return;
      const wasActive = isActive(s);
      if (on) {
        // Keep the user's columns (with their current state) to restore on exit.
        ctx.refreshColumnDefs.snapshot?.();
        ctx.state.columnDefsFrozen = true;
        s.pivotMode = true;
        ctx.options.pivotMode = true;
        apply(wasActive);
      } else {
        s.pivotMode = false;
        ctx.options.pivotMode = false;
        s.restoringFromPivot = true;
        try {
          apply(wasActive);
        } finally {
          s.restoringFromPivot = false;
          ctx.state.columnDefsFrozen = false;
        }
      }
      ctx.options.onColumnPivotModeChanged?.({ type: "columnPivotModeChanged", api });
    };
    s.setPivotMode = setPivotMode;

    const defaultAgg = (id) => {
      const d = dexColDef(api.getColumn(id));
      return d.defaultAggFunc ?? d.allowedAggFuncs?.[0] ?? "sum";
    };

    const refreshAll = () => {
      api.refreshClientSideRowModel("sort");
      const groupNodes = [];
      api.forEachNode((n) => n.data?.__dexGroup && groupNodes.push(n));
      if (groupNodes.length && api.getColumn(AUTO_COL_ID)) api.refreshCells({ rowNodes: groupNodes, columns: [AUTO_COL_ID], force: true });
    };

    const move = (list, fromIndex, toIndex) => {
      const ids = [...list];
      const [m] = ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, m);
      return ids;
    };

    attachMethods(api, {
      setRowGroupColumns: (cols) => setGroupCols(resolveIds(cols)),
      addRowGroupColumns: (cols) => setGroupCols([...s.groupCols, ...resolveIds(cols).filter((id) => !s.groupCols.includes(id))]),
      removeRowGroupColumns: (cols) => {
        const drop = new Set(resolveIds(cols));
        setGroupCols(s.groupCols.filter((id) => !drop.has(id)));
      },
      moveRowGroupColumn: (fromIndex, toIndex) => setGroupCols(move(s.groupCols, fromIndex, toIndex)),
      getRowGroupColumns: () => s.groupCols.map((id) => api.getColumn(id)).filter(Boolean),
      setValueColumns: (cols) => setValueCols(resolveIds(cols).map((id) => [id, s.valueCols.get(id) ?? defaultAgg(id)])),
      addValueColumns: (cols) => setValueCols([...s.valueCols, ...resolveIds(cols).filter((id) => !s.valueCols.has(id)).map((id) => [id, defaultAgg(id)])]),
      removeValueColumns: (cols) => {
        const drop = new Set(resolveIds(cols));
        setValueCols([...s.valueCols].filter(([id]) => !drop.has(id)));
      },
      getValueColumns: () => [...s.valueCols.keys()].map((id) => api.getColumn(id)).filter(Boolean),
      setColumnAggFunc: (col, aggFunc) => {
        const id = typeof col === "string" ? col : col.getColId();
        const entries = [...s.valueCols];
        const i = entries.findIndex(([k]) => k === id);
        if (aggFunc == null) {
          if (i >= 0) entries.splice(i, 1);
        } else if (i >= 0) entries[i] = [id, aggFunc];
        else entries.push([id, aggFunc]);
        setValueCols(entries);
      },
      getColumnAggFunc: (col) => s.valueCols.get(typeof col === "string" ? col : col.getColId()) ?? null,
      setPivotMode,
      isPivotMode: () => s.pivotMode,
      setPivotColumns: (cols) => setPivotCols(resolveIds(cols)),
      addPivotColumns: (cols) => setPivotCols([...s.pivotCols, ...resolveIds(cols).filter((id) => !s.pivotCols.includes(id))]),
      removePivotColumns: (cols) => {
        const drop = new Set(resolveIds(cols));
        setPivotCols(s.pivotCols.filter((id) => !drop.has(id)));
      },
      movePivotColumn: (fromIndex, toIndex) => setPivotCols(move(s.pivotCols, fromIndex, toIndex)),
      getPivotColumns: () => s.pivotCols.map((id) => api.getColumn(id)).filter(Boolean),
      getPivotResultColumns: () => (s.pivotMode ? api.getColumns().filter((c) => c.getColDef().context?.dexPivotResult) : null),
      isGroupNode: (node) => !!node?.data?.__dexGroup,
      setGroupExpanded: (nodeOrId, expanded) => {
        const id = typeof nodeOrId === "string" ? nodeOrId : nodeOrId?.data?.__dexGroup?.id;
        if (!id || !s.groupData.has(id)) return;
        s.expandState.set(id, !!expanded);
        refreshAll();
      },
      expandAll: () => {
        if (!s.tree) return;
        for (const g of allGroups(s.tree.root)) s.expandState.set(g.id, true);
        refreshAll();
      },
      collapseAll: () => {
        if (!s.tree) return;
        for (const g of allGroups(s.tree.root)) s.expandState.set(g.id, false);
        refreshAll();
      },
      /** Leaf data rows under a group (all of them, ignoring filters). */
      getGroupLeafData: (id) => (id === ROOT_ID ? s.leaves.slice() : s.tree?.groupsById.get(id)?.leafs.slice() ?? []),
      applyTransaction: (tx) => (isActive(s) ? applyGroupedTransaction(ctx, api, tx) : rawApply(tx)),
      applyTransactionAsync: (tx, callback) => {
        if (!isActive(s)) return rawApplyAsync ? rawApplyAsync(tx, callback) : callback?.(rawApply(tx));
        setTimeout(() => callback?.(applyGroupedTransaction(ctx, api, tx)));
      },
    });

    ctx.state.isGrouped = () => s.groupCols.length > 0;
    ctx.state.exportNodes = () => (isActive(s) ? exportNodes(ctx, api) : null);
    ctx.state.outlineLevel = (node) => {
      if (!isActive(s)) return 0;
      const meta = node.data?.__dexGroup;
      return meta ? meta.level : s.leafLevel.get(node.data) ?? s.groupCols.length;
    };
    ctx.state.columnsPanelSections ??= [];
    ctx.state.columnsPanelSections.push((a, c, params) => renderGroupZones(a, c, params));
    ctx.on("userColumnDefsChanged", (defs) => {
      initFromColDefs(s, defs, true);
    });
    if (ctx.state.mainEl) {
      const bar = document.createElement("div");
      bar.className = "dex-group-panel";
      ctx.state.mainEl.insertBefore(bar, ctx.state.mainEl.firstChild);
      s.panelEl = bar;
      const paint = () => renderGroupPanel(api, ctx, bar);
      ctx.on("groupingChanged", paint);
      paint();
    }
    // The columns panel rendered before this feature's section existed.
    ctx.emit("groupingChanged");
  },

  onOptionChanged(key, value, ctx) {
    const s = ctx.state.grouping;
    const api = ctx.api;
    if (key === "rowData") {
      s.leaves = value ?? [];
      ctx.raw.setGridOption("rowData", isActive(s) ? buildRowData(ctx) : s.leaves);
    } else if (key === "pivotMode") {
      ctx.options.pivotMode = s.pivotMode;
      s.setPivotMode(value);
    } else if (key === "rowGroupPanelShow") {
      ctx.emit("groupingChanged");
    } else if (key === "autoGroupColumnDef" || key === "suppressAggFuncInHeader") {
      ctx.refreshColumnDefs();
    } else if (key === "groupDefaultExpanded" || key === "isGroupOpenByDefault") {
      s.expandState.clear();
      if (isActive(s)) api.refreshClientSideRowModel("sort");
    }
  },
};

// ----- column definitions ---------------------------------------------------

function initFromColDefs(s, defs, onlyIfIdle = false) {
  const leafs = leafColDefs(defs);
  const ordered = (has, indexKey, initialIndexKey) =>
    leafs
      .map((d, i) => ({ d, i, dex: d.context?.dex ?? {} }))
      .filter((x) => has(x.dex) || x.dex[indexKey] != null || x.dex[initialIndexKey] != null)
      .sort((a, b) => (a.dex[indexKey] ?? a.dex[initialIndexKey] ?? a.i + 1000) - (b.dex[indexKey] ?? b.dex[initialIndexKey] ?? b.i + 1000))
      .map((x) => colIdOf(x.d));
  const grouped = ordered((d) => d.rowGroup || d.initialRowGroup, "rowGroupIndex", "initialRowGroupIndex");
  const pivots = ordered((d) => d.pivot || d.initialPivot, "pivotIndex", "initialPivotIndex");
  const values = leafs.filter((d) => d.context?.dex?.aggFunc || d.context?.dex?.initialAggFunc).map((d) => [colIdOf(d), d.context.dex.aggFunc ?? d.context.dex.initialAggFunc]);
  if (onlyIfIdle && (s.groupCols.length || s.valueCols.size || s.pivotCols.length)) return;
  s.groupCols = grouped;
  s.pivotCols = pivots;
  s.valueCols = new Map(values);
}

function valueHeader(ctx, d, id, agg) {
  const header = d.headerName ?? humanize(d.field ?? id);
  if (ctx.options.suppressAggFuncInHeader || !agg) return header;
  return `${typeof agg === "string" ? agg : "func"}(${header})`;
}

function transformDefs(ctx, defs) {
  const s = ctx.state.grouping;
  const active = isActive(s);
  const map = (d) => {
    if (Array.isArray(d.children)) return { ...d, children: d.children.map(map).filter(Boolean) };
    if (d.context?.dexAddedColumn) return null;
    const id = colIdOf(d);
    const out = { ...d };
    if (s.pivotMode) out.hide = true;
    // Leaving pivot mode: an undefined hide keeps the grid's current (hidden)
    // state, so restore the saved value explicitly.
    else if (s.restoringFromPivot) out.hide = !!d.hide;
    if (active) {
      const own = d.editable;
      out.editable = (p) => {
        if (p.data?.__dexGroup) return false;
        const e = own !== undefined ? own : ctx.raw.getGridOption?.("defaultColDef")?.editable;
        return typeof e === "function" ? e(p) : !!e;
      };
    }
    const agg = s.valueCols.get(id);
    if (agg) {
      if (typeof d.valueGetter === "function") {
        const orig = d.valueGetter;
        out.valueGetter = (p) => (p.data?.__dexGroup ? p.data.__dexGroup.values[id] : orig(p));
      }
      if (!ctx.options.suppressAggFuncInHeader) {
        const header = valueHeader(ctx, d, id, null);
        const withAgg = valueHeader(ctx, d, id, agg);
        out.headerValueGetter = (p) => (p.location === "columnToolPanel" || p.location === "columnDrop" ? header : withAgg);
      }
    }
    return out;
  };
  const mapped = defs.map(map).filter(Boolean);
  if (!active) return mapped;
  const user = ctx.options.autoGroupColumnDef ?? {};
  const auto = {
    headerName: ctx.api?.getGridOption?.("localeText")?.group ?? ctx.options.localeText?.group ?? "Group",
    minWidth: 200,
    sortable: true,
    resizable: true,
    filter: false,
    editable: false,
    ...user,
    colId: AUTO_COL_ID,
    hide: false,
    cellRenderer: user.cellRenderer === undefined || user.cellRenderer === "agGroupCellRenderer" ? "dexGroupCellRenderer" : user.cellRenderer,
    valueGetter: (p) => autoGroupValue(ctx, p),
    comparator: user.comparator ?? autoComparator,
    context: { ...(user.context ?? {}), dexAddedColumn: true, dexAutoGroup: true },
  };
  delete auto.field;
  return s.pivotMode ? [auto, ...pivotResultDefs(ctx), ...mapped] : [auto, ...mapped];
}

/** Pivot result columns, nested in column groups per pivot level. */
function pivotResultDefs(ctx) {
  const s = ctx.state.grouping;
  const valueCols = [...s.valueCols];
  if (!valueCols.length) return [];
  const leafDefs = leafColDefs(ctx.userColumnDefs);
  const defOf = (id) => leafDefs.find((d) => colIdOf(d) === id) ?? { field: id };
  const blanks = ctx.api?.getGridOption?.("localeText")?.blanks ?? ctx.options.localeText?.blanks ?? "(Blanks)";
  const resultCol = (path, vcId, agg) => {
    const d = defOf(vcId);
    const pathKey = path.join(PIVOT_KEY_SEP);
    return {
      colId: `${PIVOT_COL_PREFIX}${path.map(encodeURIComponent).join("_")}__${vcId}`,
      headerName: valueHeader(ctx, d, vcId, agg),
      valueGetter: (p) => plain(p.data?.__dexGroup?.pivot?.[pathKey]?.[vcId]) ?? null,
      valueFormatter: d.valueFormatter,
      cellClass: d.cellClass,
      sortable: true,
      filter: false,
      editable: false,
      minWidth: 90,
      context: { dexAddedColumn: true, dexPivotResult: true, dexPivotKey: pathKey, dexValueCol: vcId },
    };
  };
  if (!s.pivotCols.length) return valueCols.map(([vcId, agg]) => resultCol([], vcId, agg));
  const roots = [];
  const groupsByPrefix = new Map();
  for (const path of s.pivotPaths) {
    let siblings = roots;
    for (let level = 0; level < path.length; level++) {
      const prefix = path.slice(0, level + 1).join(PIVOT_KEY_SEP);
      let group = groupsByPrefix.get(prefix);
      if (!group) {
        group = { groupId: `${PIVOT_COL_PREFIX}g_${path.slice(0, level + 1).map(encodeURIComponent).join("_")}`, headerName: path[level] === "" ? blanks : path[level], children: [] };
        groupsByPrefix.set(prefix, group);
        siblings.push(group);
      }
      siblings = group.children;
    }
    for (const [vcId, agg] of valueCols) siblings.push(resultCol(path, vcId, agg));
  }
  return roots;
}

function humanize(field) {
  return String(field)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_.]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

const collator = new Intl.Collator("tr-TR", { numeric: true, sensitivity: "base" });
function autoComparator(a, b) {
  return collator.compare(a ?? "", b ?? "");
}

/** Sort key of the auto column: the group path, so groups sort by their keys. */
function autoGroupValue(ctx, p) {
  const s = ctx.state.grouping;
  const meta = p.data?.__dexGroup;
  if (meta) return meta.path;
  if (!p.data) return "";
  return s.groupCols.map((id) => groupKey(keyFor(ctx, id, p.data))).join("\u0001");
}

// ----- row data -------------------------------------------------------------

function columnDef(ctx, colId) {
  const col = ctx.api?.getColumn?.(colId);
  if (col) return col.getColDef();
  return leafColDefs(ctx.userColumnDefs).find((d) => colIdOf(d) === colId) ?? { field: colId };
}

function dataValue(ctx, colId, data) {
  const def = columnDef(ctx, colId);
  if (typeof def.valueGetter === "function") {
    try {
      return def.valueGetter({ data, node: null, colDef: def, column: ctx.api?.getColumn?.(colId) ?? null, api: ctx.api, context: ctx.api?.getGridOption?.("context"), getValue: (f) => readPath(data, f) });
    } catch {
      return undefined;
    }
  }
  return readPath(data, def.field ?? colId);
}

function keyFor(ctx, colId, data) {
  const def = columnDef(ctx, colId);
  const value = dataValue(ctx, colId, data);
  if (typeof def.keyCreator === "function" && !(value === null || value === undefined)) {
    try {
      return def.keyCreator({ value, data, colDef: def, column: ctx.api?.getColumn?.(colId), api: ctx.api });
    } catch {
      return value;
    }
  }
  return value;
}

function groupLabel(ctx, colId, rawValue, key) {
  if (key === "") return ctx.api?.getGridOption?.("localeText")?.blanks ?? ctx.options.localeText?.blanks ?? "(Blanks)";
  const def = columnDef(ctx, colId);
  if (typeof def.valueFormatter === "function") {
    try {
      const out = def.valueFormatter({ value: rawValue, data: null, node: null, colDef: def, column: ctx.api?.getColumn?.(colId), api: ctx.api });
      if (out !== undefined && out !== null) return String(out);
    } catch {
      // formatter needs row data
    }
  }
  return key;
}

function groupDataFor(s, id) {
  let data = s.groupData.get(id);
  if (!data) {
    data = { __dexGroup: { id, values: {}, pivot: {} } };
    s.groupData.set(id, data);
  }
  return data;
}

function buildRowData(ctx) {
  const s = ctx.state.grouping;
  s.tree = buildTree(s.leaves, s.groupCols.map((colId) => ({ colId, keyOf: (d) => keyFor(ctx, colId, d) })));
  if (s.pivotMode) {
    s.pivotPaths = pivotKeyPaths(s.leaves, s.pivotCols.map((id) => (d) => keyFor(ctx, id, d)), (a, b) => collator.compare(a, b));
  }
  const seen = new Set();
  const groups = [];
  const noChildrenInPivot = (g) => s.pivotMode && g.leafLevel;
  for (const g of allGroups(s.tree.root)) {
    seen.add(g.id);
    const data = groupDataFor(s, g.id);
    const first = g.leafs[0];
    const path = [];
    for (let p = g; p && p.level >= 0; p = p.parent) path.unshift(p.key);
    Object.assign(data.__dexGroup, {
      key: g.key,
      level: g.level,
      colId: g.colId,
      leafLevel: g.leafLevel,
      noChildren: noChildrenInPivot(g),
      group: g,
      path: path.join("\u0001"),
      count: g.leafs.length,
      label: groupLabel(ctx, g.colId, first ? dataValue(ctx, g.colId, first) : null, g.key),
    });
    groups.push(data);
  }
  if (s.pivotMode && !s.groupCols.length) {
    seen.add(ROOT_ID);
    const data = groupDataFor(s, ROOT_ID);
    Object.assign(data.__dexGroup, {
      key: "",
      level: 0,
      colId: null,
      leafLevel: true,
      noChildren: true,
      group: s.tree.root,
      path: "",
      count: s.leaves.length,
      label: ctx.api?.getGridOption?.("localeText")?.total ?? ctx.options.localeText?.total ?? "Total",
    });
    groups.push(data);
  }
  for (const id of [...s.groupData.keys()]) if (!seen.has(id)) s.groupData.delete(id);
  return [...groups, ...s.leaves];
}

function collectLeaves(api) {
  const out = [];
  api.forEachNode((n) => {
    if (n.data && !n.data.__dexGroup) out.push(n.data);
  });
  return out;
}

function isExpanded(ctx, group) {
  const s = ctx.state.grouping;
  if (!group) return false;
  if (s.pivotMode && group.leafLevel) return false;
  if (s.expandState.has(group.id)) return s.expandState.get(group.id);
  const byDefault = ctx.options.isGroupOpenByDefault;
  if (byDefault) {
    return !!byDefault({ key: group.key, level: group.level, field: columnDef(ctx, group.colId).field, rowGroupColumn: ctx.api?.getColumn(group.colId), rowNode: ctx.api?.getRowNode(group.id) });
  }
  const n = ctx.options.groupDefaultExpanded ?? 0;
  return n === -1 || group.level < n;
}

// ----- display rebuild (postSortRows) ----------------------------------------

/** Sibling-group order for the active sort: by key (auto column) or by aggregate. */
function groupComparator(ctx, api) {
  const s = ctx.state.grouping;
  const sorts = api
    .getColumnState()
    .filter((c) => c.sort)
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  const keys = [];
  for (const st of sorts) {
    const dir = st.sort === "desc" ? -1 : 1;
    if (st.colId === AUTO_COL_ID) {
      keys.push((a, b) => dir * collator.compare(a.key, b.key));
      continue;
    }
    const col = api.getColumn(st.colId);
    const pivotKey = col?.getColDef().context?.dexPivotKey;
    if (pivotKey !== undefined) {
      const vc = col.getColDef().context.dexValueCol;
      keys.push((a, b) => dir * compareValues(plain(a.pivot?.[pivotKey]?.[vc]), plain(b.pivot?.[pivotKey]?.[vc])));
    } else if (s.valueCols.has(st.colId)) {
      keys.push((a, b) => dir * compareValues(plain(a.agg?.[st.colId]), plain(b.agg?.[st.colId])));
    }
  }
  if (!keys.length) return undefined;
  return (a, b) => {
    for (const k of keys) {
      const d = k(a, b);
      if (d !== 0) return d;
    }
    return 0;
  };
}

function compareValues(a, b) {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

function rebuildDisplay(ctx, p) {
  const s = ctx.state.grouping;
  if (!s.tree) return;
  const passing = new Set();
  const leafOrder = new Map();
  let i = 0;
  for (const node of p.nodes) {
    if (node.data && !node.data.__dexGroup) {
      passing.add(node.data);
      leafOrder.set(node.data, i++);
    }
  }
  s.lastPassing = passing;
  s.lastLeafOrder = leafOrder;
  const passes = (d) => passing.has(d);
  const valueCols = [...s.valueCols].map(([colId, aggFunc]) => ({ colId, aggFunc, valueOf: (d) => dataValue(ctx, colId, d) }));
  aggregate(s.tree.root, valueCols, passes, ctx.options.aggFuncs ?? {});
  if (s.pivotMode) aggregatePivot(s.tree.root, s.pivotCols.map((id) => (d) => keyFor(ctx, id, d)), valueCols, passes, ctx.options.aggFuncs ?? {});
  const groups = allGroups(s.tree.root);
  if (s.pivotMode && !s.groupCols.length) groups.push(s.tree.root);
  for (const g of groups) {
    const data = s.groupData.get(g.id ?? ROOT_ID);
    if (!data) continue;
    data.__dexGroup.count = g.visibleLeaves;
    data.__dexGroup.expanded = isExpanded(ctx, g);
    if (s.pivotMode) data.__dexGroup.pivot = g.pivot ?? {};
    for (const vc of valueCols) {
      const value = plain(g.agg[vc.colId]);
      data.__dexGroup.values[vc.colId] = value;
      const def = columnDef(ctx, vc.colId);
      if (def.field && typeof def.valueGetter !== "function") writePath(data, def.field, value);
    }
  }
  const out = [];
  const groupNodes = [];
  if (s.pivotMode && !s.groupCols.length) {
    const node = p.api.getRowNode(ROOT_ID);
    if (node) {
      out.push(node);
      groupNodes.push(node);
    }
  } else {
    const items = flatten(s.tree.root, { passes, leafOrder, expanded: (g) => isExpanded(ctx, g), compareGroups: groupComparator(ctx, p.api), groupsOnly: s.pivotMode });
    for (const item of items) {
      if (item.type === "group") {
        const node = p.api.getRowNode(item.group.id);
        if (node) {
          out.push(node);
          groupNodes.push(node);
        }
      } else {
        s.leafLevel.set(item.data, item.level);
        const node = p.api.getRowNode(s.getRowId({ data: item.data }));
        if (node) out.push(node);
      }
    }
  }
  p.nodes.length = 0;
  p.nodes.push(...out);
  clearTimeout(s.refreshTimer);
  s.refreshTimer = setTimeout(() => {
    if (groupNodes.length && !p.api.isDestroyed?.()) p.api.refreshCells({ rowNodes: groupNodes, force: true });
  });
}

function exportNodes(ctx, api) {
  const s = ctx.state.grouping;
  if (s.pivotMode && !s.groupCols.length) return [api.getRowNode(ROOT_ID)].filter(Boolean);
  const items = flatten(s.tree.root, { passes: (d) => s.lastPassing.has(d), leafOrder: s.lastLeafOrder, expanded: (g) => !(s.pivotMode && g.leafLevel), compareGroups: groupComparator(ctx, api), groupsOnly: s.pivotMode });
  return items
    .map((item) => {
      if (item.type === "group") return api.getRowNode(item.group.id);
      s.leafLevel.set(item.data, item.level);
      return api.getRowNode(s.getRowId({ data: item.data }));
    })
    .filter(Boolean);
}

// ----- transactions while grouped -------------------------------------------

function applyGroupedTransaction(ctx, api, tx) {
  const s = ctx.state.grouping;
  const idOf = (d) => s.getRowId({ data: d, level: 0, parentKeys: [] });
  const removedIds = new Set((tx.remove ?? []).map(idOf));
  const removed = s.leaves.filter((d) => removedIds.has(idOf(d)));
  let leaves = s.leaves.filter((d) => !removedIds.has(idOf(d)));
  const updates = new Map((tx.update ?? []).map((d) => [idOf(d), d]));
  if (updates.size) leaves = leaves.map((d) => updates.get(idOf(d)) ?? d);
  if (tx.add?.length) {
    const at = tx.addIndex == null ? leaves.length : Math.max(0, Math.min(tx.addIndex, leaves.length));
    leaves = [...leaves.slice(0, at), ...tx.add, ...leaves.slice(at)];
  }
  s.leaves = leaves;
  const rows = buildRowData(ctx);
  if (s.pivotMode) ctx.refreshColumnDefs();
  ctx.raw.setGridOption("rowData", rows);
  const nodes = (list) => (list ?? []).map((d) => api.getRowNode(idOf(d))).filter(Boolean);
  return { add: nodes(tx.add), update: nodes(tx.update), remove: removed.map((data) => ({ data, id: idOf(data) })) };
}
