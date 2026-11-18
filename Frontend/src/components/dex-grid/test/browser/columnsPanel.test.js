import { test, assert, container } from "./runner.js";
import { createDexGrid } from "../../src/index.js";

const cols = () => [
  { field: "a", lockVisible: true },
  { field: "b" },
  { field: "c", hide: true },
  { field: "d", suppressColumnsToolPanel: true },
];
const items = (root) => [...root.querySelectorAll(".dex-columns-item")].map((e) => [e.dataset.colId, e.querySelector("input").checked, e.querySelector("input").disabled]);
const displayed = (api) => api.getAllDisplayedColumns().map((c) => c.getColId());

test("columns panel: DexShed sideBar config renders all columns incl. hidden", async () => {
  const el = container();
  const api = createDexGrid(el, {
    columnDefs: cols(),
    rowData: [{ a: 1, b: 2, c: 3, d: 4 }],
    sideBar: { toolPanels: [{ id: "columns", labelDefault: "Kolonlar", toolPanel: "agColumnsToolPanel", toolPanelParams: { suppressRowGroups: false, suppressValues: false } }], defaultToolPanel: "columns" },
  });
  assert.ok(api.isToolPanelShowing());
  assert.equal(el.querySelector(".dex-side-tab").textContent, "Kolonlar");
  assert.deepEqual(items(el), [["a", true, true], ["b", true, false], ["c", false, false]]);
  api.destroy();
});

test("columns panel: tab label uses localeText[labelKey] before labelDefault", async () => {
  const el = container();
  const api = createDexGrid(el, {
    columnDefs: cols(),
    rowData: [{}],
    localeText: { columns: "Sütunlar" },
    sideBar: { toolPanels: [{ id: "columns", labelDefault: "Columns", labelKey: "columns", toolPanel: "agColumnsToolPanel" }] },
  });
  assert.equal(el.querySelector(".dex-side-tab").textContent, "Sütunlar");
  api.destroy();
});

test("columns panel: checkbox hides/shows columns, select all respects lockVisible", async () => {
  const el = container();
  const api = createDexGrid(el, { columnDefs: cols(), rowData: [{}], sideBar: true });
  const box = el.querySelector('.dex-columns-item[data-col-id="b"] input');
  box.checked = false;
  box.dispatchEvent(new Event("change"));
  assert.deepEqual(displayed(api), ["a", "d"]);
  const all = el.querySelector(".dex-columns-all");
  all.checked = true;
  all.dispatchEvent(new Event("change"));
  assert.deepEqual(displayed(api), ["a", "b", "c", "d"]);
  all.checked = false;
  all.dispatchEvent(new Event("change"));
  assert.deepEqual(displayed(api), ["a", "d"], "locked a stays; d is not in the panel");
  api.destroy();
});

test("columns panel: search filters the list (Turkish-aware)", async () => {
  const el = container();
  const api = createDexGrid(el, { columnDefs: [{ field: "il", headerName: "İl" }, { field: "ilce", headerName: "İlçe" }, { field: "x", headerName: "Mahalle" }], rowData: [{}], sideBar: true });
  const search = el.querySelector(".dex-columns-search");
  search.value = "il";
  search.dispatchEvent(new Event("input"));
  assert.deepEqual(items(el).map((i) => i[0]), ["il", "ilce"]);
  api.destroy();
});

test("columns panel: open/close api, toggle tab, sideBar option change", async () => {
  const el = container();
  const api = createDexGrid(el, { columnDefs: cols(), rowData: [{}], sideBar: { toolPanels: ["columns"], hiddenByDefault: true } });
  assert.ok(!api.isToolPanelShowing());
  api.openToolPanel("columns");
  assert.ok(api.isToolPanelShowing());
  el.querySelector(".dex-side-tab").click();
  assert.ok(!api.isToolPanelShowing(), "tab click closes");
  api.setGridOption("sideBar", false);
  assert.ok(el.querySelector(".dex-side-bar").hidden);
  assert.equal(api.getGridOption("sideBar"), false);
  api.destroy();
});

test("columns panel: moveColumnBefore reorders up and down", async () => {
  const { moveColumnBefore } = await import("../../src/panels/columnsPanel.js");
  const api = createDexGrid(container(), { columnDefs: [{ field: "a" }, { field: "b" }, { field: "c" }, { field: "d" }], rowData: [{}] });
  moveColumnBefore(api, "d", "b");
  assert.deepEqual(displayed(api), ["a", "d", "b", "c"]);
  moveColumnBefore(api, "a", "c");
  assert.deepEqual(displayed(api), ["d", "b", "a", "c"]);
  api.destroy();
});

test("columns panel: grid without sideBar has no visible side bar", async () => {
  const el = container();
  const api = createDexGrid(el, { columnDefs: [{ field: "a" }], rowData: [{}] });
  assert.ok(el.querySelector(".dex-side-bar").hidden);
  assert.ok(el.querySelector(".dex-grid-main .dex-grid-host .ag-root-wrapper"), "grid rendered in main area");
  api.destroy();
});
