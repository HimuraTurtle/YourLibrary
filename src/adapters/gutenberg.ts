import type { BookResult, DownloadLink, SearchAdapter, SearchOptions } from "../types";
import type { HttpClient } from "../http";
import type { SourceConfig } from "../config";

interface RawAuthor {
  name?: string;
}
interface RawBook {
  id?: number;
  title?: string;
  authors?: RawAuthor[];
  languages?: string[];
  formats?: Record<string, string>;
}

const DOWNLOAD_FORMATS: { mime: string; label: string }[] = [
  { mime: "application/epub+zip", label: "epub" },
  { mime: "text/plain", label: "txt" },
  { mime: "text/html", label: "html" },
  { mime: "application/pdf", label: "pdf" },
  { mime: "application/x-mobipocket-ebook", label: "mobi" },
];

function collectDownloads(formats: Record<string, string> | undefined): DownloadLink[] {
  if (!formats) return [];
  const out: DownloadLink[] = [];
  for (const { mime, label } of DOWNLOAD_FORMATS) {
    const url = formats[mime];
    if (typeof url === "string" && url !== "") out.push({ format: label, url, mimeType: mime });
  }
  return out;
}

/** Project Gutenberg via Gutendex (public-domain downloads; no key required). */
export function createGutenbergAdapter(
  http: HttpClient,
  cfg: SourceConfig,
): SearchAdapter<BookResult> {
  return {
    id: "gutenberg",
    name: "Project Gutenberg",
    kind: "book",
    async search(query: string, options?: SearchOptions): Promise<BookResult[]> {
      const limit = options?.limit ?? 10;
      const url = cfg.baseUrl + "/books?search=" + encodeURIComponent(query);
      const data = (await http.getJson(url)) as { results?: RawBook[] };
      const books = Array.isArray(data.results) ? data.results : [];
      return books
        .filter((b) => typeof b.title === "string" && b.title.trim() !== "")
        .slice(0, limit)
        .map((b) => ({
          source: "gutenberg",
          sourceId: b.id === undefined ? "" : String(b.id),
          title: (b.title as string).trim(),
          authors: (b.authors ?? []).map((a) => a.name ?? "").filter((n) => n !== ""),
          language: b.languages?.[0],
          downloads: collectDownloads(b.formats),
          infoUrl: b.id === undefined ? undefined : "https://www.gutenberg.org/ebooks/" + b.id,
        }));
    },
  };
}
