// Column-definition rewriting shared by all features: component aliases and
// moving dex-owned keys into colDef.context.dex.

import { userFilterValueGetters, userValueParsers } from "./api.js";

export const COLDEF_OPTIONS = ["columnDefs", "defaultColDef", "autoGroupColumnDef"];

export const COMPONENT_ALIASES = {
  agSetColumnFilter: "dexSetFilter",
  agRichSelectCellEditor: "dexRichSelectEditor",
  agRichSelect: "dexRichSelectEditor",
};

/**
 * @param {object | object[]} defs a colDef, colGroupDef, or array of them
 * @param {Set<string>} ownedKeys keys moved to context.dex
 */
export function rewriteColDefs(defs, ownedKeys = new Set()) {
  if (!defs || typeof defs !== "object") return defs;
  if (Array.isArray(defs)) return defs.map((d) => rewriteColDefs(d, ownedKeys));
  const out = { ...defs };
  if (typeof out.filterValueGetter === "function") userFilterValueGetters.add(out.filterValueGetter);
  if (typeof out.valueParser === "function") userValueParsers.add(out.valueParser);
  if (typeof out.filter === "string" && COMPONENT_ALIASES[out.filter]) out.filter = COMPONENT_ALIASES[out.filter];
  if (typeof out.cellEditor === "string" && COMPONENT_ALIASES[out.cellEditor]) out.cellEditor = COMPONENT_ALIASES[out.cellEditor];
  if (out.filterParams?.filters) {
    out.filterParams = { ...out.filterParams, filters: out.filterParams.filters.map((d) => rewriteColDefs(d, ownedKeys)) };
  }
  const moved = {};
  for (const key of ownedKeys) {
    if (key in out) {
      moved[key] = out[key];
      delete out[key];
    }
  }
  if (Object.keys(moved).length) {
    out.context = { ...(out.context ?? {}), dex: { ...(out.context?.dex ?? {}), ...moved } };
  }
  if (Array.isArray(out.children)) out.children = out.children.map((d) => rewriteColDefs(d, ownedKeys));
  return out;
}

/** The dex-owned settings of a column (moved there by rewriteColDefs). */
export function dexColDef(column) {
  const colDef = column?.getColDef ? column.getColDef() : column;
  return colDef?.context?.dex ?? {};
}
