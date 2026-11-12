import type { AppConfig } from "./config";
import { loadConfig } from "./config";
import { HttpClient } from "./http";
import type { Fetcher } from "./http";
import { createOpenLibraryAdapter } from "./adapters/openLibrary";
import { createGoogleBooksAdapter } from "./adapters/googleBooks";
import { createGutenbergAdapter } from "./adapters/gutenberg";
import { createOpenAlexAdapter } from "./adapters/openAlex";
import { createSemanticScholarAdapter } from "./adapters/semanticScholar";
import { createArxivAdapter } from "./adapters/arxiv";
import { createWebSearch } from "./websearch";
import type { WebSearchService } from "./websearch";
import { createSearchService } from "./search";
import type { SearchService } from "./search";
import { LibraryStore } from "./store";
import type { BookResult, PaperResult, SearchAdapter } from "./types";

export type { AppConfig, SourceConfig } from "./config";
export { loadConfig } from "./config";
export { HttpClient, HttpError } from "./http";
export type { Fetcher, HttpOptions } from "./http";
export type {
  BookResult,
  PaperResult,
  SearchAdapter,
  SearchOptions,
  SearchResponse,
  ShelfItem,
  NewShelfItem,
  ShelfItemPatch,
  Bookmark,
  NewBookmark,
  ReadingStatus,
  ItemType,
  DownloadLink,
  WebResult,
} from "./types";
export { LibraryStore } from "./store";
export type { SearchService } from "./search";
export { parseYear, normalizeDoi, reconstructAbstract, normalizeKey } from "./util";

export interface LibraryService {
  config: AppConfig;
  search: SearchService;
  store: LibraryStore;
  http: HttpClient;
  bookAdapters: SearchAdapter<BookResult>[];
  paperAdapters: SearchAdapter<PaperResult>[];
  webSearch: WebSearchService;
}

/**
 * Wires config, HTTP client, all enabled adapters, the search service, and the
 * local store into one object. Pass an explicit fetch function to test without
 * touching the network.
 */
export function createLibrary(overrides?: Partial<AppConfig>, fetchFn: Fetcher = fetch): LibraryService {
  const config = loadConfig(overrides);
  const http = new HttpClient(fetchFn, { ...config.http, userAgent: config.userAgent });

  const bookAdapters: SearchAdapter<BookResult>[] = [
    createOpenLibraryAdapter(http, config.sources.openLibrary),
    createGoogleBooksAdapter(http, config.sources.googleBooks),
    createGutenbergAdapter(http, config.sources.gutenberg),
  ].filter((a) => config.sources[a.id as keyof AppConfig["sources"]].enabled);

  const paperAdapters: SearchAdapter<PaperResult>[] = [
    createOpenAlexAdapter(http, config.sources.openAlex),
    createSemanticScholarAdapter(http, config.sources.semanticScholar),
    createArxivAdapter(http, config.sources.arxiv),
  ].filter((a) => config.sources[a.id as keyof AppConfig["sources"]].enabled);

  const search = createSearchService(config, http, { books: bookAdapters, papers: paperAdapters });
  const store = new LibraryStore(config.store.path);
  const webSearch = createWebSearch(config, http);

  return { config, search, store, http, bookAdapters, paperAdapters, webSearch };
}
