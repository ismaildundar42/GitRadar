import { test, assert, container, sleep } from "./runner.js";
import { createDexGrid, DexSetFilter } from "../../src/index.js";

const rows = [
  { id: "1", city: "İstanbul", country: "TR", k: "A", n: 10 },
  { id: "2", city: "Berlin", country: "DE", k: "A", n: 2 },
  { id: "3", city: "Bern", country: "tr", k: "B", n: 1 },
  { id: "4", city: null, country: "", k: "B", n: 33 },
];
const passing = (api) => { const r = []; api.forEachNodeAfterFilter((n) => r.push(n.data.id)); return r; };

function captureWarnings() {
  const warnings = [];
  const ow = console.warn, oe = console.error;
  console.warn = (...a) => { warnings.push(a.map(String).join(" ")); ow(...a); };
  console.error = (...a) => { warnings.push(a.map(String).join(" ")); oe(...a); };
  return { warnings, restore: () => { console.warn = ow; console.error = oe; } };
}

const grid = (extra = {}) => createDexGrid(container(), {
  getRowId: (p) => p.data.id,
  columnDefs: [
    { field: "city", filter: "agSetColumnFilter", valueFormatter: (p) => (p.value == null ? "" : p.value + " City") },
    { field: "country", filter: "agSetColumnFilter" },
    { field: "k", filter: "agSetColumnFilter" },
    { field: "n", filter: "agSetColumnFilter" },
  ],
  rowData: rows,
  localeText: { blanks: "(Boş)", selectAll: "(Tümünü Seç)", searchOoo: "Ara..." },
  ...extra,
});

test("set filter: agSetColumnFilter resolves to DexSetFilter without enterprise warnings", async () => {
  const cap = captureWarnings();
  const api = grid();
  const inst = await api.getColumnFilterInstance("city");
  cap.restore();
  assert.ok(inst instanceof DexSetFilter, "instance type");
  assert.equal(cap.warnings.filter((w) => /AG Grid/.test(w)).length, 0, "no AG Grid warnings: " + cap.warnings.join(" / "));
  api.destroy();
});

test("set filter: labels use colDef.valueFormatter; blanks use localeText; numeric sort", async () => {
  const api = grid();
  const city = await api.getColumnFilterInstance("city");
  assert.deepEqual(city.getDisplayedKeys(), [null, "Berlin", "Bern", "İstanbul"]);
  assert.equal(city.label("Berlin"), "Berlin City");
  assert.equal(city.label(null), "(Boş)");
  const n = await api.getColumnFilterInstance("n");
  assert.deepEqual(n.getDisplayedKeys(), ["1", "2", "10", "33"]);
  api.destroy();
});

test("set filter: model filters rows case-insensitively and round-trips", async () => {
  const api = grid();
  await api.setColumnFilterModel("country", { values: ["TR"] });
  api.onFilterChanged();
  assert.deepEqual(passing(api), ["1", "3"]);
  assert.deepEqual(api.getFilterModel(), { country: { filterType: "set", values: ["TR"] } }, "model kept as given");
  await api.setColumnFilterModel("country", { values: [null] });
  api.onFilterChanged();
  assert.deepEqual(passing(api), ["4"], "blanks");
  await api.setColumnFilterModel("country", { values: [] });
  api.onFilterChanged();
  assert.deepEqual(passing(api), [], "empty selection passes nothing");
  await api.setColumnFilterModel("country", null);
  api.onFilterChanged();
  assert.equal(passing(api).length, 4);
  api.destroy();
});

test("set filter: unknown values are kept and match nothing", async () => {
  const api = grid();
  await api.setColumnFilterModel("country", { values: ["Paris"] });
  api.onFilterChanged();
  assert.deepEqual(passing(api), []);
  assert.deepEqual(api.getColumnFilterModel("country"), { filterType: "set", values: ["Paris"] });
  api.destroy();
});

