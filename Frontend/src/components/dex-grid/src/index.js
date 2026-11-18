// dex-grid: AG Grid Community plus the features DexShed uses from AG Grid Enterprise.
//
// createDexGrid(container, gridOptions, env?) accepts AG Grid-style options and
// returns the grid api with the extra methods attached.
//
// A feature is { name, gridOptions?, colDefKeys?, prepare?, attach?, onOptionChanged? }:
// - gridOptions: option names the feature owns. They are removed before the grid
//   is created (Community would warn and ignore them) and kept in ctx.options;
//   api.setGridOption / getGridOption / updateGridOptions route them to the feature.
// - colDefKeys: column-definition keys the feature owns. They are moved to
//   colDef.context.dex so Community's colDef validation does not reject them.
// - prepare(options, ctx) may rewrite the Community options; attach(api, ctx) runs
//   after the grid exists; onOptionChanged(key, value, ctx) runs on later changes.

import { exportDataAsExcel, getDataAsExcel } from "./excel/excelExport.js";
import { attachMethods } from "./core/api.js";
import { rewriteColDefs, COLDEF_OPTIONS } from "./core/colDefs.js";
import { aliasesFeature } from "./features/aliases.js";
import { clipboardFeature } from "./clipboard/clipboard.js";
import { contextMenuFeature } from "./menu/contextMenu.js";
import { columnsPanelFeature } from "./panels/columnsPanel.js";
import { cellSelectionFeature } from "./range/cellSelection.js";
import { groupingFeature } from "./grouping/grouping.js";
import { chartsFeature } from "./charts/charts.js";

export { attachMethods } from "./core/api.js";
export { dexColDef } from "./core/colDefs.js";
export { DexSetFilter } from "./filters/setFilter.js";
export { DexRichSelectEditor } from "./editors/richSelect.js";

const features = [];

/** Registers a feature module. Later registrations of the same name are ignored. */
export function registerFeature(feature) {
  if (!features.some((f) => f.name === feature.name)) {
    features.push(feature);
  }
}

registerFeature(aliasesFeature);
registerFeature(columnsPanelFeature);
registerFeature(groupingFeature);
registerFeature(cellSelectionFeature);
registerFeature(clipboardFeature);
registerFeature(chartsFeature);
registerFeature(contextMenuFeature);

function ownedOptions() {
  const owners = new Map();
  for (const f of features) for (const key of f.gridOptions ?? []) owners.set(key, f);
  return owners;
}

function ownedColDefKeys() {
  return new Set(features.flatMap((f) => f.colDefKeys ?? []));
}

/**
 * @param {HTMLElement} container
 * @param {object} gridOptions AG Grid-style options
 * @param {{ agGrid?: object, XLSX?: object, agCharts?: object }} [env] defaults to the globals
 */
