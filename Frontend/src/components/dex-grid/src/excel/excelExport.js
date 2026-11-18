// Excel export for a grid: the displayed columns and the filtered, sorted rows,
// in on-screen order. Per-column options live in `colDef.context.excel`:
//   { numberFormat?: string, asText?: boolean }
// so they do not trip AG Grid's colDef validation.

import { toExcelCell, buildWorksheet, safeSheetName } from "./excelCells.js";
import { exportValue } from "../core/autoGroup.js";

/**
 * @param {object} api grid api
 * @param {object} XLSX SheetJS namespace
 * @param {object} [params]
 * @param {string} [params.sheetName]
 * @param {string[]} [params.columnKeys] limit to these column ids
 * @param {boolean} [params.onlySelected]
 * @param {boolean} [params.skipColumnHeaders]
 * @param {(p: { value: unknown, column: object, node: object }) => unknown} [params.processCellCallback]
 * @param {(node: object) => number} [params.outlineLevel] row outline level (grouping)
 * @param {object[]} [params.nodes] rows to export in order (grouping supplies every group and leaf)
 * @returns {object} a SheetJS workbook
 */
export function buildWorkbook(api, XLSX, params = {}) {
  const columns = selectColumns(api, params.columnKeys);
  const headers = params.skipColumnHeaders ? null : columns.map((col) => api.getDisplayNameForColumn(col, "excel") ?? col.getColId());
  const rows = [];
  const outline = [];
  const visit = (node) => {
    if (params.onlySelected && !node.isSelected()) return;
    if (node.rowPinned) return;
    rows.push(columns.map((column) => cellFor(api, column, node, params)));
    outline.push(params.outlineLevel ? params.outlineLevel(node) : 0);
  };
  if (params.nodes) params.nodes.forEach(visit);
  else api.forEachNodeAfterFilterAndSort(visit);
  const widths = columns.map((col) => Math.max(8, Math.round(col.getActualWidth() / 7)));
  const sheet = headers
    ? buildWorksheet(XLSX, headers, rows, { columnWidths: widths, outlineLevels: params.outlineLevel ? outline : undefined })
    : buildWorksheet(XLSX, [], rows, { columnWidths: widths });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName(params.sheetName));
  return workbook;
}

function selectColumns(api, columnKeys) {
  const cols = api?.getAllDisplayedColumns?.();
  const displayed = (Array.isArray(cols) ? cols : []).filter((col) => !isUtilityColumn(col));
  if (!columnKeys?.length) return displayed;
  const wanted = new Set(columnKeys);
  return displayed.filter((col) => wanted.has(col.getColId()));
}

function isUtilityColumn(col) {
  const id = col.getColId();
  return id === "ag-Grid-SelectionColumn" || id === "ag-Grid-RowNumbersColumn";
}

function cellFor(api, column, node, params) {
  const opts = column.getColDef().context?.excel ?? {};
  let value = exportValue(api, node, column);
  if (params.processCellCallback) {
    value = params.processCellCallback({ value, column, node, api });
  }
  const formatted = opts.asText ? api.getCellValue({ rowNode: node, colKey: column, useFormatter: true }) : null;
  return toExcelCell(value, { numberFormat: opts.numberFormat, asText: !!opts.asText, formatted: formatted == null ? null : String(formatted) });
}

/** Returns the workbook as an .xlsx Blob. */
export function getDataAsExcel(api, XLSX, params = {}) {
  const workbook = buildWorkbook(api, XLSX, params);
  const data = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true });
  return new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Triggers a browser download of the .xlsx file. */
export function exportDataAsExcel(api, XLSX, params = {}) {
  const workbook = buildWorkbook(api, XLSX, params);
  const fileName = params.fileName ?? "export.xlsx";
  XLSX.writeFile(workbook, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`, { compression: true });
}
