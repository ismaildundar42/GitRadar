import { test, assert, container, sleep } from "./runner.js";
import { createDexGrid } from "../../src/index.js";

const data = () => [
  { id: "t1", country: "TR", sport: "Run", gold: 1, name: "Ali" },
  { id: "t2", country: "TR", sport: "Run", gold: 2, name: "Ayşe" },
  { id: "t3", country: "TR", sport: "Swim", gold: 3, name: "Can" },
  { id: "d1", country: "DE", sport: "Run", gold: 4, name: "Dirk" },
  { id: "n1", country: null, sport: "Swim", gold: 5, name: "Nil" },
];
const shown = (api) => {
  const out = [];
  for (let i = 0; i < api.getDisplayedRowCount(); i++) {
    const n = api.getDisplayedRowAtIndex(i);
    out.push(n.data.__dexGroup ? `G:${n.data.__dexGroup.label}(${n.data.__dexGroup.count})` : n.data.id);
  }
  return out;
};
function captureWarnings() {
  const warnings = [];
  const ow = console.warn, oe = console.error;
  console.warn = (...a) => { warnings.push(a.map(String).join(" ")); ow(...a); };
  console.error = (...a) => { warnings.push(a.map(String).join(" ")); oe(...a); };
  return { warnings, restore: () => { console.warn = ow; console.error = oe; } };
}
// DexShed-like configuration (main.js): enableRowGroup on every column, sideBar, groupDefaultExpanded 1.
const dexshed = (extra = {}) => createDexGrid(container(500), {
  getRowId: (p) => p.data.id,
  rowModelType: "clientSide",
  columnDefs: ["country", "sport", "gold", "name"].map((f) => ({ field: f, enableRowGroup: true, enablePivot: true, filter: f === "gold" ? "agNumberColumnFilter" : "agTextColumnFilter" })),
  defaultColDef: { sortable: true, filter: true, resizable: true, editable: (p) => p.colDef.field !== "id" },
  rowData: data(),
  sideBar: { toolPanels: [{ id: "columns", labelDefault: "Kolonlar", toolPanel: "agColumnsToolPanel", toolPanelParams: { suppressRowGroups: false, suppressValues: false } }] },
  rowGroupPanelShow: "false",
  groupDefaultExpanded: 1,
  autoGroupColumnDef: { headerName: "Grup", minWidth: 220, cellRenderer: "agGroupCellRenderer" },
  rowSelection: { mode: "multiRow", checkboxes: true, headerCheckbox: true, selectAll: "filtered" },
  localeText: { blanks: "(Boş)" },
  ...extra,
});

test("grouping: DexShed config creates no AG Grid warnings; grouping via api hides the column and adds the auto column", async () => {
  const cap = captureWarnings();
  const api = dexshed();
  api.setRowGroupColumns(["country"]);
  await sleep(30);
  cap.restore();
  assert.equal(cap.warnings.filter((w) => /AG Grid/.test(w)).length, 0, cap.warnings.join(" / "));
  assert.deepEqual(shown(api), ["G:TR(3)", "t1", "t2", "t3", "G:DE(1)", "d1", "G:(Boş)(1)", "n1"]);
  const displayedIds = api.getAllDisplayedColumns().map((c) => c.getColId());
  assert.ok(displayedIds.includes("dex-auto-group"), "auto column");
  assert.ok(!displayedIds.includes("country"), "grouped column hidden");
  assert.equal(api.getColumn("dex-auto-group").getColDef().headerName, "Grup");
  assert.ok(!api.getColumnDefs().some((d) => d.colId === "dex-auto-group"), "getColumnDefs hides the auto column");
  api.setRowGroupColumns([]);
  await sleep(30);
  assert.deepEqual(shown(api), ["t1", "t2", "t3", "d1", "n1"]);
  assert.ok(api.getAllDisplayedColumns().some((c) => c.getColId() === "country"), "column visible again");
  assert.ok(!api.getAllDisplayedColumns().some((c) => c.getColId() === "dex-auto-group"));
  api.destroy();
});

