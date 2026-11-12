import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDoi, normalizeKey, parseYear, reconstructAbstract } from "../src/util";

test("parseYear handles full dates and plain years", () => {
  assert.equal(parseYear("2017"), 2017);
  assert.equal(parseYear("2017-11-15"), 2017);
  assert.equal(parseYear("2017-05-06T14:42:39Z"), 2017);
  assert.equal(parseYear("no year"), undefined);
  assert.equal(parseYear(null), undefined);
  assert.equal(parseYear(undefined), undefined);
});

test("normalizeDoi strips doi.org prefixes", () => {
  assert.equal(normalizeDoi("https://doi.org/10.48550/arXiv.1706.03762"), "10.48550/arXiv.1706.03762");
  assert.equal(normalizeDoi("http://dx.doi.org/10.1000/xyz"), "10.1000/xyz");
  assert.equal(normalizeDoi("10.1000/xyz"), "10.1000/xyz");
  assert.equal(normalizeDoi(null), undefined);
  assert.equal(normalizeDoi("  "), undefined);
});

test("reconstructAbstract rebuilds text in position order", () => {
  assert.equal(
    reconstructAbstract({ The: [0], cat: [1], sat: [2] }),
    "The cat sat",
  );
  assert.equal(reconstructAbstract(null), undefined);
  assert.equal(reconstructAbstract({}), undefined);
  assert.equal(reconstructAbstract({ bad: "not-an-array" as unknown as number[] }), undefined);
});

test("normalizeKey lowercases and strips punctuation", () => {
  assert.equal(normalizeKey("Attention Is All You Need"), "attention is all you need");
  assert.equal(normalizeKey("  Hello,  WORLD!!! "), "hello world");
  assert.equal(normalizeKey(undefined), "");
  assert.equal(normalizeKey(null), "");
});
