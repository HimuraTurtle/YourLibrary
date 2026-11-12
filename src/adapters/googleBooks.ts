import type { BookResult, SearchAdapter, SearchOptions } from "../types";
import type { HttpClient } from "../http";
import type { SourceConfig } from "../config";
import { parseYear } from "../util";

interface RawVolumeInfo {
  title?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  pageCount?: number;
  language?: string;
  infoLink?: string;
  imageLinks?: { thumbnail?: string };
}
interface RawItem {
  id?: string;
  volumeInfo?: RawVolumeInfo;
}

/** Upgrades Google's thumbnail URL to a larger zoom level and forces HTTPS. */
function upgradeCover(thumbnail: string | undefined): string | undefined {
  if (!thumbnail) return undefined;
  return thumbnail.replace("http://", "https://").replace("zoom=1", "zoom=2");
}

/** Google Books API (book metadata; optional key from GOOGLE_BOOKS_API_KEY). */
export function createGoogleBooksAdapter(
  http: HttpClient,
  cfg: SourceConfig,
): SearchAdapter<BookResult> {
  return {
    id: "googleBooks",
    name: "Google Books",
    kind: "book",
    async search(query: string, options?: SearchOptions): Promise<BookResult[]> {
      const limit = options?.limit ?? 10;
      const params = new URLSearchParams({ q: query, maxResults: String(limit) });
      if (cfg.apiKey) params.set("key", cfg.apiKey);
      const data = (await http.getJson(cfg.baseUrl + "/volumes?" + params.toString())) as {
        items?: RawItem[];
      };
      const items = Array.isArray(data.items) ? data.items : [];
      const out: BookResult[] = [];
      for (const item of items) {
        const vi = item.volumeInfo;
        if (!vi || typeof vi.title !== "string" || vi.title.trim() === "") continue;
        out.push({
          source: "googleBooks",
          sourceId: item.id ?? "",
          title: vi.title.trim(),
          authors: Array.isArray(vi.authors) ? vi.authors : [],
          year: parseYear(vi.publishedDate),
          publisher: vi.publisher,
          description: vi.description,
          coverUrl: upgradeCover(vi.imageLinks?.thumbnail),
          language: vi.language,
          pageCount: vi.pageCount,
          downloads: [],
          infoUrl: vi.infoLink,
        });
      }
      return out;
    },
  };
}
