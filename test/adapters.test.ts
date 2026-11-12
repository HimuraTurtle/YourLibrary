import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpClient } from "../src/http";
import { createOpenLibraryAdapter } from "../src/adapters/openLibrary";
import { createGoogleBooksAdapter } from "../src/adapters/googleBooks";
import { createGutenbergAdapter } from "../src/adapters/gutenberg";
import { createOpenAlexAdapter } from "../src/adapters/openAlex";
import { createSemanticScholarAdapter } from "../src/adapters/semanticScholar";
import { createArxivAdapter } from "../src/adapters/arxiv";
import { fakeFetch, NO_RETRY } from "./helpers";

function http(fetchFn: ReturnType<typeof fakeFetch>): HttpClient {
  return new HttpClient(fetchFn, NO_RETRY);
}

const OL = { enabled: true, baseUrl: "https://openlibrary.org" };
const GB = { enabled: true, baseUrl: "https://www.googleapis.com/books/v1" };
const GUT = { enabled: true, baseUrl: "https://gutendex.com" };
const OA = { enabled: true, baseUrl: "https://api.openalex.org" };
const S2 = { enabled: true, baseUrl: "https://api.semanticscholar.org/graph/v1" };
const AX = { enabled: true, baseUrl: "https://export.arxiv.org/api" };

test("openLibrary maps docs and drops blank titles", async () => {
  const adapter = createOpenLibraryAdapter(http(fakeFetch({
    "openlibrary.org/search.json": {
      body: JSON.stringify({ docs: [
        { key: "/works/OL123W", title: "Pride and Prejudice", author_name: ["Jane Austen"], first_publish_year: 1813, publisher: ["T. Egerton"], cover_i: 123, language: ["eng"] },
        { key: "/works/OL456W", title: "   ", author_name: ["Nobody"] },
      ] }),
    },
  })), OL);
  const results = await adapter.search("pride and prejudice", { limit: 5 });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.title, "Pride and Prejudice");
  assert.deepEqual(results[0]?.authors, ["Jane Austen"]);
  assert.equal(results[0]?.year, 1813);
  assert.equal(results[0]?.coverUrl, "https://covers.openlibrary.org/b/id/123-L.jpg");
  assert.equal(results[0]?.infoUrl, "https://openlibrary.org/works/OL123W");
});

test("googleBooks maps volumeInfo and upgrades the cover", async () => {
  const adapter = createGoogleBooksAdapter(http(fakeFetch({
    "googleapis.com/books/v1/volumes": {
      body: JSON.stringify({ items: [
        { id: "abc", volumeInfo: { title: "Pride and Prejudice", authors: ["Jane Austen"], publishedDate: "1813-01-28", description: "A novel", pageCount: 300, language: "en", infoLink: "https://books.google.com/books?id=abc", imageLinks: { thumbnail: "http://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=1" } } },
        { id: "def", volumeInfo: {} },
      ] }),
    },
  })), GB);
  const results = await adapter.search("pride and prejudice", { limit: 5 });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.title, "Pride and Prejudice");
  assert.equal(results[0]?.year, 1813);
  assert.match(results[0]?.coverUrl ?? "", /https:\/\/books\.google\.com\/.*zoom=2/);
});

test("gutenberg collects known download formats", async () => {
  const adapter = createGutenbergAdapter(http(fakeFetch({
    "gutendex.com/books": {
      body: JSON.stringify({ results: [
        { id: 1342, title: "Pride and Prejudice", authors: [{ name: "Austen, Jane" }], languages: ["en"], formats: { "application/epub+zip": "https://www.gutenberg.org/ebooks/1342.epub.images", "text/plain": "https://www.gutenberg.org/ebooks/1342.txt.utf-8", "application/x-unknown": "https://www.gutenberg.org/ignored" } },
      ] }),
    },
  })), GUT);
  const results = await adapter.search("pride and prejudice", { limit: 5 });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.sourceId, "1342");
  assert.equal(results[0]?.infoUrl, "https://www.gutenberg.org/ebooks/1342");
  assert.deepEqual(results[0]?.downloads.map((d) => d.format), ["epub", "txt"]);
});

test("openAlex reconstructs abstract and normalizes doi", async () => {
  const adapter = createOpenAlexAdapter(http(fakeFetch({
    "api.openalex.org/works": {
      body: JSON.stringify({ results: [
        { id: "https://openalex.org/W1", title: "Attention Is All You Need", doi: "https://doi.org/10.48550/arXiv.1706.03762", publication_year: 2017, cited_by_count: 1000, authorships: [{ author: { display_name: "Ashish Vaswani" } }], abstract_inverted_index: { The: [0], cat: [1], sat: [2] }, primary_location: { landing_page_url: "https://arxiv.org/abs/1706.03762", source: { display_name: "arXiv" } }, best_oa_location: { pdf_url: "https://arxiv.org/pdf/1706.03762" } },
        { id: "https://openalex.org/W2", title: null },
      ] }),
    },
  })), OA);
  const results = await adapter.search("attention", { limit: 5 });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.doi, "10.48550/arXiv.1706.03762");
  assert.equal(results[0]?.abstract, "The cat sat");
  assert.equal(results[0]?.openAccessPdf, "https://arxiv.org/pdf/1706.03762");
});

test("semanticScholar maps fields and drops blank titles", async () => {
  const adapter = createSemanticScholarAdapter(http(fakeFetch({
    "api.semanticscholar.org": {
      body: JSON.stringify({ data: [
        { paperId: "p1", title: "Attention Is All You Need", year: 2017, venue: "NeurIPS", abstract: "dominant sequence", url: "https://www.semanticscholar.org/paper/p1", citationCount: 999, externalIds: { DOI: "10.48550/arXiv.1706.03762" }, openAccessPdf: { url: "https://arxiv.org/pdf/1706.03762" }, authors: [{ name: "Ashish Vaswani" }] },
        { paperId: "p2", title: "   " },
      ] }),
    },
  })), S2);
  const results = await adapter.search("attention", { limit: 5 });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.doi, "10.48550/arXiv.1706.03762");
  assert.equal(results[0]?.venue, "NeurIPS");
  assert.equal(results[0]?.citationCount, 999);
});

test("arxiv parses Atom and extracts pdf + alternate links", async () => {
  const xml = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">' +
    '<entry><id>http://arxiv.org/abs/1706.03762v7</id><title>Attention Is All You Need</title>' +
    '<summary>We propose Transformer.</summary><published>2017-06-12T17:57:34Z</published>' +
    '<author><name>Ashish Vaswani</name></author>' +
    '<link href="http://arxiv.org/abs/1706.03762v7" rel="alternate" type="text/html"/>' +
    '<link href="http://arxiv.org/pdf/1706.03762v7" rel="related" type="application/pdf" title="pdf"/>' +
    '</entry></feed>';
  const adapter = createArxivAdapter(http(fakeFetch({
    "export.arxiv.org": { body: xml, headers: { "content-type": "application/xml" } },
  })), AX);
  const results = await adapter.search("attention", { limit: 5 });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.title, "Attention Is All You Need");
  assert.equal(results[0]?.year, 2017);
  assert.equal(results[0]?.openAccessPdf, "http://arxiv.org/pdf/1706.03762v7");
  assert.equal(results[0]?.infoUrl, "http://arxiv.org/abs/1706.03762v7");
});

test("adapter throws HttpError on a 404", async () => {
  const adapter = createOpenLibraryAdapter(http(fakeFetch({})), OL);
  await assert.rejects(() => adapter.search("x", { limit: 1 }), (err: unknown) => {
    return err instanceof Error && err.name === "HttpError";
  });
});
