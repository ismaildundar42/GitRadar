import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTree, aggregate, flatten, allGroups, groupKey, AGG_FUNCS, pivotKeyPaths, aggregatePivot, PIVOT_KEY_SEP } from "../../src/grouping/groupModel.js";

const rows = [
  { id: 1, country: "TR", sport: "Run", gold: 1 },
  { id: 2, country: "TR", sport: "Run", gold: 2 },
  { id: 3, country: "TR", sport: "Swim", gold: 3 },
  { id: 4, country: "DE", sport: "Run", gold: 4 },
  { id: 5, country: null, sport: "Run", gold: 5 },
  { id: 6, country: "", sport: "Swim", gold: 6 },
];
const cols = [{ colId: "country", keyOf: (d) => d.country }, { colId: "sport", keyOf: (d) => d.sport }];

test("buildTree: ids, levels, first-appearance order, blanks share one group", () => {
  const { root, groupsById } = buildTree(rows, cols);
  assert.deepEqual(root.children.map((g) => g.id), ["dex-group-country-TR", "dex-group-country-DE", "dex-group-country-"]);
  assert.deepEqual(root.children[0].children.map((g) => g.id), ["dex-group-country-TR-sport-Run", "dex-group-country-TR-sport-Swim"]);
  assert.equal(groupsById.get("dex-group-country-").leafs.length, 2);
  assert.equal(groupsById.get("dex-group-country-TR-sport-Run").leafLevel, true);
  assert.equal(groupKey("  "), "");
  assert.equal(groupKey(0), "0");
});

test("aggregate: weighted avg, summed count, sum/min/max ignore text, filtered leaves only", () => {
  const data = [
    { r: "X", s: "A", v: 1, m: "5" },
    { r: "X", s: "A", v: 2, m: 7 },
    { r: "X", s: "B", v: 9, m: null },
  ];
  const { root, groupsById } = buildTree(data, [{ colId: "r", keyOf: (d) => d.r }, { colId: "s", keyOf: (d) => d.s }]);
  const vc = (colId, aggFunc, field) => ({ colId, aggFunc, valueOf: (d) => d[field] });
  aggregate(root, [vc("avg", "avg", "v"), vc("count", "count", "v"), vc("sum", "sum", "m"), vc("min", "min", "m"), vc("max", "max", "m"), vc("first", "first", "v"), vc("last", "last", "v")], () => true);
  const x = groupsById.get("dex-group-r-X").agg;
  assert.equal(x.avg.value, 4, "weighted, not 5.25");
  assert.equal(x.avg.count, 3);
  assert.equal(String(x.avg), "4");
  assert.equal(x.count.value, 3);
  assert.equal(x.sum, 7);
  assert.equal(x.min, 7);
  assert.equal(x.max, 7);
  assert.equal(x.first, 1);
  assert.equal(x.last, 9);
  aggregate(root, [vc("sum", "sum", "v")], (d) => d.v < 5);
  assert.equal(groupsById.get("dex-group-r-X").agg.sum, 3, "only passing leaves");
  assert.equal(groupsById.get("dex-group-r-X-s-B").visibleLeaves, 0);
});

test("aggregate: bigint sum and custom agg functions", () => {
  assert.equal(AGG_FUNCS.sum([1, 2n, 3]), 6n);
  const { root, groupsById } = buildTree([{ g: "a", v: 2 }, { g: "a", v: 3 }], [{ colId: "g", keyOf: (d) => d.g }]);
  aggregate(root, [{ colId: "p", aggFunc: "product", valueOf: (d) => d.v }], () => true, { product: ({ values }) => values.reduce((a, b) => a * b, 1) });
  assert.equal(groupsById.get("dex-group-g-a").agg.p, 6);
});

