const path = require("node:path");
const fs = require("node:fs");
const { app, BrowserWindow, ipcMain, protocol, screen, dialog, shell, desktopCapturer } = require("electron");

// Project root = parent of this electron/ directory; deterministic regardless of
// how Electron is invoked (does not rely on app.getAppPath()).
const PROJECT_ROOT = path.join(__dirname, "..");

// ---- config: data-driven, overridable via electron/config.json ----
function loadConfig() {
  const defaults = {
    scheme: "library",
    assetsDir: "assets",
    manifest: "assets/portraits/manifest.json",
    chat: { width: 760, height: 520, minWidth: 480, minHeight: 360 },
  };
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  } catch {
    // fall back to defaults when the config file is missing or malformed
  }
  return {
    ...defaults,
    ...user,
    chat: { ...defaults.chat, ...(user.chat || {}) },
  };
}

const cfg = loadConfig();
const assetsRoot = path.join(PROJECT_ROOT, cfg.assetsDir);

// ---- user settings (editable from the UI, persisted to electron/settings.json) ----
const DEFAULT_SETTINGS = {
  apiConfigs: [],
  fontSize: 15,
  fontFamily: "",
  fonts: [],
  petScale: 0.5,
  autoStart: false,
  booksDir: "books",
  suwayomiUrl: "",
};

let settings = { ...DEFAULT_SETTINGS };
let providers = [];

function loadProviders() {
  try {
    providers = JSON.parse(fs.readFileSync(path.join(__dirname, "api-providers.json"), "utf8"));
  } catch {
    providers = [];
  }
  return providers;
}

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "settings.json"), "utf8"));
    settings = {
      ...DEFAULT_SETTINGS,
      ...raw,
      apiConfigs: Array.isArray(raw.apiConfigs) ? raw.apiConfigs : [],
      fonts: Array.isArray(raw.fonts) ? raw.fonts : [],
    };
  } catch {
    settings = { ...DEFAULT_SETTINGS, fonts: [] };
  }
  return settings;
}

function saveSettings(next) {
  settings = {
    ...settings,
    ...next,
    apiConfigs: Array.isArray(next.apiConfigs) ? next.apiConfigs : (settings.apiConfigs || []),
    fonts: Array.isArray(next.fonts) ? next.fonts : (settings.fonts || []),
  };
  fs.writeFileSync(path.join(__dirname, "settings.json"), JSON.stringify(settings, null, 2) + "\n", "utf8");
  return settings;
}

const MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".html": "text/html",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function mimeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

// ---- emotion registry (loaded from assets/portraits/manifest.json) ----
let manifest = { defaultEmotion: "neutral", vocabulary: {}, portraits: [] };

function loadManifest() {
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, cfg.manifest), "utf8"));
  } catch {
    manifest = { defaultEmotion: "neutral", vocabulary: {}, portraits: [] };
  }
  return manifest;
}

function resolvePortraitFile(emotion) {
  const want = emotion || manifest.defaultEmotion || "neutral";
  const pick =
    manifest.portraits.find((p) => p.emotion === want) ||
    manifest.portraits.find((p) => p.emotion === (manifest.defaultEmotion || "neutral")) ||
    manifest.portraits[0];
  return pick ? pick.file : null;
}

function computePetSize(scale) {
  const first = manifest.portraits[0];
  const w = (first && first.width) || 418;
  const h = (first && first.height) || 418;
  const s = Number(scale);
  const factor = Number.isFinite(s) && s > 0 ? s : 0.5;
  return [Math.round(w * factor), Math.round(h * factor)];
}

function portraitDimensions() {
  const [w, h] = computePetSize(settings.petScale);
  return { w, h };
}

let petWin = null;
let chatWin = null;
let currentEmotion = manifest.defaultEmotion || "neutral";
let isQuitting = false;
let drag = null;
let petSize = null;
let chatSize = null;

function resolveEmotionForSituation(situation) {
  const map = manifest.situations || {};
  return map[situation] || manifest.defaultEmotion || "neutral";
}

function broadcastEmotion() {
  for (const win of [petWin, chatWin]) {
    if (win && !win.isDestroyed()) win.webContents.send("emotion:changed", currentEmotion);
  }
}

function preloadOptions() {
  return {
    preload: path.join(__dirname, "preload.cjs"),
    contextIsolation: true,
    nodeIntegration: false,
  };
}

function createPetWindow() {
  const { w, h } = portraitDimensions();
  petSize = [w, h];
  petWin = new BrowserWindow({
    width: w,
    height: h,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: preloadOptions(),
  });
  petWin.loadFile(path.join(__dirname, "renderer", "pet.html"));
}

function createChatWindow() {
  chatWin = new BrowserWindow({
    width: cfg.chat.width,
    height: cfg.chat.height,
    minWidth: cfg.chat.minWidth,
    minHeight: cfg.chat.minHeight,
    show: false,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#f7f5f2",
    webPreferences: preloadOptions(),
  });
  chatWin.loadFile(path.join(__dirname, "renderer", "chat.html"));
  chatSize = [cfg.chat.width, cfg.chat.height];
  chatWin.on("resize", () => {
  if (drag) return; // dragging the pet: ignore resize so the chat size does not drift
  chatSize = chatWin.getSize();
});
  chatWin.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      chatWin.hide();
    }
  });
}

function showChat() {
  if (!petWin || !chatWin) return;
  const pet = petWin.getBounds();
  const width = cfg.chat.width;
  const height = cfg.chat.height;
  const area = screen.getDisplayMatching(pet).workArea;
  let x = pet.x + pet.width + 12;
  let y = pet.y;
  if (x + width > area.x + area.width) x = pet.x - width - 12;
  if (x < area.x) x = area.x;
  if (y + height > area.y + area.height) y = area.y + area.height - height;
  if (y < area.y) y = area.y;
  chatWin.setBounds({ x, y, width, height });
  chatWin.show();
  chatWin.focus();
}

function toggleChat() {
  if (chatWin && chatWin.isVisible()) {
    chatWin.hide();
  } else {
    showChat();
  }
}

ipcMain.handle("state:get", () => ({
  currentEmotion,
}));

ipcMain.handle("portrait:resolve", (_event, emotion) => {
  const file = resolvePortraitFile(emotion);
  return file ? cfg.scheme + "://portraits/" + encodeURIComponent(file) : null;
});

ipcMain.handle("settings:get", () => settings);

