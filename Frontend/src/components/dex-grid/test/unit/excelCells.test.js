import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { toExcelCell, buildWorksheet, safeSheetName } from "../../src/excel/excelCells.js";

test("numeric-looking strings stay text", () => {
  assert.deepEqual(toExcelCell("0012"), { t: "s", v: "0012" });
  assert.deepEqual(toExcelCell("1e3"), { t: "s", v: "1e3" });
  assert.deepEqual(toExcelCell(" 42 "), { t: "s", v: " 42 " });
});

test("strings starting with = are not formulas", () => {
  assert.deepEqual(toExcelCell("=HYPERLINK(\"x\")"), { t: "s", v: "=HYPERLINK(\"x\")" });
});

test("numbers stay numbers, optional number format", () => {
  assert.deepEqual(toExcelCell(12.5), { t: "n", v: 12.5 });
  assert.deepEqual(toExcelCell(1234.5, { numberFormat: "#,##0.00" }), { t: "n", v: 1234.5, z: "#,##0.00" });
});

test("non-finite numbers and bigint become text", () => {
  assert.deepEqual(toExcelCell(Infinity), { t: "s", v: "Infinity" });
  assert.deepEqual(toExcelCell(NaN), { t: "s", v: "NaN" });
  assert.deepEqual(toExcelCell(9007199254740993n), { t: "s", v: "9007199254740993" });
});

test("booleans and dates keep their type", () => {
  assert.deepEqual(toExcelCell(true), { t: "b", v: true });
  const d = new Date("2026-10-16T00:00:00Z");
  assert.deepEqual(toExcelCell(d), { t: "d", v: d, z: "yyyy-mm-dd" });
  assert.equal(toExcelCell(new Date("nope")), null);
});

test("empty values produce no cell", () => {
  assert.equal(toExcelCell(null), null);
  assert.equal(toExcelCell(undefined), null);
  assert.equal(toExcelCell(""), null);
});

test("asText uses the formatted value", () => {
  assert.deepEqual(toExcelCell(1234.5, { asText: true, formatted: "$1,234.50" }), { t: "s", v: "$1,234.50" });
});

test("worksheet round-trips through SheetJS with types intact", () => {
  const sheet = buildWorksheet(XLSX, ["code", "qty"], [[toExcelCell("0012"), toExcelCell(3, { numberFormat: "#,##0.00" })], [null, toExcelCell(4)]], { columnWidths: [10, 8] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "S");
  const back = XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array", cellNF: true });
  assert.equal(back.Sheets.S.B2.z, "#,##0.00", "number format survives");
  const s = back.Sheets.S;
  assert.equal(s.A2.t, "s");
  assert.equal(s.A2.v, "0012");
  assert.equal(s.B2.t, "n");
  assert.equal(s.B2.v, 3);
  assert.equal(s.A3, undefined);
  assert.equal(s["!ref"], "A1:B3");
});

test("sheet names are sanitized to Excel limits", () => {
  assert.equal(safeSheetName("a/b:c*d?e[f]g\\h"), "a_b_c_d_e_f_g_h");
  assert.equal(safeSheetName("x".repeat(40)).length, 31);
  assert.equal(safeSheetName(""), "Sheet1");
});
