// Converts grid values into SheetJS cell objects.
//
// Rules (chosen to avoid silent data changes):
// - strings stay text, even when they look numeric ("0012", "1e3") or start with "=";
// - finite numbers stay numbers; NaN/Infinity become text;
// - bigint becomes text so no precision is lost;
// - booleans stay booleans, valid Dates stay dates;
// - null, undefined and "" produce no cell.

/**
 * @param {unknown} value raw cell value
 * @param {{ numberFormat?: string, asText?: boolean, formatted?: string | null }} [options]
 * @returns {null | { t: "s" | "n" | "b" | "d", v: unknown, z?: string }}
 */
export function toExcelCell(value, options = {}) {
  const { numberFormat, asText = false, formatted = null } = options;
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (asText) {
    return { t: "s", v: formatted ?? stringify(value) };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { t: "s", v: String(value) };
    }
    return numberFormat ? { t: "n", v: value, z: numberFormat } : { t: "n", v: value };
  }
  if (typeof value === "bigint") {
    return { t: "s", v: value.toString() };
  }
  if (typeof value === "boolean") {
    return { t: "b", v: value };
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return { t: "d", v: value, z: numberFormat ?? "yyyy-mm-dd" };
  }
  if (typeof value === "string") {
    return { t: "s", v: formatted ?? value };
  }
  return { t: "s", v: formatted ?? stringify(value) };
}

function stringify(value) {
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Builds a SheetJS worksheet from a header row and body rows of cells.
 * @param {object} XLSX the SheetJS namespace
 * @param {string[]} headers
 * @param {Array<Array<ReturnType<typeof toExcelCell>>>} rows
 * @param {{ columnWidths?: number[] }} [options] widths in characters
 */
export function buildWorksheet(XLSX, headers, rows, options = {}) {
  const sheet = {};
  const headerCells = headers.map((h) => ({ t: "s", v: h }));
  const all = [headerCells, ...rows];
  let maxCol = headers.length - 1;
  all.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell) {
        sheet[XLSX.utils.encode_cell({ r, c })] = cell;
      }
      if (c > maxCol) maxCol = c;
    });
  });
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(all.length - 1, 0), c: Math.max(maxCol, 0) } });
  if (options.columnWidths) {
    sheet["!cols"] = options.columnWidths.map((wch) => ({ wch }));
  }
  if (options.outlineLevels) {
    sheet["!rows"] = [{}, ...options.outlineLevels.map((level) => (level ? { level } : {}))];
  }
  return sheet;
}

/** Excel limits sheet names to 31 characters and forbids : \ / ? * [ ] */
export function safeSheetName(name) {
  const cleaned = String(name ?? "Sheet1").replace(/[:\\/?*[\]]/g, "_").slice(0, 31);
  return cleaned || "Sheet1";
}