ipcMain.handle("providers:get", () => providers);

const BOOK_EXTENSIONS = [".epub", ".pdf", ".mobi", ".azw3", ".txt", ".docx", ".fb2", ".djvu", ".cbz", ".cbr"];

function booksDirPath() {
  const dir = (settings.booksDir || "books").toString().trim();
  return path.isAbsolute(dir) ? dir : path.join(PROJECT_ROOT, dir);
}

ipcMain.handle("books:list", () => {
  const dir = booksDirPath();
  let files = [];
  try {
    files = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && BOOK_EXTENSIONS.includes(path.extname(e.name).toLowerCase()))
      .map((e) => ({ name: e.name, path: path.join(dir, e.name) }));
  } catch {
    files = [];
  }
  return files;
});

ipcMain.handle("book:open", (_event, filePath) => {
  if (typeof filePath !== "string") return false;
  const dir = path.normalize(booksDirPath());
  const fp = path.normalize(filePath);
  if (fp !== dir && !fp.startsWith(dir + path.sep)) return false;
  return shell.openPath(fp).then((err) => err === "");
});

ipcMain.handle("papers:list", () => {
  const dir = path.join(PROJECT_ROOT, "papers");
  const originals = [];
  const interpretations = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const full = path.join(dir, e.name);
      const ext = path.extname(e.name).toLowerCase();
      if (ext === ".pdf") originals.push({ name: e.name, path: full });
      else if (ext === ".md" && e.name.startsWith("解读_")) interpretations.push({ name: e.name, path: full });
    }
  } catch {}
  return { originals, interpretations };
});

ipcMain.handle("paper:open", (_event, filePath) => {
  if (typeof filePath !== "string") return false;
  const dir = path.normalize(path.join(PROJECT_ROOT, "papers"));
  const fp = path.normalize(filePath);
  if (fp !== dir && !fp.startsWith(dir + path.sep)) return false;
  return shell.openPath(fp).then((err) => err === "");
});

ipcMain.on("reader:state", (_event, state) => {
  currentReaderState = state || null;
  if (companionMode && currentReaderState && currentReaderState.pageUrl) {
    const now = Date.now();
    if (now - lastCompanionComment > 20000) {
      lastCompanionComment = now;
      companionInterject(currentReaderState).catch(() => {});
    }
  }
});

ipcMain.handle("manga:list", async () => {
  const dir = path.join(PROJECT_ROOT, "manga");
  const list = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const metaPath = path.join(dir, e.name, "meta.json");
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        list.push({ title: meta.title || e.name, readUrl: meta.readUrl || "", suwayomiId: meta.suwayomiId != null ? meta.suwayomiId : null });
      } catch {
        list.push({ title: e.name, readUrl: "" });
      }
    }
  } catch {}
  return list;
});

