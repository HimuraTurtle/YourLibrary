import { parseArgs } from "node:util";
import { createLibrary } from "./index";
import type { BookResult, Bookmark, PaperResult, ShelfItem, WebResult } from "./types";

function loadDotEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    // .env is optional
  }
}

const HELP = [
  "你的图书馆 (Your Library) 检索 CLI",
  "",
  "用法: pnpm cli <命令> [参数]",
  "",
  "命令:",
  "  books <关键词> [--limit N] [--json]       聚合检索电子书",
  "  papers <关键词> [--limit N] [--json]      聚合检索论文",
  "  web <关键词> [--limit N] [--json]        联网搜索（热词/梗/百科）",
  "  shelf add --type book|paper --title T [--authors a,b] [--year N] [--source S] [--source-id ID] [--doi D] [--cover-url U] [--info-url U] [--tags t1,t2] [--status want|reading|finished] [--note N]",
  "  shelf list [--status S] [--type T] [--json]",
  "  shelf update <id> [--title T] [--status S] [--note N] [--tags t1,t2]",
  "  shelf remove <id>",
  "  bookmark add --title T [--item-id ID] [--url U] [--note N]",
  "  bookmark list [--json]",
  "  bookmark remove <id>",
  "  help                                      显示本帮助",
  "",
  "环境变量: 见 .env.example（API keys 等均为可选配置）",
].join("\n");

const OPTIONS = {
  limit: { type: "string" },
  json: { type: "boolean" },
  type: { type: "string" },
  title: { type: "string" },
  authors: { type: "string" },
  year: { type: "string" },
  source: { type: "string" },
  "source-id": { type: "string" },
  doi: { type: "string" },
  "cover-url": { type: "string" },
  "info-url": { type: "string" },
  tags: { type: "string" },
  status: { type: "string" },
  note: { type: "string" },
  "item-id": { type: "string" },
  url: { type: "string" },
  help: { type: "boolean" },
} as const;

type Values = { [K in keyof typeof OPTIONS]: string | boolean | undefined };

function str(v: string | boolean | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function intOr(v: string | boolean | undefined): number | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

function splitList(v: string | boolean | undefined): string[] | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  return s.split(",").map((x) => x.trim()).filter((x) => x !== "");
}

function printBook(b: BookResult, i: number): void {
  const authors = b.authors.join(", ");
  const dl = b.downloads.length > 0 ? " [" + b.downloads.map((d) => d.format).join(",") + "]" : "";
  console.log(
    (i + 1) + ". [" + b.source + "] " + b.title + " — " + (authors || "未知作者") +
    (b.year ? " (" + b.year + ")" : "") + dl,
  );
  if (b.infoUrl) console.log("   " + b.infoUrl);
}

function printPaper(p: PaperResult, i: number): void {
  const authors = p.authors.join(", ");
  console.log(
    (i + 1) + ". [" + p.source + "] " + p.title + " — " + (authors || "未知作者") +
    (p.year ? " (" + p.year + ")" : "") +
    (p.citationCount !== undefined ? " · 被引 " + p.citationCount : ""),
  );
  if (p.doi) console.log("   DOI: " + p.doi);
  if (p.openAccessPdf) console.log("   PDF: " + p.openAccessPdf);
  else if (p.infoUrl) console.log("   链接: " + p.infoUrl);
}

function printShelfItem(it: ShelfItem): void {
  const tags = it.tags.length ? " #" + it.tags.join(" #") : "";
  console.log(
    it.id + " [" + it.status + "] " + it.title + " (" + it.type + ")" +
    (it.authors.length ? " — " + it.authors.join(",") : "") + tags,
  );
}

function printBookmark(b: Bookmark): void {
  console.log(
    b.id + " " + b.title + (b.url ? " -> " + b.url : "") +
    (b.itemId ? " (条目:" + b.itemId + ")" : ""),
  );
}

function printWeb(r: WebResult, i: number): void {
  console.log((i + 1) + ". " + r.title);
  console.log("   " + (r.snippet || "").slice(0, 200));
  console.log("   " + r.url);
}

