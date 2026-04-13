// viewer.js — Vignettes + filtres + tri dates + affichage progressif
// (menu ☰ délégué à viewer.menu.js + modules viewer.menu.about.js / viewer.menu.extension.js)
// + Tags multi (popover + save)
// ✅ UID ONLY pour stats (aligné sur game.js)
(() => {
  const DEFAULT_URL = "https://raw.githubusercontent.com/andric31/f95list/main/f95list.json";

  const $ = (sel) => document.querySelector(sel);

  // ✅ URL page jeu (id central + support collection child)
  function buildGameUrl(g) {
    const coll = (g.collection || "").toString().trim();
    const id = (g.id || "").toString().trim();
    const uid = (g.uid ?? "").toString().trim();

    // Sous-jeu de collection : /game/?id=<collection>&uid=<uid>
    if (coll) return `/game/?id=${encodeURIComponent(coll)}&uid=${encodeURIComponent(uid)}`;
    // Jeu normal / collection parent : /game/?id=<id>
    if (id) return `/game/?id=${encodeURIComponent(id)}`;
    // Fallback uid seul
    return `/game/?uid=${encodeURIComponent(uid)}`;
  }

  // ✅ Titre affiché (gameData prioritaire si présent)
  function getDisplayTitle(g) {
    return (g.gameData?.title || g.cleanTitle || g.title || "").toString().trim() || "Sans titre";
  }

  const state = {
    all: [],
    filtered: [],
    q: "",
    sort: "updatedAtLocal-desc",
    filterTranslationType: "all",
    filterCat: "all",
    filterEngine: "all",
    filterStatus: "all",
    filterTags: [],
    cols: "auto",
    pageSize: 50,
    visibleCount: 0,
  };

  // =========================
  // ✅ Compteur vues page principale (Viewer)
  // =========================

  const MAIN_PAGE_ID = "__viewer_main__";
  let MAIN_VIEW_HIT_DONE = false;

  function formatInt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "0";
    try {
      return x.toLocaleString("fr-FR");
    } catch {
      return String(Math.floor(x));
    }
  }

  // =========================
  // ✅ UID ONLY — clés compteurs
  // =========================
  function counterKeyOfUid(uid) {
    const u = String(uid ?? "").trim();
    return u ? `uid:${u}` : "";
  }

  function counterKeyOfEntry(rawEntry) {
    return counterKeyOfUid(rawEntry?.uid);
  }

  // =========================
  // Stats jeux (vues + likes + téléchargements)
  // =========================

  const GAME_STATS = {
    views: new Map(),
    mega: new Map(),
    likes: new Map(),
    loaded: false,
  };

  const GAME_RATINGS = {
    byKey: new Map(), // key(uid:xxx) -> {avg,count,sum}
    loaded: false,
  };

  async function fetchGameStatsBulk(ids) {
    try {
      const r = await fetch("/api/counters", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!r.ok) return {};
      const j = await r.json();
      if (!j?.ok || !j.stats) return {};
      return j.stats;
    } catch {
      return {};
    }
  }

  async function fetchRatingsBulk(ids) {
    try {
      const r = await fetch("/api/ratings4s", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!r.ok) return {};
      const j = await r.json();
      if (!j?.ok || !j.stats) return {};
      return j.stats; // { key: {avg, count, sum}, ... }
    } catch {
      return {};
    }
  }

  async function ensureGameStatsLoaded() {
    if (GAME_STATS.loaded) return;

    const keys = state.all.map((g) => counterKeyOfUid(g.uid)).filter(Boolean);
    const stats = await fetchGameStatsBulk(keys);

    for (const k of keys) {
      const s = stats[k] || {};
      GAME_STATS.views.set(k, Number(s.views || 0));
      GAME_STATS.mega.set(k, Number(s.mega || 0));
      GAME_STATS.likes.set(k, Number(s.likes || 0));
    }

    GAME_STATS.loaded = true;
  }

  async function ensureGameRatingsLoaded() {
    if (GAME_RATINGS.loaded) return;

    const keys = state.all.map((g) => counterKeyOfUid(g.uid)).filter(Boolean);
    const stats = await fetchRatingsBulk(keys);

    for (const k of keys) {
      const s = stats[k] || {};
      GAME_RATINGS.byKey.set(k, {
        avg: Number(s.avg || 0),
        count: Number(s.count || 0),
        sum: Number(s.sum || 0),
      });
    }

    GAME_RATINGS.loaded = true;
  }

  async function forceReloadGameStats() {
    GAME_STATS.loaded = false;
    GAME_STATS.views.clear();
    GAME_STATS.mega.clear();
    GAME_STATS.likes.clear();
    await ensureGameStatsLoaded();
  }

  async function forceReloadGameRatings() {
    GAME_RATINGS.loaded = false;
    GAME_RATINGS.byKey.clear();
    await ensureGameRatingsLoaded();
  }

  async function initMainPageCounter() {
    const el = document.getElementById("mainViews");
    if (!el) return;

    try {
      const op = MAIN_VIEW_HIT_DONE ? "get" : "hit";
      const r = await fetch(
        `/api/counter?op=${op}&kind=view&id=${encodeURIComponent(MAIN_PAGE_ID)}`,
        { cache: "no-store" }
      );
      if (!r.ok) return;

      const j = await r.json();
      if (!j?.ok) return;

      MAIN_VIEW_HIT_DONE = true;
      el.textContent = formatInt(j.views);
    } catch {}
  }

  // =========================
  // Helpers temps / notes
  // =========================

  function formatRelativeTranslationTime(ts) {
    const t = Number(ts || 0);
    if (!Number.isFinite(t) || t <= 0) return "—";

    let delta = Date.now() - t;
    if (!Number.isFinite(delta) || delta < 0) delta = 0;

    const MIN = 60 * 1000;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;
    const YEAR = 365 * DAY;

    if (delta < MIN) return "à l’instant";

    if (delta < HOUR) {
      const n = Math.max(1, Math.floor(delta / MIN));
      return `${n} min`;
    }

    if (delta < DAY) {
      const n = Math.max(1, Math.floor(delta / HOUR));
      return `${n} h`;
    }

    if (delta < WEEK) {
      const n = Math.max(1, Math.floor(delta / DAY));
      return `${n} j`;
    }

    if (delta < 5 * WEEK) {
      const n = Math.max(1, Math.floor(delta / WEEK));
      return `${n} sem`;
    }

    if (delta < YEAR) {
      const n = Math.max(1, Math.floor(delta / MONTH));
      return `${n} mois`;
    }

    const n = Math.max(1, Math.floor(delta / YEAR));
    return `${n} an${n > 1 ? "s" : ""}`;
  }

  function formatAbsoluteDateTime(ts) {
    const t = Number(ts || 0);
    if (!Number.isFinite(t) || t <= 0) return "Date de traduction inconnue";
    try {
      return new Date(t).toLocaleString("fr-FR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return new Date(t).toISOString();
    }
  }

  function setViewerLoading(visible, text) {
    const loadingEl = document.getElementById("viewerLoading");
    const emptyEl = document.getElementById("gridEmpty");
  
    if (loadingEl) loadingEl.classList.add("hidden");
  
    if (!emptyEl) return;
  
    if (visible) {
      emptyEl.textContent = text || "Chargement…";
      emptyEl.classList.remove("hidden");
    } else {
      emptyEl.classList.add("hidden");
    }
  }

  function formatRatingForCard(avg, count) {
    const a = Number(avg || 0);
    const c = Number(count || 0);
    if (c <= 0 || a <= 0) return "—";
  
    const rounded = Math.round(a * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  
    return `${text}/4`;
  }

  // =========================
  // ☰ MENU
  // =========================

  function positionPopover(pop, anchorBtn) {
    const r = anchorBtn.getBoundingClientRect();
    const margin = 8;

    let left = Math.round(r.left);
    let top = Math.round(r.bottom + margin);

    const widthGuess = pop.getBoundingClientRect().width || 260;
    const maxLeft = window.innerWidth - widthGuess - 10;

    if (left > maxLeft) left = Math.max(10, maxLeft);
    if (left < 10) left = 10;

    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  // =========================
  // 🎨 Thème
  // =========================

  async function getViewerTheme() {
    try {
      return (localStorage.getItem("viewerTheme") || "auto").trim() || "auto";
    } catch {
      return "auto";
    }
  }

  async function setViewerTheme(v) {
    try {
      localStorage.setItem("viewerTheme", String(v || "auto"));
    } catch {}
  }

  function applyViewerTheme(t) {
    const v = (t || "auto").toString().trim() || "auto";
    const root = document.documentElement;

    root.removeAttribute("data-theme");
    if (v === "auto") return;
    root.setAttribute("data-theme", v);
  }

  // =========================
  // Header tools
  // =========================

  let THEME_MQ_BOUND = false;

  function initHeaderMenuAndDisplayTools() {
    const row = document.querySelector(".top-title-row");
    if (!row) return;
    if (document.getElementById("hamburgerBtn")) return;

    const h1 = row.querySelector("h1");
    if (!h1) return;

    row.classList.add("top-title-flex");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "hamburgerBtn";
    btn.className = "hamburger-btn";
    btn.setAttribute("aria-label", "Ouvrir le menu");
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `
      <span class="ham-lines" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>
    `;

    const tools = document.createElement("div");
    tools.className = "top-title-tools";

    row.insertBefore(btn, h1);
    row.appendChild(tools);

    const total = document.querySelector("#countTotal")?.closest(".total-inline");
    const cols = document.getElementById("cols");
    const pageSize = document.getElementById("pageSize");
    const themeSel = document.getElementById("theme");

    if (total) tools.appendChild(total);
    if (cols) tools.appendChild(cols);
    if (pageSize) tools.appendChild(pageSize);
    if (themeSel) tools.appendChild(themeSel);

    try {
      window.ViewerMenu?.init?.();
    } catch {}

    function closeTopMenu() {
      const pop = document.getElementById("topMenuPopover");
      if (pop) pop.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
      try {
        window.ViewerMenu?.closeMenu?.();
      } catch {}
    }

    function bindAutoThemeWatcher() {
      if (THEME_MQ_BOUND) return;
      THEME_MQ_BOUND = true;

      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", async () => {
        try {
          const t = await getViewerTheme();
          if ((t || "auto") === "auto") {
            applyViewerTheme("auto");
            if (themeSel) themeSel.value = "auto";
          }
        } catch {}
      });
    }

    (async () => {
      try {
        const t = await getViewerTheme();
        applyViewerTheme(t);
        if (themeSel) themeSel.value = t;

        bindAutoThemeWatcher();

        if (themeSel) {
          themeSel.addEventListener("change", async (e) => {
            const v = (e.target?.value || "auto").trim() || "auto";
            await setViewerTheme(v);
            applyViewerTheme(v);
            if (v === "auto") bindAutoThemeWatcher();
          });
        }
      } catch {}
    })();

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const pop = document.getElementById("topMenuPopover");
      if (!pop) return;

      const isOpen = !pop.classList.contains("hidden");
      if (isOpen) {
        closeTopMenu();
        return;
      }

      pop.classList.remove("hidden");
      btn.setAttribute("aria-expanded", "true");
      positionPopover(pop, btn);
    });

    document.addEventListener("click", (e) => {
      const pop = document.getElementById("topMenuPopover");
      const hb = document.getElementById("hamburgerBtn");
      if (pop && hb) {
        const t = e.target;
        if (!pop.contains(t) && !hb.contains(t)) closeTopMenu();
      }

      const tagsPop = document.getElementById("tagsPopover");
      const tagsBtn = document.getElementById("tagsBtn");
      if (tagsPop && tagsBtn) {
        const t = e.target;
        if (!tagsPop.contains(t) && !tagsBtn.contains(t)) closeTagsPopover();
      }
    });

    window.addEventListener("resize", () => {
      const pop = document.getElementById("topMenuPopover");
      const hb = document.getElementById("hamburgerBtn");
      if (pop && hb && !pop.classList.contains("hidden")) positionPopover(pop, hb);

      const tp = document.getElementById("tagsPopover");
      const tb = document.getElementById("tagsBtn");
      if (tp && tb && !tp.classList.contains("hidden")) positionTagsPopover(tp, tb);

      syncTopbarHeight();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeTopMenu();
        try { window.ViewerMenuAbout?.close?.(); } catch {}
        try { window.ViewerMenuExtension?.close?.(); } catch {}
        closeTagsPopover();
      }
    });
  }

  // =========================
  // ✅ TAGS MULTI
  // =========================

  const TAGS_STORE_KEY = "viewerSelectedTags";

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m]));
  }

  function getSavedTags() {
    try {
      const raw = localStorage.getItem(TAGS_STORE_KEY) || "[]";
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function setSavedTags(tags) {
    try {
      localStorage.setItem(TAGS_STORE_KEY, JSON.stringify(tags || []));
    } catch {}
  }


  function syncTopbarHeight() {
    try {
      const topbar = document.querySelector(".topbar");
      if (!topbar) return;
      const h = Math.ceil(topbar.offsetHeight || 0);
      if (h > 0) {
        document.documentElement.style.setProperty("--topbar-h", h + "px");
      }
    } catch {}
  }

  function clearSavedTags() {
    try {
      localStorage.removeItem(TAGS_STORE_KEY);
    } catch {}
  }

  function ensureTagsDom() {
    let btn = document.getElementById("tagsBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = "tagsBtn";
      btn.className = "tags-btn";
      btn.setAttribute("aria-haspopup", "menu");
      btn.setAttribute("aria-expanded", "false");
      btn.innerHTML = `🏷️ Tags <span id="tagsCount" class="tags-count hidden">0</span>`;
      const anchor = document.getElementById("filterStatus");
      if (anchor && anchor.parentElement) anchor.parentElement.insertBefore(btn, anchor.nextSibling);
      else document.querySelector(".top-actions")?.appendChild(btn);
    }

    let activeBox = document.getElementById("activeTagsBar");
    if (!activeBox) {
      activeBox = document.createElement("div");
      activeBox.id = "activeTagsBar";
      activeBox.className = "active-tags-bar hidden";
      const actions = document.querySelector(".top-actions");
      actions?.insertAdjacentElement("afterend", activeBox);
    }

    let pop = document.getElementById("tagsPopover");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "tagsPopover";
      pop.className = "tag-popover hidden";
      pop.innerHTML = `
        <div class="tag-head">
          <div class="tag-title">Tags</div>
          <button type="button" class="tag-clear" id="tagsClearBtn">Tout enlever</button>
        </div>
        <div class="tag-search-wrap">
          <input id="tagsSearch" class="tag-search-input" type="search" placeholder="Rechercher un tag..." autocomplete="off" />
        </div>
        <div class="tag-list" id="tagsList"></div>
      `;
      document.body.appendChild(pop);
    }

    return { btn, pop, activeBox };
  }

  function positionTagsPopover(pop, anchorBtn) {
    const r = anchorBtn.getBoundingClientRect();
    const margin = 8;

    let left = Math.round(r.left);
    let top = Math.round(r.bottom + margin);

    const w = pop.getBoundingClientRect().width || 320;
    const SCROLLBAR_GAP = 18;
    const maxLeft = window.innerWidth - w - SCROLLBAR_GAP;

    if (left > maxLeft) left = Math.max(10, maxLeft);
    if (left < 10) left = 10;

    const approxH = 380;
    if (top + approxH > window.innerHeight - 10) {
      top = Math.max(10, Math.round(r.top - margin - approxH));
    }

    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  function closeTagsPopover() {
    const pop = document.getElementById("tagsPopover");
    if (pop) pop.classList.add("hidden");
    const b = document.getElementById("tagsBtn");
    if (b) b.setAttribute("aria-expanded", "false");
  }

  function updateTagsCountBadge() {
    const c = document.getElementById("tagsCount");
    if (!c) return;
    const n = (state.filterTags || []).length;
    c.textContent = String(n);
    c.classList.toggle("hidden", n <= 0);
  }

  let TAGS_UI_BOUND = false;

  function initTagsUI(allTags) {
    const { btn, pop, activeBox } = ensureTagsDom();
    const list = document.getElementById("tagsList");
    const searchInput = document.getElementById("tagsSearch");

    const tagCounts = new Map();
    for (const g of state.all || []) {
      const tags = Array.isArray(g.tags) ? g.tags : [];
      for (const t of tags) {
        if (!t) continue;
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      }
    }

    const renderActiveTags = () => {
      if (!activeBox) return;
      const activeTags = Array.from(state.filterTags || []);
      activeBox.innerHTML = "";
      activeBox.classList.toggle("hidden", activeTags.length <= 0);
      if (!activeTags.length) {
        requestAnimationFrame(syncTopbarHeight);
        return;
      }

      const label = document.createElement("div");
      label.className = "active-tags-label";
      label.textContent = "Tags actifs :";
      activeBox.appendChild(label);

      for (const t of activeTags) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "active-tag-chip";
        chip.innerHTML = `<span class="active-tag-chip-name">${escapeHtml(t)}</span><span class="active-tag-chip-x">✕</span>`;
        chip.addEventListener("click", () => {
          state.filterTags = (state.filterTags || []).filter((x) => x !== t);
          setSavedTags(state.filterTags);
          updateTagsCountBadge();
          renderActiveTags();
          renderTagList();
          applyFilters();
        });
        activeBox.appendChild(chip);
      }

      requestAnimationFrame(syncTopbarHeight);
    };

    const renderTagList = () => {
      if (!list) return;
      const active = new Set(state.filterTags || []);
      const q = String(searchInput?.value || "").trim().toLowerCase();
      list.innerHTML = "";

      const visibleTags = allTags
        .filter((t) => !q || t.toLowerCase().includes(q))
        .sort((a, b) => {
          const aa = active.has(a) ? 0 : 1;
          const bb = active.has(b) ? 0 : 1;
          if (aa !== bb) return aa - bb;
          return a.localeCompare(b);
        });

      for (const t of visibleTags) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "tag-item" + (active.has(t) ? " active" : "");
        item.innerHTML = `
          <span class="tag-left">
            <span class="tag-check">✓</span>
            <span class="tag-name">${escapeHtml(t)}</span>
          </span>
          <span class="tag-hit-count">${tagCounts.get(t) || 0}</span>
        `;
        item.addEventListener("click", () => {
          const cur = new Set(state.filterTags || []);
          if (cur.has(t)) cur.delete(t);
          else cur.add(t);

          state.filterTags = Array.from(cur);
          setSavedTags(state.filterTags);
          updateTagsCountBadge();
          renderActiveTags();
          renderTagList();
          applyFilters();
        });

        list.appendChild(item);
      }

      if (!visibleTags.length) {
        const empty = document.createElement("div");
        empty.className = "tag-empty";
        empty.textContent = "Aucun tag trouvé.";
        list.appendChild(empty);
      }
    };

    if (!TAGS_UI_BOUND) {
      TAGS_UI_BOUND = true;

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isOpen = !pop.classList.contains("hidden");
        if (isOpen) {
          closeTagsPopover();
          return;
        }

        pop.classList.remove("hidden");
        btn.setAttribute("aria-expanded", "true");
        renderTagList();
        positionTagsPopover(pop, btn);
        try { searchInput?.focus({ preventScroll: true }); } catch {}
      });

      document.getElementById("tagsClearBtn")?.addEventListener("click", () => {
        state.filterTags = [];
        clearSavedTags();
        updateTagsCountBadge();
        renderActiveTags();
        renderTagList();
        applyFilters();
      });

      searchInput?.addEventListener("input", () => {
        renderTagList();
      });
    }

    updateTagsCountBadge();
    renderActiveTags();
    renderTagList();
  }

  // =========================
  // Helpers URL / prefs / list
  // =========================

  async function getListUrl() {
    try {
      const p = new URLSearchParams(location.search);
      const src = (p.get("src") || "").trim();
      if (src) return src;
    } catch {}
    try {
      return (localStorage.getItem("f95listUrl") || "").trim() || DEFAULT_URL;
    } catch {
      return DEFAULT_URL;
    }
  }

  async function getViewerCols() {
    try {
      return (localStorage.getItem("viewerCols") || "auto").trim() || "auto";
    } catch {
      return "auto";
    }
  }

  async function setViewerCols(v) {
    try {
      localStorage.setItem("viewerCols", String(v));
    } catch {}
  }

  async function loadList() {
    const url = await getListUrl();
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  // =========================
  // Title parsing / normalize
  // =========================

  const CAT_ALLOWED = ["VN", "Collection"];
  const ENGINE_ALLOWED = ["Ren'Py", "RPGM", "Unity", "Others", "Wolf RPG"];
  const STATUS_ALLOWED = ["Completed", "Abandoned", "Onhold"];
  const ENGINE_RAW = {
    renpy: "Ren'Py",
    "ren'py": "Ren'Py",
    rpgm: "RPGM",
    rpg: "RPGM",
    rpgmaker: "RPGM",
    rpgmakerxp: "RPGM",
    rpgmakermv: "RPGM",
    rpgmakermz: "RPGM",
    "rpg maker": "RPGM",
    unity: "Unity",
    others: "Others",
    other: "Others",
    html: "Others",
    wolf: null,
    wolfrpg: "Wolf RPG",
    "wolf rpg": "Wolf RPG",
    flash: null,
  };

  const SEP_RE = /[\u2014\u2013\-:]/;
  const ucFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  function slug(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function parseFrenchDate(str) {
    if (!str) return null;
    const s = String(str).trim().toLowerCase();
    const months = {
      janvier: 0,
      fevrier: 1,
      février: 1,
      mars: 2,
      avril: 3,
      mai: 4,
      juin: 5,
      juillet: 6,
      aout: 7,
      août: 7,
      septembre: 8,
      octobre: 9,
      novembre: 10,
      decembre: 11,
      décembre: 11,
    };
    const m = s.match(/^(\d{1,2})\s+([a-zêéèûôîïùç]+)\s+(\d{4})$/i);
    if (!m) return null;

    const day = parseInt(m[1], 10);
    let key = m[2].toLowerCase();
    if (!(key in months)) key = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const month = months[key];
    const year = parseInt(m[3], 10);
    if (month === undefined || !year || !day) return null;

    const d = new Date(Date.UTC(year, month, day));
    const ts = d.getTime();
    return Number.isNaN(ts) ? null : ts;
  }

  function parseIsoDateTime(str) {
    if (!str) return 0;
    const raw = String(str).trim();
    if (!raw) return 0;

    let normalized = raw;
    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[+-][0-9]{4}$/.test(raw)) {
      normalized = raw.replace(/([+-][0-9]{2})([0-9]{2})$/, "$1:$2");
    }

    const ts = Date.parse(normalized);
    return Number.isNaN(ts) ? 0 : ts;
  }

  function cleanTitle(raw) {
    let t = String(raw || "").trim();
    let categories = [];
    let engines = [];
    let status = null;
    let othersExplicit = false;

    if (/^collection\b/i.test(t)) {
      categories.push("Collection");
      t = t.replace(/^collection[ :\-]*/i, "").trim();
    }

    const head = t.split(SEP_RE)[0];
    const tokens = head.split(/[\s/|,]+/).filter(Boolean);
    let cut = 0;

    for (let i = 0; i < tokens.length; i++) {
      const wRaw = tokens[i];
      const w = wRaw.toLowerCase();
      const norm = w.replace(/[^\w']/g, "");

      if (norm === "vn") {
        if (!categories.includes("VN")) categories.push("VN");
        cut = i + 1;
        continue;
      }

      if (norm === "wolf" && tokens[i + 1] && tokens[i + 1].toLowerCase().replace(/[^\w']/g, "") === "rpg") {
        if (!engines.includes("Wolf RPG")) engines.push("Wolf RPG");
        cut = i + 2;
        i++;
        continue;
      }

      if (norm === "wolf") break;

      if (norm === "flash") {
        cut = i + 1;
        continue;
      }

      if (norm === "others" || norm === "other") {
        if (!engines.includes("Others")) engines.push("Others");
        othersExplicit = true;
        cut = i + 1;
        continue;
      }

      if (ENGINE_RAW[norm] !== undefined) {
        const eng = ENGINE_RAW[norm];
        if (eng && !engines.includes(eng)) engines.push(eng);
        cut = i + 1;
        continue;
      }

      const pretty = ucFirst(norm);
      if (STATUS_ALLOWED.includes(pretty)) {
        status = pretty;
        cut = i + 1;
        continue;
      }

      if (w === "&" || w === "and" || w === "/") {
        cut = i + 1;
        continue;
      }

      break;
    }

    if (cut > 0) {
      const headSlice = tokens.slice(0, cut).join(" ");
      t = t.slice(headSlice.length).trim();
      t = t.replace(/^[\u2014\u2013\-:|]+/, "").trim();
    }

    if (!status) status = "En cours";

    const allowedCat = new Set(CAT_ALLOWED);
    const allowedEng = new Set(ENGINE_ALLOWED);
    categories = categories.filter((c) => allowedCat.has(c));
    engines = engines.filter((e) => allowedEng.has(e));

    if (!othersExplicit && engines.includes("Others") && engines.some((e) => e !== "Others")) {
      engines = engines.filter((e) => e !== "Others");
    }

    return { title: t, categories, engines, status };
  }

  function normalizeGame(game) {
    const coll = String(game.collection || "");
    const uid = game.uid ?? "";

    const displayTitleRaw = String(
      game.gameData && game.gameData.title ? game.gameData.title : game.title || ""
    );
    const displayImageRaw = String(
      game.gameData && game.gameData.imageUrl ? game.gameData.imageUrl : game.imageUrl || ""
    );

    const displayTags = Array.isArray(game.gameData?.tags)
      ? game.gameData.tags.slice()
      : Array.isArray(game.tags)
      ? game.tags.slice()
      : [];

    const c = cleanTitle(displayTitleRaw);
    
    let finalStatus = "";
    if (game.gameData?.status) finalStatus = String(game.gameData.status).trim();
    else if (game.status) finalStatus = String(game.status).trim();
    else if (game.version && ["Completed", "Abandoned", "Onhold"].includes(String(game.version).trim())) finalStatus = String(game.version).trim();
    else finalStatus = c.status;
const categories = Array.isArray(c.categories) ? c.categories : game.category ? [game.category] : [];

    let engines = Array.isArray(c.engines) ? c.engines : game.engine ? [game.engine] : [];
    if (game.gameData?.engine) {
      const engNorm = ENGINE_RAW[slug(game.gameData.engine)] || game.gameData.engine;
      engines = [engNorm];
    } else if (!engines || engines.length === 0) {
      if (!String(game.id || "").trim() && String(game.collection || "").trim()) {
        const cp = cleanTitle(String(game.title || ""));
        engines = Array.isArray(cp.engines) ? cp.engines : [];
      }
    }

    const updatedAtTs = parseFrenchDate(game.updatedAt);
    const releaseDateTs = parseFrenchDate(game.releaseDate);
    const createdAtDateTimeRaw = game.createdAtDateTime || "";
    const updatedAtDateTimeRaw = game.updatedAtDateTime || "";
    const createdAtDateTimeTs = parseIsoDateTime(createdAtDateTimeRaw);
    const updatedAtDateTimeTs = parseIsoDateTime(updatedAtDateTimeRaw);

    const updatedAtLocalRaw = game.updatedAtLocal || "";
    const createdAtLocalRaw = game.createdAtLocal || "";
    const updatedAtLocalTs = parseIsoDateTime(updatedAtLocalRaw);
    const createdAtLocalTs = parseIsoDateTime(createdAtLocalRaw);
    const lastTranslationTs = updatedAtLocalTs || createdAtLocalTs || updatedAtTs || 0;

    const ckey = counterKeyOfUid(uid);

    return {
      uid,
      ckey,
      collection: coll,
      id: String(game.id || ""),
      rawTitle: displayTitleRaw,
      title: c.title,
      gameData: game.gameData || null,
      categories,
      category: categories[0] || null,
      engines,
      engine: engines[0] || null,
      status: STATUS_ALLOWED.includes(finalStatus) || finalStatus === "En cours" ? finalStatus : "En cours",
      translationType: String(game.translationType || "").trim(),
      discord: String(game.discordlink || ""),
      translation: String(game.translation || ""),
      image: displayImageRaw,
      url: String(game.url || game.threadUrl || ""),
      tags: displayTags,
      updatedAt: game.updatedAt || "",
      updatedAtTs,
      releaseDate: game.releaseDate || "",
      releaseDateTs,
      updatedAtLocal: updatedAtLocalRaw,
      updatedAtLocalTs,
      createdAtLocal: createdAtLocalRaw,
      createdAtLocalTs,
      createdAtDateTime: createdAtDateTimeRaw,
      createdAtDateTimeTs,
      updatedAtDateTime: updatedAtDateTimeRaw,
      updatedAtDateTimeTs,
      lastTranslationTs,
      __raw: game,
    };
  }

  // =========================
  // Render
  // =========================

  function badgesLineHtml(g) {
    const out = [];
    const cats = Array.isArray(g.categories) ? g.categories : g.category ? [g.category] : [];
    const engs = Array.isArray(g.engines) ? g.engines : g.engine ? [g.engine] : [];

    for (const cat of cats) {
      if (CAT_ALLOWED.includes(cat)) out.push(`<span class="badge cat cat-${slug(cat)}">${escapeHtml(cat)}</span>`);
    }
    for (const e of engs) {
      if (ENGINE_ALLOWED.includes(e)) out.push(`<span class="badge eng eng-${slug(e)}">${escapeHtml(e)}</span>`);
    }
    if (g.status) out.push(`<span class="badge status status-${slug(g.status)}">${escapeHtml(g.status)}</span>`);
    return out.join(" ");
  }

  function buildDynamicFilters() {
    const tags = new Set();
    const translationTypes = new Set();

    for (const g of state.all) {
      if (Array.isArray(g.tags)) g.tags.forEach((t) => t && tags.add(t));
      const tt = String(g.translationType || "").trim();
      if (tt) translationTypes.add(tt);
    }

    const preferredOrder = [
      "automatique",
      "auto rapide",
      "auto avec correction",
      "auto avec relecture",
      "manuel - humaine",
      "VO française",
      "A tester",
    ];

    const preferredIndex = new Map(preferredOrder.map((v, i) => [v.toLowerCase(), i]));
    const allTranslationTypes = Array.from(translationTypes).sort((a, b) => {
      const ak = a.toLowerCase();
      const bk = b.toLowerCase();
      const ai = preferredIndex.has(ak) ? preferredIndex.get(ak) : 999;
      const bi = preferredIndex.has(bk) ? preferredIndex.get(bk) : 999;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b, "fr", { sensitivity: "base" });
    });

    const ttSel = $("#filterTranslationType");
    if (ttSel) {
      const previous = state.filterTranslationType || "all";
      const translationTypeLabels = {
        "automatique": "Automatique 🎲",
        "auto rapide": "Automatique ⚡ rapide",
        "auto avec correction": "Automatique 🤖 correction",
        "auto avec relecture": "Automatique 👀 relecture",
        "manuel - humaine": "Manuelle",
        "VO française": "Version française",
        "A tester": "À tester",
      };
      ttSel.innerHTML = '<option value="all">Type de traduction : Tout</option>';
      for (const tt of allTranslationTypes) {
        const opt = document.createElement("option");
        opt.value = tt;
        opt.textContent = translationTypeLabels[tt] || tt;
        ttSel.appendChild(opt);
      }
      ttSel.value = allTranslationTypes.includes(previous) ? previous : "all";
      state.filterTranslationType = ttSel.value || "all";
    }

    const allTags = Array.from(tags).sort((a, b) => a.localeCompare(b));
    initTagsUI(allTags);
  }

  function sortNow() {
    const [k, dir] = state.sort.split("-");
    const mul = dir === "asc" ? 1 : -1;

    if (k === "title") {
      state.filtered.sort((a, b) => a.title.localeCompare(b.title) * mul);
      return;
    }

    if (["releaseDate", "updatedAt", "updatedAtLocal", "createdAtDateTime", "updatedAtDateTime"].includes(k)) {
      const key = k + "Ts";
      state.filtered.sort((a, b) => ((a[key] || 0) - (b[key] || 0)) * mul);
      return;
    }

    if (k === "views") {
      state.filtered.sort((a, b) => {
        const da = GAME_STATS.views.get(a.ckey) || 0;
        const db = GAME_STATS.views.get(b.ckey) || 0;
        if (da !== db) return (da - db) * mul;

        const ta = a.updatedAtLocalTs || 0;
        const tb = b.updatedAtLocalTs || 0;
        if (ta !== tb) return (ta - tb) * mul;

        return a.title.localeCompare(b.title);
      });
      return;
    }

    if (k === "mega") {
      state.filtered.sort((a, b) => {
        const da = GAME_STATS.mega.get(a.ckey) || 0;
        const db = GAME_STATS.mega.get(b.ckey) || 0;
        if (da !== db) return (da - db) * mul;

        const ta = a.updatedAtLocalTs || 0;
        const tb = b.updatedAtLocalTs || 0;
        if (ta !== tb) return (ta - tb) * mul;

        return a.title.localeCompare(b.title);
      });
      return;
    }

    if (k === "likes") {
      state.filtered.sort((a, b) => {
        const da = GAME_STATS.likes.get(a.ckey) || 0;
        const db = GAME_STATS.likes.get(b.ckey) || 0;
        if (da !== db) return (da - db) * mul;

        const ta = a.updatedAtLocalTs || 0;
        const tb = b.updatedAtLocalTs || 0;
        if (ta !== tb) return (ta - tb) * mul;

        return a.title.localeCompare(b.title);
      });
      return;
    }
  }

  function applyFilters() {
    const q = state.q.toLowerCase();
    const ftt = state.filterTranslationType;
    const fc = state.filterCat;
    const fe = state.filterEngine;
    const fs = state.filterStatus;
    const ft = state.filterTags;

    state.filtered = state.all.filter((g) => {
      const mq = !q || g.title.toLowerCase().includes(q) || String(g.id || "").includes(q) || String(g.uid || "").includes(q);

      const mtt = ftt === "all" || String(g.translationType || "") === ftt;

      const mc =
        fc === "all" || (Array.isArray(g.categories) ? g.categories.includes(fc) : g.category === fc);

      const me =
        fe === "all" || (Array.isArray(g.engines) ? g.engines.includes(fe) : g.engine === fe);

      const ms = fs === "all" || g.status === fs;

      let mt = true;
      if (ft && ft.length) {
        const tags = Array.isArray(g.tags) ? g.tags : [];
        mt = ft.every((t) => tags.includes(t));
      }

      return mq && mtt && mc && me && ms && mt;
    });

    sortNow();
    state.visibleCount = 0;
    renderGrid();
  }

  function updateStats() {
    const el = $("#countTotal");
    if (el) el.textContent = String(state.filtered.length);
  }

  function applyGridCols() {
    const gridEl = $("#grid");
    if (!gridEl) return;

    delete gridEl.dataset.cols;
    delete gridEl.dataset.density;

    if (state.cols === "auto") {
      gridEl.style.gridTemplateColumns = "";
      return;
    }

    const n = Math.max(1, Math.min(10, parseInt(state.cols, 10) || 1));
    gridEl.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    gridEl.dataset.cols = String(n);
    if (n >= 7) gridEl.dataset.density = "compact";
  }


  // =========================
  // Hover gallery (miniatures F95 sur les tuiles)
  // =========================
  const HOVER_GALLERY = {
    cache: new Map(),      // f95 url -> Promise<string[]>
    timers: new WeakMap(), // card -> interval id
    baseSrc: new WeakMap(),
    baseFallback: new WeakMap(),
    activeToken: new WeakMap(),
    preload: new Map(),    // image url -> Promise<void>
  };

  function getF95GalleryApiUrl(f95Url) {
    const u = String(f95Url || "").trim();
    return u ? `/api/f95gallery?url=${encodeURIComponent(u)}` : "";
  }

  function toF95ThumbUrl(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    if (/\/thumb\//i.test(u)) return u;
    if (/^https?:\/\/attachments\.f95zone\.to\//i.test(u)) {
      return u.replace(/^(https?:\/\/attachments\.f95zone\.to\/\d{4}\/\d{2}\/)(?!thumb\/)/i, "$1thumb/");
    }
    return u;
  }

  function toF95PreviewUrl(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    if (/^https?:\/\/preview\.f95zone\.to\//i.test(u)) return u;
    const m = u.match(/^https?:\/\/attachments\.f95zone\.to\/(\d{4})\/(\d{2})\/(.+)$/i);
    if (m) {
      return `https://preview.f95zone.to/${m[1]}/${m[2]}/${m[3]}`;
    }
    return u;
  }

  function preloadImage(url) {
    const u = String(url || "").trim();
    if (!u) return Promise.resolve();
    if (HOVER_GALLERY.preload.has(u)) return HOVER_GALLERY.preload.get(u);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = u;
    });
    HOVER_GALLERY.preload.set(u, p);
    return p;
  }

  function applyThumbState(img, src, isFallback) {
    if (!img) return;
    img.src = src || "";
    img.classList.toggle("is-fallback", !!isFallback);
  }

  function normalizeF95MediaKey(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    try {
      const x = new URL(u, location.origin);
      const host = (x.hostname || "").toLowerCase();
      let path = (x.pathname || "").replace(/\\/g, "/");

      // preview / attachments / thumb -> même clé logique basée sur le fichier
      if (
        host === "preview.f95zone.to" ||
        host === "attachments.f95zone.to"
      ) {
        path = path.replace(/^\/(\d{4})\/(\d{2})\/(thumb\/)?/i, "/");
        return path.toLowerCase();
      }

      return `${host}${path}`.toLowerCase();
    } catch {
      return u.replace(/[?#].*$/, "").toLowerCase();
    }
  }

  function sameImageUrl(a, b) {
    const aa = String(a || "").trim();
    const bb = String(b || "").trim();
    if (!aa || !bb) return false;

    const ka = normalizeF95MediaKey(aa);
    const kb = normalizeF95MediaKey(bb);
    if (ka && kb) return ka === kb;

    return aa === bb;
  }

  async function fetchHoverGalleryUrls(rawEntry, fallbackUrl) {
    const entry = rawEntry || {};
    const f95Url = String(
      entry.url || entry.threadUrl || entry.f95url || entry.f95Url || entry.sourceUrl || ""
    ).trim();

    const base = String(fallbackUrl || "").trim();
    if (!f95Url) return base ? [base] : [];

    if (!HOVER_GALLERY.cache.has(f95Url)) {
      const api = getF95GalleryApiUrl(f95Url);
      HOVER_GALLERY.cache.set(
        f95Url,
        fetch(api, { credentials: "same-origin", cache: "force-cache" })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            const raw = Array.isArray(data?.gallery) ? data.gallery : [];
            const cleaned = [];
            const seen = new Set();
            const baseKey = normalizeF95MediaKey(base);

            if (base) {
              seen.add(baseKey || base);
              cleaned.push(base);
            }

            for (const item of raw) {
              const original = String(item || "").trim();
              if (!original) continue;

              const preview = toF95PreviewUrl(original) || original;
              const key = normalizeF95MediaKey(preview) || preview;

              // Ignore l'image F95 si elle correspond déjà à la cover de la base
              if (base && sameImageUrl(preview, base)) continue;
              if (seen.has(key)) continue;

              seen.add(key);
              cleaned.push(preview);
            }

            return cleaned.length ? cleaned : (base ? [base] : []);
          })
          .catch(() => (base ? [base] : []))
      );
    }
    return HOVER_GALLERY.cache.get(f95Url);
  }

  function stopCardHoverSlideshow(card) {
    const timer = HOVER_GALLERY.timers.get(card);
    if (timer) clearInterval(timer);
    HOVER_GALLERY.timers.delete(card);

    const img = card?.querySelector(".thumb");
    const baseSrc = HOVER_GALLERY.baseSrc.get(card) || "";
    const baseFallback = !!HOVER_GALLERY.baseFallback.get(card);
    if (img && baseSrc) applyThumbState(img, baseSrc, baseFallback);
  }

  function bindCardHoverGallery(card, rawEntry, fallbackUrl) {
    const img = card?.querySelector(".thumb");
    if (!card || !img) return;

    const baseSrc = String(fallbackUrl || "").trim() || img.src;
    const baseFallback = img.classList.contains("is-fallback");

    HOVER_GALLERY.baseSrc.set(card, baseSrc);
    HOVER_GALLERY.baseFallback.set(card, baseFallback);

    card.addEventListener("mouseleave", () => {
      HOVER_GALLERY.activeToken.set(card, null);
      stopCardHoverSlideshow(card);
    });

    card.addEventListener("mouseenter", async () => {
      stopCardHoverSlideshow(card);

      const token = Symbol("hover");
      HOVER_GALLERY.activeToken.set(card, token);

      const urls = await fetchHoverGalleryUrls(rawEntry, baseSrc);
      if (HOVER_GALLERY.activeToken.get(card) !== token) return;

      if (!Array.isArray(urls) || urls.length < 2) {
        applyThumbState(img, baseSrc, baseFallback);
        return;
      }

      // Si la première URL est la même que la cover, saute directement à la suivante
      let idx = 0;
      if (urls.length > 1 && sameImageUrl(urls[0], baseSrc)) idx = 1;

      applyThumbState(img, urls[idx], false);

      // Précharge la suivante pour accélérer le premier switch
      preloadImage(urls[(idx + 1) % urls.length]);

      const timer = setInterval(() => {
        if (!card.matches(":hover")) {
          stopCardHoverSlideshow(card);
          return;
        }
        idx = (idx + 1) % urls.length;
        applyThumbState(img, urls[idx], false);
        preloadImage(urls[(idx + 1) % urls.length]);
      }, 2000);

      HOVER_GALLERY.timers.set(card, timer);
    });
  }


  function renderGrid() {
    const grid = $("#grid");
    const empty = $("#gridEmpty");
    grid.innerHTML = "";

    if (!state.filtered.length) {
      empty.classList.remove("hidden");
      updateStats();
      return;
    }
    empty.classList.add("hidden");

    applyGridCols();

    const total = state.filtered.length;

    if (!state.visibleCount || state.visibleCount < 0) {
      state.visibleCount = state.pageSize === "all" ? total : Math.min(total, state.pageSize);
    }

    const limit = state.pageSize === "all" ? total : Math.min(total, state.visibleCount);

    const frag = document.createDocumentFragment();

    for (let i = 0; i < limit; i++) {
      const g = state.filtered[i];
      const card = document.createElement("a");
      card.className = "card card-link";

      const imgSrc = (g.image || "").trim() || "/favicon.png";
      const pageHref = buildGameUrl(g.__raw || g);

      const views = GAME_STATS.views.get(g.ckey) || 0;
      const mega = GAME_STATS.mega.get(g.ckey) || 0;
      const likes = GAME_STATS.likes.get(g.ckey) || 0;
      const rating = GAME_RATINGS.byKey.get(g.ckey) || { avg: 0, count: 0, sum: 0 };
      const ratingText = formatRatingForCard(rating.avg, rating.count);
      const translationText = formatRelativeTranslationTime(g.lastTranslationTs);
      const translationTitle = formatAbsoluteDateTime(g.lastTranslationTs);

      card.href = pageHref;
      card.target = "_blank";
      card.rel = "noopener";
      card.setAttribute("aria-label", `Ouvrir : ${getDisplayTitle(g.__raw || g)}`);

      card.innerHTML = `
        <img src="${imgSrc}" class="thumb" alt=""
             referrerpolicy="no-referrer"
             loading="lazy"
             onerror="this.onerror=null;this.src='/favicon.png';this.classList.add('is-fallback');">
        <div class="body">
          <h3 class="name clamp-2">${escapeHtml(getDisplayTitle(g.__raw || g))}</h3>
          <div class="badges-line one-line">${badgesLineHtml(g)}</div>

          <div class="card-meta">
            <div class="card-stats" aria-label="Statistiques de la vignette">
              <span class="card-stat" title="${escapeHtml(translationTitle)}">
                <span class="stat-icon stat-icon-time" aria-hidden="true"></span>
                <span>${escapeHtml(translationText)}</span>
              </span>
              <span class="card-stat" title="Nombre de vues">
                <span class="stat-icon stat-icon-views" aria-hidden="true"></span>
                <span>${formatInt(views)}</span>
              </span>
              <span class="card-stat" title="Nombre de téléchargements">
                <span class="stat-icon stat-icon-downloads" aria-hidden="true"></span>
                <span>${formatInt(mega)}</span>
              </span>
              <span class="card-stat" title="Nombre de j'aime">
                <span class="stat-icon stat-icon-likes" aria-hidden="true"></span>
                <span>${formatInt(likes)}</span>
              </span>
              <span class="card-stat" title="Note étoile moyenne et nombre de votes">
                <span class="stat-icon stat-icon-rating" aria-hidden="true"></span>
                <span>${escapeHtml(ratingText)}</span>
              </span>
            </div>
          </div>
        </div>
      `;

      bindCardHoverGallery(card, g.__raw || g, imgSrc);
      frag.appendChild(card);
    }

    grid.appendChild(frag);

    if (limit < total && state.pageSize !== "all") {
      const rest = total - limit;
      const step = typeof state.pageSize === "number" ? state.pageSize : 50;
      const more = Math.min(step, rest);

      const wrap = document.createElement("div");
      wrap.className = "load-more-wrap";

      const btn = document.createElement("button");
      btn.className = "load-more-btn";
      btn.textContent = `Afficher +${more} (${rest} restants)`;
      btn.addEventListener("click", () => {
        state.visibleCount = Math.min(total, limit + step);
        renderGrid();
      });

      wrap.appendChild(btn);
      grid.appendChild(wrap);
    }

    updateStats();
  }

  // =========================
  // Events
  // =========================

  $("#search")?.addEventListener("input", (e) => {
    state.q = e.target.value || "";
    applyFilters();
  });

  $("#sort")?.addEventListener("change", async (e) => {
    state.sort = e.target.value;

    if (state.sort.startsWith("views") || state.sort.startsWith("mega") || state.sort.startsWith("likes")) {
      await forceReloadGameStats();
    }

    sortNow();
    state.visibleCount = 0;
    renderGrid();
  });

  $("#filterTranslationType")?.addEventListener("change", (e) => {
    state.filterTranslationType = e.target.value || "all";
    applyFilters();
  });

  $("#filterCat")?.addEventListener("change", (e) => {
    state.filterCat = e.target.value || "all";
    applyFilters();
  });

  $("#filterEngine")?.addEventListener("change", (e) => {
    state.filterEngine = e.target.value || "all";
    applyFilters();
  });

  $("#filterStatus")?.addEventListener("change", (e) => {
    state.filterStatus = e.target.value || "all";
    applyFilters();
  });

  const pageSizeSel = $("#pageSize");
  if (pageSizeSel) {
    pageSizeSel.addEventListener("change", (e) => {
      const v = e.target.value;
      if (v === "all") state.pageSize = "all";
      else {
        const n = parseInt(v, 10);
        state.pageSize = !isNaN(n) && n > 0 ? n : 50;
      }
      state.visibleCount = 0;
      renderGrid();
    });
  }

  $("#cols")?.addEventListener("change", async (e) => {
    state.cols = e.target.value || "auto";
    applyGridCols();
    await setViewerCols(state.cols);
  });

  $("#refresh")?.addEventListener("click", () => {
    state.q = "";
    state.sort = "updatedAtLocal-desc";
    state.filterTranslationType = "all";
    state.filterCat = "all";
    state.filterEngine = "all";
    state.filterStatus = "all";
    state.filterTags = [];
    state.visibleCount = 0;

    const search = $("#search");
    if (search) search.value = "";

    const sort = $("#sort");
    if (sort) sort.value = state.sort;

    const tt = $("#filterTranslationType");
    if (tt) tt.value = "all";

    const cat = $("#filterCat");
    if (cat) cat.value = "all";

    const eng = $("#filterEngine");
    if (eng) eng.value = "all";

    const stat = $("#filterStatus");
    if (stat) stat.value = "all";

    clearSavedTags();
    updateTagsCountBadge();
    closeTagsPopover();

    try {
      window.ViewerMenu?.closeMenu?.();
    } catch {}
    try {
      window.ViewerMenuAbout?.close?.();
    } catch {}
    try {
      window.ViewerMenuExtension?.close?.();
    } catch {}

    state.pageSize = 50;
    const ps = $("#pageSize");
    if (ps) ps.value = "50";

    GAME_STATS.loaded = false;
    GAME_STATS.views.clear();
    GAME_STATS.mega.clear();
    GAME_STATS.likes.clear();

    GAME_RATINGS.loaded = false;
    GAME_RATINGS.byKey.clear();

    init();
  });

  // =========================
  // Init
  // =========================

  async function init() {
    $("#grid").innerHTML = "";
    $("#gridEmpty")?.classList.add("hidden");
    setViewerLoading(true, "Chargement…");

    try {
      initHeaderMenuAndDisplayTools();
      syncTopbarHeight();

      state.cols = await getViewerCols();
      const colsSel = $("#cols");
      if (colsSel) colsSel.value = state.cols;

      const raw = await loadList();
      state.all = Array.isArray(raw) ? raw.map(normalizeGame) : [];

      if (!state.filterTags || !state.filterTags.length) {
        state.filterTags = getSavedTags();
      }
      updateTagsCountBadge();

      buildDynamicFilters();

      await Promise.all([
        ensureGameStatsLoaded(),
        ensureGameRatingsLoaded(),
      ]);

      applyFilters();
      initMainPageCounter();
      setViewerLoading(false);
    } catch (e) {
      console.error("[viewer] load error:", e);

      try {
        window.viewerAnnonce?.setMaintenance?.("La liste est indisponible pour le moment.");
      } catch {}

      $("#grid").innerHTML = "";
      const ge = $("#gridEmpty");
      if (ge) {
        ge.textContent = "Erreur de chargement";
        ge.classList.remove("hidden");
      }
      setViewerLoading(false);
    }
  }

  init();
})();