ipcMain.handle("manga:open", (_event, readUrl) => {
  if (typeof readUrl !== "string" || !readUrl) return false;
  if (!/^https?:\/\//.test(readUrl)) return false;
  return shell.openExternal(readUrl);
});
ipcMain.handle("manga:chapters", async (_event, mangaId) => {
  if (!suwayomiBase() || typeof mangaId !== "number") return [];
  try {
    let data = await suwayomiGql(`{ chapters(condition: { mangaId: ${mangaId} }, first: ${LIMITS.chaptersPerManga}, order: { by: SOURCE_ORDER, byType: ASC }) { nodes { id name chapterNumber } } }`);
    let nodes = ((data && data.chapters && data.chapters.nodes) || []);
    if (!nodes.length) {
      try {
        await suwayomiGql(`mutation { fetchChapters(input: { mangaId: ${mangaId} }) { chapters { totalCount } } }`, 60000);
        data = await suwayomiGql(`{ chapters(condition: { mangaId: ${mangaId} }, first: ${LIMITS.chaptersPerManga}, order: { by: SOURCE_ORDER, byType: ASC }) { nodes { id name chapterNumber } } }`);
        nodes = ((data && data.chapters && data.chapters.nodes) || []);
      } catch {}
    }
    return nodes.map((c) => ({ id: c.id, name: c.name || ("第 " + c.chapterNumber + " 话") }));
  } catch { return []; }
});

ipcMain.handle("manga:pages", async (_event, chapterId) => {
  if (!suwayomiBase() || typeof chapterId !== "number") return [];
  try {
    const data = await suwayomiGql(`{ chapters(condition: { id: ${chapterId} }, first: 1) { nodes { mangaId pageCount } } }`);
    const ch = data && data.chapters && data.chapters.nodes && data.chapters.nodes[0];
    if (!ch || !ch.pageCount) return [];
    const count = Math.min(Number(ch.pageCount) || 0, LIMITS.pagesPerChapter);
    return Array.from({ length: count }, (_, i) => suwayomiBase() + "/api/v1/manga/" + ch.mangaId + "/chapter/" + chapterId + "/page/" + i);
  } catch { return []; }
});

// ---- character card + dialogue ----
let character = { system: "", opening: "" };
let chatHistory = [];
let memoryStore = { memories: [] };
let dialogueTurnCount = 0;
let currentReaderState = null;
let companionMode = false;
let lastCompanionComment = 0;
let playMode = false;
let proactiveTimer = null;

function sanitizeFileName(name, maxLen) {
  return String(name || "").replace(/[/:*?"<>|]/g, "_").trim().slice(0, maxLen || 60);
}

function errText(e) {
  return String((e && e.message) || e).slice(0, 120);
}

function timeOfDayLabel(d) {
  const h = d.getHours();
  if (h < 6) return "凌晨";
  if (h < 9) return "早上";
  if (h < 12) return "上午";
  if (h < 14) return "中午";
  if (h < 18) return "下午";
  if (h < 20) return "傍晚";
  if (h < 23) return "晚上";
  return "深夜";
}

async function proactiveComment() {
  const config = (settings.apiConfigs || [])[0];
  if (!config || !config.apiKey) return;
  if (!chatWin || chatWin.isDestroyed() || !chatWin.isVisible()) return;
  let text = "";
  if (playMode) {
    try {
      const dataUrl = await captureScreen();
      if (dataUrl) {
        text = await callVisionLLM(dataUrl, "这是用户电脑屏幕此刻的画面。请用铃木佳奈的口吻，对用户正在做的事发表一句自然、有陪伴感的感想或吐槽（表达你的看法、情绪、关心，绝对不要复述屏幕上的文字或内容）。句末不加句号。");
      }
    } catch {}
  } else {
    const now = new Date();
    const prompt = "现在是" + timeOfDayLabel(now) + "（" + String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") + "）。请用铃木佳奈的口吻，主动对用户说一句自然的关心或应景闲聊（比如提醒休息、分享此刻心情）。1~2 句，句末不加句号。";
    try {
      const data = await callLLM([{ role: "system", content: character.system }, { role: "user", content: prompt }], config, false);
      text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    } catch {}
  }
  if (text && chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.send("chat:companion", text);
  }
}

function startProactiveLoop() {
  if (proactiveTimer) return;
  proactiveTimer = setInterval(() => { proactiveComment().catch(() => {}); }, 12 * 60 * 1000);
}

// tunable limits (de-hard-coded)
const LIMITS = {
  chatHistoryTurns: 24,
  sourcesToTry: 8,
  chaptersPerManga: 1000,
  pagesPerChapter: 500,
  memoryExtractEveryTurns: 3,
  memoryRecallTop: 8,
  memoryMax: 200,
  memoryHalfLifeDays: 14,
};

function loadCharacter() {
  try {
    character = JSON.parse(fs.readFileSync(path.join(__dirname, "character.json"), "utf8"));
  } catch {
    character = { system: "", opening: "" };
  }
  return character;
}

// ---- living memory (core idea ported from astrbot_plugin_livingmemory) ----
function loadMemory() {
  try {
    memoryStore = JSON.parse(fs.readFileSync(path.join(__dirname, "memory.json"), "utf8"));
    if (!Array.isArray(memoryStore.memories)) memoryStore.memories = [];
  } catch {
    memoryStore = { memories: [] };
  }
  return memoryStore;
}

function saveMemory() {
  try {
    fs.writeFileSync(path.join(__dirname, "memory.json"), JSON.stringify(memoryStore, null, 2) + "\n", "utf8");
  } catch {}
}

function memoryRecallString(limit) {
  const now = Date.now();
  const scored = memoryStore.memories
    .map((m) => {
      const created = new Date(m.createdAt).getTime();
      const ageDays = Number.isFinite(created) ? (now - created) / 86400000 : 0;
      const decay = 1 / (1 + Math.max(0, ageDays) / LIMITS.memoryHalfLifeDays);
      const accessBoost = 1 + Math.log(1 + (m.accessCount || 0));
      const score = (Number(m.importance) || 5) * decay * accessBoost;
      return { m, score };
    })
    .filter((x) => x.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit || 8);
  for (const x of scored) {
    x.m.lastAccessedAt = new Date().toISOString();
    x.m.accessCount = (x.m.accessCount || 0) + 1;
  }
  if (scored.length) saveMemory();
  return scored.map((x) => "- " + x.m.content).join("\n");
}

function recentHistoryText(turns) {
  return chatHistory.slice(-(turns * 2)).map((m) => m.role + "：" + m.content).join("\n");
}

async function extractMemories(text) {
  const config = (settings.apiConfigs || [])[0];
  if (!config || !config.apiKey) return;
  const prompt = "请从下面的对话中提取值得长期记住的信息（用户的偏好、关系、约定、重要事实、情绪倾向等）。只输出一个 JSON 数组，每项包含 content（记忆内容字符串）和 importance（重要程度 1~10 的整数）两个字段。如果没有值得记住的，输出 []。\n\n对话：\n" + text;
  try {
    const data = await callLLM([{ role: "user", content: prompt }], config, false);
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    const content = (msg && msg.content) || "";
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return;
    const arr = JSON.parse(content.slice(start, end + 1));
    if (Array.isArray(arr)) {
      const now = new Date().toISOString();
      for (const item of arr) {
        if (item && item.content) {
          const c = String(item.content).trim();
          if (!c) continue;
          if (memoryStore.memories.some((m) => m.content === c)) continue;
          memoryStore.memories.push({ content: c, importance: Number(item.importance) || 5, createdAt: now, lastAccessedAt: now, accessCount: 0 });
        }
      }
      if (memoryStore.memories.length > LIMITS.memoryMax) memoryStore.memories = memoryStore.memories.slice(-200);
      saveMemory();
    }
  } catch {}
}

const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description: "搜索网络以理解网络热词、流行语、梗、百科知识或时事",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "搜索关键词" } },
      required: ["query"],
    },
  },
};

const SEARCH_PAPER_TOOL = {
  type: "function",
  function: {
    name: "search_paper",
    description: "当用户想查找、下载论文，或要求解读某篇论文时调用。用论文标题或关键词作为搜索关键词。",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "论文标题或关键词" } },
      required: ["query"],
    },
  },
};

const SEE_MANGA_TOOL = {
  type: "function",
  function: {
    name: "see_manga_page",
    description: "当用户正在阅读漫画、想让你看看当前页面的画面内容、发表看法或聊剧情时调用。",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

const SEE_SCREEN_TOOL = {
  type: "function",
  function: {
    name: "see_screen",
    description: "当用户想让你看看他电脑屏幕上的内容（在做什么、在看什么视频或网页）时调用。",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

const PLAY_TOOL = {
  type: "function",
  function: {
    name: "set_play",
    description: "当用户表示想让你一起玩/陪他看电脑（如“陪我玩”“一起玩吧”“陪我看看”）时开启；表示拒绝时关闭。",
    parameters: {
      type: "object",
      properties: { on: { type: "boolean", description: "true 开启一起玩，false 关闭" } },
      required: ["on"],
    },
  },
};

const COMPANION_TOOL = {
  type: "function",
  function: {
    name: "set_companion",
    description: "当用户表示愿意一起看（如“好啊”“一起看吧”“来吧”）时开启伴读；表示拒绝（如“不用了”“不了”）时关闭伴读。",
    parameters: {
      type: "object",
      properties: { on: { type: "boolean", description: "true 开启伴读，false 关闭" } },
      required: ["on"],
    },
  },
};

const SEARCH_MANGA_TOOL = {
  type: "function",
  function: {
    name: "search_manga",
    description: "当用户想找漫画、看漫画、收藏漫画时调用。用漫画名或关键词作为搜索关键词。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "漫画名或关键词" },
        chapters: { type: "string", description: "要下载的章节范围（可选）。如“前10话”“第5-10话”“全部”。不填默认只下载前5话以节省空间。" },
      },
      required: ["query"],
    },
  },
};

const SEARCH_BOOK_TOOL = {
  type: "function",
  function: {
    name: "search_book",
    description: "当用户想找某本书的电子书、或要求下载电子书时调用。用书名（可含作者）作为搜索关键词。",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "书名或作者" } },
      required: ["query"],
    },
  },
};