test("grouping: two levels with groupDefaultExpanded 1; expand/collapse api and toggle click", async () => {
  const api = dexshed();
  api.setRowGroupColumns(["country", "sport"]);
  await sleep(30);
  assert.deepEqual(shown(api), ["G:TR(3)", "G:Run(2)", "G:Swim(1)", "G:DE(1)", "G:Run(1)", "G:(Boş)(1)", "G:Swim(1)"]);
  api.setGroupExpanded("dex-group-country-TR-sport-Run", true);
  assert.deepEqual(shown(api).slice(0, 4), ["G:TR(3)", "G:Run(2)", "t1", "t2"]);
  api.collapseAll();
  assert.deepEqual(shown(api), ["G:TR(3)", "G:DE(1)", "G:(Boş)(1)"]);
  api.expandAll();
  assert.equal(shown(api).length, 5 + 3 + 4);
  api.collapseAll();
  await sleep(50);
  const toggle = document.querySelector('.ag-row[row-id="dex-group-country-DE"] .dex-group-toggle');
  assert.ok(toggle, "toggle rendered");
  toggle.click();
  await sleep(30);
  assert.deepEqual(shown(api), ["G:TR(3)", "G:DE(1)", "G:Run(1)", "G:(Boş)(1)"]);
  api.destroy();
});

test("grouping: filters keep groups that have passing leaves; counts follow the filter", async () => {
  const api = dexshed();
  api.setRowGroupColumns(["country"]);
  await api.setColumnFilterModel("gold", { type: "greaterThan", filter: 1 });
  api.onFilterChanged();
  await sleep(30);
  assert.deepEqual(shown(api), ["G:TR(2)", "t2", "t3", "G:DE(1)", "d1", "G:(Boş)(1)", "n1"]);
  await api.setColumnFilterModel("gold", { type: "greaterThan", filter: 3 });
  api.onFilterChanged();
  await sleep(30);
  assert.deepEqual(shown(api), ["G:DE(1)", "d1", "G:(Boş)(1)", "n1"]);
  api.destroy();
});

test("grouping: sorting orders leaves within groups and groups by their first leaf; auto column sort by key", async () => {
  const api = dexshed();
  api.setRowGroupColumns(["country"]);
  api.applyColumnState({ state: [{ colId: "gold", sort: "desc" }] });
  await sleep(30);
  assert.deepEqual(shown(api), ["G:(Boş)(1)", "n1", "G:DE(1)", "d1", "G:TR(3)", "t3", "t2", "t1"]);
  api.applyColumnState({ state: [{ colId: "dex-auto-group", sort: "asc" }], defaultState: { sort: null } });
  await sleep(30);
  assert.deepEqual(shown(api).filter((x) => x.startsWith("G:")), ["G:(Boş)(1)", "G:DE(1)", "G:TR(3)"]);
  api.destroy();
});

test("grouping: aggregation over filtered leaves, plain numbers, header shows the function", async () => {
  const api = createDexGrid(container(), {
    getRowId: (p) => p.data.id,
    columnDefs: [{ field: "country", rowGroup: true, hide: true }, { field: "gold", aggFunc: "sum", filter: "agNumberColumnFilter" }, { colId: "avgGold", valueGetter: (p) => p.data.gold, aggFunc: "avg" }, { field: "name" }],
    rowData: data(),
  });
  await sleep(30);
  const tr = api.getRowNode("dex-group-country-TR");
  assert.equal(tr.data.gold, 6);
  assert.equal(api.getCellValue({ rowNode: tr, colKey: "avgGold" }), 2);
  assert.equal(api.getDisplayNameForColumn(api.getColumn("gold"), "header"), "sum(Gold)");
  await api.setColumnFilterModel("gold", { type: "greaterThan", filter: 1 });
  api.onFilterChanged();
  await sleep(30);
  assert.equal(api.getRowNode("dex-group-country-TR").data.gold, 5, "2 + 3");
  api.setColumnAggFunc("gold", "max");
  await sleep(30);
  assert.equal(api.getRowNode("dex-group-country-TR").data.gold, 3);
  api.destroy();
});