test("set filter: UI toggles; select all clears the model", async () => {
  const api = grid();
  const inst = await api.getColumnFilterInstance("k");
  inst.toggleKey("A", false);
  assert.deepEqual(api.getColumnFilterModel("k"), { filterType: "set", values: ["B"] });
  assert.deepEqual(passing(api), ["3", "4"]);
  inst.toggleAllDisplayed(true);
  assert.equal(api.getColumnFilterModel("k"), null, "all selected -> inactive");
  assert.equal(passing(api).length, 4);
  api.destroy();
});

test("set filter: Turkish-aware mini filter on formatted labels", async () => {
  const api = grid();
  const inst = await api.getColumnFilterInstance("city");
  inst.setMiniFilter("istan");
  assert.deepEqual(inst.getDisplayedKeys(), ["İstanbul"]);
  inst.setMiniFilter("n city");
  assert.deepEqual(inst.getDisplayedKeys(), ["Berlin", "Bern"]);
  inst.setMiniFilter("");
  api.destroy();
});

test("set filter: list shows only values available under other filters", async () => {
  const api = grid();
  await api.setColumnFilterModel("k", { values: ["B"] });
  api.onFilterChanged();
  const inst = await api.getColumnFilterInstance("city");
  inst.onAnyFilterChanged();
  assert.deepEqual(inst.getDisplayedKeys(), [null, "Bern"]);
  api.destroy();
});

test("set filter: aliases also apply to columnDefs set later", async () => {
  const api = createDexGrid(container(), { columnDefs: [{ field: "x" }], rowData: [{ x: 1, y: "a" }, { x: 2, y: "b" }] });
  api.setGridOption("columnDefs", [{ field: "y", filter: "agSetColumnFilter" }]);
  await sleep(0);
  const inst = await api.getColumnFilterInstance("y");
  assert.ok(inst instanceof DexSetFilter);
  api.destroy();
});

test("set filter: provided values list and array cell values", async () => {
  const api = createDexGrid(container(), {
    columnDefs: [{ field: "tags", filter: "agSetColumnFilter", filterParams: { values: ["z", "x", "y"] } }],
    rowData: [{ tags: ["x", "y"] }, { tags: ["y"] }, { tags: [] }],
  });
  const inst = await api.getColumnFilterInstance("tags");
  assert.deepEqual(inst.getDisplayedKeys(), ["x", "y", "z"]);
  await api.setColumnFilterModel("tags", { values: ["x"] });
  api.onFilterChanged();
  let count = 0;
  api.forEachNodeAfterFilter(() => count++);
  assert.equal(count, 1);
  api.destroy();
});

test("set filter: an application filterValueGetter is still used", async () => {
  const api = createDexGrid(container(), {
    columnDefs: [{ colId: "y", filter: "agSetColumnFilter", filterValueGetter: (p) => String(p.data.d).slice(0, 4) }],
    rowData: [{ d: "2024-01-02" }, { d: "2025-03-04" }, { d: "2024-09-09" }],
  });
  const inst = await api.getColumnFilterInstance("y");
  assert.deepEqual(inst.getDisplayedKeys(), ["2024", "2025"]);
  await api.setColumnFilterModel("y", { values: ["2024"] });
  api.onFilterChanged();
  let count = 0;
  api.forEachNodeAfterFilter(() => count++);
  assert.equal(count, 2);
  api.destroy();
});

test("set filter: opening the popup renders the virtual list", async () => {
  const rowsMany = Array.from({ length: 3000 }, (_, i) => ({ v: "v" + i }));
  const api = createDexGrid(container(), { columnDefs: [{ field: "v", filter: "agSetColumnFilter" }], rowData: rowsMany });
  const inst = await api.getColumnFilterInstance("v");
  assert.equal(inst.getDisplayedKeys().length, 3000);
  const rendered = inst.getGui().querySelectorAll(".dex-set-filter-row").length;
  assert.ok(rendered > 0 && rendered < 100, "windowed rendering, got " + rendered);
  api.destroy();
});
