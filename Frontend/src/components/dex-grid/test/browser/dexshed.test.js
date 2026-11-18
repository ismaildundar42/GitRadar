// Compatibility smoke test: the options, column definitions and api calls of
// DexShed's main data grid (public/main.js), reproduced from an inventory of that
// code. DexShed itself is not modified or loaded here.

import { test, assert, container, sleep } from "./runner.js";
import { createDexGrid } from "../../src/index.js";

const TR = { blanks: "(Boş)", selectAll: "(Tümünü Seç)", searchOoo: "Ara...", copy: "Kopyala", copyWithHeaders: "Başlıklarla Kopyala", paste: "Yapıştır", columns: "Kolonlar", group: "Grup", noRowsToShow: "Gösterilecek satır yok" };

function captureConsole() {
  const messages = [];
  const ow = console.warn, oe = console.error;
  console.warn = (...a) => { messages.push(a.map(String).join(" ")); ow(...a); };
  console.error = (...a) => { messages.push(a.map(String).join(" ")); oe(...a); };
  return { messages, restore: () => { console.warn = ow; console.error = oe; } };
}

const rows = () => Array.from({ length: 40 }, (_, i) => ({
  HoleID: `BH-${String(i % 5).padStart(3, "0")}`,
  SampleID: `S${i}`,
  From: i * 1.5,
  To: i * 1.5 + 1.5,
  Lithology: ["Andezit", "Bazalt", "Granit", null][i % 4],
  Date: new Date(2024, i % 12, 1 + (i % 27)),
  Au_ppm: Math.round(Math.random() * 1000) / 100,
}));

function makeColumnDefs() {
  // Shape of main.js createColumnDefs: enableRowGroup/enablePivot on every column,
  // set filters for text, number/date filters, rich select editor, cell class rules.
  return [
    { headerName: "HoleID", field: "HoleID", colId: "HoleID", enableRowGroup: true, enablePivot: true, filter: "agSetColumnFilter", pinned: "left", lockPosition: true, lockVisible: true, editable: false, cellClassRules: { "pk-empty": (p) => !p.value } },
    { headerName: "SampleID", field: "SampleID", enableRowGroup: true, enablePivot: true, filter: "agTextColumnFilter", tooltipValueGetter: (p) => `Örnek ${p.value}` },
    { headerName: "From", field: "From", enableRowGroup: true, enablePivot: true, filter: "agNumberColumnFilter", valueParser: (p) => Number(p.newValue) },
    { headerName: "To", field: "To", enableRowGroup: true, enablePivot: true, filter: "agNumberColumnFilter" },
    { headerName: "Lithology", field: "Lithology", enableRowGroup: true, enablePivot: true, filter: "agSetColumnFilter", cellEditor: "agRichSelectCellEditor", cellEditorParams: { values: ["Andezit", "Bazalt", "Granit"], filterList: true, valueListMaxHeight: 200, formatValue: (v) => v ?? "" } },
    { headerName: "Date", field: "Date", enableRowGroup: true, enablePivot: true, filter: "agDateColumnFilter", cellEditor: "agDateCellEditor", valueFormatter: (p) => (p.value instanceof Date ? p.value.toISOString().slice(0, 10) : "") },
    { headerName: "Au_ppm", field: "Au_ppm", enableRowGroup: true, enablePivot: true, filter: "agNumberColumnFilter", cellStyle: (p) => (p.value > 9 ? { color: "red" } : null) },
  ];
}

function makeGrid(events) {
  return createDexGrid(container(520), {
    localeText: TR,
    rowModelType: "clientSide",
    undoRedoCellEditing: true,
    undoRedoCellEditingLimit: 10,
    defaultColDef: {
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 100,
      editable: (p) => p.colDef.field !== "HoleID",
      onCellValueChanged: (e) => events.push(["default", e.colDef.field]),
      cellStyle: (p) => (p.colDef.field === "HoleID" && !p.value ? { background: "#fee" } : null),
    },
    columnDefs: makeColumnDefs(),
    rowData: rows(),
    rowGroupPanelShow: "false",
    sideBar: { toolPanels: [{ id: "columns", labelDefault: "Kolonlar", labelKey: "columns", iconKey: "columns", toolPanel: "agColumnsToolPanel", toolPanelParams: { suppressRowGroups: false, suppressValues: false, suppressPivots: false, suppressPivotMode: false } }], defaultToolPanel: "" },
    groupDefaultExpanded: 1,
    enableCharts: true,
    rowSelection: { mode: "multiRow", checkboxes: true, headerCheckbox: true, enableClickSelection: false, selectAll: "filtered" },
    autoGroupColumnDef: { headerName: "Grup", minWidth: 220, cellRendererParams: { suppressCount: false }, cellRenderer: "agGroupCellRenderer" },
    autoSizeStrategy: { type: "fitCellContents" },
    cellSelection: true,
    overlayLoadingTemplate: '<span class="ag-overlay-loading-center">Yükleniyor...</span>',
    overlayNoRowsTemplate: "<span>Kayıt yok</span>",
    getContextMenuItems: (params) => [
      "copy",
      "copyWithHeaders",
      "paste",
      "separator",
      "chartRange",
      "separator",
      "contractAll",
      "expandAll",
      "autoSizeAll",
      "separator",
      { name: "Seçili satırları sil", action: () => events.push(["delete", params.api.getSelectedRows().length]) },
    ],
    onGridReady: (e) => events.push(["ready", typeof e.api.exportDataAsExcel]),
    onCellValueChanged: (e) => events.push(["grid", e.colDef.field]),
    onCellMouseDown: () => {},
    onCellMouseOver: () => {},
    onRowSelected: () => {},
    onChartCreated: () => events.push(["chart"]),
  });
}

