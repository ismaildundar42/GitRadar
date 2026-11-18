import { test } from "node:test";
import assert from "node:assert/strict";
import { toTsv, parseTsv } from "../../src/clipboard/tsv.js";

test("toTsv: plain cells, nulls, CRLF rows", () => {
  assert.equal(toTsv([["a", 1, null], ["b", undefined, 0]]), "a\t1\t\r\nb\t\t0");
});

test("toTsv: quotes cells with tab, newline or quote", () => {
  assert.equal(toTsv([["x\ty", 'say "hi"', "l1\nl2"]]), '"x\ty"\t"say ""hi"""\t"l1\nl2"');
});

test("parseTsv: round-trips toTsv output", () => {
  const rows = [["x\ty", 'say "hi"', "l1\nl2"], ["", "plain", "0012"]];
  assert.deepEqual(parseTsv(toTsv(rows)), rows);
});

test("parseTsv: Excel-style trailing newline and LF-only input", () => {
  assert.deepEqual(parseTsv("a\tb\r\nc\td\r\n"), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(parseTsv("a\tb\nc\td\n"), [["a", "b"], ["c", "d"]]);
});

test("parseTsv: single cell, empty cells, empty input", () => {
  assert.deepEqual(parseTsv("42"), [["42"]]);
  assert.deepEqual(parseTsv("a\t\tc"), [["a", "", "c"]]);
  assert.deepEqual(parseTsv(""), []);
});

test("parseTsv: a quote inside an unquoted cell is literal", () => {
  assert.deepEqual(parseTsv('5" pipe\tx'), [['5" pipe', "x"]]);
});
