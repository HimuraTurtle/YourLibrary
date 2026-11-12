import type { PaperResult, SearchAdapter, SearchOptions } from "../types";
import type { HttpClient } from "../http";
import type { SourceConfig } from "../config";

interface RawS2Author {
  name?: string;
}
interface RawS2Paper {
  paperId?: string;
  title?: string;
  year?: number | null;
  venue?: string;
  abstract?: string | null;
  url?: string;
  citationCount?: number;
  externalIds?: { DOI?: string } | null;
  openAccessPdf?: { url?: string } | null;
  authors?: RawS2Author[];
}

const FIELDS = "title,authors,year,abstract,venue,url,externalIds,openAccessPdf,citationCount,paperId";

/** Semantic Scholar paper search (citations + OA PDF + abstract; optional x-api-key). */
export function createSemanticScholarAdapter(
  http: HttpClient,
  cfg: SourceConfig,
): SearchAdapter<PaperResult> {
  return {
    id: "semanticScholar",
    name: "Semantic Scholar",
    kind: "paper",
    async search(query: string, options?: SearchOptions): Promise<PaperResult[]> {
      const limit = options?.limit ?? 10;
      const params = new URLSearchParams({ query, limit: String(limit), fields: FIELDS });
      const headers = cfg.apiKey ? { "x-api-key": cfg.apiKey } : undefined;
      const data = (await http.getJson(cfg.baseUrl + "/paper/search?" + params.toString(), {
        headers,
      })) as { data?: RawS2Paper[] };
      const papers = Array.isArray(data.data) ? data.data : [];
      return papers
        .filter((p) => typeof p.title === "string" && p.title.trim() !== "")
        .map((p) => ({
          source: "semanticScholar",
          sourceId: p.paperId ?? "",
          title: (p.title as string).trim(),
          authors: (p.authors ?? []).map((a) => a.name ?? "").filter((n) => n !== ""),
          year: p.year ?? undefined,
          venue: p.venue,
          doi: p.externalIds?.DOI ?? undefined,
          abstract: p.abstract ?? undefined,
          citationCount: p.citationCount,
          openAccessPdf: p.openAccessPdf?.url ?? undefined,
          infoUrl: p.url,
        }));
    },
  };
}
