import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpClient } from "../src/http";
import { createSearchService } from "../src/search";
import type { AppConfig } from "../src/config";
import type { BookResult, PaperResult, SearchAdapter, SearchOptions } from "../src/types";
import { NO_RETRY } from "./helpers";

function stubAdapter<T extends BookResult | PaperResult>(
  id: string,
  impl: (query: string, options?: SearchOptions) => Promise<T[]>,
): SearchAdapter<T> {
  return { id, name: id, kind: "book", search: impl };
}

const config = {
  defaultLimit: 10,
  maxLimit: 50,
  http: NO_RETRY,
  userAgent: "t",
  contactEmail: "",
  sources: {},
  store: { path: ":memory:" },
} as unknown as AppConfig;

test("dedupeAndMerge collapses duplicates and fills missing fields", async () => {
  const a = stubAdapter<BookResult>("a", async () => [
    { source: "a", sourceId: "1", title: "Pride and Prejudice", authors: ["Jane Austen"], year: 1813, downloads: [] },
  ]);
  const b = stubAdapter<BookResult>("b", async () => [
    { source: "b", sourceId: "2", title: "Pride and Prejudice", authors: ["Jane Austen"], description: "A novel", downloads: [{ format: "epub", url: "https://x/epub" }] },
  ]);
  const service = createSearchService(config, new HttpClient(fetch, NO_RETRY), { books: [a, b], papers: [] });
  const res = await service.searchBooks("pride");
  assert.equal(res.results.length, 1);
  const only = res.results[0];
  assert.equal(only?.description, "A novel");
  assert.equal(only?.downloads.length, 1);
  assert.deepEqual(res.sources.sort(), ["a", "b"]);
  assert.deepEqual(res.errors, []);
});

test("a failing source is isolated into errors and does not discard others", async () => {
  const good = stubAdapter<BookResult>("good", async () => [
    { source: "good", sourceId: "1", title: "Title", authors: [], downloads: [] },
  ]);
  const bad = stubAdapter<BookResult>("bad", async () => {
    throw new Error("boom");
  });
  const service = createSearchService(config, new HttpClient(fetch, NO_RETRY), { books: [good, bad], papers: [] });
  const res = await service.searchBooks("title");
  assert.equal(res.results.length, 1);
  assert.equal(res.errors.length, 1);
  assert.equal(res.errors[0]?.source, "bad");
  assert.equal(res.errors[0]?.message, "boom");
});

test("limit is clamped to the configured maximum", async () => {
  let seen = 0;
  const a = stubAdapter<BookResult>("a", async (_q, options) => {
    seen = options?.limit ?? 0;
    return [];
  });
  const service = createSearchService(config, new HttpClient(fetch, NO_RETRY), { books: [a], papers: [] });
  await service.searchBooks("x", { limit: 9999 });
  assert.equal(seen, 50);
});
