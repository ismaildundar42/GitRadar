// Cell range selection (cellSelection: true | { suppressMultiRanges?: boolean }).
//
// Mouse: drag selects a range, Shift+click extends the last range, Ctrl/Cmd+click
// adds a range. Keyboard: Shift+arrows extend from the focused cell; focusing a
// cell without Shift selects just that cell; Delete/Backspace on a multi-cell
// range clears its editable cells. Ranges are kept by column id, so moving
// columns keeps them; sorting, filtering or new row data clears them because row
// indexes then point at different rows. Clicks in the row selection column do not
// start a range (applications may implement drag-to-select rows there).

import { attachMethods } from "../core/api.js";
import { cellState, normalize, cellCount } from "./rangeModel.js";

const UTILITY = new Set(["ag-Grid-SelectionColumn", "ag-Grid-RowNumbersColumn"]);

export const cellSelectionFeature = {
  name: "cellSelection",
  gridOptions: ["cellSelection", "enableRangeSelection", "suppressMultiRangeSelection", "onCellSelectionChanged", "onRangeSelectionChanged"],
  attach(api, ctx) {
    const sel = { ranges: [], dragging: false, shift: false, mouseFocus: false };
    ctx.state.cellSelection = sel;
    const enabled = () => !!(ctx.options.cellSelection || ctx.options.enableRangeSelection);
    const multi = () => !ctx.options.suppressMultiRangeSelection && !(typeof ctx.options.cellSelection === "object" && ctx.options.cellSelection.suppressMultiRanges);
    const columns = () => {
      const cols = api?.getAllDisplayedColumns?.();
      if (!cols || !Array.isArray(cols)) return [];
      return cols.filter((c) => c && !UTILITY.has(c.getColId?.()));
    };
    const colPos = (id) => columns().findIndex((c) => c.getColId() === id);
    const positional = () =>
      sel.ranges
        .map((r) => ({ r1: r.r1, r2: r.r2, c1: colPos(r.col1), c2: colPos(r.col2) }))
        .filter((r) => r.c1 >= 0 && r.c2 >= 0);
    const notify = (finished) => {
      const event = { type: "cellSelectionChanged", api, started: !finished, finished };
      ctx.options.onCellSelectionChanged?.(event);
      ctx.options.onRangeSelectionChanged?.({ ...event, type: "rangeSelectionChanged" });
    };
    const set = (ranges, finished = true) => {
      sel.ranges = ranges;
      paint();
      notify(finished);
    };

    // ----- painting ---------------------------------------------------------
    let scheduled = false;
    const paint = () => {
      scheduled = false;
      if (!api || !api.getAllDisplayedColumns) return;
      if (!enabled()) return;
      const pos = positional();
      const cols = columns();
      const index = new Map(cols.map((c, i) => [c.getColId(), i]));
      // Body cells only: header cells are .ag-header-cell, not .ag-cell. AG Grid's
      // container class names change between versions, so do not rely on them.
      for (const cell of ctx.gridContainer.querySelectorAll(".ag-row .ag-cell[col-id]")) {
        const row = cell.closest(".ag-row");
        const r = row ? Number(row.getAttribute("row-index")) : NaN;
        const c = index.get(cell.getAttribute("col-id"));
        const st = Number.isFinite(r) && c !== undefined && !row.classList.contains("ag-row-pinned") ? cellState(pos, r, c) : null;
        cell.classList.toggle("dex-range-cell", !!st);
        cell.classList.toggle("dex-range-top", !!st?.top);
        cell.classList.toggle("dex-range-bottom", !!st?.bottom);
        cell.classList.toggle("dex-range-left", !!st?.left);
        cell.classList.toggle("dex-range-right", !!st?.right);
        cell.classList.toggle("dex-range-multi", (st?.count ?? 0) > 1);
      }
    };
    const schedule = () => {
      if (!api || !api.getAllDisplayedColumns || !enabled()) return;
      if (scheduled) return;
      scheduled = true;
      (typeof requestAnimationFrame === "function" ? requestAnimationFrame : setTimeout)(paint);
      setTimeout(() => scheduled && paint(), 50);
    };
    for (const type of ["bodyScroll", "viewportChanged", "virtualColumnsChanged", "displayedColumnsChanged", "columnResized", "columnMoved", "cellValueChanged", "modelUpdated"]) {
      api.addEventListener(type, schedule);
    }
    for (const type of ["sortChanged", "filterChanged", "rowDataUpdated", "newColumnsLoaded"]) {
      api.addEventListener(type, () => sel.ranges.length && set([]));
    }

    // ----- mouse ------------------------------------------------------------
    const cellAt = (el) => {
      const cell = el?.closest?.(".ag-cell[col-id]");
      const row = cell?.closest(".ag-row");
      if (!cell || !row || row.classList.contains("ag-row-pinned") || !ctx.gridContainer.contains(cell)) return null;
      const colId = cell.getAttribute("col-id");
      if (UTILITY.has(colId)) return null;
      const r = Number(row.getAttribute("row-index"));
      return Number.isFinite(r) ? { r, colId } : null;
    };
    const onDown = (e) => {
      if (!api || !api.getAllDisplayedColumns) return;
      if (!enabled() || (e.button !== 0 && e.button !== 2)) return;
      if (e.target.closest(".ag-cell-inline-editing, .ag-popup-editor, input, select, textarea")) return;
      const hit = cellAt(e.target);
      if (!hit) return;
      sel.mouseFocus = true;
      const last = sel.ranges[sel.ranges.length - 1];
      if (e.button === 2) {
        const inside = positional().some((p) => normalize(p).top <= hit.r && hit.r <= normalize(p).bottom && normalize(p).left <= colPos(hit.colId) && colPos(hit.colId) <= normalize(p).right);
        if (!inside) set([{ r1: hit.r, r2: hit.r, col1: hit.colId, col2: hit.colId }]);
        return;
      }
      if (e.shiftKey && last) {
        set([...sel.ranges.slice(0, -1), { ...last, r2: hit.r, col2: hit.colId }], false);
      } else if ((e.ctrlKey || e.metaKey) && multi()) {
        set([...sel.ranges, { r1: hit.r, r2: hit.r, col1: hit.colId, col2: hit.colId }], false);
      } else {
        set([{ r1: hit.r, r2: hit.r, col1: hit.colId, col2: hit.colId }], false);
      }
      sel.dragging = true;
      ctx.container.classList.add("dex-range-dragging");
    };
    const onMove = (e) => {
      if (!api || !api.getAllDisplayedColumns) return;
      if (!sel.dragging) return;
      const hit = cellAt(document.elementFromPoint(e.clientX, e.clientY));
      const last = sel.ranges[sel.ranges.length - 1];
      if (!hit || !last || (last.r2 === hit.r && last.col2 === hit.colId)) return;
      sel.ranges = [...sel.ranges.slice(0, -1), { ...last, r2: hit.r, col2: hit.colId }];
      paint();
      notify(false);
    };
    const onUp = () => {
      if (!sel.dragging) return;
      sel.dragging = false;
      ctx.container.classList.remove("dex-range-dragging");
      notify(true);
    };

    // ----- keyboard ---------------------------------------------------------
    const editing = () => api.getEditingCells().length > 0;
    const onKey = (e) => {
      sel.shift = e.shiftKey;
      if (!enabled() || editing()) return;
      if ((e.key === "Delete" || e.key === "Backspace") && cellCount(positional()) > 1) {
        e.preventDefault();
        e.stopPropagation();
        clearRangeValues();
      }
    };
    const onKeyUp = (e) => {
      sel.shift = e.shiftKey;
    };
    api.addEventListener("cellFocused", (e) => {
      if (!enabled() || e.rowIndex == null || !e.column || e.rowPinned) return;
      const colId = typeof e.column === "string" ? e.column : e.column.getColId();
      if (UTILITY.has(colId)) return;
      if (sel.mouseFocus) {
        sel.mouseFocus = false;
        return;
      }
      const last = sel.ranges[sel.ranges.length - 1];
      if (sel.shift && last) set([...sel.ranges.slice(0, -1), { ...last, r2: e.rowIndex, col2: colId }]);
      else set([{ r1: e.rowIndex, r2: e.rowIndex, col1: colId, col2: colId }]);
    });

    const clearRangeValues = () => {
      for (const range of rangeNodes()) {
        for (const node of range.rowNodes) {
          if (node.group || node.data?.__dexGroup) continue;
          for (const column of range.columns) if (column.isCellEditable(node)) node.setDataValue(column, null, "rangeSvc");
        }
      }
    };

    const root = ctx.gridContainer;
    root.addEventListener("mousedown", onDown);
    root.addEventListener("keydown", onKey, true);
    root.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    sel.cleanup = () => {
      root.removeEventListener("mousedown", onDown);
      root.removeEventListener("keydown", onKey, true);
      root.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    // ----- api --------------------------------------------------------------
    const rangeNodes = () => {
      const cols = columns();
      return positional().map((p) => {
        const n = normalize(p);
        const rowNodes = [];
        for (let r = n.top; r <= n.bottom; r++) {
          const node = api.getDisplayedRowAtIndex(r);
          if (node) rowNodes.push(node);
        }
        return { rowNodes, columns: cols.slice(n.left, n.right + 1), top: n.top, bottom: n.bottom };
      });
    };
    ctx.state.getCellRanges = () => (enabled() ? rangeNodes() : []);
    const toAgRange = (r, i) => {
      const p = positional()[i];
      const n = normalize(p);
      const cols = columns();
      return { id: String(i), startRow: { rowIndex: r.r1, rowPinned: null }, endRow: { rowIndex: r.r2, rowPinned: null }, columns: cols.slice(n.left, n.right + 1), startColumn: api.getColumn(r.col1) };
    };
    const resolveCol = (c) => (typeof c === "string" ? c : c?.getColId?.());
    attachMethods(api, {
      getCellRanges: () => (enabled() ? sel.ranges.filter((r) => colPos(r.col1) >= 0 && colPos(r.col2) >= 0).map(toAgRange) : null),
      addCellRange: (params) => {
        if (!enabled()) return;
        const ids = params.columns?.map(resolveCol) ?? [];
        const col1 = resolveCol(params.columnStart) ?? ids[0];
        const col2 = resolveCol(params.columnEnd) ?? ids[ids.length - 1] ?? col1;
        if (!col1) return;
        const range = { r1: params.rowStartIndex, r2: params.rowEndIndex ?? params.rowStartIndex, col1, col2 };
        set(multi() ? [...sel.ranges, range] : [range]);
      },
      clearCellSelection: () => set([]),
      clearRangeSelection: () => set([]),
      /** Repaints range highlighting (normally automatic). */
      refreshCellSelection: paint,
    });
  },
  destroy(ctx) {
    ctx.state.cellSelection?.cleanup?.();
  },
};
