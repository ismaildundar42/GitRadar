// Drop zones for row groups and values, shown in the columns tool panel and in
// the group panel above the grid (rowGroupPanelShow). Columns are dragged from
// the columns panel list (dataTransfer "text/dex-col").

import { dexColDef } from "../core/colDefs.js";

const AGG_NAMES = ["sum", "avg", "count", "min", "max", "first", "last"];

function t(api, key, fallback) {
  return api.getGridOption("localeText")?.[key] ?? fallback;
}

function label(api, id) {
  const col = api.getColumn(id);
  return col ? api.getDisplayNameForColumn(col, "columnDrop") ?? id : id;
}

function canGroup(api, id) {
  const d = dexColDef(api.getColumn(id));
  return !!(d.enableRowGroup || d.rowGroup || d.initialRowGroup);
}

function canPivot(api, id) {
  const d = dexColDef(api.getColumn(id));
  return !!(d.enablePivot || d.pivot || d.initialPivot);
}

function canValue(api, id) {
  const d = dexColDef(api.getColumn(id));
  return !!(d.enableValue || d.aggFunc || d.initialAggFunc);
}

function zone(api, ctx, { title, emptyText, ids, chip, accepts, onDrop, onRemove, onReorder, className }) {
  const el = document.createElement("div");
  el.className = `dex-drop-zone ${className}`;
  const head = document.createElement("div");
  head.className = "dex-drop-zone-title";
  head.textContent = title;
  const body = document.createElement("div");
  body.className = "dex-drop-zone-body";
  if (!ids.length) {
    const empty = document.createElement("span");
    empty.className = "dex-drop-zone-empty";
    empty.textContent = emptyText;
    body.appendChild(empty);
  }
  ids.forEach((id, index) => {
    const c = document.createElement("span");
    c.className = "dex-chip";
    c.dataset.colId = id;
    c.draggable = true;
    c.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/dex-chip", String(index));
      e.dataTransfer.setData("text/dex-col", id);
    });
    c.addEventListener("dragover", (e) => {
      if (e.dataTransfer.types.includes("text/dex-chip")) e.preventDefault();
    });
    c.addEventListener("drop", (e) => {
      if (!e.dataTransfer.types.includes("text/dex-chip")) return;
      e.preventDefault();
      e.stopPropagation();
      onReorder?.(Number(e.dataTransfer.getData("text/dex-chip")), index);
    });
    const name = document.createElement("span");
    name.textContent = label(api, id);
    c.appendChild(name);
    chip?.(c, id);
    const x = document.createElement("button");
    x.type = "button";
    x.className = "dex-chip-remove";
    x.setAttribute("aria-label", "remove");
    x.textContent = "×";
    x.addEventListener("click", () => onRemove(id));
    c.appendChild(x);
    body.appendChild(c);
  });
  el.addEventListener("dragover", (e) => {
    if (e.dataTransfer.types.includes("text/dex-col")) {
      e.preventDefault();
      el.classList.add("dex-drop-zone-over");
    }
  });
  el.addEventListener("dragleave", () => el.classList.remove("dex-drop-zone-over"));
  el.addEventListener("drop", (e) => {
    el.classList.remove("dex-drop-zone-over");
    if (e.dataTransfer.types.includes("text/dex-chip")) return;
    const id = e.dataTransfer.getData("text/dex-col");
    if (id && accepts(id)) {
      e.preventDefault();
      onDrop(id);
    }
  });
  el.append(head, body);
  return el;
}

export function groupZone(api, ctx) {
  const s = ctx.state.grouping;
  return zone(api, ctx, {
    className: "dex-row-group-zone",
    title: t(api, "rowGroupColumnsEmptyMessage", "Row Groups"),
    emptyText: t(api, "dragHereToSetRowGroups", "Drag here to set row groups"),
    ids: s.groupCols,
    accepts: (id) => canGroup(api, id) && !s.groupCols.includes(id),
    onDrop: (id) => api.addRowGroupColumns([id]),
    onRemove: (id) => api.removeRowGroupColumns([id]),
    onReorder: (from, to) => api.moveRowGroupColumn(from, to),
  });
}

export function valueZone(api, ctx) {
  const s = ctx.state.grouping;
  return zone(api, ctx, {
    className: "dex-value-zone",
    title: t(api, "valueColumnsEmptyMessage", "Values"),
    emptyText: t(api, "dragHereToAggregate", "Drag here to aggregate"),
    ids: [...s.valueCols.keys()],
    accepts: (id) => canValue(api, id) && !s.valueCols.has(id),
    onDrop: (id) => api.addValueColumns([id]),
    onRemove: (id) => api.removeValueColumns([id]),
    chip: (el, id) => {
      const d = dexColDef(api.getColumn(id));
      const select = document.createElement("select");
      select.className = "dex-agg-select";
      for (const name of [...(d.allowedAggFuncs ?? AGG_NAMES), ...Object.keys(ctx.options.aggFuncs ?? {})]) {
        const o = document.createElement("option");
        o.value = name;
        o.textContent = name;
        select.appendChild(o);
      }
      const current = s.valueCols.get(id);
      if (typeof current === "string") select.value = current;
      select.addEventListener("change", () => api.setColumnAggFunc(id, select.value));
      el.insertBefore(select, el.firstChild);
    },
  });
}

export function pivotZone(api, ctx) {
  const s = ctx.state.grouping;
  return zone(api, ctx, {
    className: "dex-pivot-zone",
    title: t(api, "pivotColumnsEmptyMessage", "Column Labels"),
    emptyText: t(api, "dragHereToSetColumnLabels", "Drag here to set column labels"),
    ids: s.pivotCols,
    accepts: (id) => canPivot(api, id) && !s.pivotCols.includes(id),
    onDrop: (id) => api.addPivotColumns([id]),
    onRemove: (id) => api.removePivotColumns([id]),
    onReorder: (from, to) => api.movePivotColumn(from, to),
  });
}

function pivotModeToggle(api, ctx) {
  const label = document.createElement("label");
  label.className = "dex-pivot-mode";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = ctx.state.grouping.pivotMode;
  box.addEventListener("change", () => api.setPivotMode(box.checked));
  const text = document.createElement("span");
  text.textContent = t(api, "pivotMode", "Pivot Mode");
  label.append(box, text);
  return label;
}

/** Sections added to the columns tool panel. */
export function renderGroupZones(api, ctx, params) {
  const s = ctx.state.grouping;
  const wrap = document.createElement("div");
  wrap.className = "dex-columns-zones";
  const cols = api.getColumns() ?? [];
  const anyPivotCol = cols.some((c) => canPivot(api, c.getColId()));
  if (!params.suppressPivotMode && anyPivotCol) wrap.appendChild(pivotModeToggle(api, ctx));
  if (!params.suppressRowGroups) wrap.appendChild(groupZone(api, ctx));
  const anyValueCol = cols.some((c) => canValue(api, c.getColId()));
  if (!params.suppressValues && (anyValueCol || s.valueCols.size)) wrap.appendChild(valueZone(api, ctx));
  if (!params.suppressPivots && s.pivotMode) wrap.appendChild(pivotZone(api, ctx));
  return wrap.childElementCount ? wrap : null;
}

/** Group panel above the grid, controlled by rowGroupPanelShow. */
export function renderGroupPanel(api, ctx, el) {
  const mode = ctx.options.rowGroupPanelShow;
  const grouped = ctx.state.grouping.groupCols.length > 0;
  const show = mode === "always" || (mode === "onlyWhenGrouping" && grouped);
  el.hidden = !show;
  el.replaceChildren(...(show ? [groupZone(api, ctx)] : []));
}
