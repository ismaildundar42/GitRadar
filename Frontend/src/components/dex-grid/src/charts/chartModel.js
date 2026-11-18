// Pure chart logic: turning a cell range into chart data and AG Grid chart type
// names into AG Charts (community) options.

export const CHART_TYPES = [
  "groupedColumn",
  "stackedColumn",
  "normalizedColumn",
  "groupedBar",
  "stackedBar",
  "normalizedBar",
  "line",
  "area",
  "stackedArea",
  "pie",
  "donut",
  "scatter",
];

const isNumeric = (v) => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "bigint");

/**
 * @param {Array<{ id: string, name: string, chartDataType?: "category" | "series" | "excluded" }>} columns
 * @param {Array<Record<string, unknown>>} rows values by column id (category values already formatted)
 * @returns {{ categoryKey: string | null, series: Array<{ key: string, name: string }>, data: object[] }}
 */
export function buildChartData(columns, rows) {
  const usable = columns.filter((c) => c.chartDataType !== "excluded");
  const explicitCategory = usable.find((c) => c.chartDataType === "category");
  const numericCols = usable.filter((c) => c.chartDataType === "series" || (c.chartDataType !== "category" && rows.length > 0 && rows.every((r) => r[c.id] == null || isNumeric(r[c.id])) && rows.some((r) => isNumeric(r[c.id]))));
  const category = explicitCategory ?? usable.find((c) => !numericCols.includes(c)) ?? null;
  const series = numericCols.filter((c) => c !== category).map((c) => ({ key: c.id, name: c.name }));
  const categoryKey = category ? category.id : "__dexRow";
  const data = rows.map((r, i) => {
    const out = { [categoryKey]: category ? (r[category.id] == null ? "" : String(r[category.id])) : String(i + 1) };
    for (const s of series) out[s.key] = r[s.key] == null ? null : Number(r[s.key]);
    return out;
  });
  return { categoryKey, series, data };
}

/** AG Charts options for an AG Grid chart type name. */
export function chartOptions(chartType, { categoryKey, series, data }, title) {
  const base = { data, title: title ? { text: title } : undefined, legend: { enabled: series.length > 1 || chartType === "pie" || chartType === "donut" } };
  const bar = (direction, stacked, normalized) => ({
    ...base,
    series: series.map((s) => ({ type: "bar", direction, xKey: categoryKey, yKey: s.key, yName: s.name, ...(stacked ? { stacked: true } : {}), ...(normalized ? { normalizedTo: 100 } : {}) })),
  });
  switch (chartType) {
    case "groupedColumn":
      return bar("vertical", false, false);
    case "stackedColumn":
      return bar("vertical", true, false);
    case "normalizedColumn":
      return bar("vertical", true, true);
    case "groupedBar":
      return bar("horizontal", false, false);
    case "stackedBar":
      return bar("horizontal", true, false);
    case "normalizedBar":
      return bar("horizontal", true, true);
    case "line":
      return { ...base, series: series.map((s) => ({ type: "line", xKey: categoryKey, yKey: s.key, yName: s.name })) };
    case "area":
      return { ...base, series: series.map((s) => ({ type: "area", xKey: categoryKey, yKey: s.key, yName: s.name })) };
    case "stackedArea":
      return { ...base, series: series.map((s) => ({ type: "area", xKey: categoryKey, yKey: s.key, yName: s.name, stacked: true })) };
    case "pie":
      return { ...base, series: series.slice(0, 1).map((s) => ({ type: "pie", angleKey: s.key, legendItemKey: categoryKey, calloutLabelKey: categoryKey, angleName: s.name })) };
    case "donut":
      return { ...base, series: series.slice(0, 1).map((s) => ({ type: "donut", angleKey: s.key, legendItemKey: categoryKey, calloutLabelKey: categoryKey, angleName: s.name, innerRadiusRatio: 0.6 })) };
    case "scatter":
      return { ...base, series: series.slice(1).map((s) => ({ type: "scatter", xKey: series[0].key, xName: series[0].name, yKey: s.key, yName: s.name })) };
    default:
      throw new Error(`dex-grid: unsupported chart type "${chartType}"`);
  }
}
