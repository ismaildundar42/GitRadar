import { test, assert, container, sleep } from "./runner.js";
import { createDexGrid } from "../../src/index.js";

const rows = () => [
  { id: "1", name: "Ankara", qty: 3, note: "a\tb" },
  { id: "2", name: "Berlin", qty: 5, note: "" },
  { id: "3", name: "Bern", qty: 7, note: "x" },
];
const grid = (extra = {}) => createDexGrid(container(), {
  getRowId: (p) => p.data.id,
  columnDefs: [{ field: "name", editable: true }, { field: "qty", editable: true }, { field: "note", editable: false }],
  rowData: rows(),
  rowSelection: { mode: "multiRow" },
  ...extra,
});

test("clipboard: focused cell copy", async () => {
  const api = grid();
  api.setFocusedCell(1, "qty");
  assert.equal(api.getCopyText(), "5");
  assert.equal(api.getCopyText({ includeHeaders: true }), "Qty\r\n5");
  api.destroy();
});

test("clipboard: selected rows copy in display order, quoted cells, no selection column", async () => {
  const api = grid();
  api.getRowNode("3").setSelected(true);
  api.getRowNode("1").setSelected(true);
  assert.equal(api.getCopyText(), 'Ankara\t3\t"a\tb"\r\nBern\t7\tx');
  api.destroy();
});

test("clipboard: processCellForClipboard and processHeaderForClipboard", async () => {
  const api = grid({ processCellForClipboard: (p) => (p.column.getColId() === "qty" ? p.value * 10 : p.value), processHeaderForClipboard: (p) => p.column.getColId().toUpperCase() });
  api.getRowNode("2").setSelected(true);
  assert.equal(api.getCopyText({ includeHeaders: true }), "NAME\tQTY\tNOTE\r\nBerlin\t50\t");
  api.destroy();
});

test("clipboard: paste block from focused cell, skips non-editable, parses numbers", async () => {
  const changes = [];
  const api = grid({ onCellValueChanged: (e) => changes.push([e.data.id, e.colDef.field, e.newValue, e.source]) });
  api.setFocusedCell(0, "name");
  const written = api.pasteText("İzmir\t42\tZZ\r\nKonya\t1,5\tZZ\r\n");
  assert.equal(written, 4, "2 rows x 2 editable cols");
  assert.deepEqual(api.getRowNode("1").data, { id: "1", name: "İzmir", qty: 42, note: "a\tb" });
  assert.deepEqual(api.getRowNode("2").data, { id: "2", name: "Konya", qty: 1.5, note: "" });
  assert.ok(changes.every((c) => c[3] === "paste"), "cellValueChanged source paste");
  api.destroy();
});

test("clipboard: paste uses the column valueParser", async () => {
  const api = createDexGrid(container(), {
    getRowId: (p) => p.data.id,
    columnDefs: [{ field: "code", editable: true, valueParser: (p) => String(p.newValue).trim().toUpperCase() }],
    rowData: [{ id: "1", code: "a" }],
  });
  api.setFocusedCell(0, "code");
  api.pasteText("  tr-01 ");
  assert.equal(api.getRowNode("1").data.code, "TR-01");
  api.destroy();
});

test("clipboard: suppressClipboardPaste and copy via keyboard event", async () => {
  const api = grid({ suppressClipboardPaste: true });
  assert.equal(await api.pasteFromClipboard(), 0);
  api.setFocusedCell(2, "name");
  await sleep(30);
  const cell = document.querySelector('.ag-row[row-index="2"] [col-id="name"]');
  cell.focus();
  const dt = new DataTransfer();
  const evt = new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true });
  cell.dispatchEvent(evt);
  assert.equal(dt.getData("text/plain"), "Bern");
  assert.ok(evt.defaultPrevented);
  api.destroy();
});
