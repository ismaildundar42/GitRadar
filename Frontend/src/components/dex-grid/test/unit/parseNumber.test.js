import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNumber } from "../../src/clipboard/clipboard.js";

test("parseNumber: Turkish and English decimal marks", () => {
  assert.equal(parseNumber("1,5"), 1.5);
  assert.equal(parseNumber("1.5"), 1.5);
  assert.equal(parseNumber("1.234,5"), 1234.5);
  assert.equal(parseNumber("1,234.5"), 1234.5);
  assert.equal(parseNumber("1,234,567"), 1234567);
  assert.equal(parseNumber(" 42 "), 42);
  assert.equal(parseNumber("-0,25"), -0.25);
});

test("parseNumber: empty clears, garbage keeps the old value", () => {
  assert.equal(parseNumber("  "), null);
  assert.equal(parseNumber("abc", 7), 7);
});
