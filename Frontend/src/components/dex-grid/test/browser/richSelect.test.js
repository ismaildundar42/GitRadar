import { test, assert, container, sleep } from "./runner.js";
import { createDexGrid } from "../../src/index.js";

const grid = (params = {}) => createDexGrid(container(), {
  getRowId: (p) => p.data.id,
  columnDefs: [{ field: "status", editable: true, cellEditor: "agRichSelectCellEditor", cellEditorParams: { values: ["Açık", "Kapalı", "İptal"], filterList: true, formatValue: (v) => (v ? v.toUpperCase() : ""), ...params } }],
  rowData: [{ id: "1", status: "Açık" }],
});

const popup = () => document.querySelector(".dex-rich-select");

test("rich select: alias opens popup with formatted values", async () => {
  const api = grid();
  api.startEditingCell({ rowIndex: 0, colKey: "status" });
  await sleep(50);
  assert.ok(popup(), "popup rendered");
  assert.deepEqual([...popup().querySelectorAll(".dex-rich-select-item")].map((e) => e.textContent), ["AÇIK", "KAPALI", "İPTAL"]);
  assert.ok(popup().querySelector(".dex-rich-select-current")?.textContent === "AÇIK", "current value marked");
  api.stopEditing(true);
  api.destroy();
});

test("rich select: typing filters (Turkish-aware), Enter commits", async () => {
  const api = grid();
  api.startEditingCell({ rowIndex: 0, colKey: "status" });
  await sleep(50);
  const search = popup().querySelector(".dex-rich-select-search");
  search.value = "ipt";
  search.dispatchEvent(new Event("input"));
  assert.deepEqual([...popup().querySelectorAll(".dex-rich-select-item")].map((e) => e.textContent), ["İPTAL"]);
  search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await sleep(50);
  assert.equal(api.getRowNode("1").data.status, "İptal");
  api.destroy();
});

test("rich select: arrow keys move, mouse click commits", async () => {
  const api = grid();
  api.startEditingCell({ rowIndex: 0, colKey: "status" });
  await sleep(50);
  const items = popup().querySelectorAll(".dex-rich-select-item");
  items[1].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  await sleep(50);
  assert.equal(api.getRowNode("1").data.status, "Kapalı");
  api.destroy();
});

test("rich select: async values", async () => {
  const api = grid({ values: Promise.resolve(["X", "Y"]), formatValue: undefined });
  api.startEditingCell({ rowIndex: 0, colKey: "status" });
  await sleep(50);
  assert.deepEqual([...popup().querySelectorAll(".dex-rich-select-item")].map((e) => e.textContent), ["X", "Y"]);
  api.stopEditing(true);
  api.destroy();
});
