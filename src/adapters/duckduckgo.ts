import type { HttpClient } from "../http";
import type { SourceConfig } from "../config";
import type { SearchOptions, WebResult } from "../types";

interface RawTopic {
  Text?: string;
  FirstURL?: string;
  Topics?: RawTopic[];
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** DuckDuckGo Instant Answer API (keyless; returns definitions + related topics). */
export function createDuckDuckGoAdapter(http: HttpClient, cfg: SourceConfig) {
  return {
    id: "duckduckgo",
    name: "DuckDuckGo",
    async search(query: string, options?: SearchOptions): Promise<WebResult[]> {
      const params = new URLSearchParams({ q: query, format: "json", no_html: "1", skip_disambig: "1" });
      const data = (await http.getJson(cfg.baseUrl + "/?" + params.toString())) as {
        Heading?: string;
        AbstractText?: string;
        AbstractURL?: string;
        Definition?: string;
        DefinitionURL?: string;
        Answer?: string;
        RelatedTopics?: RawTopic[];
      };
      const results: WebResult[] = [];
      const source = "duckduckgo";
      if (data.Definition && data.DefinitionURL) {
        results.push({ source, title: data.Heading || query, url: data.DefinitionURL, snippet: stripHtml(data.Definition) });
      } else if (data.AbstractText && data.AbstractURL) {
        results.push({ source, title: data.Heading || query, url: data.AbstractURL, snippet: data.AbstractText });
      }
      if (data.Answer) {
        results.push({ source, title: query, url: data.AbstractURL || data.DefinitionURL || "", snippet: stripHtml(data.Answer) });
      }
      const flatten = (topics: RawTopic[]): void => {
        for (const t of topics) {
          if (Array.isArray(t.Topics)) flatten(t.Topics);
          else if (t.Text && t.FirstURL) {
            results.push({ source, title: stripHtml(t.Text).slice(0, 100), url: t.FirstURL, snippet: stripHtml(t.Text) });
          }
        }
      };
      if (Array.isArray(data.RelatedTopics)) flatten(data.RelatedTopics);
      return results.slice(0, options?.limit ?? 10);
    },
  };
}
