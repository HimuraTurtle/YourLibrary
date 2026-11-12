import type { AppConfig } from "./config";
import type { HttpClient } from "./http";
import type { SearchOptions, WebResult } from "./types";
import { createDuckDuckGoAdapter } from "./adapters/duckduckgo";

export interface WebSearchService {
  search(query: string, options?: SearchOptions): Promise<WebResult[]>;
}

/** Keyless web search (DuckDuckGo Instant Answer), ready for dialogue tool-calling. */
export function createWebSearch(config: AppConfig, http: HttpClient): WebSearchService {
  const adapter = createDuckDuckGoAdapter(http, config.sources.duckduckgo);
  return {
    search: (query, options) => adapter.search(query, options),
  };
}
