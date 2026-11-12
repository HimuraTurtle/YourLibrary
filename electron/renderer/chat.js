(function () {
  var messages = document.getElementById("messages");
  var input = document.getElementById("input");
  var avatar = document.getElementById("avatar");
  var closeBtn = document.getElementById("close");
  var chatView = document.getElementById("chat");
  var settingsView = document.getElementById("settings");
var readerView = document.getElementById("reader");
  var providers = [];
  var statusEl = null;

  function addMessage(kind, text) {
    var el = document.createElement("div");
    el.className = "msg " + kind;
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  function setAvatar(emotion) {
    window.library.resolvePortrait(emotion).then(function (url) {
      if (url) avatar.src = url;
    });
  }

  function applyFont(family, size) {
    var px = size || 15;
    messages.style.fontSize = px + "px";
    input.style.fontSize = px + "px";
    chatView.style.fontFamily = family ? "'" + family + "', sans-serif" : "";
  }

  function registerFont(font) {
    if (!font || !font.name || !font.file) return;
    var face = new FontFace(font.name, "url('library://fonts/" + font.file + "')");
    face.load().then(function (loaded) {
      document.fonts.add(loaded);
    }).catch(function () {});
  }

  function findProvider(name) {
    for (var i = 0; i < providers.length; i++) {
      if (providers[i].name === name) return providers[i];
    }
    return null;
  }

  function modelOptions(models, selected) {
    var html = "";
    (models || []).forEach(function (m) {
      html += "<option value='" + m + "'" + (m === selected ? " selected" : "") + ">" + m + "</option>";
    });
    return html;
  }

  function makeApiConfigRow(config) {
    var row = document.createElement("div");
    row.className = "api-config";

    var providerSel = document.createElement("select");
    providerSel.className = "api-provider";
    providers.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = p.name;
      if (p.name === config.name) opt.selected = true;
      providerSel.appendChild(opt);
    });

    var baseInput = document.createElement("input");
    baseInput.className = "api-base";
    baseInput.type = "text";
    baseInput.placeholder = "接口地址";
    baseInput.value = config.baseUrl || "";

    var modelSel = document.createElement("select");
    modelSel.className = "api-model";
    var prov = findProvider(config.name);
    var models = (prov && prov.models) ? prov.models.slice() : [];
    if (config.model && models.indexOf(config.model) === -1) models.unshift(config.model);
    modelSel.innerHTML = modelOptions(models, config.model);

    var visionSel = document.createElement("select");
    visionSel.className = "api-vision";
    var vmodels = (prov && prov.visionModels) ? prov.visionModels.slice() : [];
    if (config.visionModel && vmodels.indexOf(config.visionModel) === -1) vmodels.unshift(config.visionModel);
    visionSel.innerHTML = modelOptions(vmodels, config.visionModel);
    visionSel.title = "视觉模型";

    var keyInput = document.createElement("input");
    keyInput.className = "api-key";
    keyInput.type = "password";
    keyInput.placeholder = "API Key";
    keyInput.value = config.apiKey || "";

    var removeBtn = document.createElement("button");
    removeBtn.className = "api-remove";
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.title = "删除";

    providerSel.addEventListener("change", function () {
      var p = findProvider(providerSel.value);
      if (p) {
        baseInput.value = p.baseUrl || "";
        modelSel.innerHTML = modelOptions(p.models, p.models[0]);
        var vm = (p.visionModels || []);
        visionSel.innerHTML = modelOptions(vm, vm[0]);
      }
    });

    removeBtn.addEventListener("click", function () {
      row.remove();
    });

    row.appendChild(providerSel);
    row.appendChild(baseInput);
    row.appendChild(modelSel);
    row.appendChild(visionSel);
    row.appendChild(keyInput);
    row.appendChild(removeBtn);
    return row;
  }

  function renderApiConfigs(apiConfigs) {
    var container = document.getElementById("api-configs");
    container.innerHTML = "";
    (apiConfigs || []).forEach(function (c) {
      container.appendChild(makeApiConfigRow(c));
    });
  }

  function collectApiConfigs() {
    var rows = document.querySelectorAll(".api-config");
    var configs = [];
    rows.forEach(function (row) {
      configs.push({
        name: row.querySelector(".api-provider").value,
        baseUrl: row.querySelector(".api-base").value.trim(),
        model: row.querySelector(".api-model").value,
        visionModel: row.querySelector(".api-vision").value,
        apiKey: row.querySelector(".api-key").value.trim(),
      });
    });
    return configs;
  }

  function populateSettings(s) {
    document.getElementById("font-size").value = s.fontSize || 15;
    document.getElementById("pet-scale").value = s.petScale || 0.5;
    document.getElementById("pet-scale-val").textContent = s.petScale || 0.5;
    document.getElementById("auto-start").checked = !!s.autoStart;
    document.getElementById("books-dir").value = s.booksDir || "books";
    document.getElementById("suwayomi-url").value = s.suwayomiUrl || "";
    var sel = document.getElementById("font-family");
    sel.innerHTML = "";
    var optDefault = document.createElement("option");
    optDefault.value = "";
    optDefault.textContent = "当前使用字体";
    sel.appendChild(optDefault);
    (s.fonts || []).forEach(function (f) {
      var opt = document.createElement("option");
      opt.value = f.name;
      opt.textContent = f.name;
      sel.appendChild(opt);
    });
    sel.value = s.fontFamily || "";
  }

  function openSettings() {
    chatView.hidden = true;
    settingsView.hidden = false;
    window.library.getProviders().then(function (prov) {
      providers = prov || [];
      window.library.getSettings().then(function (s) {
        populateSettings(s);
        renderApiConfigs(s.apiConfigs);
      });
    });
  }

  function closeSettings() {
    settingsView.hidden = true;
    chatView.hidden = false;
  }

  function renderFileList(container, files, emptyText, openFn) {
    container.innerHTML = "";
    if (!files || files.length === 0) {
      var empty = document.createElement("div");
      empty.className = "bookshelf-empty";
      empty.textContent = emptyText;
      container.appendChild(empty);
      return;
    }
    files.forEach(function (f) {
      var a = document.createElement("a");
      a.className = "book-link";
      a.textContent = f.name;
      a.title = f.path;
      a.href = "#";
      a.addEventListener("click", function (e) {
        e.preventDefault();
        openFn(f.path);
      });
      container.appendChild(a);
    });
  }

  function renderBooks(books) {
    renderFileList(document.getElementById("bookshelf"), books, "暂无电子书", function (p) { window.library.openBook(p); });
  }

  function renderPapers(data) {
    renderFileList(document.getElementById("papers-originals"), data.originals, "暂无论文", function (p) { window.library.openPaper(p); });
    renderFileList(document.getElementById("papers-interpretations"), data.interpretations, "暂无解读", function (p) { window.library.openPaper(p); });
  }

  function toggleBookshelf() {
    var shelf = document.getElementById("bookshelf");
    var willShow = !shelf.classList.contains("open");
    shelf.classList.toggle("open", willShow);
    if (willShow) {
      window.library.listBooks().then(renderBooks);
    }
  }

  function togglePapers() {
    var panel = document.getElementById("papers");
    var willShow = !panel.classList.contains("open");
    panel.classList.toggle("open", willShow);
    if (willShow) {
      window.library.listPapers().then(renderPapers);
    }
  }

  function renderManga(list) {
    var container = document.getElementById("manga");
    container.innerHTML = "";
    if (!list || list.length === 0) {
      var empty = document.createElement("div");
      empty.className = "bookshelf-empty";
      empty.textContent = "暂无漫画";
      container.appendChild(empty);
      return;
    }
    list.forEach(function (m) {
      var a = document.createElement("a");
      a.className = "book-link";
      a.textContent = m.title;
      a.title = m.readUrl;
      a.href = "#";
      a.addEventListener("click", function (e) {
        e.preventDefault();
        if (m.suwayomiId != null) {
          openReader(m.title, m.suwayomiId);
        } else {
          window.library.openManga(m.readUrl);
        }
      });
      container.appendChild(a);
    });
  }

  function toggleManga() {
    var panel = document.getElementById("manga");
    var willShow = !panel.classList.contains("open");
    panel.classList.toggle("open", willShow);
    if (willShow) {
      window.library.listManga().then(renderManga);
    }
  }

  var readerState = { pages: [], index: 0, title: "", chapter: "" };

  function openReader(title, mangaId) {
    readerState.pages = [];
    readerState.index = 0;
    readerState.title = title;
    readerState.chapter = "";
    document.getElementById("reader-title").textContent = title;
    document.getElementById("reader-chapters").innerHTML = '<option value="">加载章节…</option>';
    document.getElementById("reader-empty").textContent = "选择章节开始阅读";
    document.getElementById("reader-empty").style.display = "";
    document.getElementById("reader-img").style.display = "none";
    document.getElementById("reader-pageinfo").textContent = "- / -";
    settingsView.hidden = true;
    readerView.hidden = false;
    window.library.mangaChapters(mangaId).then(function (chapters) {
      var sel = document.getElementById("reader-chapters");
      sel.innerHTML = "";
      if (!chapters || !chapters.length) {
        var o = document.createElement("option");
        o.value = "";
        o.textContent = "无章节";
        sel.appendChild(o);
        return;
      }
      chapters.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.id;
        o.textContent = c.name;
        sel.appendChild(o);
      });
      loadChapter(chapters[0].id);
    });
  }

  function loadChapter(chapterId) {
    var sel = document.getElementById("reader-chapters");
    var opt = sel.options[sel.selectedIndex];
    readerState.chapter = opt ? opt.textContent : "";
    document.getElementById("reader-empty").textContent = "加载中……";
    document.getElementById("reader-empty").style.display = "";
    document.getElementById("reader-img").style.display = "none";
    window.library.mangaPages(chapterId).then(function (pages) {
      readerState.pages = pages || [];
      readerState.index = 0;
      if (!readerState.pages.length) {
        document.getElementById("reader-empty").textContent = "无法加载页面（源可能连不上）";
        document.getElementById("reader-pageinfo").textContent = "- / -";
        return;
      }
      showPage(0);
    });
  }

  function showPage(i) {
    if (!readerState.pages.length) return;
    readerState.index = Math.max(0, Math.min(i, readerState.pages.length - 1));
    var img = document.getElementById("reader-img");
    var empty = document.getElementById("reader-empty");
    empty.textContent = "加载中……";
    empty.style.display = "";
    img.style.display = "none";
    img.dataset.retried = "";
    img.onload = function () { img.style.display = ""; empty.style.display = "none"; };
    img.onerror = function () {
      var tries = Number(img.dataset.retried || 0);
      if (tries < 2) {
        img.dataset.retried = String(tries + 1);
        empty.textContent = "加载失败，重试中（" + (tries + 1) + "/2）……";
        setTimeout(function () { img.src = readerState.pages[readerState.index]; }, 800);
        return;
      }
      empty.textContent = "该页加载失败（源可能连不上，可换一页重试）";
      empty.style.display = "";
    };
    img.src = readerState.pages[readerState.index];
    document.getElementById("reader-pageinfo").textContent = (readerState.index + 1) + " / " + readerState.pages.length;
    window.library.setReaderState({ title: readerState.title, chapter: readerState.chapter, pageUrl: readerState.pages[readerState.index] });
  }

  function closeReader() {
    readerView.hidden = true;
  }

  document.getElementById("reader-back").addEventListener("click", closeReader);
  document.getElementById("reader-prev").addEventListener("click", function () { showPage(readerState.index - 1); });
  document.getElementById("reader-next").addEventListener("click", function () { showPage(readerState.index + 1); });
  document.getElementById("reader-chapters").addEventListener("change", function () {
    var v = Number(this.value);
    if (v) loadChapter(v);
  });
  document.addEventListener("keydown", function (e) {
    if (readerView.hidden) return;
    if (e.key === "ArrowLeft") showPage(readerState.index - 1);
    else if (e.key === "ArrowRight") showPage(readerState.index + 1);
    else if (e.key === "Escape") closeReader();
  });

  window.library.onEmotionChange(function (emotion) {
    setAvatar(emotion);
  });

  window.library.onOpenReader(function (info) {
    if (info && info.mangaId != null) {
      openReader(info.title || "漫画", info.mangaId);
    }
  });

  window.library.onCompanion(function (text) {
    if (text) addMessage("pet", text);
  });

  window.library.onStatus(function (text) {
    if (!statusEl || !statusEl.isConnected) {
      statusEl = document.createElement("div");
      statusEl.className = "msg status";
      messages.appendChild(statusEl);
    }
    statusEl.textContent = text;
    messages.scrollTop = messages.scrollHeight;
  });

  window.library.getState().then(function (state) {
    setAvatar(state.currentEmotion);
    window.library.setSituation("greeting");
  });

  window.library.generateOpening().then(function (res) {
    if (res && res.opening) addMessage("pet", res.opening);
  });

  window.library.getSettings().then(function (s) {
    (s.fonts || []).forEach(registerFont);
    applyFont(s.fontFamily, s.fontSize);
  });

  closeBtn.addEventListener("click", function () {
    window.library.setSituation("farewell");
    window.library.closeChat();
  });

  var buttons = document.querySelectorAll(".fn");
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener("click", function () {
      var fn = this.dataset.fn;
      if (fn === "settings") {
        openSettings();
        return;
      }
      if (fn === "shelf") {
        toggleBookshelf();
        return;
      }
      if (fn === "papers") {
        togglePapers();
        return;
      }
      if (fn === "manga") {
        toggleManga();
        return;
      }
    });
  }

  document.getElementById("pet-scale").addEventListener("input", function () {
    document.getElementById("pet-scale-val").textContent = this.value;
  });

  document.getElementById("import-font").addEventListener("click", function () {
    window.library.importFont().then(function (res) {
      if (res) {
        registerFont(res);
        window.library.getSettings().then(populateSettings);
      }
    });
  });

  document.getElementById("add-api").addEventListener("click", function () {
    var first = providers[0] || { name: "", baseUrl: "", models: [] };
    var container = document.getElementById("api-configs");
    container.appendChild(makeApiConfigRow({
      name: first.name,
      baseUrl: first.baseUrl,
      apiKey: "",
      model: (first.models && first.models[0]) || "",
    }));
  });

  document.getElementById("back-from-settings").addEventListener("click", function () {
    closeSettings();
  });

  document.getElementById("save-settings").addEventListener("click", function () {
    var next = {
      apiConfigs: collectApiConfigs(),
      fontSize: Number(document.getElementById("font-size").value) || 15,
      fontFamily: document.getElementById("font-family").value,
      petScale: Number(document.getElementById("pet-scale").value) || 0.5,
      autoStart: document.getElementById("auto-start").checked,
      booksDir: document.getElementById("books-dir").value.trim() || "books",
      suwayomiUrl: document.getElementById("suwayomi-url").value.trim(),
    };
    window.library.saveSettings(next).then(function (updated) {
      applyFont(updated.fontFamily, updated.fontSize);
      closeSettings();
    });
  });

  document.getElementById("inputbar").addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || input.disabled) return;
    var btn = this.querySelector('button[type="submit"]');
    input.disabled = true;
    if (btn) btn.disabled = true;
    window.library.setSituation("thinking");
    addMessage("user", text);
    input.value = "";
    window.library.sendMessage(text).then(function (result) {
      if (statusEl && statusEl.isConnected) {
        statusEl.remove();
        statusEl = null;
      }
      if (result && result.reply) addMessage("pet", result.reply);
      window.library.setSituation("chatting");
    }).catch(function () {
      addMessage("system", "（发送失败，请检查设置里的 API 配置）");
      window.library.setSituation("chatting");
    }).finally(function () {
      input.disabled = false;
      if (btn) btn.disabled = false;
    });
  });
})();
