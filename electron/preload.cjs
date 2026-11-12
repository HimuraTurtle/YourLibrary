const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("library", {
  getState: () => ipcRenderer.invoke("state:get"),
  resolvePortrait: (emotion) => ipcRenderer.invoke("portrait:resolve", emotion),
  openChat: () => ipcRenderer.send("chat:open"),
  closeChat: () => ipcRenderer.send("chat:close"),
  quit: () => ipcRenderer.send("app:quit"),
  setSituation: (situation) => ipcRenderer.send("situation:set", situation),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  getProviders: () => ipcRenderer.invoke("providers:get"),
  saveSettings: (s) => ipcRenderer.invoke("settings:save", s),
  importFont: () => ipcRenderer.invoke("font:import"),
  listBooks: () => ipcRenderer.invoke("books:list"),
  openBook: (p) => ipcRenderer.invoke("book:open", p),
  listPapers: () => ipcRenderer.invoke("papers:list"),
  openPaper: (p) => ipcRenderer.invoke("paper:open", p),
  listManga: () => ipcRenderer.invoke("manga:list"),
  openManga: (u) => ipcRenderer.invoke("manga:open", u),
  mangaChapters: (id) => ipcRenderer.invoke("manga:chapters", id),
  mangaPages: (cid) => ipcRenderer.invoke("manga:pages", cid),
  setReaderState: (state) => ipcRenderer.send("reader:state", state),
  onCompanion: (cb) => {
    const h = (_e, text) => cb(text);
    ipcRenderer.on("chat:companion", h);
    return () => ipcRenderer.removeListener("chat:companion", h);
  },
  onOpenReader: (cb) => {
    const h = (_e, info) => cb(info);
    ipcRenderer.on("manga:openReader", h);
    return () => ipcRenderer.removeListener("manga:openReader", h);
  },
  sendMessage: (text) => ipcRenderer.invoke("chat:send", text),
  getCharacter: () => ipcRenderer.invoke("character:get"),
  generateOpening: () => ipcRenderer.invoke("opening:generate"),
  onStatus: (callback) => {
    const handler = (_event, text) => callback(text);
    ipcRenderer.on("chat:status", handler);
    return () => ipcRenderer.removeListener("chat:status", handler);
  },
  onEmotionChange: (callback) => {
    const handler = (_event, emotion) => callback(emotion);
    ipcRenderer.on("emotion:changed", handler);
    return () => ipcRenderer.removeListener("emotion:changed", handler);
  },
  dragStart: (x, y) => ipcRenderer.send("drag:start", { x, y }),
  dragMove: (x, y) => ipcRenderer.send("drag:move", { x, y }),
  dragEnd: () => ipcRenderer.send("drag:end"),
});