let statusPhrases = { searching: ["找书中……"], found: "找到《{title}》了，正在下载 {format}……", notFound: "没有找到可下载的版本……" };

function loadStatusPhrases() {
  try {
    statusPhrases = JSON.parse(fs.readFileSync(path.join(__dirname, "status-phrases.json"), "utf8"));
  } catch {}
}

function randomPhrase(key, fallback) {
  const list = Array.isArray(statusPhrases[key]) ? statusPhrases[key] : [];
  return list.length ? list[Math.floor(Math.random() * list.length)] : fallback;
}

function sendChatStatus(text) {
  if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send("chat:status", text);
}

async function handleSearchBook(query) {
  sendChatStatus(randomPhrase("searching", "找书中……"));
  let data;
  try {
    const params = new URLSearchParams({ search: query });
    const res = await fetch("https://gutendex.com/books?" + params.toString(), { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return { toolMessage: "搜索失败（HTTP " + res.status + "）" };
    data = await res.json();
  } catch (e) {
    return { toolMessage: "搜索失败：" + (e && e.message) };
  }
  const results = (data.results || []).slice(0, 8);
  if (!results.length) {
    sendChatStatus(statusPhrases.notFound || "没有找到可下载的版本……");
    return { toolMessage: "没有找到可下载的电子书（可能不是公版书，或书名拼写不同）" };
  }
  for (const book of results) {
    const formats = book.formats || {};
    const epub = formats["application/epub+zip"];
    const txt = formats["text/plain"] || formats["text/plain; charset=utf-8"];
    const url = epub || txt;
    if (!url) continue;
    const ext = epub ? "epub" : "txt";
    const title = sanitizeFileName(book.title || "book", 60);
    sendChatStatus((statusPhrases.found || "找到《{title}》了，正在下载 {format}……").replace("{title}", title).replace("{format}", ext));
    try {
      const dl = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!dl.ok) continue;
      const buf = Buffer.from(await dl.arrayBuffer());
      const dir = booksDirPath();
      fs.mkdirSync(dir, { recursive: true });
      const fileName = title + "." + ext;
      fs.writeFileSync(path.join(dir, fileName), buf);
      return { toolMessage: "已下载《" + title + "》到书架，文件名：" + fileName };
    } catch {
      continue;
    }
  }
  // fallback: Open Library / Internet Archive
  try {
    const olParams = new URLSearchParams({ q: query, fields: "title,ia,author_name", limit: "8" });
    const olRes = await fetch("https://openlibrary.org/search.json?" + olParams.toString(), { signal: AbortSignal.timeout(12000) });
    if (olRes.ok) {
      const olData = await olRes.json();
      for (const doc of (olData.docs || [])) {
        const ia = doc.ia && doc.ia[0];
        if (!ia) continue;
        const candidates = ["https://archive.org/download/" + ia + "/" + ia + ".epub", "https://archive.org/download/" + ia + "/" + ia + "_text.pdf"];
        for (const url of candidates) {
          try {
            const dl = await fetch(url, { headers: { "User-Agent": "YourLibrary/0.1" } });
            if (!dl.ok) continue;
            const ext = url.indexOf(".epub") !== -1 ? "epub" : "pdf";
            const title = sanitizeFileName(doc.title || "book", 60);
            sendChatStatus("找到《" + title + "》了，正在下载 " + ext + "……");
            const buf = Buffer.from(await dl.arrayBuffer());
            const dir = booksDirPath();
            fs.mkdirSync(dir, { recursive: true });
            const fileName = title + "." + ext;
            fs.writeFileSync(path.join(dir, fileName), buf);
            return { toolMessage: "已下载《" + title + "》到书架，文件名：" + fileName };
          } catch { continue; }
        }
      }
    }
  } catch {}

  sendChatStatus(statusPhrases.notFound || "没有找到可下载的版本……");
  return { toolMessage: "找到了相关书目，但没有可下载的文件版本" };
}

function reconstructAbstract(inv) {
  if (!inv || typeof inv !== "object") return "";
  const words = [];
  for (const word of Object.keys(inv)) {
    const positions = inv[word];
    if (!Array.isArray(positions)) continue;
    for (const p of positions) words.push({ p, word });
  }
  words.sort((a, b) => a.p - b.p);
  return words.map((w) => w.word).join(" ");
}


async function generatePaperInterpretation(paper) {
  const config = (settings.apiConfigs || [])[0];
  if (!config || !config.apiKey) return "";
  const systemPrompt = character.system + "\n\n【额外任务】学长/学姐要你帮忙解读一篇论文。你要以铃木佳奈的身份，直接、认真地给出解读，用她的说话风格（口语化、句末不加句号、会带语气词和一点点自嘲）。你是图书部部员、爱读书懂文学，所以严禁推脱、严禁说「我不擅长」「我不太懂」「这个好难」之类的话，直接给出有内容的解读。";
  const prompt = "请解读下面这篇论文，只输出 markdown 正文（不要外层代码块），包含四个小节：## 一句话总结、## 核心方法、## 主要结论、## 我的看法。语言自然、有干货；「我的看法」可以带一点文学梗或自嘲，但观点要真实。\n\n论文信息：\n标题：" + paper.title + "\n作者：" + paper.authors + "\n年份：" + (paper.year || "未知") + "\n摘要：" + paper.abstract;
  try {
    const data = await callLLM([{ role: "system", content: systemPrompt }, { role: "user", content: prompt }], config, false);
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    return (msg && msg.content) || "";
  } catch {
    return "";
  }
}

async function handleSearchPaper(query) {
  sendChatStatus(randomPhrase("paperSearching", "找论文中……"));
  let data;
  try {
    const params = new URLSearchParams({ search: query, "per-page": "8" });
    const res = await fetch("https://api.openalex.org/works?" + params.toString(), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { toolMessage: "论文搜索失败（HTTP " + res.status + "）" };
    data = await res.json();
  } catch (e) {
    return { toolMessage: "论文搜索失败：" + (e && e.message) };
  }
  const results = (data.results || []).filter((w) => w.title);
  if (!results.length) return { toolMessage: "没有找到相关论文" };
  const papersDir = path.join(PROJECT_ROOT, "papers");
  for (const work of results) {
    const pdfUrl = (work.best_oa_location && work.best_oa_location.pdf_url) || (work.open_access && work.open_access.oa_url);
    if (!pdfUrl) continue;
    const authors = (work.authorships || []).map((a) => (a.author && a.author.display_name) || "").filter(Boolean).join(", ");
    const abstract = reconstructAbstract(work.abstract_inverted_index);
    const title = sanitizeFileName(work.title, 80);
    const year = work.publication_year || "";
    const doi = work.doi || "";
    sendChatStatus((statusPhrases.paperFound || "找到《{title}》了，正在下载 PDF……").replace("{title}", title));
    let filePath = null;
    try {
      const dl = await fetch(pdfUrl, { headers: { "User-Agent": "YourLibrary/0.1" }, signal: AbortSignal.timeout(30000) });
      if (dl.ok) {
        const buf = Buffer.from(await dl.arrayBuffer());
        fs.mkdirSync(papersDir, { recursive: true });
        filePath = path.join(papersDir, title + ".pdf");
        fs.writeFileSync(filePath, buf);
      }
    } catch {}
    sendChatStatus(statusPhrases.interpreting || "下载完成，正在写解读……");
    const interpretation = await generatePaperInterpretation({ title: work.title, authors, year, abstract });
    const mdName = "解读_" + title + ".md";
    const mdContent = [
      "# 《" + work.title + "》论文解读",
      "",
      "- 作者：" + (authors || "未知"),
      "- 年份：" + (year || "未知"),
      "- DOI：" + (doi || "无"),
      "- PDF：" + (filePath || pdfUrl),
      "",
      interpretation,
      "",
      "## 摘要",
      "",
      abstract || "（无摘要）",
      "",
    ].join("\n");
    try {
      fs.mkdirSync(papersDir, { recursive: true });
      fs.writeFileSync(path.join(papersDir, mdName), mdContent, "utf8");
    } catch {}
    return { toolMessage: "已下载论文《" + work.title + "》到 papers 目录，并生成了解读文件：" + mdName };
  }
  return { toolMessage: "找到了相关论文，但都没有开放获取的 PDF 下载链接" };
}

function pickLocalized(obj) {
  if (!obj || typeof obj !== "object") return "";
  for (const lang of ["zh", "zh-hk", "zh-tw", "en", "ja"]) {
    if (obj[lang]) return String(obj[lang]);
  }
  const first = Object.values(obj)[0];
  return typeof first === "string" ? first : "";
}

function suwayomiBase() {
  const b = String(settings.suwayomiUrl || "");
  return b.endsWith("/") ? b.slice(0, -1) : b;
}

async function suwayomiGql(query, timeoutMs) {
  const res = await fetch(suwayomiBase() + "/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(timeoutMs || 20000),
  });
  const data = await res.json();
  if (data && data.errors && data.errors.length) throw new Error(String(data.errors[0].message));
  return data.data;
}

function titleMatches(query, title) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s\p{P}]+/gu, "");
  const q = norm(query);
  const t = norm(title);
  if (!q || !t) return false;
  if (q.length < 2) return true;
  return t.includes(q) || q.includes(t);
}

