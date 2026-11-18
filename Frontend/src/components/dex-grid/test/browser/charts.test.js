import { test, assert, container, sleep } from "./runner.js";
import { createDexGrid } from "../../src/index.js";

const rows = [
  { id: "1", city: "Ankara", gold: 3, silver: 1, note: "a" },
  { id: "2", city: "Bursa", gold: 5, silver: 2, note: "b" },
  { id: "3", city: "Çorum", gold: 2, silver: 4, note: "c" },
];
const grid = (extra = {}) => createDexGrid(container(), {
  getRowId: (p) => p.data.id,
  columnDefs: [{ field: "city" }, { field: "gold" }, { field: "silver" }, { field: "note", chartDataType: "excluded" }],
  rowData: rows,
  cellSelection: true,
  enableCharts: true,
  ...extra,
});
const dialogs = () => document.querySelectorAll(".dex-chart-dialog");

function captureWarnings() {
  const warnings = [];
  const ow = console.warn;
  console.warn = (...a) => { warnings.push(a.map(String).join(" ")); ow(...a); };
  return { warnings, restore: () => { console.warn = ow; } };
}

test("charts: AG Charts loaded; chartDataType does not warn", async () => {
  assert.ok(globalThis.agCharts?.AgCharts, "agCharts global");
  const cap = captureWarnings();
  const api = grid();
  cap.restore();
  assert.equal(cap.warnings.filter((w) => /AG Grid/.test(w)).length, 0, cap.warnings.join(" / "));
  api.destroy();
});

test("charts: range data uses category + numeric series, excluded columns skipped", async () => {
  const api = grid();
  api.addCellRange({ rowStartIndex: 0, rowEndIndex: 2, columnStart: "city", columnEnd: "note" });
  const d = api.getChartData();
  assert.equal(d.categoryKey, "city");
  assert.deepEqual(d.series.map((s) => s.key), ["gold", "silver"]);
  assert.deepEqual(d.data.map((r) => r.city), ["Ankara", "Bursa", "Çorum"]);
  api.destroy();
});

test("charts: createRangeChart opens a dialog with a rendered chart; type switch; destroy", async () => {
  const events = [];
  const api = grid({ onChartCreated: (e) => events.push(["created", e.chartId]), onChartDestroyed: (e) => events.push(["destroyed", e.chartId]) });
  api.addCellRange({ rowStartIndex: 0, rowEndIndex: 2, columnStart: "city", columnEnd: "silver" });
  const ref = api.createRangeChart({ chartType: "groupedColumn" });
  assert.ok(ref?.chartId, "chart ref");
  assert.equal(dialogs().length, 1);
  await sleep(300);
  assert.ok(dialogs()[0].querySelector("canvas"), "AG Charts rendered a canvas");
  ref.setChartType("pie");
  assert.equal(ref.chartType(), "pie");
  assert.equal(api.getChartRefs().length, 1);
  dialogs()[0].querySelector(".dex-chart-close").click();
  assert.equal(dialogs().length, 0);
  assert.deepEqual(events.map((e) => e[0]), ["created", "destroyed"]);
  api.destroy();
});

test("charts: explicit cellRange and chartContainer", async () => {
  const api = grid();
  const host = document.createElement("div");
  host.style.cssText = "width:400px;height:300px";
  document.getElementById("stage").appendChild(host);
  const ref = api.createRangeChart({ chartType: "line", cellRange: { rowStartIndex: 1, rowEndIndex: 2, columns: ["city", "gold"] }, chartContainer: host });
  await sleep(300);
  assert.equal(dialogs().length, 0, "no dialog when a container is given");
  assert.ok(host.querySelector("canvas"));
  assert.deepEqual(api.getChartData({ cellRange: { rowStartIndex: 1, rowEndIndex: 2, columns: ["city", "gold"] } }).data.map((r) => r.gold), [5, 2]);
  ref.destroyChart();
  api.destroy();
});

test("charts: disabled without enableCharts; context menu chartRange follows the range", async () => {
  const off = grid({ enableCharts: false });
  off.addCellRange({ rowStartIndex: 0, rowEndIndex: 1, columnStart: "city", columnEnd: "gold" });
  assert.equal(off.createRangeChart({ chartType: "line" }), undefined);
  off.destroy();
  const api = grid({ getContextMenuItems: () => ["chartRange"] });
  const item = () => api.getContextMenuItemsFor()[0];
  assert.equal(item().disabled, true, "no range yet");
  api.addCellRange({ rowStartIndex: 0, rowEndIndex: 1, columnStart: "city", columnEnd: "gold" });
  assert.equal(item().disabled, false);
  item().action();
  assert.equal(dialogs().length, 1, "menu action created a chart");
  api.destroy();
  assert.equal(dialogs().length, 0, "grid destroy closes its charts");
});
