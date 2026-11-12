import type { AppConfig } from "./config";
import type { HttpClient } from "./http";
import type {
  BookResult,
  PaperResult,
  SearchAdapter,
  SearchOptions,
  SearchResponse,
} from "./types";
import { normalizeKey } from "./util";

export interface SearchService {
  searchBooks(query: string, options?: SearchOptions): Promise<SearchResponse<BookResult>>;
  searchPapers(query: string, options?: SearchOptions): Promise<SearchResponse<PaperResult>>;
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  const base = value === undefined || !Number.isFinite(value) ? fallback : value;
  return Math.max(1, Math.min(Math.floor(base), max));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function arrayKey(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && "url" in item) {
    const url = (item as { url?: unknown }).url;
    if (typeof url === "string") return url;
  }
  return JSON.stringify(item);
}

/** Fills missing scalar/array fields on the kept item from a duplicate. */
function mergeInto(keep: Record<string, unknown>, add: Record<string, unknown>): void {
  for (const key of Object.keys(add)) {
    const added = add[key];
    if (added === undefined || added === null) continue;
    const existing = keep[key];
    if (Array.isArray(added)) {
      if (Array.isArray(existing)) {
        for (const item of added) {
          const itemKey = arrayKey(item);
          if (!existing.some((e) => arrayKey(e) === itemKey)) existing.push(item);
        }
      } else if (existing === undefined || existing === null || (Array.isArray(existing) && existing.length === 0)) {
        keep[key] = [...added];
      }
    } else if (typeof added === "string") {
      if (typeof existing !== "string" || existing === "") keep[key] = added;
    } else if (typeof added === "number" || typeof added === "boolean") {
      if (existing === undefined || existing === null) keep[key] = added;
    }
  }
}

function dedupeAndMerge<T extends { title: string; authors: string[] }>(items: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const item of items) {
    const key = normalizeKey(item.title) + "|" + normalizeKey(item.authors[0]);
    const existing = byKey.get(key);
    if (existing) {
      mergeInto(existing as unknown as Record<string, unknown>, item as unknown as Record<string, unknown>);
    } else {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()];
}

export function createSearchService(
  config: AppConfig,
  http: HttpClient,
  adapters: { books: SearchAdapter<BookResult>[]; papers: SearchAdapter<PaperResult>[] },
): SearchService {
  async function run<T extends BookResult | PaperResult>(
    query: string,
    sources: SearchAdapter<T>[],
    options?: SearchOptions,
  ): Promise<SearchResponse<T>> {
    const started = Date.now();
    const limit = clampLimit(options?.limit, config.defaultLimit, config.maxLimit);
    const settled = await Promise.allSettled(
      sources.map((source) => source.search(query, { ...options, limit })),
    );
    const results: T[] = [];
    const errors: { source: string; message: string }[] = [];
    const okSources: string[] = [];
    settled.forEach((outcome, i) => {
      if (outcome.status === "fulfilled") {
        okSources.push(sources[i]?.id ?? "");
        results.push(...outcome.value);
      } else {
        errors.push({ source: sources[i]?.id ?? "", message: errorMessage(outcome.reason) });
      }
    });
    return {
      query,
      results: dedupeAndMerge(results),
      errors,
      sources: okSources,
      tookMs: Date.now() - started,
    };
  }

  return {
    searchBooks: (query, options) => run(query, adapters.books, options),
    searchPapers: (query, options) => run(query, adapters.papers, options),
  };
}
