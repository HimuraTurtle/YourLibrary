import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { HttpClient } from "../src/http";
import { createOpenAlexAdapter } from "../src/adapters/openAlex";
import { createArxivAdapter } from "../src/adapters/arxiv";
import { fakeFetch, NO_RETRY } from "./helpers";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, "fixtures");

test("openAlex adapter parses the real captured payload", async () => {
  const body = readFileSync(join(FIX, "openalex.works.json"), "utf8");
  const adapter = createOpenAlexAdapter(
    new HttpClient(fakeFetch({ "api.openalex.org/works": { body } }), NO_RETRY),
    { enabled: true, baseUrl: "https://api.openalex.org" },
  );
  const results = await adapter.search("attention is all you need", { limit: 2 });
  assert.ok(results.length >= 1);
  const first = results.find((r) => r.title === "Attention Is All You Need");
  assert.ok(first, "expected the famous paper in results");
  assert.ok((first?.authors.length ?? 0) > 0, "authors should be non-empty");
  assert.equal(first?.year, 2017);
  assert.ok(first?.abstract && first.abstract.length > 50, "abstract should be reconstructed");
  assert.ok(first?.openAccessPdf, "should carry an OA pdf");
  assert.equal(first?.doi, "10.48550/arxiv.1706.03762");
});

test("arxiv adapter parses the real captured Atom feed", async () => {
  const body = readFileSync(join(FIX, "arxiv.feed.xml"), "utf8");
  const adapter = createArxivAdapter(
    new HttpClient(fakeFetch({ "export.arxiv.org": { body, headers: { "content-type": "application/xml" } } }), NO_RETRY),
    { enabled: true, baseUrl: "https://export.arxiv.org/api" },
  );
  const results = await adapter.search("attention is all you need", { limit: 2 });
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.title.length > 0));
  assert.ok(results.every((r) => r.authors.length > 0));
  assert.ok(results.every((r) => typeof r.year === "number"));
  assert.ok(results.every((r) => r.openAccessPdf?.startsWith("https://arxiv.org/pdf/")));
});
