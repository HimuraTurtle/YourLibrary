// Unified, source-agnostic domain models for the retrieval layer.
// Every search adapter maps its own raw API response into these shapes so the
// rest of the application never depends on a specific provider.

export type ItemType = "book" | "paper";

export interface DownloadLink {
  /** Short human label, e.g. "epub", "pdf", "txt", "html". */
  format: string;
  url: string;
  /** MIME type when known, e.g. "application/epub+zip". */
  mimeType?: string;
}

export interface BookResult {
  /** Adapter id that produced this result, e.g. "openLibrary". */
  source: string;
  /** Stable identifier within the source (Open Library key, Gutenberg id, ...). */
  sourceId: string;
  title: string;
  authors: string[];
  year?: number;
  publisher?: string;
  description?: string;
  coverUrl?: string;
  language?: string;
  pageCount?: number;
  /** Legal, source-provided download links (may be empty). */
  downloads: DownloadLink[];
  /** Human-facing page for the item. */
  infoUrl?: string;
}

export interface PaperResult {
  source: string;
  sourceId: string;
  title: string;
  authors: string[];
  year?: number;
  /** Journal / venue / category, when known. */
  venue?: string;
  doi?: string;
  abstract?: string;
  citationCount?: number;
  /** Legal open-access PDF URL, when known. */
  openAccessPdf?: string;
  infoUrl?: string;
}

export interface WebResult {
  source: string;
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  /** Max results requested per source (clamped to configured bounds). */
  limit?: number;
}

/** A single search source that maps its raw API response to a normalized result. */
export interface SearchAdapter<T extends BookResult | PaperResult> {
  readonly id: string;
  readonly name: string;
  readonly kind: "book" | "paper";
  search(query: string, options?: SearchOptions): Promise<T[]>;
}

export interface SearchResponse<T> {
  query: string;
  results: T[];
  /** Sources that failed; the search still returns partial results. */
  errors: { source: string; message: string }[];
  /** Source ids that responded successfully (even if they returned nothing). */
  sources: string[];
  tookMs: number;
}

// ---- Local library (bookshelf + bookmarks) ----

export type ReadingStatus = "want" | "reading" | "finished";

export interface ShelfItem {
  id: string;
  type: ItemType;
  title: string;
  authors: string[];
  year?: number;
  source?: string;
  sourceId?: string;
  doi?: string;
  coverUrl?: string;
  infoUrl?: string;
  tags: string[];
  status: ReadingStatus;
  note?: string;
  addedAt: string;
  updatedAt: string;
}

export interface NewShelfItem {
  type: ItemType;
  title: string;
  authors?: string[];
  year?: number;
  source?: string;
  sourceId?: string;
  doi?: string;
  coverUrl?: string;
  infoUrl?: string;
  tags?: string[];
  status?: ReadingStatus;
  note?: string;
}

export interface ShelfItemPatch {
  title?: string;
  status?: ReadingStatus;
  note?: string;
  tags?: string[];
  coverUrl?: string;
  infoUrl?: string;
}

export interface Bookmark {
  id: string;
  /** When set, the bookmark is a reading position on a shelf item. */
  itemId?: string;
  title: string;
  url?: string;
  note?: string;
  createdAt: string;
}

export type NewBookmark = Omit<Bookmark, "id" | "createdAt">;
