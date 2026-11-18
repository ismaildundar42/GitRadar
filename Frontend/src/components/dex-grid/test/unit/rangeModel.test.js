import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, contains, cellState, extend, cellCount } from "../../src/range/rangeModel.js";

test("normalize and contains work for ranges dragged in any direction", () => {
  const up = { r1: 5, r2: 2, c1: 3, c2: 1 };
  assert.deepEqual(normalize(up), { top: 2, bottom: 5, left: 1, right: 3 });
  assert.ok(contains(up, 2, 1));
  assert.ok(contains(up, 5, 3));
  assert.ok(!contains(up, 6, 3));
});

test("cellState reports edges and overlap count", () => {
  const ranges = [{ r1: 0, r2: 1, c1: 0, c2: 1 }, { r1: 1, r2: 1, c1: 1, c2: 2 }];
  assert.deepEqual(cellState(ranges, 0, 0), { top: true, bottom: false, left: true, right: false, count: 1 });
  assert.deepEqual(cellState(ranges, 1, 1), { top: true, bottom: true, left: true, right: true, count: 2 });
  assert.equal(cellState(ranges, 3, 3), null);
});

test("extend moves the active corner and clamps", () => {
  const r = { r1: 2, r2: 2, c1: 1, c2: 1 };
  assert.deepEqual(extend(r, 1, 1, 10, 5), { r1: 2, r2: 3, c1: 1, c2: 2 });
  assert.deepEqual(extend(r, -5, -5, 10, 5), { r1: 2, r2: 0, c1: 1, c2: 0 });
  assert.deepEqual(extend(r, 50, 50, 10, 5), { r1: 2, r2: 10, c1: 1, c2: 5 });
});

test("cellCount counts overlapping cells once", () => {
  assert.equal(cellCount([{ r1: 0, r2: 1, c1: 0, c2: 1 }, { r1: 1, r2: 2, c1: 1, c2: 1 }]), 5);
});
