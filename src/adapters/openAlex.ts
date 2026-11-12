import type { PaperResult, SearchAdapter, SearchOptions } from "../types";
import type { HttpClient } from "../http";
import type { SourceConfig } from "../config";
import { normalizeDoi, reconstructAbstract } from "../util";

interface RawAuthor {
  display_name?: string;
}
interface RawAuthorship {
  author?: RawAuthor;
}
interface RawLocation {
  landing_page_url?: string | null;
  source?: { display_name?: string } | null;
}
interface RawWork {
  id?: string;
  title?: string | null;
  doi?: string | null;
  publication_year?: number | null;
  cited_by_count?: number | null;
  authorships?: RawAuthorship[];
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: RawLocation | null;
  best_oa_location?: { pdf_url?: string | null } | null;
}

/** OpenAlex works search (free, all disciplines; optional mailto for the polite pool). */
export function createOpenAlexAdapter(
  http: HttpClient,
  cfg: SourceConfig,
): SearchAdapter<PaperResult> {
  return {
    id: "openAlex",
    name: "OpenAlex",
    kind: "paper",
    async search(query: string, options?: SearchOptions): Promise<PaperResult[]> {
      const limit = options?.limit ?? 10;
      const params = new URLSearchParams({ search: query, "per-page": String(limit) });
      if (cfg.email) params.set("mailto", cfg.email);
      const data = (await http.getJson(cfg.baseUrl + "/works?" + params.toString())) as {
        results?: RawWork[];
      };
      const works = Array.isArray(data.results) ? data.results : [];
      return works
        .filter((w) => typeof w.title === "string" && (w.title as string).trim() !== "")
        .map((w) => {
          const doi = normalizeDoi(w.doi);
          return {
            source: "openAlex",
            sourceId: w.id ?? "",
            title: (w.title as string).trim(),
            authors: (w.authorships ?? [])
              .map((a) => a.author?.display_name ?? "")
              .filter((n) => n !== ""),
            year: w.publication_year ?? undefined,
            venue: w.primary_location?.source?.display_name ?? undefined,
            doi,
            abstract: reconstructAbstract(w.abstract_inverted_index),
            citationCount: w.cited_by_count ?? undefined,
            openAccessPdf: w.best_oa_location?.pdf_url ?? undefined,
            infoUrl:
              w.primary_location?.landing_page_url ?? (doi ? "https://doi.org/" + doi : undefined),
          };
        });
    },
  };
}