async function main(): Promise<number> {
  loadDotEnv();
  const args = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args,
    options: OPTIONS,
    allowPositionals: true,
    strict: true,
  });
  const v = values as Values;

  if (v.help || positionals.length === 0) {
    console.log(HELP);
    return 0;
  }

  const command = positionals[0];
  const rest = positionals.slice(1);
  const lib = createLibrary();

  try {
    if (command === "help") {
      console.log(HELP);
    } else if (command === "books" || command === "papers") {
      const query = rest.join(" ");
      if (!query) {
        console.error("缺少关键词");
        return 1;
      }
      const response =
        command === "books"
          ? await lib.search.searchBooks(query, { limit: intOr(v.limit) })
          : await lib.search.searchPapers(query, { limit: intOr(v.limit) });
      if (v.json) {
        console.log(JSON.stringify(response, null, 2));
      } else {
        console.log("查询: " + response.query + " · 结果 " + response.results.length + " · 耗时 " + response.tookMs + "ms");
        response.results.forEach((r, i) =>
          command === "books" ? printBook(r as BookResult, i) : printPaper(r as PaperResult, i),
        );
        for (const e of response.errors) console.log("[警告] " + e.source + ": " + e.message);
      }
    } else if (command === "web") {
      const query = rest.join(" ");
      if (!query) {
        console.error("缺少关键词");
        return 1;
      }
      const results = await lib.webSearch.search(query, { limit: intOr(v.limit) });
      if (v.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log("联网搜索: " + query + " · 结果 " + results.length);
        results.forEach((r, i) => printWeb(r, i));
      }
    } else if (command === "shelf") {
      const sub = rest[0];
      if (sub === "add") {
        const type = str(v.type);
        const title = str(v.title);
        if (type !== "book" && type !== "paper") {
          console.error("需要 --type book|paper");
          return 1;
        }
        if (!title) {
          console.error("需要 --title");
          return 1;
        }
        const status = str(v.status);
        const item = lib.store.addShelfItem({
          type,
          title,
          authors: splitList(v.authors),
          year: intOr(v.year),
          source: str(v.source),
          sourceId: str(v["source-id"]),
          doi: str(v.doi),
          coverUrl: str(v["cover-url"]),
          infoUrl: str(v["info-url"]),
          tags: splitList(v.tags),
          status: status === "want" || status === "reading" || status === "finished" ? status : undefined,
          note: str(v.note),
        });
        console.log("已加入书架: " + item.id);
        printShelfItem(item);
      } else if (sub === "list") {
        const status = str(v.status);
        const type = str(v.type);
        const items = lib.store.listShelfItems({
          status: status === "want" || status === "reading" || status === "finished" ? status : undefined,
          type: type === "book" || type === "paper" ? type : undefined,
        });
        if (v.json) console.log(JSON.stringify(items, null, 2));
        else items.forEach(printShelfItem);
      } else if (sub === "update") {
        const id = rest[1];
        if (!id) {
          console.error("缺少条目 id");
          return 1;
        }
        const status = str(v.status);
        const updated = lib.store.updateShelfItem(id, {
          title: str(v.title),
          note: str(v.note),
          tags: splitList(v.tags),
          status: status === "want" || status === "reading" || status === "finished" ? status : undefined,
        });
        if (!updated) {
          console.error("未找到条目: " + id);
          return 1;
        }
        printShelfItem(updated);
      } else if (sub === "remove") {
        const id = rest[1];
        if (!id) {
          console.error("缺少条目 id");
          return 1;
        }
        console.log(lib.store.removeShelfItem(id) ? "已删除 " + id : "未找到 " + id);
      } else {
        console.error("未知 shelf 子命令: " + (sub ?? ""));
        return 1;
      }
    } else if (command === "bookmark") {
      const sub = rest[0];
      if (sub === "add") {
        const title = str(v.title);
        if (!title) {
          console.error("需要 --title");
          return 1;
        }
        const bm = lib.store.addBookmark({
          title,
          itemId: str(v["item-id"]),
          url: str(v.url),
          note: str(v.note),
        });
        console.log("已添加书签: " + bm.id);
        printBookmark(bm);
      } else if (sub === "list") {
        const bookmarks = lib.store.listBookmarks();
        if (v.json) console.log(JSON.stringify(bookmarks, null, 2));
        else bookmarks.forEach(printBookmark);
      } else if (sub === "remove") {
        const id = rest[1];
        if (!id) {
          console.error("缺少书签 id");
          return 1;
        }
        console.log(lib.store.removeBookmark(id) ? "已删除 " + id : "未找到 " + id);
      } else {
        console.error("未知 bookmark 子命令: " + (sub ?? ""));
        return 1;
      }
    } else {
      console.error("未知命令: " + command);
      console.log(HELP);
      return 1;
    }
    return 0;
  } finally {
    lib.store.close();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
