# dex-grid

An open-source (MIT) data grid built on **AG Grid Community 36.2.0**. It adds,
as independent code, the AG Grid Enterprise features that the DexShed web app
uses. Options, column definitions and api method names follow AG Grid, so
existing AG Grid Enterprise configurations mostly work unchanged.

The Enterprise features were written from DexShed's requirements and AG Grid
Community's public API. No AG Grid Enterprise code is included.

## Features

| Feature | AG Grid-style API |
|---|---|
| Set filter | `filter: "agSetColumnFilter"`, set filter model `{ filterType: "set", values }` |
| Rich select editor | `cellEditor: "agRichSelectCellEditor"`, `cellEditorParams: { values, filterList, formatValue, valueListMaxHeight }` |
| Columns tool panel | `sideBar`, `openToolPanel`, `closeToolPanel`, `setSideBarVisible` |
| Context menu | `getContextMenuItems` (built-ins: copy, copyWithHeaders, paste, separator, export, csvExport, excelExport, autoSizeAll, resetColumns, expandAll, contractAll, chartRange) |
| Clipboard | Ctrl/Cmd+C, Ctrl/Cmd+V, `copyToClipboard`, `pasteFromClipboard`, `processCellForClipboard`, `processCellFromClipboard` |
| Cell range selection | `cellSelection`, `getCellRanges`, `addCellRange`, `clearCellSelection` |
| Row grouping + aggregation | `rowGroup`, `enableRowGroup`, `aggFunc`, `groupDefaultExpanded`, `autoGroupColumnDef`, `rowGroupPanelShow`, `setRowGroupColumns`, `expandAll`, `collapseAll` |
| Pivot | `pivotMode`, `pivot`, `enablePivot`, `setPivotMode`, `setPivotColumns`, `getPivotResultColumns` |
| Excel export | `exportDataAsExcel`, `getDataAsExcel` (SheetJS) |
| Range charts | `enableCharts`, `createRangeChart` (AG Charts Community) |

## Install and use

```html
<script src="ag-grid-community.js"></script>          <!-- ag-grid-community@36.2.0 -->
<script src="xlsx.full.min.js"></script>              <!-- SheetJS 0.20.3, for Excel export -->
<script src="ag-charts-community.js"></script>        <!-- ag-charts-community@14.2.0, for charts -->
<link rel="stylesheet" href="dex-grid/src/styles.css">
<script type="module">
  import { createDexGrid } from "./dex-grid/src/index.js";
  const api = createDexGrid(document.getElementById("grid"), gridOptions);
</script>
```

`createDexGrid(container, gridOptions, env?)` takes AG Grid-style options. It
returns the grid api with the extra methods attached; the same object is passed
to event handlers as `params.api`. `env` can provide `{ agGrid, XLSX, agCharts }`
instead of the globals.

### Migrating from AG Grid Enterprise

1. Load `ag-grid-community` (pinned version) instead of `ag-grid-enterprise`.
   Load SheetJS and AG Charts Community if you use Excel export or charts.
2. Replace `agGrid.createGrid(el, options)` with `createDexGrid(el, options)`.
3. Remove the license key call.

## Differences from AG Grid Enterprise

- **Group rows are ordinary rows.** `node.group` is `false`; `node.data.__dexGroup`
  holds the group. Use `api.isGroupNode(node)` when iterating with `forEachNode`.
- **Id names.** Group row ids start with `dex-group-` and the auto group column id
  is `dex-auto-group`, because AG Grid reserves `row-group-` and `ag-Grid-AutoColumn`.
- **Aggregates are plain values.** For example, `avg` is a number, not a `{ value, count }` object.
- **Set filter label formatting.** The set filter uses `filterParams.valueFormatter`,
  then `colDef.valueFormatter`, for its labels and its search.
- **Unmatched set filter values.** A model whose values match no data keeps those
  values and passes no rows.
- **Pivot columns.** Pivot result columns are generated from all rows; filters change
  their values but not the column set.
- **Excel export typing.** Strings stay text (`"0012"` keeps its zeros); numbers stay
  numbers, with an optional `colDef.context.excel.numberFormat`.
- **Group sort order.** Without a sort, groups appear in first-appearance order. Sorting
  by the group column or an aggregated column orders groups by that value.
- **Not implemented.** Server-side row model, tree data, master/detail, multi filter,
  advanced filter, filters tool panel, status bar, sparklines, integrated chart editing
  UI, undo for paste.

## Tests

```bash
npm test
```

```bash
npm run demo
```

`npm test` runs the pure-logic unit tests. `npm run demo` serves the demo at
<http://localhost:5180/> and the browser test suite at
`/test/browser/index.html?suites=excel,setFilter,richSelect,clipboard,contextMenu,columnsPanel,cellSelection,grouping,pivot,charts,dexshed`.

## License

MIT. AG Grid Community, AG Charts Community and SheetJS Community Edition are
separate packages under their own licenses (MIT, MIT and Apache-2.0).
