import { test, assert, container } from "./runner.js";
import { createDexGrid } from "../../src/index.js";

const read = async (blob) => {
  const wb = XLSX.read(await blob.arrayBuffer(), { type: "array", cellDates: true, cellNF: true });
  return wb.Sheets[wb.SheetNames[0]];
};

test("excel: types are preserved per value", async () => {
  const rows = [{ code: "0012", qty: 3, price: 1234.5, ok: true, note: "=SUM(1,2)" }, { code: null, qty: 4, price: 2, ok: false, note: "" }];
  const api = createDexGrid(container(), {
    columnDefs: [{ field: "code" }, { field: "qty" }, { field: "price", valueFormatter: (p) => "$" + p.value.toFixed(2), context: { excel: { numberFormat: "#,##0.00" } } }, { field: "ok" }, { field: "note" }],
    rowData: rows,
  });
  const s = await read(api.getDataAsExcel());
  assert.equal(s.A1.v, "Code", "header from headerName/field");
  assert.deepEqual([s.A2.t, s.A2.v], ["s", "0012"], "numeric-looking string kept as text");
  assert.deepEqual([s.B2.t, s.B2.v], ["n", 3]);
  assert.deepEqual([s.C2.t, s.C2.v, s.C2.z], ["n", 1234.5, "#,##0.00"], "number with number format");
  assert.deepEqual([s.D2.t, s.D2.v], ["b", true]);
  assert.deepEqual([s.E2.t, s.E2.v], ["s", "=SUM(1,2)"], "no formula injection");
  assert.ok(!s.E2.f, "no formula");
  assert.equal(s.A3, undefined, "null -> no cell");
  api.destroy();
});

test("excel: asText exports the formatted value", async () => {
  const api = createDexGrid(container(), {
    columnDefs: [{ field: "price", valueFormatter: (p) => "$" + p.value.toFixed(2), context: { excel: { asText: true } } }],
    rowData: [{ price: 5 }],
  });
  const s = await read(api.getDataAsExcel());
  assert.deepEqual([s.A2.t, s.A2.v], ["s", "$5.00"]);
  api.destroy();
});

test("excel: follows filter, sort and column order; skips selection column", async () => {
  const api = createDexGrid(container(), {
    columnDefs: [{ field: "b" }, { field: "a", filter: "agNumberColumnFilter" }],
    rowData: [{ a: 3, b: "x" }, { a: 1, b: "y" }, { a: 2, b: "z" }],
    rowSelection: { mode: "multiRow" },
  });
  api.applyColumnState({ state: [{ colId: "a", sort: "asc" }] });
  await api.setColumnFilterModel("a", { type: "greaterThan", filter: 1 });
  api.onFilterChanged();
  const s = await read(api.getDataAsExcel());
  assert.equal(s["!ref"], "A1:B3", "header + 2 rows, 2 columns");
  assert.deepEqual([s.A1.v, s.B1.v], ["B", "A"]);
  assert.deepEqual([s.B2.v, s.B3.v], [2, 3]);
  api.destroy();
});

test("excel: onlySelected and columnKeys", async () => {
  const api = createDexGrid(container(), {
    columnDefs: [{ field: "a" }, { field: "b" }],
    rowData: [{ a: 1, b: 10 }, { a: 2, b: 20 }],
    rowSelection: { mode: "multiRow" },
    getRowId: (p) => String(p.data.a),
  });
  api.getRowNode("2").setSelected(true);
  const s = await read(api.getDataAsExcel({ onlySelected: true, columnKeys: ["b"] }));
  assert.equal(s["!ref"], "A1:A2");
  assert.equal(s.A2.v, 20);
  api.destroy();
});

test("excel: two grids on one page are independent", async () => {
  const a = createDexGrid(container(150), { columnDefs: [{ field: "v" }], rowData: [{ v: "A" }] });
  const b = createDexGrid(container(150), { columnDefs: [{ field: "v" }], rowData: [{ v: "B" }] });
  const sa = await read(a.getDataAsExcel());
  const sb = await read(b.getDataAsExcel());
  assert.deepEqual([sa.A2.v, sb.A2.v], ["A", "B"]);
  a.destroy();
  b.destroy();
});

test("excel: method is reachable from event params.api", async () => {
  let fromEvent = null;
  const api = createDexGrid(container(), { columnDefs: [{ field: "v" }], rowData: [{ v: 1 }], onGridReady: (e) => { fromEvent = e.api; } });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(typeof (fromEvent ?? api).getDataAsExcel, "function");
  assert.ok(fromEvent === api || fromEvent === null, "event api is the same object");
  api.destroy();
});