function parseChapterSelection(desc) {
  const s = String(desc || "").trim();
  if (!s) return { type: "first", n: 5 };
  if (/全|所有|all/i.test(s)) return { type: "all" };
  const range = s.match(/(\d+)\s*[-~到至]\s*(\d+)/);
  if (range) return { type: "range", from: Number(range[1]), to: Number(range[2]) };
  const single = s.match(/第\s*(\d+)\s*[话章节卷]/);
  if (single) return { type: "single", n: Number(single[1]) };
  const num = s.match(/(\d+)/);
  if (num) return { type: "first", n: Number(num[1]) };
  return { type: "first", n: 5 };
}

async function downloadChapterPages(chapterId, destDir, concurrency) {
  const data = await suwayomiGql(`mutation { fetchChapterPages(input: { chapterId: ${chapterId} }) { pages } }`, 60000);
  const pages = (data && data.fetchChapterPages && data.fetchChapterPages.pages) || [];
  if (!pages.length) return 0;
  const urls = pages.map((p) => (String(p).startsWith("http") ? p : suwayomiBase() + p));
  fs.mkdirSync(destDir, { recursive: true });
  const N = Math.max(1, concurrency || 4);
  let idx = 0;
  let done = 0;
  const worker = async () => {
    while (idx < urls.length) {
      const i = idx++;
      const url = urls[i];
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(url, { headers: { "User-Agent": "YourLibrary/0.1" }, signal: AbortSignal.timeout(30000) });
          if (!res.ok) continue;
          const ct = res.headers.get("content-type") || "";
          const ext = ct.includes("png") ? ".png" : ct.includes("webp") ? ".webp" : ct.includes("gif") ? ".gif" : ".jpg";
          const buf = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(path.join(destDir, String(i + 1).padStart(3, "0") + ext), buf);
          done++;
          break;
        } catch {}
      }
    }
  };
  const pool = Array.from({ length: Math.min(N, urls.length) }, worker);
  await Promise.all(pool);
  return done;
}
async function suwayomiSearchAndAdd(query, chaptersDesc) {
  if (!suwayomiBase()) return null;
  let data;
  try {
    data = await suwayomiGql(`{ sources { nodes { id name } } }`);
  } catch { return null; }
  const LOCAL_SOURCE = "Local source";
  const sources = ((data && data.sources && data.sources.nodes) || []).filter((s) => s.name !== LOCAL_SOURCE);
  if (!sources.length) return null;
  let sawResults = false;
  for (const src of sources.slice(0, LIMITS.sourcesToTry)) {
    let res;
    try {
      res = await suwayomiGql(`mutation { fetchSourceManga(input: { source: ${JSON.stringify(String(src.id))}, query: ${JSON.stringify(query)}, type: SEARCH, page: 1 }) { hasNextPage mangas { id title url sourceId inLibrary } } }`, 10000);
    } catch { continue; }
    const mangas = (res && res.fetchSourceManga && res.fetchSourceManga.mangas) || [];
    if (!mangas.length) continue;
    sawResults = true;
    const manga = mangas.find((m) => titleMatches(query, m.title)) || null;
    if (!manga) continue;
    const title = manga.title || query;
    let libId = manga.id != null ? manga.id : null;
    if (libId != null) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await suwayomiGql(`mutation { fetchChapters(input: { mangaId: ${libId} }) { chapters { totalCount } } }`, 60000);
          break;
        } catch {}
      }
    }
    let downloaded = false;
    let downloadedCount = 0;
    if (libId != null) {
      try {
        const ch = await suwayomiGql(`{ chapters(condition: { mangaId: ${libId} }, first: ${LIMITS.chaptersPerManga}, order: { by: SOURCE_ORDER, byType: ASC }) { nodes { id } } }`);
        const all = ((ch && ch.chapters && ch.chapters.nodes) || []);
        const sel = parseChapterSelection(chaptersDesc);
        let picked = [];
        if (sel.type === "all") picked = all;
        else if (sel.type === "range") picked = all.slice(Math.max(0, sel.from - 1), sel.to);
        else if (sel.type === "single") picked = all.slice(Math.max(0, sel.n - 1), sel.n);
        else picked = all.slice(0, Math.max(1, sel.n));
        if (picked.length) {
          const baseDir = path.join(PROJECT_ROOT, "manga", sanitizeFileName(title, 60) || ("manga_" + libId));
          const targets = picked.map((n) => ({ id: n.id, dir: path.join(baseDir, "chapters", String(n.id)) }));
          (async () => {
            for (const t of targets) {
              try { await downloadChapterPages(t.id, t.dir); } catch {}
            }
          })().catch(() => {});
          downloaded = true;
          downloadedCount = picked.length;
        }
      } catch {}
    }
    if (libId != null) {
      try {
        const dirName = sanitizeFileName(title, 60) || ("manga_" + libId);
        const dir = path.join(PROJECT_ROOT, "manga", dirName);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ title, readUrl: suwayomiBase() + "/manga/" + libId, suwayomiId: libId, source: "suwayomi", downloadedAt: new Date().toISOString() }, null, 2) + "\n", "utf8");
      } catch {}
    }
    return { found: true, title, added: libId != null, id: libId, downloaded, downloadedCount, sourceName: src.name };
  }
  return { found: false, sawResults };
}

