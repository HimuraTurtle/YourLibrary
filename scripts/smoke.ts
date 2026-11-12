import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createLibrary } from "../src/index";

async function main(): Promise<number> {
  try {
    process.loadEnvFile();
  } catch {
    // .env is optional
  }
  const dbPath = join(tmpdir(), "your-library-smoke-" + randomUUID() + ".db");
  const lib = createLibrary({ store: { path: dbPath } });
  console.log("启用书源: " + lib.bookAdapters.map((a) => a.id).join(", "));
  console.log("启用论文源: " + lib.paperAdapters.map((a) => a.id).join(", "));
  console.log("");

  console.log("== 论文检索: attention is all you need ==");
  const papers = await lib.search.searchPapers("attention is all you need", { limit: 5 });
  console.log("成功源: " + papers.sources.join(", ") + " | 结果 " + papers.results.length + " | 耗时 " + papers.tookMs + "ms");
  for (const p of papers.results.slice(0, 3)) {
    console.log("- " + p.title + " | " + (p.authors.join(", ") || "?") + " | " + (p.year ?? "?") + " | pdf=" + (p.openAccessPdf ?? "-"));
  }
  for (const e of papers.errors) console.log("  [错误] " + e.source + ": " + e.message);

  console.log("");
  console.log("== 电子书检索: pride and prejudice ==");
  const books = await lib.search.searchBooks("pride and prejudice", { limit: 5 });
  console.log("成功源: " + books.sources.join(", ") + " | 结果 " + books.results.length + " | 耗时 " + books.tookMs + "ms");
  for (const b of books.results.slice(0, 3)) {
    console.log("- " + b.title + " | " + (b.authors.join(", ") || "?") + " | 下载 " + b.downloads.length + " 种格式");
  }
  for (const e of books.errors) console.log("  [错误] " + e.source + ": " + e.message);

  console.log("");
  console.log("== 本地库自检 ==");
  const item = lib.store.addShelfItem({
    type: "paper",
    title: "Attention Is All You Need",
    authors: ["Ashish Vaswani"],
    year: 2017,
    tags: ["ml", "transformer"],
  });
  const bookmark = lib.store.addBookmark({ itemId: item.id, title: "Transformer 关键点", note: "self-attention" });
  console.log("书架条目: " + lib.store.listShelfItems().length + " | 书签: " + lib.store.listBookmarks().length);
  lib.store.removeShelfItem(item.id);
  lib.store.removeBookmark(bookmark.id);
  lib.store.close();

  const papersAllFailed = papers.results.length === 0 && papers.errors.length === lib.paperAdapters.length;
  if (papersAllFailed) {
    console.error("论文检索全部源失败，视为 smoke 不通过。");
    return 1;
  }
  console.log("smoke 通过。");
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exitCode = 1;
  });
