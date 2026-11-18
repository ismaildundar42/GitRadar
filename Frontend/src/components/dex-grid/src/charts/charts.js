// Range charts with AG Charts Community (global agCharts or env.agCharts).
// Options: enableCharts, onChartCreated, onChartDestroyed, chartThemeOverrides.
// colDef: chartDataType ("category" | "series" | "excluded").
// api.createRangeChart({ chartType, cellRange?, chartContainer?, title? }) returns
// { chartId, chart, chartElement, destroyChart() } or undefined when charts are off.

import { attachMethods } from "../core/api.js";
import { dexColDef } from "../core/colDefs.js";
import { buildChartData, chartOptions, CHART_TYPES } from "./chartModel.js";

let nextId = 1;

export const chartsFeature = {
  name: "charts",
  gridOptions: ["enableCharts", "onChartCreated", "onChartDestroyed", "chartThemeOverrides"],
  colDefKeys: ["chartDataType"],
  attach(api, ctx) {
    const charts = new Map();
    ctx.state.charts = charts;
    const agCharts = () => ctx.env?.agCharts ?? globalThis.agCharts;

    const rangeData = (cellRange) => {
      let rowNodes;
      let columns;
      if (cellRange) {
        const all = api.getAllDisplayedColumns();
        const ids = cellRange.columns?.map((c) => (typeof c === "string" ? c : c.getColId()));
        if (ids?.length) columns = ids.map((id) => api.getColumn(id)).filter(Boolean);
        else {
          const a = all.findIndex((c) => c.getColId() === (typeof cellRange.columnStart === "string" ? cellRange.columnStart : cellRange.columnStart?.getColId()));
          const b = all.findIndex((c) => c.getColId() === (typeof cellRange.columnEnd === "string" ? cellRange.columnEnd : cellRange.columnEnd?.getColId()));
          columns = all.slice(Math.min(a, b), Math.max(a, b) + 1);
        }
        rowNodes = [];
        const top = Math.min(cellRange.rowStartIndex, cellRange.rowEndIndex ?? cellRange.rowStartIndex);
        const bottom = Math.max(cellRange.rowStartIndex, cellRange.rowEndIndex ?? cellRange.rowStartIndex);
        for (let r = top; r <= bottom; r++) {
          const n = api.getDisplayedRowAtIndex(r);
          if (n) rowNodes.push(n);
        }
      } else {
        const ranges = ctx.state.getCellRanges?.() ?? [];
        if (!ranges.length) return null;
        ({ rowNodes, columns } = ranges[0]);
      }
      const cols = columns.map((c) => ({ id: c.getColId(), name: api.getDisplayNameForColumn(c, "chart") ?? c.getColId(), chartDataType: dexColDef(c).chartDataType }));
      const rows = rowNodes.map((node) => {
        const r = {};
        for (const c of columns) {
          const raw = node.data?.__dexGroup && c.getColDef().context?.dexAutoGroup ? node.data.__dexGroup.label : api.getCellValue({ rowNode: node, colKey: c });
          r[c.getColId()] = typeof raw === "number" || typeof raw === "bigint" || raw == null ? raw : api.getCellValue({ rowNode: node, colKey: c, useFormatter: true }) ?? raw;
        }
        return r;
      });
      return buildChartData(cols, rows);
    };

    const create = (params = {}) => {
      if (!ctx.options.enableCharts) return undefined;
      const lib = agCharts();
      if (!lib?.AgCharts) throw new Error("dex-grid: AG Charts (global agCharts) is required for charts");
      const data = rangeData(params.cellRange);
      if (!data || !data.series.length) return undefined;
      const chartId = `dex-chart-${nextId++}`;
      let chartType = params.chartType ?? "groupedColumn";
      const t = (k, f) => api.getGridOption("localeText")?.[k] ?? f;
      const host = params.chartContainer ?? createDialog(ctx, t, () => ref.destroyChart());
      const target = host.querySelector?.(".dex-chart-body") ?? host;
      const build = () => ({ container: target, ...chartOptions(chartType, data, params.title), ...(ctx.options.chartThemeOverrides ? { theme: { overrides: ctx.options.chartThemeOverrides } } : {}) });
      const chart = lib.AgCharts.create(build());
      const ref = {
        chartId,
        chart,
        chartElement: host,
        chartType: () => chartType,
        setChartType: (type) => {
          chartType = type;
          chart.update?.(build());
        },
        destroyChart: () => {
          if (!charts.has(chartId)) return;
          charts.delete(chartId);
          chart.destroy?.();
          if (!params.chartContainer) {
            host._dexCleanup?.();
            host.remove();
          }
          ctx.options.onChartDestroyed?.({ type: "chartDestroyed", chartId, api });
        },
      };
      charts.set(chartId, ref);
      const select = host.querySelector?.(".dex-chart-type");
      if (select) {
        select.value = chartType;
        select.addEventListener("change", () => ref.setChartType(select.value));
      }
      host.querySelector?.(".dex-chart-download")?.addEventListener("click", () => chart.download?.({ fileName: chartId }));
      ctx.options.onChartCreated?.({ type: "chartCreated", chartId, api });
      return ref;
    };

    attachMethods(api, {
      createRangeChart: create,
      getChartRef: (id) => charts.get(id),
      getChartRefs: () => [...charts.values()],
      /** The data a range chart would plot (for tests and custom UIs). */
      getChartData: (params = {}) => rangeData(params.cellRange),
    });
  },
  destroy(ctx) {
    for (const ref of [...(ctx.state.charts?.values() ?? [])]) ref.destroyChart();
  },
};

function createDialog(ctx, t, onClose) {
  const dialog = document.createElement("div");
  dialog.className = "dex-chart-dialog";
  dialog.setAttribute("role", "dialog");
  const head = document.createElement("div");
  head.className = "dex-chart-head";
  const select = document.createElement("select");
  select.className = "dex-chart-type";
  for (const type of CHART_TYPES) {
    const o = document.createElement("option");
    o.value = type;
    o.textContent = t(type, type);
    select.appendChild(o);
  }
  const download = document.createElement("button");
  download.type = "button";
  download.className = "dex-chart-download";
  download.textContent = t("chartDownload", "Download");
  const close = document.createElement("button");
  close.type = "button";
  close.className = "dex-chart-close";
  close.setAttribute("aria-label", t("close", "Close"));
  close.textContent = "×";
  close.addEventListener("click", onClose);
  head.append(select, download, close);
  const body = document.createElement("div");
  body.className = "dex-chart-body";
  dialog.append(head, body);
  let drag = null;
  head.addEventListener("mousedown", (e) => {
    if (e.target !== head) return;
    const r = dialog.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
  });
  const onMove = (e) => {
    if (!drag) return;
    dialog.style.left = `${e.clientX - drag.dx}px`;
    dialog.style.top = `${e.clientY - drag.dy}px`;
    dialog.style.transform = "none";
  };
  const onUp = () => (drag = null);
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
  dialog._dexCleanup = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };
  document.body.appendChild(dialog);
  return dialog;
}
