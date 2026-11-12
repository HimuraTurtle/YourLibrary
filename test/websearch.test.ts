import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpClient } from "../src/http";
import { createDuckDuckGoAdapter } from "../src/adapters/duckduckgo";
import { fakeFetch, NO_RETRY } from "./helpers";

test("duckduckgo maps definition, answer, and related topics", async () => {
  const body = JSON.stringify({
    Heading: "yyds",
    Definition: "永远的神",
    DefinitionURL: "https://example.com/yyds",
    Answer: "网络用语，表示赞美",
    RelatedTopics: [
      { Text: "YYDS - 网络流行语", FirstURL: "https://example.com/1" },
      { Topics: [{ Text: "相关词条", FirstURL: "https://example.com/2" }] },
    ],
  });
  const adapter = createDuckDuckGoAdapter(
    new HttpClient(fakeFetch({ "api.duckduckgo.com": { body } }), NO_RETRY),
    { enabled: true, baseUrl: "https://api.duckduckgo.com" },
  );
  const results = await adapter.search("yyds", { limit: 5 });
  assert.ok(results.length >= 2);
  assert.equal(results[0]?.title, "yyds");
  assert.equal(results[0]?.snippet, "永远的神");
  assert.ok(results.some((r) => r.snippet.includes("网络流行语")));
});

test("duckduckgo handles an empty response", async () => {
  const adapter = createDuckDuckGoAdapter(
    new HttpClient(fakeFetch({ "api.duckduckgo.com": { body: "{}" } }), NO_RETRY),
    { enabled: true, baseUrl: "https://api.duckduckgo.com" },
  );
  const results = await adapter.search("xx", { limit: 5 });
  assert.deepEqual(results, []);
});