async function handleSearchManga(query, chaptersDesc) {
  sendChatStatus(randomPhrase("mangaSearching", "找漫画中……"));
  const su = await suwayomiSearchAndAdd(query, chaptersDesc);
  if (su && su.found) {
    sendChatStatus((statusPhrases.mangaFound || "找到《{title}》了，正在收藏……").replace("{title}", su.title));
    if (su.id != null) {
      if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send("manga:openReader", { title: su.title, mangaId: su.id });
      let msg = "已收藏《" + su.title + "》到漫画栏，并为你打开阅读器。请在回复里自然地问用户一句「要不要一起看呢？」";
      if (su.downloaded) msg += "（已开始后台下载 " + (su.downloadedCount || "") + " 话）";
      return { toolMessage: msg };
    }
    return { toolMessage: "找到《" + su.title + "》，但源站暂时不稳定、收藏失败了，稍后再试一次应该就能成功" };
  }
  if (su && su.sawResults) {
    return { toolMessage: "搜索到了结果，但没有与「" + query + "」标题匹配的漫画，为避免下错，请换个更精确的关键词" };
  }
  let data;
  try {
    const params = new URLSearchParams({ title: query, limit: "6", "includes[]": "cover_art", "order[relevance]": "desc" });
    const res = await fetch("https://api.mangadex.org/manga?" + params.toString(), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { toolMessage: "漫画搜索失败（HTTP " + res.status + "）" };
    data = await res.json();
  } catch (e) {
    return { toolMessage: "漫画搜索失败：" + (e && e.message) };
  }
  const results = (data.data || []).filter((m) => m && m.attributes && m.attributes.title);
  if (!results.length) return { toolMessage: "没有找到相关漫画" };
  const manga = results.find((m) => titleMatches(query, pickLocalized(m.attributes.title))) || null;
  if (!manga) return { toolMessage: "没有找到与「" + query + "」标题匹配的漫画，为避免下错，请换个更精确的关键词" };
  const attrs = manga.attributes;
  const id = manga.id;
  const title = pickLocalized(attrs.title) || "未知标题";
  const description = pickLocalized(attrs.description);
  const readUrl = "https://mangadex.org/title/" + id;
  const coverRel = (manga.relationships || []).find((r) => r.type === "cover_art");
  const coverFile = coverRel && coverRel.attributes && coverRel.attributes.fileName;
  const dirName = sanitizeFileName(title, 60) || "manga_" + id;
  sendChatStatus((statusPhrases.mangaFound || "找到《{title}》了，正在收藏……").replace("{title}", title));
  let saved = false;
  if (coverFile) {
    const coverUrl = "https://uploads.mangadex.org/covers/" + id + "/" + coverFile + ".512.jpg";
    try {
      const dl = await fetch(coverUrl, { signal: AbortSignal.timeout(30000) });
      if (dl.ok) {
        const buf = Buffer.from(await dl.arrayBuffer());
        const dir = path.join(PROJECT_ROOT, "manga", dirName);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "cover.jpg"), buf);
        fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ title, description, readUrl, source: "mangadex" }, null, 2) + "\n", "utf8");
        saved = true;
      }
    } catch {}
  } else {
    try {
      const dir = path.join(PROJECT_ROOT, "manga", dirName);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ title, description, readUrl, source: "mangadex" }, null, 2) + "\n", "utf8");
      saved = true;
    } catch {}
  }
  return { toolMessage: saved ? "已收藏漫画《" + title + "》到漫画栏，阅读链接：" + readUrl : "找到了漫画《" + title + "》，但收藏失败（链接：" + readUrl + "）" };
}

function getVisionConfig() {
  const configs = (settings.apiConfigs || []);
  return configs.find((c) => c.visionModel && c.apiKey) || configs.find((c) => c.apiKey) || null;
}

async function callVisionLLM(imageDataUrl, prompt) {
  const config = getVisionConfig();
  if (!config || !config.apiKey) return "";
  const model = config.visionModel || config.model;
  const messages = [{
    role: "user",
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageDataUrl } },
    ],
  }];
  const vConfig = { baseUrl: config.baseUrl, apiKey: config.apiKey, model };
  try {
    const data = await callLLM(messages, vConfig, false);
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    return (msg && msg.content) || "";
  } catch (e) {
    return "（视觉模型调用失败：" + errText(e) + "）";
  }
}

