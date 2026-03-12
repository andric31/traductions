// viewer.js — Vignettes + filtres + tri + affichage progressif + stats
// Universel multi-traducteurs : détecte automatiquement le dossier (slug) dans l'URL.
// ✅ UID ONLY pour les stats (aligné sur game.js)
// ✅ Menu hamburger compatible extensions (window.ViewerMenu.addItem)
// ✅ Annonce compatible template (window.viewerAnnonce.* + host auto si absent)

(() => {
  "use strict";

  // =========================
  // ✅ Détection universelle SLUG + chemins
  // =========================
  function detectSlug() {
    // 1) override possible depuis index.html : window.__SITE_SLUG__ = "ikaros";
    try {
      const forced = (window.__SITE_SLUG__ || "").toString().trim();
      if (forced) return forced;
    } catch {}

    // 2) sinon, 1er segment du pathname
    // ex: /ikaros/ -> ikaros ; /ikaros/index.html -> ikaros
    const segs = (location.pathname || "/").split("/").filter(Boolean);
    return (segs[0] || "").trim();
  }

  const SLUG = detectSlug();                 // "liste" / "ikaros" / "ant28jsp" / ...
  const APP_PATH = SLUG ? `/${SLUG}/` : `/`; // base pour les liens internes
  const DEFAULT_URL = SLUG ? `/f95list_${SLUG}.json` : `/f95list.json`;

  const $ = (sel) => document.querySelector(sel);

  // =========================
  // 📢 Annonce (template)
  // - utilise viewer.annonce.js si présent (window.viewerAnnonce)
  // - assure #viewerAnnonceHost (fallback) si absent
  // =========================
  function ensureAnnonceHost() {
    let host = document.getElementById("viewerAnnonceHost");
    if (host) return host;

    host = document.createElement("div");
    host.id = "viewerAnnonceHost";

    // priorité : avant la grille / conteneur
    const grid = document.getElementById("grid");
    if (grid && grid.parentNode) {
      grid.parentNode.insertBefore(host, grid);
      return host;
    }

    const gridWrap = document.getElementById("gridMode") || document.querySelector(".grid-wrap");
    if (gridWrap) {
      gridWrap.insertBefore(host, gridWrap.firstChild);
      return host;
    }

    document.body.insertBefore(host, document.body.firstChild);
    return host;
  }

  function initAnnonceTemplate() {
    ensureAnnonceHost();

    // si viewer.annonce.js est chargé, il s’init tout seul au DOMContentLoaded
    // mais on peut forcer un refresh ici pour être sûr (et utile après "refresh")
    try {
      if (window.viewerAnnonce && typeof window.viewerAnnonce.refresh === "function") {
        window.viewerAnnonce.refresh();
      }
    } catch {}
  }

  // =========================
  // ☰ Hamburger menu (Viewer) — compatible extensions
  // - expose window.ViewerMenu.addItem(label, onClick)
  // - ajoute "🌍 Accueil"
  // - les scripts externes (ex: viewer.menu.extension.js) peuvent enregistrer leurs entrées
  // =========================
  function initHamburgerMenu() {
    const btn =
      document.getElementById("hamburgerBtnViewer") ||
      document.getElementById("hamburgerBtn");

    if (!btn) return;

    // crée le popover une seule fois
    let pop = document.getElementById("viewerMenuPopover");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "viewerMenuPopover";
      pop.className = "menu-popover hidden";
      pop.setAttribute("role", "menu");
      document.body.appendChild(pop);
    }

    const items = [];

    function render() {
      pop.innerHTML = "";

      for (const it of items) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "menu-item";
        b.textContent = it.label;

        b.addEventListener("click", () => {
          close();
          try { it.onClick && it.onClick(); } catch (e) { console.warn("[menu] onClick error", e); }
        });

        pop.appendChild(b);
      }
    }

    // API publique (pour tes extensions)
    if (!window.ViewerMenu) {
      window.ViewerMenu = {
        addItem(label, onClick) {
          const l = String(label || "").trim();
          if (!l) return;

          // évite doublons exacts
          if (items.some(x => x.label === l)) return;

          items.push({ label: l, onClick });
          render();
        }
      };
    }

    // ✅ entrée par défaut
    try {
      window.ViewerMenu.addItem("🌍 Accueil", () => {
        location.href = "https://traductions.pages.dev/";
      });
    } catch {}

    const close = () => {
      pop.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
    };

    const open = () => {
      // calc position après avoir rendu (au cas où la largeur change)
      pop.classList.remove("hidden");

      const r = btn.getBoundingClientRect();
      const pad = 8;

      const rect = pop.getBoundingClientRect();
      const w = rect.width || 240;
      const h = rect.height || 120;

      const maxL = Math.max(pad, window.innerWidth - w - pad);
      const maxT = Math.max(pad, window.innerHeight - h - pad);

      const left = Math.min(maxL, Math.max(pad, r.left));
      const top = Math.min(maxT, Math.max(pad, r.bottom + 8));

      pop.style.left = left + "px";
      pop.style.top = top + "px";

      btn.setAttribute("aria-expanded", "true");
    };

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = !pop.classList.contains("hidden");
      if (isOpen) close();
      else open();
    });

    // click dehors => ferme
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!t) return;
      if (t === btn || btn.contains(t)) return;
      if (t === pop || pop.contains(t)) return;
      close();
    });

    // resize => ferme
    window.addEventListener("resize", () => {
      if (!pop.classList.contains("hidden")) close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  // =========================
  // 🔞 Age gate (intégré ici)
  // =========================
  (function initAgeGate() {
    const KEY = "ageVerified";
    const gate = document.getElementById("age-gate");
    if (!gate) return;

    try {
      if (!localStorage.getItem(KEY)) {
        gate.style.display = "flex";
        document.body.classList.add("age-gate-active");
        document.body.style.overflow = "hidden";
      }
    } catch {}

    document.getElementById("age-yes")?.addEventListener("click", () => {
      try { localStorage.setItem(KEY, "1"); } catch {}
      gate.style.display = "none";
      document.body.classList.remove("age-gate-active");
      document.body.style.overflow = "";
    });

    document.getElementById("age-no")?.addEventListener("click", () => {
      location.href = "https://www.google.com";
    });
  })();

  // =========================
  // ✅ URL page jeu (règle EXACTE de tes viewers)
  // =========================
  // - Sous-jeu de collection : ?id=<collection>&uid=<uid>
  // - Jeu normal / parent      : ?id=<id>   (⚠️ PAS de uid)
  // - Fallback                 : ?uid=<uid>
  function buildGameUrl(g) {
    const base = (g && g._openBase) ? String(g._openBase).trim() : APP_PATH;

    const coll = (g && g.collection != null) ? String(g.collection).trim() : "";
    const id   = (g && g.id != null)         ? String(g.id).trim() : "";
    const uid  = (g && g.uid != null)        ? String(g.uid).trim() : "";

    const params = new URLSearchParams();

    if (coll && uid) {
      // ✅ sous-jeu de collection : thread parent + uid
      params.set("id", coll);
      params.set("uid", uid);
    } else if (id) {
      // ✅ jeu normal : id seulement (comme tes viewers)
      params.set("id", id);
    } else if (uid) {
      // fallback uid only
      params.set("uid", uid);
    }

    const qs = params.toString();
    if (!qs) return base;

    return base.includes("?") ? (base + "&" + qs) : (base + "?" + qs);
  }

  function getDisplayTitle(g) {
    return (g.gameData?.title || g.cleanTitle || g.title || "").toString().trim() || "Sans titre";
  }

  // =========================
  // ✅ Etat global
  // =========================
  const state = {
    all: [],
    filtered: [],
    q: "",
    sort: "updatedAtLocal-desc",
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
  const MAIN_PAGE_ID = `t:${String(SLUG || "root").trim()}:page:index`;
  let MAIN_VIEW_HIT_DONE = false;

  function formatInt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "0";
    try { return x.toLocaleString("fr-FR"); }
    catch { return String(Math.floor(x)); }
  }



  // =========================
  // Helpers temps
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


  function formatRatingForCard(avg, count) {
    const a = Number(avg || 0);
    const c = Number(count || 0);
    if (c <= 0 || a <= 0) return "—";

    const rounded = Math.round(a * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${text}/4`;
  }

  // =========================
  // ✅ UID ONLY — clés compteurs
  // =========================
  function counterKeyOfUid(uid, slugOverride = "") {
    const u = String(uid ?? "").trim();
    const slug = String(slugOverride || SLUG || "root").trim();
    return u ? `t:${slug}:uid:${u}` : "";
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

  const GAME_RATINGS = {
    byKey: new Map(),
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
      return j.stats;
    } catch {
      return {};
    }
  }

  async function ensureGameRatingsLoaded() {
    if (GAME_RATINGS.loaded) return;

    const keys = state.all.map((g) => g.ckey).filter(Boolean);
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

  async function forceReloadGameRatings() {
    GAME_RATINGS.loaded = false;
    GAME_RATINGS.byKey.clear();
    await ensureGameRatingsLoaded();
  }

  async function ensureGameStatsLoaded() {
    if (GAME_STATS.loaded) return;

    const keys = state.all.map((g) => g.ckey).filter(Boolean);
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
  
      const el = document.getElementById("mainViews");
      if (el) el.textContent = formatInt(j.views);
    } catch {}
  }

  // =========================
  // Helpers URL / prefs / list
  // =========================
  function getListUrl() {
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

  function getViewerCols() {
    try { return (localStorage.getItem("viewerCols") || "auto").trim() || "auto"; }
    catch { return "auto"; }
  }

  function setViewerCols(v) {
    try { localStorage.setItem("viewerCols", String(v)); }
    catch {}
  }

  // =========================
  // ✅ Mode "ALL" : fusion de toutes les listes via traducteurs_manifest.json
  // =========================
  async function loadAllLists() {
    const manifestUrl = "/traducteurs_manifest.json";
    const mr = await fetch(manifestUrl, { cache: "no-store" });
    if (!mr.ok) throw new Error("HTTP " + mr.status + " sur " + manifestUrl);
    const manifest = await mr.json();
    const list = Array.isArray(manifest)
      ? manifest
      : (manifest && Array.isArray(manifest.traducteurs))
      ? manifest.traducteurs
      : [];

    const combined = [];
    for (const t of list) {
      const name = (t && (t.name || t.key || t.slug) || "").toString().trim() || "Traducteur";
      const listUrl = (t && t.listUrl ? String(t.listUrl) : "").trim();
      if (!listUrl) continue;

      try {
        const r = await fetch(listUrl, { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const raw = await r.json();

        const games = Array.isArray(raw) ? raw
          : (raw && Array.isArray(raw.games)) ? raw.games
          : (raw && Array.isArray(raw.items)) ? raw.items
          : [];

        for (const g of games) {
          if (!g || typeof g !== "object") continue;
          if (!g._translator) g._translator = name;
          if (!g._translatorKey && t && t.key) g._translatorKey = String(t.key);
          if (!g._openBase && t && t.openBase) g._openBase = String(t.openBase);
          combined.push(g);
        }
      } catch (e) {
        console.warn("[ALL] échec chargement", name, listUrl, e);
      }
    }
    return combined;
  }

  // Promesse globale partagée avec game.js (chargée après viewer.js)
  if (!window.__ALL_DATA_PROMISE__) {
    window.__ALL_DATA_PROMISE__ = loadAllLists().then(arr => {
      window.__ALL_GAMES__ = arr;
      return arr;
    });
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
    wolfrpg: "Wolf RPG",
    "wolf rpg": "Wolf RPG",
  };

  const SEP_RE = /[\u2014\u2013\-:]/;
  const ucFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

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

    categories = categories.filter((c) => CAT_ALLOWED.includes(c));
    engines = engines.filter((e) => ENGINE_ALLOWED.includes(e));

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

    const updatedAtTs = parseFrenchDate(game.updatedAt);
    const releaseDateTs = parseFrenchDate(game.releaseDate);

    const updatedAtLocalRaw = game.updatedAtLocal || "";
    const createdAtLocalRaw = game.createdAtLocal || "";
    const updatedAtLocalParsed = updatedAtLocalRaw ? Date.parse(updatedAtLocalRaw) : NaN;
    const createdAtLocalParsed = createdAtLocalRaw ? Date.parse(createdAtLocalRaw) : NaN;

    const updatedAtLocalTs = !Number.isNaN(updatedAtLocalParsed) ? updatedAtLocalParsed : 0;
    const createdAtLocalTs = !Number.isNaN(createdAtLocalParsed) ? createdAtLocalParsed : 0;

    const translatorSlug = String(game._translatorKey || game._translator || "").trim().toLowerCase();
    const ckey = counterKeyOfUid(uid, translatorSlug);

    // moteur : priorité gameData.engine si présent
    let engines = Array.isArray(c.engines) ? c.engines : [];
    if (game.gameData?.engine) {
      const engNorm = ENGINE_RAW[slugify(game.gameData.engine)] || game.gameData.engine;
      engines = [engNorm];
    }

    return {
      uid,
      ckey,
      collection: coll,
      id: String(game.id || ""),
      rawTitle: displayTitleRaw,
      title: c.title,
      gameData: game.gameData || null,
      categories: c.categories,
      category: c.categories[0] || null,
      engines,
      engine: engines[0] || null,
      status: (c.status === "En cours" || STATUS_ALLOWED.includes(c.status)) ? c.status : "En cours",
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
  // TAGS MULTI (popover + save)
  // =========================
  const TAGS_STORE_KEY = `viewerSelectedTags:${SLUG || "root"}`;

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
    try { localStorage.setItem(TAGS_STORE_KEY, JSON.stringify(tags || [])); } catch {}
  }

  function clearSavedTags() {
    try { localStorage.removeItem(TAGS_STORE_KEY); } catch {}
  }

  function ensureTagsDom() {
    let btn = document.getElementById("tagsBtn");
    if (!btn) return null;

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
    const dom = ensureTagsDom();
    if (!dom) return;
    const { btn, pop } = dom;
    const list = document.getElementById("tagsList");
    if (!list) return;

    const renderTagList = () => {
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
        if (isOpen) { closeTagsPopover(); return; }

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

      document.addEventListener("click", (e) => {
        const t = e.target;
        const tagsBtn = document.getElementById("tagsBtn");
        const tagsPop = document.getElementById("tagsPopover");
        if (tagsPop && tagsBtn && !tagsPop.contains(t) && !tagsBtn.contains(t)) closeTagsPopover();
      });

      window.addEventListener("resize", () => {
        const tp = document.getElementById("tagsPopover");
        const tb = document.getElementById("tagsBtn");
        if (tp && tb && !tp.classList.contains("hidden")) positionTagsPopover(tp, tb);
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeTagsPopover();
      });
    }

    updateTagsCountBadge();
    renderTagList();
  }

  // =========================
  // Render / tri / filtres
  // =========================
  function badgesLineHtml(g) {
    const out = [];
    const cats = Array.isArray(g.categories) ? g.categories : [];
    const engs = Array.isArray(g.engines) ? g.engines : [];

    for (const cat of cats) {
      if (CAT_ALLOWED.includes(cat)) out.push(`<span class="badge cat cat-${slugify(cat)}">${escapeHtml(cat)}</span>`);
    }
    for (const e of engs) {
      if (ENGINE_ALLOWED.includes(e)) out.push(`<span class="badge eng eng-${slugify(e)}">${escapeHtml(e)}</span>`);
    }
    if (g.status) out.push(`<span class="badge status status-${slugify(g.status)}">${escapeHtml(g.status)}</span>`);
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

    if (k === "views") {
      state.filtered.sort((a, b) => ((GAME_STATS.views.get(a.ckey) || 0) - (GAME_STATS.views.get(b.ckey) || 0)) * mul
        || ((a.updatedAtLocalTs || 0) - (b.updatedAtLocalTs || 0)) * mul
        || a.title.localeCompare(b.title)
      );
      return;
    }

    if (k === "mega") {
      state.filtered.sort((a, b) => ((GAME_STATS.mega.get(a.ckey) || 0) - (GAME_STATS.mega.get(b.ckey) || 0)) * mul
        || ((a.updatedAtLocalTs || 0) - (b.updatedAtLocalTs || 0)) * mul
        || a.title.localeCompare(b.title)
      );
      return;
    }

    if (k === "likes") {
      state.filtered.sort((a, b) => ((GAME_STATS.likes.get(a.ckey) || 0) - (GAME_STATS.likes.get(b.ckey) || 0)) * mul
        || ((a.updatedAtLocalTs || 0) - (b.updatedAtLocalTs || 0)) * mul
        || a.title.localeCompare(b.title)
      );
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
      const mq = !q
        || g.title.toLowerCase().includes(q)
        || String(g.id || "").includes(q)
        || String(g.uid || "").includes(q);

      const mc = fc === "all" || (Array.isArray(g.categories) ? g.categories.includes(fc) : false);
      const me = fe === "all" || (Array.isArray(g.engines) ? g.engines.includes(fe) : false);
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
    if (!grid) return;

    grid.innerHTML = "";

    if (!state.filtered.length) {
      empty?.classList.remove("hidden");
      updateStats();
      return;
    }
    empty?.classList.add("hidden");

    applyGridCols();

    const total = state.filtered.length;

    if (!state.visibleCount || state.visibleCount < 0) {
      state.visibleCount = state.pageSize === "all" ? total : Math.min(total, state.pageSize);
    }

    const limit = state.pageSize === "all" ? total : Math.min(total, state.visibleCount);
    const frag = document.createDocumentFragment();

    for (let i = 0; i < limit; i++) {
      const g = state.filtered[i];
      // ✅ Toute la tuile est cliquable
      const pageHref = buildGameUrl(g.__raw || g);
      const card = document.createElement("a");
      card.className = "card card-link";
      card.href = pageHref;
      card.target = "_blank";
      card.rel = "noopener";

      const trKey =
        (g.__raw && (g.__raw._translatorKey || g.__raw._translator)) ? String(g.__raw._translatorKey || g.__raw._translator) :
        (g.__raw && g.__raw._translator) ? String(g.__raw._translator) :
        "";

      card.dataset.tr = trKey.toLowerCase();

      const imgSrc = (g.image || "").trim() || "/favicon.png";
      const translationText = formatRelativeTranslationTime(g.updatedAtLocalTs || g.createdAtLocalTs || 0);
      const translationTitle = formatAbsoluteDateTime(g.updatedAtLocalTs || g.createdAtLocalTs || 0);
      const views = GAME_STATS.views.get(g.ckey) || 0;
      const mega = GAME_STATS.mega.get(g.ckey) || 0;
      const likes = GAME_STATS.likes.get(g.ckey) || 0;
      const rating = GAME_RATINGS.byKey.get(g.ckey) || { avg: 0, count: 0, sum: 0 };
      const ratingText = formatRatingForCard(rating.avg, rating.count);

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

  $("#pageSize")?.addEventListener("change", (e) => {
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
    setViewerCols(state.cols);
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

    $("#filterCat") && ($("#filterCat").value = "all");
    $("#filterEngine") && ($("#filterEngine").value = "all");
    $("#filterStatus") && ($("#filterStatus").value = "all");

    clearSavedTags();
    updateTagsCountBadge();
    closeTagsPopover();

    state.pageSize = 50;
    $("#pageSize") && ($("#pageSize").value = "50");

    GAME_STATS.loaded = false;
    GAME_STATS.views.clear();
    GAME_STATS.mega.clear();
    GAME_STATS.likes.clear();

    // ✅ refresh annonce (template)
    try {
      if (window.viewerAnnonce && typeof window.viewerAnnonce.refresh === "function") {
        window.viewerAnnonce.refresh();
      }
    } catch {}

    init();
  });

  // =========================
  // Init
  // =========================
  async function init() {
    $("#grid") && ($("#grid").innerHTML = "");
    $("#gridEmpty")?.classList.add("hidden");

    try {
      state.cols = getViewerCols();
      const colsSel = $("#cols");
      if (colsSel) colsSel.value = state.cols;

      const raw = await (window.__ALL_DATA_PROMISE__ || loadAllLists());
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
    } catch (e) {
      console.error("[viewer] load error:", e);

      $("#grid") && ($("#grid").innerHTML = "");
      const ge = $("#gridEmpty");
      if (ge) {
        ge.textContent = "Erreur de chargement";
        ge.classList.remove("hidden");
      }

      // ✅ si annonce dispo, tu peux afficher une maintenance si tu veux
      try {
        if (window.viewerAnnonce && typeof window.viewerAnnonce.setMaintenance === "function") {
          window.viewerAnnonce.setMaintenance("Impossible de charger la liste pour le moment.");
        }
      } catch {}
    }
  }

  // ✅ Annonce template
  initAnnonceTemplate();

  // ✅ Menu hamburger (compatible extensions)
  initHamburgerMenu();

  init();
})();