test("grouping: transactions and rowData while grouped", async () => {
  const api = dexshed();
  api.setRowGroupColumns(["country"]);
  const res = api.applyTransaction({ add: [{ id: "d2", country: "DE", sport: "Ski", gold: 7, name: "Eva" }], remove: [{ id: "t1" }] });
  await sleep(30);
  assert.equal(res.add[0].data.id, "d2");
  assert.equal(res.remove[0].id, "t1");
  assert.deepEqual(shown(api), ["G:TR(2)", "t2", "t3", "G:DE(2)", "d1", "d2", "G:(Boş)(1)", "n1"]);
  api.applyTransaction({ update: [{ id: "t2", country: "DE", sport: "Run", gold: 2, name: "Ayşe" }] });
  await sleep(30);
  // t2 is now the first DE row in data order, so DE comes first (first-appearance order).
  assert.deepEqual(shown(api), ["G:DE(3)", "t2", "d1", "d2", "G:TR(1)", "t3", "G:(Boş)(1)", "n1"]);
  api.setGridOption("rowData", [{ id: "x", country: "FR", sport: "Run", gold: 1, name: "X" }]);
  await sleep(30);
  assert.deepEqual(shown(api), ["G:FR(1)", "x"]);
  api.setRowGroupColumns([]);
  await sleep(30);
  assert.deepEqual(shown(api), ["x"], "leaves preserved after ungrouping");
  api.destroy();
});

test("grouping: group rows are not selectable or editable; select all picks leaves only", async () => {
  const api = dexshed();
  api.setRowGroupColumns(["country"]);
  await sleep(30);
  const tr = api.getRowNode("dex-group-country-TR");
  assert.equal(tr.selectable, false);
  assert.equal(api.getColumn("gold").isCellEditable(tr), false, "defaultColDef.editable fn bypassed for groups");
  assert.equal(api.getColumn("gold").isCellEditable(api.getRowNode("t1")), true);
  api.selectAll("filtered");
  assert.deepEqual(api.getSelectedRows().map((r) => r.id).sort(), ["d1", "n1", "t1", "t2", "t3"]);
  api.destroy();
});

test("grouping: Excel export includes collapsed rows with outline levels and group labels", async () => {
  const api = dexshed({ groupDefaultExpanded: 0 });
  api.setRowGroupColumns(["country"]);
  await sleep(30);
  assert.deepEqual(shown(api), ["G:TR(3)", "G:DE(1)", "G:(Boş)(1)"], "all collapsed on screen");
  const wb = XLSX.read(await api.getDataAsExcel().arrayBuffer(), { type: "array", cellStyles: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  assert.equal(rows[0][0], "Grup");
  assert.deepEqual(rows.slice(1).map((r) => r[0] ?? ""), ["TR", "", "", "", "DE", "", "(Boş)", ""]);
  assert.equal(rows.length, 1 + 8, "header + 3 groups + 5 leaves");
  const rowInfo = sheet["!rows"] ?? [];
  const levels = Array.from({ length: 2 }, (_, i) => rowInfo[i + 1]?.level || 0); // !rows is sparse
  assert.deepEqual(levels, [0, 1]);
  api.destroy();
});

test("grouping: columns panel shows the row group zone with chips", async () => {
  const el = container(500);
  const api = createDexGrid(el, {
    columnDefs: ["country", "sport", "gold"].map((f) => ({ field: f, enableRowGroup: true })),
    rowData: data(),
    sideBar: true,
  });
  const zone = () => el.querySelector(".dex-row-group-zone");
  assert.ok(zone(), "zone rendered");
  assert.equal(zone().querySelectorAll(".dex-chip").length, 0);
  api.addRowGroupColumns(["sport"]);
  await sleep(30);
  assert.deepEqual([...zone().querySelectorAll(".dex-chip")].map((c) => c.dataset.colId), ["sport"]);
  zone().querySelector(".dex-chip-remove").click();
  await sleep(30);
  assert.equal(api.getRowGroupColumns().length, 0);
  api.destroy();
});

test("grouping: rowGroupPanelShow onlyWhenGrouping shows the bar only when grouped", async () => {
  const el = container(500);
  const api = createDexGrid(el, { columnDefs: ["country", "gold"].map((f) => ({ field: f, enableRowGroup: true })), rowData: data(), rowGroupPanelShow: "onlyWhenGrouping" });
  const bar = el.querySelector(".dex-group-panel");
  assert.ok(bar.hidden);
  api.setRowGroupColumns(["country"]);
  assert.ok(!bar.hidden);
  assert.equal(bar.querySelectorAll(".dex-chip").length, 1);
  api.destroy();
});
