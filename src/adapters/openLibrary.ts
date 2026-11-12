import type { BookResult, SearchAdapter, SearchOptions } from "../types";
import type { HttpClient } from "../http";
import type { SourceConfig } from "../config";

const COVER_BASE = "https://covers.openlibrary.org";

interface RawDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  publisher?: string[];
  cover_i?: number;
  language?: string[];
}

/** Open Library search API (book metadata; no key required). */
export function createOpenLibraryAdapter(
  http: HttpClient,
  cfg: SourceConfig,
): SearchAdapter<BookResult> {
  return {
    id: "openLibrary",
    name: "Open Library",
    kind: "book",
    async search(query: string, options?: SearchOptions): Promise<BookResult[]> {
      const limit = options?.limit ?? 10;
      const params = new URLSearchParams({
        q: query,
        fields: "key,title,author_name,first_publish_year,publisher,cover_i,language",
        limit: String(limit),
      });
      const data = (await http.getJson(cfg.baseUrl + "/search.json?" + params.toString())) as {
        docs?: RawDoc[];
      };
      const docs = Array.isArray(data.docs) ? data.docs : [];
      return docs
        .filter((d) => typeof d.title === "string" && d.title.trim() !== "")
        .map((d) => ({
          source: "openLibrary",
          sourceId: d.key ?? "",
          title: (d.title as string).trim(),
          authors: Array.isArray(d.author_name) ? d.author_name : [],
          year: typeof d.first_publish_year === "number" ? d.first_publish_year : undefined,
          publisher: Array.isArray(d.publisher) ? d.publisher[0] : undefined,
          coverUrl:
            typeof d.cover_i === "number" ? COVER_BASE + "/b/id/" + d.cover_i + "-L.jpg" : undefined,
          language: Array.isArray(d.language) ? d.language[0] : undefined,
          downloads: [],
          infoUrl: d.key ? "https://openlibrary.org" + d.key : undefined,
        }));
    },
  };
}