export function createDexGrid(container, gridOptions, env = {}) {
  const agGrid = env.agGrid ?? globalThis.agGrid;
  const XLSX = env.XLSX ?? globalThis.XLSX;
  if (!agGrid?.createGrid) {
    throw new Error("dex-grid: AG Grid Community (global agGrid or env.agGrid) is required");
  }
  const owners = ownedOptions();
  const colDefKeys = ownedColDefKeys();
  const listeners = new Map();
  const ctx = {
    env,
    agGrid,
    XLSX,
    container,
    gridContainer: container,
    state: {},
    options: {},
    features,
    raw: {},
    /** Internal event bus between features. */
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    emit(type, payload) {
      for (const fn of listeners.get(type) ?? []) fn(payload);
    },
    /** Column definitions as features want the grid to see them. */
    transformColumnDefs(defs) {
      let out = defs;
      for (const f of features) if (f.transformColumnDefs) out = f.transformColumnDefs(out, ctx);
      return out;
    },
  };

  let options = { components: {} };
  for (const [key, value] of Object.entries(gridOptions)) {
    if (owners.has(key)) ctx.options[key] = value;
    else options[key] = value;
  }
  options.components = { ...(gridOptions.components ?? {}) };
  for (const key of COLDEF_OPTIONS) {
    if (options[key]) options[key] = rewriteColDefs(options[key], colDefKeys);
  }
  ctx.userColumnDefs = options.columnDefs ?? [];
  for (const feature of features) {
    options = feature.prepare?.(options, ctx) ?? options;
  }
  if (options.columnDefs) options.columnDefs = ctx.transformColumnDefs(ctx.userColumnDefs);

  const api = agGrid.createGrid(ctx.gridContainer, options);
  ctx.api = api;

  const setGridOption = api.setGridOption.bind(api);
  const getGridOption = api.getGridOption.bind(api);
  const updateGridOptions = api.updateGridOptions.bind(api);
  const rawGetColumnDefs = api.getColumnDefs.bind(api);
  ctx.raw = { setGridOption, getGridOption, updateGridOptions, getColumnDefs: rawGetColumnDefs };
  // Current column definitions (with the user's width/hide/sort changes), minus
  // columns that dex features add, such as the auto group column.
  const userFacingColumnDefs = () => stripDexColumns(rawGetColumnDefs());
  const routeOwned = (key, value) => {
    ctx.options[key] = value;
    owners.get(key).onOptionChanged?.(key, value, ctx);
  };
  const forGrid = (key, value) => {
    if (key === "columnDefs") {
      ctx.userColumnDefs = rewriteColDefs(value, colDefKeys) ?? [];
      ctx.emit("userColumnDefsChanged", ctx.userColumnDefs);
      return ctx.transformColumnDefs(ctx.userColumnDefs);
    }
    return COLDEF_OPTIONS.includes(key) ? rewriteColDefs(value, colDefKeys) : value;
  };
  /** Re-applies feature column transforms to the current user column definitions. */
  // While ctx.state.columnDefsFrozen is set (pivot mode hides the user columns),
  // the saved user definitions are reused instead of re-read from the grid.
  ctx.refreshColumnDefs = () => {
    if (!ctx.state.columnDefsFrozen) ctx.userColumnDefs = userFacingColumnDefs() ?? ctx.userColumnDefs;
    setGridOption("columnDefs", ctx.transformColumnDefs(ctx.userColumnDefs));
  };
  ctx.refreshColumnDefs.snapshot = () => {
    ctx.userColumnDefs = userFacingColumnDefs() ?? ctx.userColumnDefs;
  };
  attachMethods(api, {
    setGridOption: (key, value) => {
      if (owners.has(key)) return routeOwned(key, value);
      return setGridOption(key, forGrid(key, value));
    },
    getGridOption: (key) => {
      if (owners.has(key)) return ctx.options[key];
      if (key === "columnDefs") return userFacingColumnDefs();
      return getGridOption(key);
    },
    getColumnDefs: userFacingColumnDefs,
    updateGridOptions: (opts) => {
      const rest = {};
      for (const [key, value] of Object.entries(opts)) {
        if (owners.has(key)) routeOwned(key, value);
        else rest[key] = forGrid(key, value);
      }
      return updateGridOptions(rest);
    },
    getDataAsExcel: (params) => requireXlsx(XLSX) && getDataAsExcel(api, XLSX, withOutline(params, ctx)),
    exportDataAsExcel: (params) => requireXlsx(XLSX) && exportDataAsExcel(api, XLSX, withOutline(params, ctx)),
  });
  for (const feature of features) {
    feature.attach?.(api, ctx);
  }
  const destroy = api.destroy.bind(api);
  attachMethods(api, {
    destroy: () => {
      for (const feature of [...features].reverse()) feature.destroy?.(ctx);
      destroy();
    },
  });
  return api;
}

function stripDexColumns(defs) {
  if (!Array.isArray(defs)) return defs;
  return defs
    .filter((d) => !d?.context?.dexAddedColumn && !String(d?.groupId ?? "").startsWith("dexpivot_"))
    .map((d) => (Array.isArray(d?.children) ? { ...d, children: stripDexColumns(d.children) } : d))
    .filter((d) => !Array.isArray(d?.children) || d.children.length > 0);
}

/** When rows are grouped, exports walk every group and leaf (collapsed ones too) with outline levels. */
function withOutline(params, ctx) {
  const p = { ...(params ?? {}) };
  if (ctx.state.exportNodes && !p.nodes) {
    const nodes = ctx.state.exportNodes();
    if (nodes) p.nodes = nodes;
  }
  if (ctx.state.outlineLevel && !p.outlineLevel) p.outlineLevel = ctx.state.outlineLevel;
  return p;
}

function requireXlsx(XLSX) {
  if (!XLSX?.utils) {
    throw new Error("dex-grid: SheetJS (global XLSX or env.XLSX) is required for Excel export");
  }
  return true;
}