test("dexshed: main grid options create no AG Grid warnings or errors", async () => {
  const cap = captureConsole();
  const events = [];
  const api = makeGrid(events);
  await sleep(100);
  cap.restore();
  const agMessages = cap.messages.filter((m) => /AG Grid/.test(m));
  assert.equal(agMessages.length, 0, agMessages.join(" / "));
  assert.ok(events.some((e) => e[0] === "ready" && e[1] === "function"), "onGridReady sees dex api");
  api.destroy();
});

test("dexshed: api calls used by main.js work", async () => {
  const events = [];
  const api = makeGrid(events);
  await sleep(50);
  api.setGridOption("loading", true);
  api.setGridOption("loading", false);
  api.refreshCells({ force: true });
  const defs = api.getColumnDefs();
  assert.equal(defs.length, 7, "getColumnDefs returns the 7 user columns");
  api.setGridOption("columnDefs", defs);
  await sleep(20);
  assert.ok(api.getColumn("Lithology"), "columns re-set from getColumnDefs");
  const add = api.applyTransaction({ add: [{ HoleID: "BH-NEW", SampleID: "S-NEW", From: 0, To: 1 }] });
  assert.equal(add.add.length, 1);
  assert.equal(api.getDisplayedRowCount(), 41);
  api.ensureIndexVisible(40);
  api.getDisplayedRowAtIndex(0).setSelected(true);
  assert.equal(api.getSelectedRows().length, 1);
  api.applyTransaction({ remove: api.getSelectedRows() });
  assert.equal(api.getDisplayedRowCount(), 40);
  let n = 0;
  api.forEachNode(() => n++);
  assert.equal(n, 40);
  api.autoSizeAllColumns();
  assert.ok(api.getGridOption("rowSelection").mode === "multiRow");
  const csv = api.getDataAsCsv();
  assert.ok(csv.split("\n").length >= 41);
  const xlsx = api.getDataAsExcel();
  assert.ok(xlsx instanceof Blob && xlsx.size > 1000);
  api.showNoRowsOverlay?.();
  api.destroy();
});

test("dexshed: set filter on HoleID, rich select edit, edit events fire", async () => {
  const events = [];
  const api = makeGrid(events);
  await sleep(50);
  await api.setColumnFilterModel("HoleID", { values: ["BH-001", "BH-002"] });
  api.onFilterChanged();
  assert.equal(api.getDisplayedRowCount(), 16);
  await api.setColumnFilterModel("HoleID", null);
  api.onFilterChanged();
  const lith = await api.getColumnFilterInstance("Lithology");
  assert.deepEqual(lith.getDisplayedKeys(), [null, "Andezit", "Bazalt", "Granit"]);
  assert.equal(lith.label(null), "(Boş)");
  api.startEditingCell({ rowIndex: 0, colKey: "Lithology" });
  await sleep(50);
  const popup = document.querySelector(".dex-rich-select");
  assert.ok(popup, "rich select editor opened");
  popup.querySelectorAll(".dex-rich-select-item")[2].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  await sleep(50);
  assert.equal(api.getDisplayedRowAtIndex(0).data.Lithology, "Granit");
  assert.ok(events.some((e) => e[0] === "grid" && e[1] === "Lithology"), "grid onCellValueChanged");
  assert.equal(api.getColumn("HoleID").isCellEditable(api.getDisplayedRowAtIndex(0)), false, "defaultColDef.editable fn respected");
  api.destroy();
});

test("dexshed: grouping via the columns panel api, context menu items, range chart", async () => {
  const events = [];
  const api = makeGrid(events);
  await sleep(50);
  api.setRowGroupColumns(["HoleID"]);
  await sleep(30);
  assert.equal(api.getDisplayedRowAtIndex(0).data.__dexGroup?.label, "BH-000", "first group");
  const labels = api.getContextMenuItemsFor().map((i) => (i === "separator" ? "|" : i.name));
  assert.deepEqual(labels, ["Kopyala", "Başlıklarla Kopyala", "Yapıştır", "|", "Chart Range", "|", "Collapse All Row Groups", "Expand All Row Groups", "Autosize All Columns", "|", "Seçili satırları sil"]);
  api.getContextMenuItemsFor().find((i) => i.name === "Collapse All Row Groups").action();
  assert.equal(api.getDisplayedRowCount(), 5, "5 collapsed groups");
  api.setRowGroupColumns([]);
  await sleep(30);
  api.addCellRange({ rowStartIndex: 0, rowEndIndex: 4, columnStart: "SampleID", columnEnd: "To" });
  const chart = api.createRangeChart({ chartType: "groupedColumn" });
  assert.ok(chart, "chart created from a range");
  assert.ok(events.some((e) => e[0] === "chart"), "onChartCreated");
  api.destroy();
});
