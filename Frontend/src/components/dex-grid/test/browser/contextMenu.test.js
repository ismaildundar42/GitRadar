import { test, assert, container, sleep } from "./runner.js";
import { createDexGrid } from "../../src/index.js";

const menus = () => [...document.querySelectorAll(".dex-menu")];
const labels = (menu) => [...menu.querySelectorAll(".dex-menu-item .dex-menu-label")].map((e) => e.textContent);

function captureWarnings() {
  const warnings = [];
  const ow = console.warn;
  console.warn = (...a) => { warnings.push(a.map(String).join(" ")); ow(...a); };
  return { warnings, restore: () => { console.warn = ow; } };
}

test("context menu: default items, localized, no AG Grid enterprise warning", async () => {
  const cap = captureWarnings();
  const api = createDexGrid(container(), {
    columnDefs: [{ field: "a" }],
    rowData: [{ a: 1 }],
    getContextMenuItems: undefined,
    localeText: { copy: "Kopyala", copyWithHeaders: "Başlıklarla Kopyala", paste: "Yapıştır", export: "Dışa Aktar" },
  });
  cap.restore();
  api.showContextMenu({ x: 50, y: 50 });
  assert.deepEqual(labels(menus()[0]), ["Kopyala", "Başlıklarla Kopyala", "Yapıştır", "Dışa Aktar"]);
  assert.equal(menus()[0].querySelectorAll(".dex-menu-separator").length, 1);
  assert.equal(cap.warnings.filter((w) => /AG Grid/.test(w)).length, 0, cap.warnings.join(" / "));
  api.hidePopupMenu();
  assert.equal(menus().length, 0);
  api.destroy();
});

test("context menu: DexShed-style getContextMenuItems with custom actions and built-ins", async () => {
  const calls = [];
  const api = createDexGrid(container(), {
    columnDefs: [{ field: "a" }],
    rowData: [{ a: 1 }],
    getContextMenuItems: (p) => [
      "copy",
      "separator",
      "separator",
      { name: "Satırı Sil", action: () => calls.push(["delete", p.node?.data?.a]) },
      { name: "Kapalı", disabled: true, action: () => calls.push(["disabled"]) },
      "autoSizeAll",
      "expandAll",
      "chartRange",
      "separator",
    ],
  });
  const node = api.getDisplayedRowAtIndex(0);
  api.showContextMenu({ rowNode: node, column: api.getColumn("a"), x: 10, y: 10 });
  const menu = menus()[0];
  assert.deepEqual(labels(menu), ["Copy", "Satırı Sil", "Kapalı", "Autosize All Columns", "Expand All Row Groups", "Chart Range"]);
  assert.equal(menu.querySelectorAll(".dex-menu-separator").length, 1, "duplicate and trailing separators collapsed");
  const items = menu.querySelectorAll(".dex-menu-item");
  items[2].click();
  assert.deepEqual(calls, [], "disabled item does nothing");
  items[1].click();
  assert.deepEqual(calls, [["delete", 1]]);
  assert.equal(menus().length, 0, "menu closes after action");
  api.destroy();
});

test("context menu: right-click on a cell opens it; Escape closes", async () => {
  const api = createDexGrid(container(), { columnDefs: [{ field: "a" }], rowData: [{ a: 1 }] });
  await sleep(30);
  const cell = document.querySelector('.ag-row[row-index="0"] [col-id="a"]');
  const r = cell.getBoundingClientRect();
  cell.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5, button: 2 }));
  await sleep(30);
  assert.equal(menus().length, 1, "menu opened from cell");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(menus().length, 0);
  api.destroy();
});

test("context menu: export submenu opens on hover and runs CSV export", async () => {
  const api = createDexGrid(container(), { columnDefs: [{ field: "a" }], rowData: [{ a: 1 }] });
  let csvCalled = false;
  const orig = api.exportDataAsCsv.bind(api);
  api.exportDataAsCsv = () => { csvCalled = true; };
  api.showContextMenu({ x: 10, y: 10 });
  const exportRow = [...menus()[0].querySelectorAll(".dex-menu-item")].find((e) => e.textContent.includes("Export"));
  exportRow.dispatchEvent(new MouseEvent("mouseenter"));
  assert.equal(menus().length, 2, "submenu layer");
  assert.deepEqual(labels(menus()[1]), ["CSV Export", "Excel Export"]);
  menus()[1].querySelector(".dex-menu-item").click();
  assert.ok(csvCalled);
  api.exportDataAsCsv = orig;
  api.destroy();
});

test("context menu: suppressContextMenu keeps the browser menu", async () => {
  const api = createDexGrid(container(), { columnDefs: [{ field: "a" }], rowData: [{ a: 1 }], suppressContextMenu: true });
  await sleep(30);
  const cell = document.querySelector('.ag-row[row-index="0"] [col-id="a"]');
  const evt = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  cell.dispatchEvent(evt);
  await sleep(30);
  assert.equal(menus().length, 0);
  assert.ok(!evt.defaultPrevented, "browser menu not suppressed");
  api.destroy();
});
