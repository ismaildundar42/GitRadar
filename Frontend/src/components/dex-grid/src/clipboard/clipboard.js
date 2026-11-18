// Clipboard copy and paste.
//
// Copy source, in order: cell ranges (cell selection feature), selected rows
// (unless suppressCopyRowsToClipboard), the focused cell. Keyboard Ctrl/Cmd+C and
// Ctrl/Cmd+V use the browser copy/paste events, so no clipboard permission is
// needed; menu actions use navigator.clipboard.
//
// Paste starts at the top-left of the range or the focused cell, skips cells that
// are not editable, applies processCellFromClipboard then the column valueParser,
// and writes with node.setDataValue(..., "paste"). A single copied value pasted
// onto a larger range fills the range.

import { toTsv, parseTsv } from "./tsv.js";
import { exportValue } from "../core/autoGroup.js";
import { attachMethods, userValueParsers } from "../core/api.js";

/**
 * Parses pasted number text: "1,5" and "1.5" both mean 1.5; "1.234,5" and
 * "1,234.5" use the last separator as the decimal mark. Unparseable text keeps
 * the old value; empty text clears the cell.
 */
export function parseNumber(text, oldValue) {
  const s = text.trim().replace(/\s/g, "");
  if (s === "") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized = s;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = s.split(",").length === 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : oldValue;
}

const OPTIONS = [
  "processCellForClipboard",
  "processHeaderForClipboard",
  "processCellFromClipboard",
  "processDataFromClipboard",
  "sendToClipboard",
  "suppressClipboardPaste",
  "suppressCopyRowsToClipboard",
  "suppressCopySingleCellRanges",
  "copyHeadersToClipboard",
];

export const clipboardFeature = {
  name: "clipboard",
  gridOptions: OPTIONS,
  attach(api, ctx) {
    const copy = (includeHeaders) => writeClipboard(ctx, buildCopyText(api, ctx, includeHeaders));
    attachMethods(api, {
      copyToClipboard: (params = {}) => copy(params.includeHeaders ?? !!ctx.options.copyHeadersToClipboard),
      copySelectedRangeToClipboard: (params = {}) => writeClipboard(ctx, rangeText(api, ctx, params.includeHeaders ?? !!ctx.options.copyHeadersToClipboard)),
      copySelectedRowsToClipboard: (params = {}) => writeClipboard(ctx, rowsText(api, ctx, params.includeHeaders ?? !!ctx.options.copyHeadersToClipboard, params.columnKeys)),
      pasteFromClipboard: async () => {
        if (ctx.options.suppressClipboardPaste) return 0;
        const text = await navigator.clipboard.readText();
        return pasteText(api, ctx, text);
      },
      /** Pastes the given text as if it came from the clipboard (for tests and custom UIs). */
      pasteText: (text) => pasteText(api, ctx, text),
      /** The text a copy would produce now. */
      getCopyText: (params = {}) => buildCopyText(api, ctx, params.includeHeaders ?? !!ctx.options.copyHeadersToClipboard),
    });
    const root = ctx.gridContainer;
    const isEditing = () => api.getEditingCells().length > 0;
    const onCopy = (e) => {
      if (isEditing() || !root.contains(document.activeElement)) return;
      const text = buildCopyText(api, ctx, !!ctx.options.copyHeadersToClipboard);
      if (text == null) return;
      e.preventDefault();
      if (ctx.options.sendToClipboard) ctx.options.sendToClipboard({ data: text, api });
      else e.clipboardData.setData("text/plain", text);
    };
    const onPaste = (e) => {
      if (isEditing() || ctx.options.suppressClipboardPaste || !root.contains(document.activeElement)) return;
      e.preventDefault();
      pasteText(api, ctx, e.clipboardData.getData("text/plain"));
    };
    root.addEventListener("copy", onCopy);
    root.addEventListener("paste", onPaste);
    ctx.state.clipboardCleanup = () => {
      root.removeEventListener("copy", onCopy);
      root.removeEventListener("paste", onPaste);
    };
  },
  destroy(ctx) {
    ctx.state.clipboardCleanup?.();
  },
};

function dataColumns(api) {
  const cols = api?.getAllDisplayedColumns?.();
  if (!cols || !Array.isArray(cols)) return [];
  return cols.filter((c) => {
    const id = c?.getColId?.();
    return id !== "ag-Grid-SelectionColumn" && id !== "ag-Grid-RowNumbersColumn";
  });
}

function header(api, ctx, column) {
  const name = api.getDisplayNameForColumn(column, "clipboard") ?? column.getColId();
  return ctx.options.processHeaderForClipboard ? ctx.options.processHeaderForClipboard({ column, api }) : name;
}

