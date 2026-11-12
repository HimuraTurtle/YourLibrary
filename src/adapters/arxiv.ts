import { XMLParser } from "fast-xml-parser";
import type { PaperResult, SearchAdapter, SearchOptions } from "../types";
import type { HttpClient } from "../http";
import type { SourceConfig } from "../config";
import { parseYear } from "../util";

interface RawLink {
  "@_href"?: string;
  "@_rel"?: string;
  "@_type"?: string;
  "@_title"?: string;
}
interface RawEntry {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  doi?: string;
  primary_category?: { "@_term"?: string };
  author?: { name?: string }[];
  link?: RawLink[];
}

function findLink(links: RawLink[] | undefined, predicate: (l: RawLink) => boolean): string | undefined {
  if (!Array.isArray(links)) return undefined;
  const hit = links.find(predicate);
  return hit?.["@_href"];
}

/** arXiv Atom API (preprints; pdf + abstract; no key required). */
export function createArxivAdapter(
  http: HttpClient,
  cfg: SourceConfig,
): SearchAdapter<PaperResult> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    isArray: (name) => name === "entry" || name === "author" || name === "link" || name === "category",
  });

  return {
    id: "arxiv",
    name: "arXiv",
    kind: "paper",
    async search(query: string, options?: SearchOptions): Promise<PaperResult[]> {
      const limit = options?.limit ?? 10;
      const params = new URLSearchParams({
        search_query: "all:" + query,
        start: "0",
        max_results: String(limit),
      });
      const xml = await http.getText(cfg.baseUrl + "/query?" + params.toString());
      const parsed = parser.parse(xml) as { feed?: { entry?: RawEntry[] } };
      const entries = Array.isArray(parsed.feed?.entry) ? parsed.feed.entry : [];
      return entries
        .filter((e) => typeof e.title === "string" && e.title.trim() !== "")
        .map((e) => {
          const category = e.primary_category?.["@_term"];
          return {
            source: "arxiv",
            sourceId: e.id ?? "",
            title: (e.title as string).trim(),
            authors: (e.author ?? []).map((a) => a.name ?? "").filter((n) => n !== ""),
            year: parseYear(e.published),
            venue: category ? "arXiv:" + category : undefined,
            doi: e.doi,
            abstract: typeof e.summary === "string" && e.summary.trim() !== "" ? e.summary.trim() : undefined,
            openAccessPdf: findLink(e.link, (l) => l["@_title"] === "pdf" || l["@_type"] === "application/pdf"),
            infoUrl: findLink(e.link, (l) => l["@_rel"] === "alternate") ?? e.id,
          };
        });
    },
  };
}