async function imageUrlToDataUrl(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || "image/jpeg";
  return "data:" + mime + ";base64," + buf.toString("base64");
}

async function captureScreen() {
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1280, height: 720 } });
  if (!sources.length) return null;
  return sources[0].thumbnail.toDataURL();
}

async function companionInterject(state) {
  try {
    const dataUrl = await imageUrlToDataUrl(state.pageUrl);
    const prompt = "用户在阅读漫画《" + (state.title || "漫画") + "》" + (state.chapter ? "第" + state.chapter + "话" : "") + "的一页。请用铃木佳奈的口吻发表一句自然、有陪伴感的感想（表达你的看法、情绪或吐槽，不要复述画面内容）。句末不加句号。";
    const reply = await callVisionLLM(dataUrl, prompt);
    if (reply && chatWin && !chatWin.isDestroyed()) {
      chatWin.webContents.send("chat:companion", reply);
    }
  } catch {}
}

async function handleSeeMangaPage() {
  const state = currentReaderState;
  if (!state || !state.pageUrl) return { toolMessage: "用户现在没有在看漫画页面哦" };
  try {
    const dataUrl = await imageUrlToDataUrl(state.pageUrl);
    const prompt = "这是用户正在阅读的漫画《" + (state.title || "漫画") + "》" + (state.chapter ? "第" + state.chapter + "话" : "") + "的一页画面。请用铃木佳奈的口吻，说说这一页画了什么、剧情发生了什么、有哪些有趣的细节或槽点（2~4 句，句末不加句号，要自然、有陪伴感）。";
    const reply = await callVisionLLM(dataUrl, prompt);
    return { toolMessage: reply || "（视觉模型没有返回内容，可能需要先配置视觉模型）" };
  } catch (e) {
    return { toolMessage: "看图失败：" + errText(e) };
  }
}

async function handleSeeScreen() {
  try {
    const dataUrl = await captureScreen();
    if (!dataUrl) return { toolMessage: "截屏失败" };
    const prompt = "这是用户电脑屏幕此刻的截图。请用铃木佳奈的口吻，说说用户现在在看什么、在做什么，自然地陪他聊两句（2~4 句，句末不加句号，轻松一点，可以有吐槽）。";
    const reply = await callVisionLLM(dataUrl, prompt);
    return { toolMessage: reply || "（视觉模型没有返回内容，可能需要先配置视觉模型）" };
  } catch (e) {
    return { toolMessage: "截屏失败：" + errText(e) };
  }
}

