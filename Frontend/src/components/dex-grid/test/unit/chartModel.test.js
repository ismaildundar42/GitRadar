import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChartData, chartOptions, CHART_TYPES } from "../../src/charts/chartModel.js";

const cols = [{ id: "city", name: "City" }, { id: "gold", name: "Gold" }, { id: "silver", name: "Silver" }];
const rows = [{ city: "Ankara", gold: 3, silver: 1 }, { city: "Bursa", gold: null, silver: 2 }];

test("buildChartData: first non-numeric column is the category, numeric columns are series", () => {
  const d = buildChartData(cols, rows);
  assert.equal(d.categoryKey, "city");
  assert.deepEqual(d.series, [{ key: "gold", name: "Gold" }, { key: "silver", name: "Silver" }]);
  assert.deepEqual(d.data, [{ city: "Ankara", gold: 3, silver: 1 }, { city: "Bursa", gold: null, silver: 2 }]);
});

test("buildChartData: chartDataType overrides inference; no category uses row numbers", () => {
  const d = buildChartData([{ id: "year", name: "Year", chartDataType: "category" }, { id: "v", name: "V" }], [{ year: 2024, v: 1 }, { year: 2025, v: 2 }]);
  assert.equal(d.categoryKey, "year");
  assert.deepEqual(d.data.map((r) => r.year), ["2024", "2025"]);
  const n = buildChartData([{ id: "v", name: "V" }], [{ v: 5 }, { v: 6 }]);
  assert.equal(n.categoryKey, "__dexRow");
  assert.deepEqual(n.data.map((r) => r.__dexRow), ["1", "2"]);
  const ex = buildChartData([...cols, { id: "x", name: "X", chartDataType: "excluded" }], rows.map((r) => ({ ...r, x: 9 })));
  assert.ok(!ex.series.some((s) => s.key === "x"));
});

test("chartOptions: every supported type maps to AG Charts series", () => {
  const d = buildChartData(cols, rows);
  for (const type of CHART_TYPES) {
    const o = chartOptions(type, d, "T");
    assert.ok(Array.isArray(o.series) && o.series.length > 0, type);
  }
  assert.deepEqual(chartOptions("stackedBar", d).series[0], { type: "bar", direction: "horizontal", xKey: "city", yKey: "gold", yName: "Gold", stacked: true });
  assert.equal(chartOptions("pie", d).series.length, 1, "pie uses the first series");
  assert.equal(chartOptions("normalizedColumn", d).series[0].normalizedTo, 100);
  assert.throws(() => chartOptions("bogus", d));
});
