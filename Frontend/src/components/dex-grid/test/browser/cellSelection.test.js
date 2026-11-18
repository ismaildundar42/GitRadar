import { test, assert, container, sleep } from "./runner.js";
import { createDexGrid } from "../../src/index.js";

const data = () => Array.from({ length: 6 }, (_, i) => ({ id: String(i), a: i, b: i * 10, c: "c" + i, locked: "L" + i }));
const grid = (extra = {}) => createDexGrid(container(), {
  getRowId: (p) => p.data.id,
  columnDefs: [{ field: "a", editable: true }, { field: "b", editable: true }, { field: "c", editable: true }, { field: "locked", editable: false }],
  rowData: data(),
  cellSelection: true,
  rowSelection: { mode: "multiRow" },
  ...extra,
});
const cellEl = (r, col) => document.querySelector(`.ag-row[row-index="${r}"] .ag-cell[col-id="${col}"]`);
const center = (el) => { const b = el.getBoundingClientRect(); return { clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 }; };
function drag(from, to, opts = {}) {
  const a = cellEl(...from), b = cellEl(...to);
  a.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, ...center(a), ...opts }));
  document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, ...center(b) }));
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, ...center(b) }));
}
const shape = (api) => (api.getCellRanges() ?? []).map((r) => [r.startRow.rowIndex, r.endRow.rowIndex, r.columns.map((c) => c.getColId())]);

test("cell selection: mouse drag selects a range; AG Grid-shaped getCellRanges", async () => {
  const events = [];
  const api = grid({ onCellSelectionChanged: (e) => events.push(e.finished) });
  await sleep(30);
  drag([1, "a"], [3, "b"]);
  assert.deepEqual(shape(api), [[1, 3, ["a", "b"]]]);
  assert.ok(events.includes(true), "finished event");
  await sleep(80);
  assert.ok(cellEl(2, "b").classList.contains("dex-range-cell"), "painted");
  assert.ok(cellEl(1, "a").classList.contains("dex-range-top") && cellEl(1, "a").classList.contains("dex-range-left"));
  assert.ok(!cellEl(4, "a").classList.contains("dex-range-cell"));
  api.destroy();
});

test("cell selection: dragging upward/leftward normalizes; shift-click extends; ctrl-click adds", async () => {
  const api = grid();
  await sleep(30);
  drag([4, "c"], [2, "a"]);
  assert.deepEqual(shape(api), [[4, 2, ["a", "b", "c"]]]);
  cellEl(5, "a").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, shiftKey: true }));
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  assert.deepEqual(shape(api), [[4, 5, ["a", "b", "c"]]]);
  cellEl(0, "locked").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, ctrlKey: true }));
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  assert.equal(shape(api).length, 2);
  api.destroy();
});

test("cell selection: suppressMultiRanges ignores ctrl-click adding", async () => {
  const api = grid({ cellSelection: { suppressMultiRanges: true } });
  await sleep(30);
  drag([0, "a"], [1, "a"]);
  cellEl(3, "b").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, ctrlKey: true }));
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  assert.equal(shape(api).length, 1);
  api.destroy();
});

test("cell selection: selection column clicks do not start a range", async () => {
  const api = grid();
  await sleep(30);
  const selCell = cellEl(1, "ag-Grid-SelectionColumn");
  assert.ok(selCell, "selection column rendered");
  selCell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  assert.deepEqual(shape(api), []);
  api.destroy();
});

test("cell selection: copy range text, paste fills range, Delete clears editable cells", async () => {
  const api = grid();
  await sleep(30);
  drag([0, "a"], [1, "b"]);
  assert.equal(api.getCopyText(), "0\t0\r\n1\t10");
  assert.equal(api.getCopyText({ includeHeaders: true }), "A\tB\r\n0\t0\r\n1\t10");
  api.addCellRange({ rowStartIndex: 2, rowEndIndex: 3, columnStart: "c", columnEnd: "locked" });
  api.clearCellSelection();
  api.addCellRange({ rowStartIndex: 2, rowEndIndex: 3, columnStart: "c", columnEnd: "locked" });
  assert.equal(api.pasteText("Z"), 2, "fill only editable cells of the range");
  assert.deepEqual([api.getRowNode("2").data.c, api.getRowNode("3").data.c, api.getRowNode("3").data.locked], ["Z", "Z", "L3"]);
  api.clearCellSelection();
  api.addCellRange({ rowStartIndex: 4, rowEndIndex: 5, columns: ["a", "locked"] });
  api.setFocusedCell(4, "a");
  await sleep(10);
  api.clearCellSelection();
  api.addCellRange({ rowStartIndex: 4, rowEndIndex: 5, columnStart: "a", columnEnd: "locked" });
  const focusedCell = cellEl(4, "a");
  focusedCell.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
  assert.deepEqual([api.getRowNode("4").data.a, api.getRowNode("5").data.b, api.getRowNode("5").data.locked], [null, null, "L5"]);
  api.destroy();
});

test("cell selection: sorting clears ranges; moving a column keeps ids", async () => {
  const api = grid();
  await sleep(30);
  drag([0, "b"], [1, "c"]);
  api.moveColumns(["c"], 1); // index 0 is the locked selection column
  assert.deepEqual(api.getAllDisplayedColumns().map((c) => c.getColId()), ["ag-Grid-SelectionColumn", "c", "a", "b", "locked"]);
  assert.deepEqual(shape(api), [[0, 1, ["c", "a", "b"]]], "range spans by id across the new order");
  api.applyColumnState({ state: [{ colId: "a", sort: "desc" }] });
  await sleep(20); // sortChanged is delivered asynchronously
  assert.deepEqual(shape(api), []);
  api.destroy();
});

test("cell selection: disabled when cellSelection is not set", async () => {
  const api = createDexGrid(container(), { columnDefs: [{ field: "a" }], rowData: [{ a: 1 }] });
  await sleep(30);
  cellEl(0, "a").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  assert.equal(api.getCellRanges(), null);
  api.destroy();
});