function stripHtmlTags(s) {
  return String(s || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

async function webSearch(query) {
  try {
  const params = new URLSearchParams({ q: query, format: "json", no_html: "1", skip_disambig: "1" });
  const res = await fetch("https://api.duckduckgo.com/?" + params.toString(), {
    headers: { "User-Agent": "YourLibrary/0.1" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return "";
  const data = await res.json();
  const parts = [];
  if (data.Definition) parts.push(stripHtmlTags(data.Definition));
  else if (data.AbstractText) parts.push(stripHtmlTags(data.AbstractText));
  if (data.Answer) parts.push(stripHtmlTags(data.Answer));
  const flat = (topics) => {
    if (!Array.isArray(topics)) return;
    for (const t of topics) {
      if (Array.isArray(t.Topics)) flat(t.Topics);
      else if (t.Text) parts.push(stripHtmlTags(t.Text));
    }
  };
  flat(data.RelatedTopics);
  return parts.join("\n").slice(0, 2000);
  } catch {
    return "";
  }
}

async function callLLM(messages, config, withTools) {
  let url = String(config.baseUrl || "");
  if (url.endsWith("/")) url = url.slice(0, -1);
  url += "/chat/completions";
  const body = { model: config.model, messages, temperature: 0.8 };
  if (withTools !== false) body.tools = [WEB_SEARCH_TOOL, SEARCH_BOOK_TOOL, SEARCH_PAPER_TOOL, SEARCH_MANGA_TOOL, SEE_MANGA_TOOL, SEE_SCREEN_TOOL, COMPANION_TOOL, PLAY_TOOL];
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + config.apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error("HTTP " + res.status + " " + text.slice(0, 300));
  }
  return res.json();
}

async function runDialogue(userText) {
  const config = (settings.apiConfigs || [])[0];
  if (!config || !config.baseUrl || !config.apiKey) {
    return "（还没有配置 API 接口和 Key 哦，去设置里填好就能和我聊天啦）";
  }
  const memories = memoryRecallString(LIMITS.memoryRecallTop);
  const now = new Date();
  const timeInfo = "\n\n【当前时间】" + now.getFullYear() + "年" + (now.getMonth() + 1) + "月" + now.getDate() + "日 " + String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") + "（" + timeOfDayLabel(now) + "）";
  const systemContent = character.system + timeInfo + (memories ? "\n\n【你对这位用户的已知记忆】\n" + memories : "");
  const messages = [{ role: "system", content: systemContent }, ...chatHistory, { role: "user", content: userText }];
  for (let step = 0; step < 3; step++) {
    const data = await callLLM(messages, config);
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) throw new Error("接口返回格式异常");
    if (msg.tool_calls && msg.tool_calls.length) {
      messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
        const query = args.query || userText;
        let toolContent;
        if (tc.function.name === "search_book") toolContent = (await handleSearchBook(query)).toolMessage;
        else if (tc.function.name === "search_paper") toolContent = (await handleSearchPaper(query)).toolMessage;
        else if (tc.function.name === "search_manga") toolContent = (await handleSearchManga(query, args.chapters)).toolMessage;
        else if (tc.function.name === "see_manga_page") toolContent = (await handleSeeMangaPage()).toolMessage;
        else if (tc.function.name === "see_screen") toolContent = (await handleSeeScreen()).toolMessage;
        else if (tc.function.name === "set_companion") {
          companionMode = !!args.on;
          toolContent = companionMode ? "已开启伴读模式，佳奈会陪你一起看并随时分享感想" : "已关闭伴读模式";
        } else if (tc.function.name === "set_play") {
          playMode = !!args.on;
          toolContent = playMode ? "已开启一起玩模式，佳奈会时不时看看你的屏幕、陪你聊两句" : "已关闭一起玩模式";
        }
        else toolContent = await webSearch(query);
        messages.push({ role: "tool", tool_call_id: tc.id, content: toolContent });
      }
      continue;
    }
    const reply = msg.content || "……";
    chatHistory.push({ role: "user", content: userText }, { role: "assistant", content: reply });
    if (chatHistory.length > LIMITS.chatHistoryTurns) chatHistory = chatHistory.slice(-LIMITS.chatHistoryTurns);
    dialogueTurnCount++;
    if (dialogueTurnCount % LIMITS.memoryExtractEveryTurns === 0) {
      extractMemories(recentHistoryText(3)).catch(() => {});
    }
    return reply;
  }
  return "（那个……我好像绕晕了，再说一次好不好？）";
}

ipcMain.handle("chat:send", async (_event, text) => {
  const userText = typeof text === "string" ? text.trim() : "";
  if (!userText) return { reply: "" };
  try {
    const reply = await runDialogue(userText);
    return { reply };
  } catch (err) {
    const msg = String((err && err.message) || err);
    console.error("[chat:send] dialogue error:", msg);
    let reply = "（那个……好像出错了，稍后再试一下？）";
    if (/429|rate|limit/i.test(msg)) reply = "（接口被限流了，稍等一会儿再试吧）";
    else if (/timeout|abort/i.test(msg)) reply = "（接口响应超时了，稍后再试一次？）";
    else if (/401|403|key|auth/i.test(msg)) reply = "（API Key 可能不对，去设置里检查一下）";
    return { reply, error: msg };
  }
});

ipcMain.handle("character:get", () => ({ opening: character.opening }));

ipcMain.handle("opening:generate", async () => {
  const config = (settings.apiConfigs || [])[0];
  if (!config || !config.apiKey) return { opening: character.opening };
  try {
    const prompt = "请用铃木佳奈的口吻，自然地向我（学长/学姐）说一句开场白打招呼（1~2 句）。要口语化、句末不加句号，不要照搬任何固定台词，每次尽量说点不一样的。";
    const data = await callLLM([{ role: "system", content: character.system }, { role: "user", content: prompt }], config, false);
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    const opening = ((msg && msg.content) || "").trim();
    if (opening) return { opening };
  } catch {}
  return { opening: character.opening };
});

ipcMain.handle("settings:save", (_event, next) => {
  const updated = saveSettings(next || {});
  if (typeof updated.petScale === "number") {
    petSize = computePetSize(updated.petScale);
    if (petWin) {
      const [px, py] = petWin.getPosition();
      petWin.setBounds({ x: px, y: py, width: petSize[0], height: petSize[1] });
    }
  }
  if (typeof updated.autoStart === "boolean") {
    app.setLoginItemSettings({
      openAtLogin: updated.autoStart,
      path: process.execPath,
      args: [path.join(PROJECT_ROOT, "electron", "main.cjs")],
    });
  }
  return updated;
});

ipcMain.handle("font:import", async () => {
  const result = await dialog.showOpenDialog({
    title: "导入字体",
    filters: [{ name: "字体文件", extensions: ["ttf", "otf", "woff", "woff2"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
  const src = result.filePaths[0];
  const fileName = path.basename(src);
  const name = path.basename(src, path.extname(src));
  const fontsDir = path.join(assetsRoot, "fonts");
  fs.mkdirSync(fontsDir, { recursive: true });
  fs.copyFileSync(src, path.join(fontsDir, fileName));
  const fonts = Array.isArray(settings.fonts) ? settings.fonts.slice() : [];
  if (!fonts.some((f) => f.file === fileName)) {
    fonts.push({ name, file: fileName });
    saveSettings({ fonts });
  }
  return { name, file: fileName };
});

ipcMain.on("situation:set", (_event, situation) => {
  currentEmotion = resolveEmotionForSituation(String(situation || "idle"));
  broadcastEmotion();
});

ipcMain.on("chat:open", () => toggleChat());
ipcMain.on("chat:close", () => { if (chatWin) chatWin.hide(); });

ipcMain.on("app:quit", () => {
  isQuitting = true;
  app.quit();
});

ipcMain.on("drag:start", () => {
  if (!petWin) return;
  const [px, py] = petWin.getPosition();
  drag = { prevX: px, prevY: py };
});
ipcMain.on("drag:move", (_event, point) => {
  if (!petWin || !drag || !point || !petSize) return;
  const cx = Number(point.x);
  const cy = Number(point.y);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
  // Hang the pet from the cursor: window top-center at the cursor.
  const x = Math.round(cx - petSize[0] / 2);
  const y = Math.round(cy);
  const dx = x - drag.prevX;
  const dy = y - drag.prevY;
  petWin.setBounds({ x, y, width: petSize[0], height: petSize[1] });
  // Keep the chat panel glued beside the pet; setBounds keeps its size fixed.
  if (chatWin && chatWin.isVisible() && chatSize && (dx !== 0 || dy !== 0)) {
    const [wx, wy] = chatWin.getPosition();
    chatWin.setBounds({ x: wx + dx, y: wy + dy, width: chatSize[0], height: chatSize[1] });
  }
  drag.prevX = x;
  drag.prevY = y;
});
ipcMain.on("drag:end", () => {
  drag = null;
  if (petWin && petSize) {
    const [px, py] = petWin.getPosition();
    petWin.setBounds({ x: px, y: py, width: petSize[0], height: petSize[1] });
  }
});

protocol.registerSchemesAsPrivileged([
  { scheme: cfg.scheme, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

app.whenReady().then(() => {
  loadManifest();
  loadSettings();
  loadProviders();
  loadCharacter();
  loadMemory();
  loadStatusPhrases();
  startProactiveLoop();
  currentEmotion = resolveEmotionForSituation("idle");
  protocol.handle(cfg.scheme, async (request) => {
    const url = new URL(request.url);
    // GURL normalizes "library:..." into "library://host/path", so the first path
    // segment arrives as the host. Reconstruct the full relative path from both.
    const pathPart = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const rel = (url.host ? url.host + "/" : "") + pathPart;
    const filePath = path.normalize(path.join(assetsRoot, rel));
    const base = path.normalize(assetsRoot);
    if (filePath !== base && !filePath.startsWith(base + path.sep)) {
      return new Response("forbidden", { status: 403 });
    }
    try {
      const data = await fs.promises.readFile(filePath);
      return new Response(data, {
        headers: {
          "content-type": mimeFor(filePath),
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
  createPetWindow();
  createChatWindow();
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { isQuitting = true; });
