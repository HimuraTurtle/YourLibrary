import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Bookmark,
  ItemType,
  NewBookmark,
  NewShelfItem,
  ReadingStatus,
  ShelfItem,
  ShelfItemPatch,
} from "./types";

const SCHEMA =
  "CREATE TABLE IF NOT EXISTS shelf_items (" +
  "id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('book','paper')), " +
  "title TEXT NOT NULL, authors TEXT NOT NULL DEFAULT '[]', year INTEGER, " +
  "source TEXT, source_id TEXT, doi TEXT, cover_url TEXT, info_url TEXT, " +
  "tags TEXT NOT NULL DEFAULT '[]', " +
  "status TEXT NOT NULL DEFAULT 'want' CHECK (status IN ('want','reading','finished')), " +
  "note TEXT, added_at TEXT NOT NULL, updated_at TEXT NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS bookmarks (" +
  "id TEXT PRIMARY KEY, item_id TEXT, title TEXT NOT NULL, url TEXT, note TEXT, " +
  "created_at TEXT NOT NULL);" +
  "CREATE INDEX IF NOT EXISTS idx_shelf_status ON shelf_items(status);" +
  "CREATE INDEX IF NOT EXISTS idx_bookmarks_item ON bookmarks(item_id);";

interface RawShelfRow {
  id: string;
  type: ItemType;
  title: string;
  authors: string;
  year: number | null;
  source: string | null;
  source_id: string | null;
  doi: string | null;
  cover_url: string | null;
  info_url: string | null;
  tags: string;
  status: ReadingStatus;
  note: string | null;
  added_at: string;
  updated_at: string;
}

interface RawBookmarkRow {
  id: string;
  item_id: string | null;
  title: string;
  url: string | null;
  note: string | null;
  created_at: string;
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function toShelfItem(row: RawShelfRow): ShelfItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    authors: parseStringArray(row.authors),
    year: row.year ?? undefined,
    source: row.source ?? undefined,
    sourceId: row.source_id ?? undefined,
    doi: row.doi ?? undefined,
    coverUrl: row.cover_url ?? undefined,
    infoUrl: row.info_url ?? undefined,
    tags: parseStringArray(row.tags),
    status: row.status,
    note: row.note ?? undefined,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  };
}

function toBookmark(row: RawBookmarkRow): Bookmark {
  return {
    id: row.id,
    itemId: row.item_id ?? undefined,
    title: row.title,
    url: row.url ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

/** Local persistence for the bookshelf and bookmarks, backed by node:sqlite. */
export class LibraryStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  // --- bookshelf ---

  addShelfItem(input: NewShelfItem): ShelfItem {
    const now = new Date().toISOString();
    const item: ShelfItem = {
      id: randomUUID(),
      type: input.type,
      title: input.title.trim(),
      authors: input.authors ?? [],
      year: input.year,
      source: input.source,
      sourceId: input.sourceId,
      doi: input.doi,
      coverUrl: input.coverUrl,
      infoUrl: input.infoUrl,
      tags: input.tags ?? [],
      status: input.status ?? "want",
      note: input.note,
      addedAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        "INSERT INTO shelf_items (id,type,title,authors,year,source,source_id,doi,cover_url,info_url,tags,status,note,added_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        item.id,
        item.type,
        item.title,
        JSON.stringify(item.authors),
        item.year ?? null,
        item.source ?? null,
        item.sourceId ?? null,
        item.doi ?? null,
        item.coverUrl ?? null,
        item.infoUrl ?? null,
        JSON.stringify(item.tags),
        item.status,
        item.note ?? null,
        item.addedAt,
        item.updatedAt,
      );
    return item;
  }

  listShelfItems(filter?: { status?: ReadingStatus; type?: ItemType }): ShelfItem[] {
    const rows = this.db.prepare("SELECT * FROM shelf_items ORDER BY updated_at DESC").all() as unknown as RawShelfRow[];
    return rows
      .map(toShelfItem)
      .filter(
        (it) =>
          (filter?.status === undefined || it.status === filter.status) &&
          (filter?.type === undefined || it.type === filter.type),
      );
  }

  getShelfItem(id: string): ShelfItem | undefined {
    const row = this.db.prepare("SELECT * FROM shelf_items WHERE id = ?").get(id) as
      | RawShelfRow
      | undefined;
    return row ? toShelfItem(row) : undefined;
  }

  updateShelfItem(id: string, patch: ShelfItemPatch): ShelfItem | undefined {
    const existing = this.getShelfItem(id);
    if (!existing) return undefined;
    const next: ShelfItem = {
      ...existing,
      ...patch,
      title: patch.title !== undefined ? patch.title.trim() : existing.title,
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        "UPDATE shelf_items SET title=?, status=?, note=?, tags=?, cover_url=?, info_url=?, updated_at=? WHERE id=?",
      )
      .run(
        next.title,
        next.status,
        next.note ?? null,
        JSON.stringify(next.tags),
        next.coverUrl ?? null,
        next.infoUrl ?? null,
        next.updatedAt,
        id,
      );
    return next;
  }

  removeShelfItem(id: string): boolean {
    const res = this.db.prepare("DELETE FROM shelf_items WHERE id = ?").run(id);
    return Number(res.changes) > 0;
  }

  // --- bookmarks ---

  addBookmark(input: NewBookmark): Bookmark {
    const bookmark: Bookmark = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      itemId: input.itemId,
      title: input.title.trim(),
      url: input.url,
      note: input.note,
    };
    this.db
      .prepare("INSERT INTO bookmarks (id,item_id,title,url,note,created_at) VALUES (?,?,?,?,?,?)")
      .run(bookmark.id, bookmark.itemId ?? null, bookmark.title, bookmark.url ?? null, bookmark.note ?? null, bookmark.createdAt);
    return bookmark;
  }

  listBookmarks(): Bookmark[] {
    const rows = this.db.prepare("SELECT * FROM bookmarks ORDER BY created_at DESC").all() as unknown as RawBookmarkRow[];
    return rows.map(toBookmark);
  }

  removeBookmark(id: string): boolean {
    const res = this.db.prepare("DELETE FROM bookmarks WHERE id = ?").run(id);
    return Number(res.changes) > 0;
  }
}
