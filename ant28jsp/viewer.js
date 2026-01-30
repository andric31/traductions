// viewer.js — Vignettes + filtres + tri dates + affichage progressif
// (menu ☰ délégué à viewer.menu.js + modules viewer.menu.about.js / viewer.menu.extension.js)
// + Tags multi (popover + save)
// ✅ UID ONLY pour stats (aligné sur game.js)
// ✅ MULTI-TRADUCTEUR : charge ./config.json si présent + URLs game relatives + storage séparé par traducteur
(() => {
  const DEFAULT_URL = "https://raw.githubusercontent.com/andric31/f95list/main/f95list.json";

  const $ = (sel) => document.querySelector(sel);

  // ✅ Owner (pour séparer storage / compteur page)
  const OWNER = (window.VIEWER_OWNER || "").toString().trim() || "default";

  // ✅ URL page jeu (id central + support collection child)
  // IMPORTANT: URL RELATIVE (pas de /game/), pour que /ant28jsp/ -> /ant28jsp/game/
  function buildGameUrl(g) {
    const coll = (g.collection || "").toString().trim();
    const id = (g.id || "").toString().trim();
    const uid = (g.uid ?? "").toString().trim();

    // Sous-jeu de collection : game/?id=<collection>&uid=<uid>
    if (coll) return `game/?id=${encodeURIComponent(coll)}&uid=${encodeURIComponent(uid)}`;
    // Jeu normal / collection parent : game/?id=<id>
    if (id) return `game/?id=${encodeURIComponent(id)}`;
    // Fallback uid seul
    return `game/?uid=${encodeURIComponent(uid)}`;
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
    filterCat: "all",
    filterEngine: "all",
    filterStatus: "all",
    filterTags: [], // ✅ multi tags
    cols: "auto",
    pageSize: 50,
    visibleCount: 0,
  };

  // =========================
  // ✅ Compteur vues page principale (Viewer)
  // =========================

  // ✅ sépare les vues par traducteur (sinon tous partagent "__viewer_main__")
  const MAIN_PAGE_ID = `__viewer_main__:${OWNER}`;
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
    views: new Map(), // key(uid:xxx) -> number
    mega: new Map(),
    likes: new Map(),
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
      return j.stats; // { key: {views, mega, likes}, ... }
    } catch {
      return {};
    }
  }

  async function ensureGameStatsLoaded() {
    if (GAME_STATS.loaded) return;

    // ✅ on envoie uid:<uid> (comme game.js)
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

  async function forceReloadGameStats() {
    GAME_STATS.loaded = false;
    GAME_STATS.views.clear();
    GAME_STATS.mega.clear();
    GAME_STATS.likes.clear();
    await ensureGameStatsLoaded();
  }

  async function initMainPageCounter() {
    const el = document.getElementById("mainViews");
    if (!el) return;

    try {
      // ✅ 1 seul "hit" par chargement de page
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
  // ☰ MENU (viewer.menu.js gère le contenu / items / modales)
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

    if (total) tools.appendChild(total);
    if (cols) tools.appendChild(cols);
    if (pageSize) tools.appendChild(pageSize);

    try {
      window.ViewerMenu?.init?.();
    } catch {}

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const pop = document.getElementById("topMenuPopover");
      if (!pop) return;

      const isOpen = !pop.classList.contains("hidden");
      if (isOpen) {
        try {
          window.ViewerMenu?.closeMenu?.();
        } catch {
          pop.classList.add("hidden");
        }
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
        if (!pop.contains(t) && !hb.contains(t)) {
          try {
            window.ViewerMenu?.closeMenu?.();
          } catch {
            pop.classList.add("hidden");
          }
        }
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
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        try {
          window.ViewerMenu?.closeMenu?.();
        } catch {}
        try {
          window.ViewerMenuAbout?.close?.();
        } catch {}
        try {
          window.ViewerMenuExtension?.close?.();
        } catch {}
        closeTagsPopover();
      }
    });
  }

  // =========================
  // ✅ TAGS MULTI (popover + save)
  // =========================

  // ✅ storage séparé par traducteur
  const TAGS_STORE_KEY = `viewerSelectedTags:${OWNER}`;

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
        <div class="tag-list" id="tagsList"></div>
      `;
      document.body.appendChild(pop);
    }

    return { btn, pop };
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
    const { btn, pop } = ensureTagsDom();
    const list = document.getElementById("tagsList");

    const renderTagList = () => {
      if (!list) return;
      const active = new Set(state.filterTags || []);
      list.innerHTML = "";

      for (const t of allTags) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "tag-item" + (active.has(t) ? " active" : "");
        item.innerHTML = `
          <span class="tag-left">
            <span class="tag-check">✓</span>
            <span class="tag-name">${escapeHtml(t)}</span>
          </span>
        `;
        item.addEventListener("click", () => {
          const cur = new Set(state.filterTags || []);
          if (cur.has(t)) cur.delete(t);
          else cur.add(t);

          state.filterTags = Array.from(cur);
          setSavedTags(state.filterTags);
          updateTagsCountBadge();
          renderTagList();
          applyFilters();
        });

        list.appendChild(item);
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
      });

      document.getElementById("tagsClearBtn")?.addEventListener("click", () => {
        state.filterTags = [];
        clearSavedTags();
        updateTagsCountBadge();
        renderTagList();
        applyFilters();
      });
    }

    updateTagsCountBadge();
    renderTagList();
  }

  // =========================
  // Helpers URL / prefs / list
  // =========================

  // ✅ Multi-traducteur :
  // 1) ?src=...
  // 2) ./config.json -> listUrl
  // 3) localStorage f95listUrl (fallback legacy)
  // 4) DEFAULT_URL
  async function getListUrlSmart() {
    // 1) ?src=
    try {
      const p = new URLSearchParams(location.search);
      const src = (p.get("src") || "").trim();
      if (src) return src;
    } catch {}

    // 2) ./config.json
    try {
      const r = await fetch("./config.json", { cache: "no-store" });
      if (r.ok) {
        const cfg = await r.json();
        const listUrl = (cfg?.listUrl || "").toString().trim();
        if (listUrl) return listUrl;
      }
    } catch {}

    // 3) legacy localStorage
    try {
      const ls = (localStorage.getItem("f95listUrl") || "").trim();
      if (ls) return ls;
    } catch {}

    // 4) fallback
    return DEFAULT_URL;
  }

  // ✅ cols séparé par traducteur
  async function getViewerCols() {
    try {
      return (localStorage.getItem(`viewerCols:${OWNER}`) || "auto").trim() || "auto";
    } catch {
      return "auto";
    }
  }

  async function setViewerCols(v) {
    try {
      localStorage.setItem(`viewerCols:${OWNER}`, String(v));
    } catch {}
  }

  async function loadList() {
    const url = await getListUrlSmart();
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

    const updatedAtLocalRaw = game.updatedAtLocal || "";
    const createdAtLocalRaw = game.createdAtLocal || "";
    const updatedAtLocalParsed = updatedAtLocalRaw ? Date.parse(updatedAtLocalRaw) : NaN;
    const createdAtLocalParsed = createdAtLocalRaw ? Date.parse(createdAtLocalRaw) : NaN;

    const updatedAtLocalTs = !Number.isNaN(updatedAtLocalParsed) ? updatedAtLocalParsed : 0;
    const createdAtLocalTs = !Number.isNaN(createdAtLocalParsed) ? createdAtLocalParsed : 0;

    // ✅ clé compteur UID ONLY
    const ckey = counterKeyOfUid(uid);

    return {
      uid,
      ckey, // ✅ on garde la clé déjà calculée
      collection: coll,
      id: String(game.id || ""),
      rawTitle: displayTitleRaw,
      title: c.title,
      gameData: game.gameData || null,
      categories,
      category: categories[0] || null,
      engines,
      engine: engines[0] || null,
      status: STATUS_ALLOWED.includes(c.status) || c.status === "En cours" ? c.status : "En cours",
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
    for (const g of state.all) {
      if (Array.isArray(g.tags)) g.tags.forEach((t) => t && tags.add(t));
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

    if (["releaseDate", "updatedAt", "updatedAtLocal"].includes(k)) {
      const key = k + "Ts";
      state.filtered.sort((a, b) => ((a[key] || 0) - (b[key] || 0)) * mul);
      return;
    }

    // ✅ tri stats = UID key
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
    const fc = state.filterCat;
    const fe = state.filterEngine;
    const fs = state.filterStatus;
    const ft = state.filterTags;

    state.filtered = state.all.filter((g) => {
      const mq =
        !q ||
        g.title.toLowerCase().includes(q) ||
        String(g.id || "").includes(q) ||
        String(g.uid || "").includes(q);

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

      return mq && mc && me && ms && mt;
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
      const card = document.createElement("article");
      card.className = "card";

      const imgSrc = (g.image || "").trim() || "/favicon.png";
      const pageHref = buildGameUrl(g.__raw || g);

      card.innerHTML = `
        <img src="${imgSrc}" class="thumb" alt=""
             referrerpolicy="no-referrer"
             onerror="this.onerror=null;this.src='/favicon.png';this.classList.add('is-fallback');">
        <div class="body">
          <h3 class="name clamp-2">${escapeHtml(getDisplayTitle(g.__raw || g))}</h3>
          <div class="badges-line one-line">${badgesLineHtml(g)}</div>
          <div class="actions">
            <a class="btn btn-page" href="${pageHref}" target="_blank" rel="noopener">
              📄 Ouvrir la page
            </a>
          </div>
        </div>
      `;

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
  if (pageSizeSel)
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

  $("#cols")?.addEventListener("change", async (e) => {
    state.cols = e.target.value || "auto";
    applyGridCols();
    await setViewerCols(state.cols);
  });

  $("#refresh")?.addEventListener("click", () => {
    state.q = "";
    state.sort = "updatedAtLocal-desc";
    state.filterCat = "all";
    state.filterEngine = "all";
    state.filterStatus = "all";
    state.filterTags = [];
    state.visibleCount = 0;

    const search = $("#search");
    if (search) search.value = "";

    const sort = $("#sort");
    if (sort) sort.value = state.sort;

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

    // ✅ reset cache stats
    GAME_STATS.loaded = false;
    GAME_STATS.views.clear();
    GAME_STATS.mega.clear();
    GAME_STATS.likes.clear();

    init();
  });

  // =========================
  // Init
  // =========================

  async function init() {
    $("#grid").innerHTML = "";
    $("#gridEmpty")?.classList.add("hidden");

    try {
      initHeaderMenuAndDisplayTools();

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

      if (state.sort.startsWith("views") || state.sort.startsWith("mega") || state.sort.startsWith("likes")) {
        await ensureGameStatsLoaded();
      }

      applyFilters();
      initMainPageCounter();
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
    }
  }

  init();
})();
