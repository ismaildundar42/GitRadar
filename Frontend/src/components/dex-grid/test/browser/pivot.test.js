import { test, assert, container, sleep } from "./runner.js";
import { createDexGrid } from "../../src/index.js";

const data = () => [
  { id: "1", region: "N", year: "2024", v: 1 },
  { id: "2", region: "N", year: "2024", v: 2 },
  { id: "3", region: "N", year: "2023", v: 4 },
  { id: "4", region: "S", year: "2023", v: 8 },
  { id: "5", region: "S", year: null, v: 16 },
];
const cols = () => [
  { field: "region", enableRowGroup: true, enablePivot: true },
  { field: "year", enableRowGroup: true, enablePivot: true, filter: "agTextColumnFilter" },
  { field: "v", enableValue: true, filter: "agNumberColumnFilter" },
];
const displayedIds = (api) => api.getAllDisplayedColumns().map((c) => c.getColId());
const rowsShown = (api) => {
  const out = [];
  for (let i = 0; i < api.getDisplayedRowCount(); i++) {
    const n = api.getDisplayedRowAtIndex(i);
    out.push(n.data.__dexGroup ? n.data.__dexGroup.label : n.data.id);
  }
  return out;
};
const cell = (api, rowId, colId) => api.getCellValue({ rowNode: api.getRowNode(rowId), colKey: colId });

function captureWarnings() {
  const warnings = [];
  const ow = console.warn, oe = console.error;
  console.warn = (...a) => { warnings.push(a.map(String).join(" ")); ow(...a); };
  console.error = (...a) => { warnings.push(a.map(String).join(" ")); oe(...a); };
  return { warnings, restore: () => { console.warn = ow; console.error = oe; } };
}

test("pivot: row groups x pivot keys x value columns", async () => {
  const cap = captureWarnings();
  const api = createDexGrid(container(), { getRowId: (p) => p.data.id, columnDefs: cols(), rowData: data(), localeText: { blanks: "(Boş)" } });
  api.setRowGroupColumns(["region"]);
  api.setValueColumns(["v"]);
  api.setPivotColumns(["year"]);
  api.setPivotMode(true);
  await sleep(30);
  cap.restore();
  assert.equal(cap.warnings.filter((w) => /AG Grid/.test(w)).length, 0, cap.warnings.join(" / "));
  assert.deepEqual(rowsShown(api), ["N", "S"], "group rows only");
  const result = api.getPivotResultColumns().map((c) => c.getColId());
  assert.equal(result.length, 3, "years '', 2023, 2024 x 1 value column");
  assert.ok(displayedIds(api).every((id) => id === "dex-auto-group" || id.startsWith("dexpivot_")), "user columns hidden: " + displayedIds(api));
  const col = (year) => result.find((id) => id.startsWith(`dexpivot_${year}__`));
  assert.equal(cell(api, "dex-group-region-N", col("2024")), 3);
  assert.equal(cell(api, "dex-group-region-N", col("2023")), 4);
  assert.equal(cell(api, "dex-group-region-S", col("")), 16);
  assert.equal(cell(api, "dex-group-region-N", col("")), null);
  const headerGroups = api.getAllDisplayedColumns().map((c) => c.getParent()?.getColGroupDef()?.headerName).filter(Boolean);
  assert.deepEqual(headerGroups, ["(Boş)", "2023", "2024"], "column groups per pivot key, sorted");
  api.destroy();
});

test("pivot: no row groups shows one grand total row; filter changes values not columns", async () => {
  const api = createDexGrid(container(), { getRowId: (p) => p.data.id, columnDefs: cols(), rowData: data(), localeText: { total: "Toplam" } });
  api.setValueColumns(["v"]);
  api.setPivotColumns(["year"]);
  api.setPivotMode(true);
  await sleep(30);
  assert.deepEqual(rowsShown(api), ["Toplam"]);
  const ids = api.getPivotResultColumns().map((c) => c.getColId());
  const y2023 = ids.find((id) => id.startsWith("dexpivot_2023__"));
  assert.equal(cell(api, "dex-group-root", y2023), 12);
  await api.setColumnFilterModel("v", { type: "lessThan", filter: 5 });
  api.onFilterChanged();
  await sleep(30);
  assert.equal(cell(api, "dex-group-root", y2023), 4);
  assert.equal(api.getPivotResultColumns().length, ids.length, "column set unchanged by filters");
  api.destroy();
});

test("pivot: leaving pivot mode restores user columns and their state", async () => {
  const api = createDexGrid(container(), { getRowId: (p) => p.data.id, columnDefs: cols(), rowData: data() });
  api.applyColumnState({ state: [{ colId: "v", width: 222 }] });
  api.setValueColumns(["v"]);
  api.setPivotColumns(["year"]);
  api.setPivotMode(true);
  await sleep(30);
  api.setPivotMode(false);
  await sleep(30);
  assert.deepEqual(displayedIds(api), ["region", "year", "v"]);
  assert.equal(api.getColumn("v").getActualWidth(), 222, "width kept");
  assert.deepEqual(rowsShown(api), ["1", "2", "3", "4", "5"]);
  assert.ok(!api.getColumnDefs().some((d) => String(d.colId ?? d.groupId ?? "").startsWith("dexpivot_")));
  assert.equal(api.getPivotResultColumns(), null);
  api.destroy();
});

test("pivot: columns panel shows the pivot mode toggle and the column labels zone", async () => {
  const el = container(500);
  const api = createDexGrid(el, { columnDefs: cols(), rowData: data(), sideBar: true });
  const toggle = el.querySelector(".dex-pivot-mode input");
  assert.ok(toggle, "pivot mode toggle");
  assert.ok(!el.querySelector(".dex-pivot-zone"));
  toggle.checked = true;
  toggle.dispatchEvent(new Event("change"));
  await sleep(30);
  assert.ok(api.isPivotMode());
  assert.ok(el.querySelector(".dex-pivot-zone"), "column labels zone in pivot mode");
  api.destroy();
});

test("grouping: sorting by an aggregated column orders groups by their aggregate", async () => {
  const api = createDexGrid(container(), {
    getRowId: (p) => p.data.id,
    columnDefs: [{ field: "region", rowGroup: true, hide: true }, { field: "v", aggFunc: "sum" }],
    rowData: [...data(), { id: "6", region: "W", year: "2024", v: 100 }],
  });
  api.applyColumnState({ state: [{ colId: "v", sort: "asc" }] });
  await sleep(30);
  assert.deepEqual(rowsShown(api).filter((x) => ["N", "S", "W"].includes(x)), ["N", "S", "W"], "7, 24, 100");
  api.applyColumnState({ state: [{ colId: "v", sort: "desc" }] });
  await sleep(30);
  assert.deepEqual(rowsShown(api).filter((x) => ["N", "S", "W"].includes(x)), ["W", "S", "N"]);
  api.destroy();
});
