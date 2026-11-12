import { test } from "node:test";
import assert from "node:assert/strict";
import { LibraryStore } from "../src/store";

function fresh(): LibraryStore {
  return new LibraryStore(":memory:");
}

test("shelf item CRUD round-trips authors/tags as JSON", () => {
  const store = fresh();
  const item = store.addShelfItem({
    type: "book",
    title: "  Pride and Prejudice  ",
    authors: ["Jane Austen"],
    year: 1813,
    tags: ["classic", "romance"],
  });
  assert.equal(item.title, "Pride and Prejudice");
  assert.equal(item.status, "want");
  assert.deepEqual(item.tags, ["classic", "romance"]);

  const found = store.getShelfItem(item.id);
  assert.equal(found?.authors[0], "Jane Austen");
  assert.equal(found?.year, 1813);

  const updated = store.updateShelfItem(item.id, { status: "reading", tags: ["classic"] });
  assert.equal(updated?.status, "reading");
  assert.deepEqual(updated?.tags, ["classic"]);

  assert.equal(store.listShelfItems().length, 1);
  assert.equal(store.listShelfItems({ status: "finished" }).length, 0);
  assert.equal(store.listShelfItems({ type: "paper" }).length, 0);

  assert.equal(store.removeShelfItem(item.id), true);
  assert.equal(store.removeShelfItem(item.id), false);
  store.close();
});

test("update returns undefined for a missing id", () => {
  const store = fresh();
  assert.equal(store.updateShelfItem("nope", { status: "reading" }), undefined);
  store.close();
});

test("bookmarks round-trip with optional fields", () => {
  const store = fresh();
  const item = store.addShelfItem({ type: "paper", title: "Paper" });
  const bm = store.addBookmark({ itemId: item.id, title: "Key idea", url: "https://example.com", note: "n" });
  const list = store.listBookmarks();
  assert.equal(list.length, 1);
  assert.equal(list[0]?.itemId, item.id);
  assert.equal(list[0]?.url, "https://example.com");
  assert.equal(store.removeBookmark(bm.id), true);
  assert.equal(store.listBookmarks().length, 0);
  store.close();
});