test("flatten: depth-first, collapsed children hidden, empty groups dropped, leaf order respected", () => {
  const { root } = buildTree(rows, cols);
  const order = new Map(rows.map((r, i) => [r, i]));
  const all = flatten(root, { passes: () => true, leafOrder: order, expanded: () => true });
  assert.deepEqual(all.map((x) => (x.type === "group" ? x.group.id : x.data.id)), [
    "dex-group-country-TR", "dex-group-country-TR-sport-Run", 1, 2, "dex-group-country-TR-sport-Swim", 3,
    "dex-group-country-DE", "dex-group-country-DE-sport-Run", 4,
    "dex-group-country-", "dex-group-country--sport-Run", 5, "dex-group-country--sport-Swim", 6,
  ]);
  const collapsed = flatten(root, { passes: () => true, leafOrder: order, expanded: (g) => g.level === 0 && g.key === "TR" });
  assert.deepEqual(collapsed.map((x) => (x.type === "group" ? x.group.id : x.data.id)), [
    "dex-group-country-TR", "dex-group-country-TR-sport-Run", "dex-group-country-TR-sport-Swim", "dex-group-country-DE", "dex-group-country-",
  ]);
  const filtered = flatten(root, { passes: (d) => d.gold >= 4, leafOrder: order, expanded: () => true });
  assert.deepEqual(filtered.filter((x) => x.type === "group" && x.group.level === 0).map((x) => x.group.key), ["DE", ""]);
});

test("flatten: groups follow sorted leaf order (sort by gold desc)", () => {
  const { root } = buildTree(rows, [cols[0]]);
  const sorted = [...rows].sort((a, b) => b.gold - a.gold);
  const order = new Map(sorted.map((r, i) => [r, i]));
  const out = flatten(root, { passes: () => true, leafOrder: order, expanded: () => true });
  assert.deepEqual(out.filter((x) => x.type === "group").map((x) => x.group.key), ["", "DE", "TR"]);
  assert.deepEqual(out.filter((x) => x.type === "leaf").map((x) => x.data.id), [6, 5, 4, 3, 2, 1]);
});

test("flatten: compareGroups orders sibling groups (e.g. by aggregate); groupsOnly hides leaves", () => {
  const { root } = buildTree(rows, [cols[0]]);
  aggregate(root, [{ colId: "gold", aggFunc: "sum", valueOf: (d) => d.gold }], () => true);
  const order = new Map(rows.map((r, i) => [r, i]));
  const bySumDesc = flatten(root, { passes: () => true, leafOrder: order, expanded: () => true, compareGroups: (a, b) => b.agg.gold - a.agg.gold, groupsOnly: true });
  assert.deepEqual(bySumDesc.map((x) => `${x.group.key}:${x.group.agg.gold}`), [":11", "TR:6", "DE:4"]);
});

test("pivot: key paths per level and per-group aggregates over passing leaves", () => {
  const data = [
    { r: "N", y: "2024", q: "Q2", v: 2 },
    { r: "N", y: "2024", q: "Q1", v: 1 },
    { r: "N", y: "2023", q: "Q1", v: 4 },
    { r: "S", y: "2023", q: "Q1", v: 8 },
    { r: "S", y: null, q: "Q2", v: 16 },
  ];
  const keyOfs = [(d) => d.y, (d) => d.q];
  const cmp = (a, b) => a.localeCompare(b);
  assert.deepEqual(pivotKeyPaths(data, keyOfs, cmp), [["", "Q2"], ["2023", "Q1"], ["2024", "Q1"], ["2024", "Q2"]]);
  const { root, groupsById } = buildTree(data, [{ colId: "r", keyOf: (d) => d.r }]);
  aggregatePivot(root, keyOfs, [{ colId: "v", aggFunc: "sum", valueOf: (d) => d.v }], (d) => d.v !== 2);
  const n = groupsById.get("dex-group-r-N").pivot;
  assert.equal(n[["2024", "Q1"].join(PIVOT_KEY_SEP)].v, 1);
  assert.equal(n[["2023", "Q1"].join(PIVOT_KEY_SEP)].v, 4);
  assert.equal(n[["2024", "Q2"].join(PIVOT_KEY_SEP)], undefined, "the only 2024/Q2 leaf is filtered out");
  assert.equal(root.pivot[["2023", "Q1"].join(PIVOT_KEY_SEP)].v, 12, "root = grand total");
});

test("allGroups lists every group depth-first", () => {
  const { root } = buildTree(rows, cols);
  assert.equal(allGroups(root).length, 8);
});