function cellText(api, ctx, node, column) {
  let value = exportValue(api, node, column);
  if (ctx.options.processCellForClipboard) {
    value = ctx.options.processCellForClipboard({ value, node, column, api, type: "clipboard" });
  }
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && typeof value.toString === "function" && value.toString !== Object.prototype.toString) return value.toString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function rangeText(api, ctx, includeHeaders) {
  const ranges = ctx.state.getCellRanges?.() ?? [];
  if (!ranges.length) return null;
  const blocks = ranges.map((range) => {
    const rows = range.rowNodes.map((node) => range.columns.map((col) => cellText(api, ctx, node, col)));
    return includeHeaders ? [range.columns.map((c) => header(api, ctx, c)), ...rows] : rows;
  });
  return toTsv(blocks.flat());
}

function rowsText(api, ctx, includeHeaders, columnKeys) {
  const nodes = api.getSelectedNodes().filter((n) => n.displayed !== false);
  if (!nodes.length) return null;
  nodes.sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));
  let cols = dataColumns(api);
  if (columnKeys?.length) cols = cols.filter((c) => columnKeys.includes(c.getColId()));
  const rows = nodes.map((node) => cols.map((col) => cellText(api, ctx, node, col)));
  return toTsv(includeHeaders ? [cols.map((c) => header(api, ctx, c)), ...rows] : rows);
}

function focusedText(api, ctx, includeHeaders) {
  const focused = api.getFocusedCell();
  if (!focused || focused.rowPinned) return null;
  const node = api.getDisplayedRowAtIndex(focused.rowIndex);
  if (!node) return null;
  const rows = [[cellText(api, ctx, node, focused.column)]];
  return toTsv(includeHeaders ? [[header(api, ctx, focused.column)], ...rows] : rows);
}

function buildCopyText(api, ctx, includeHeaders) {
  const ranges = ctx.state.getCellRanges?.() ?? [];
  const singleCell = ranges.length === 1 && ranges[0].rowNodes.length === 1 && ranges[0].columns.length === 1;
  if (ranges.length && !(singleCell && ctx.options.suppressCopySingleCellRanges)) return rangeText(api, ctx, includeHeaders);
  if (!ctx.options.suppressCopyRowsToClipboard) {
    const text = rowsText(api, ctx, includeHeaders);
    if (text != null) return text;
  }
  return focusedText(api, ctx, includeHeaders);
}

async function writeClipboard(ctx, text) {
  if (text == null) return false;
  if (ctx.options.sendToClipboard) {
    ctx.options.sendToClipboard({ data: text, api: ctx.api });
    return true;
  }
  await navigator.clipboard.writeText(text);
  return true;
}

function parseCell(column, node, api, ctx, raw) {
  let value = raw;
  if (ctx.options.processCellFromClipboard) {
    value = ctx.options.processCellFromClipboard({ value, node, column, api, type: "clipboard" });
  }
  const colDef = column.getColDef();
  const oldValue = api.getCellValue({ rowNode: node, colKey: column });
  if (userValueParsers.has(colDef.valueParser)) {
    return colDef.valueParser({ oldValue, newValue: value, node, data: node.data, colDef, column, api, context: api.getGridOption("context") });
  }
  if (typeof value === "string" && (colDef.cellDataType === "number" || typeof oldValue === "number")) {
    return parseNumber(value, oldValue);
  }
  return value;
}

/** @returns {number} number of cells written */
export function pasteText(api, ctx, text) {
  let data = parseTsv(text);
  if (ctx.options.processDataFromClipboard) {
    data = ctx.options.processDataFromClipboard({ data, api }) ?? data;
  }
  if (!data.length) return 0;
  const cols = dataColumns(api);
  const ranges = ctx.state.getCellRanges?.() ?? [];
  let startRow;
  let startCol;
  let target = null;
  if (ranges.length) {
    const r = ranges[0];
    startRow = Math.min(...r.rowNodes.map((n) => n.rowIndex));
    startCol = cols.indexOf(r.columns[0]);
    target = r;
  } else {
    const focused = api.getFocusedCell();
    if (!focused) return 0;
    startRow = focused.rowIndex;
    startCol = cols.indexOf(focused.column);
  }
  if (startCol < 0) return 0;
  const fill = data.length === 1 && data[0].length === 1 && target && (target.rowNodes.length > 1 || target.columns.length > 1);
  const height = fill ? target.rowNodes.length : data.length;
  const width = fill ? target.columns.length : Math.max(...data.map((r) => r.length));
  let written = 0;
  for (let i = 0; i < height; i++) {
    const node = api.getDisplayedRowAtIndex(startRow + i);
    if (!node || node.group || node.data?.__dexGroup) continue;
    for (let j = 0; j < width; j++) {
      const column = cols[startCol + j];
      if (!column) break;
      const raw = fill ? data[0][0] : data[i]?.[j];
      if (raw === undefined) continue;
      if (!column.isCellEditable(node)) continue;
      node.setDataValue(column, parseCell(column, node, api, ctx, raw), "paste");
      written++;
    }
  }
  return written;
}
