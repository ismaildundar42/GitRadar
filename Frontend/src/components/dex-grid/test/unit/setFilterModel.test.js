import { test } from "node:test";
import assert from "node:assert/strict";
import { collectKeys, sortKeys, matchesMiniFilter, createMatcher, isBlank, compareKeys } from "../../src/filters/setFilterModel.js";

test("blanks: null, undefined, empty and whitespace share the null key", () => {
  const keys = collectKeys(["X", null, undefined, "", "  ", "Y"]);
  assert.deepEqual([...keys.keys()], ["X", null, "Y"]);
  assert.ok(isBlank("   "));
  assert.ok(!isBlank(0));
});

test("numbers become string keys; 0 is not blank", () => {
  assert.deepEqual([...collectKeys([10, 2, 0, 2]).keys()], ["10", "2", "0"]);
});

test("case-insensitive by default, first spelling wins; Turkish İ/ı fold", () => {
  assert.deepEqual([...collectKeys(["tr", "TR", "De"]).keys()], ["tr", "De"]);
  assert.deepEqual([...collectKeys(["İstanbul", "istanbul", "ISPARTA", "ısparta"]).keys()], ["İstanbul", "ISPARTA"]);
  assert.deepEqual([...collectKeys(["tr", "TR"], { caseSensitive: true }).keys()], ["tr", "TR"]);
});

test("arrays contribute each element; empty array is blank", () => {
  assert.deepEqual([...collectKeys([["x", "y"], ["y"], [], ["z"]]).keys()], ["x", "y", null, "z"]);
});

test("sort: blanks first, numbers numerically, text in Turkish order", () => {
  assert.deepEqual(sortKeys(["10", "2", null, "1", "33"]), [null, "1", "2", "10", "33"]);
  assert.deepEqual(sortKeys(["Zonguldak", "Çorum", "Ankara", "Ömer", "Osmaniye"]), ["Ankara", "Çorum", "Osmaniye", "Ömer", "Zonguldak"]);
  assert.ok(compareKeys("5", "abc") < 0, "numbers before text");
});

test("sort: custom comparator on raw values; suppressSorting keeps order", () => {
  const raw = new Map([["b", 2], ["a", 1]]);
  assert.deepEqual(sortKeys(["b", "a"], { comparator: (x, y) => y - x, rawOf: (k) => raw.get(k) }), ["b", "a"]);
  assert.deepEqual(sortKeys(["b", "a"], { suppressSorting: true }), ["b", "a"]);
});

test("mini filter: contains, case-insensitive, Turkish-aware", () => {
  assert.ok(matchesMiniFilter("Berlin City", "n city"));
  assert.ok(matchesMiniFilter("İSTANBUL", "istan"));
  assert.ok(matchesMiniFilter("ISPARTA", "ısp"));
  assert.ok(matchesMiniFilter("INFO", "info"), "non-Turkish text still matches");
  assert.ok(!matchesMiniFilter("Ankara", "ber"));
});

test("matcher: membership, blanks, arrays, case folding", () => {
  const m = createMatcher(["TR", null]);
  assert.ok(m("tr"));
  assert.ok(m(null));
  assert.ok(m(""));
  assert.ok(!m("DE"));
  assert.ok(m(["DE", "tr"]));
  assert.ok(m([]), "empty array matches blanks");
  assert.ok(!createMatcher(["TR"], { caseSensitive: true })("tr"));
  assert.ok(!createMatcher([])("anything"), "empty selection passes nothing");
});

test("matcher: unknown values simply match nothing (no silent model rewrite)", () => {
  const m = createMatcher(["Paris"]);
  assert.ok(!m("Ankara"));
});
