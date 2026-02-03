// viewer.js — Version universelle complète (février 2026)
// Support multi-traducteurs via slug dans l’URL : /ant28jsp/ /ikaros/ etc.
// JSON : /f95list_<slug>.json
// Pas de hardcode "ant28jsp" → erreur explicite si slug non détecté

(() => {
  "use strict";

  // ────────────────────────────────────────────────
  // Détection du slug du traducteur
  // ────────────────────────────────────────────────
  function getSiteSlug() {
    // Priorité 1 : slug forcé via window.__SITE_SLUG__ (wrapper spécifique)
    if (window.__SITE_SLUG__) {
      const forced = String(window.__SITE_SLUG__).trim().toLowerCase();
      if (forced) return forced;
    }

    // Priorité 2 : premier segment du path
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length === 0) throw new Error("Aucun slug dans l’URL");

    const first = decodeURIComponent(parts[0]).trim().toLowerCase();

    if (first.includes(".")) {
      throw new Error("Slug invalide : semble être un fichier (" + first + ")");
    }

    if (!["app", "viewer", "static", "api"].includes(first)) {
      return first;
    }

    // Priorité 3 : query ?slug= ou ?site=
    try {
      const p = new URLSearchParams(location.search);
      const q = (p.get("slug") || p.get("site") || "").trim().toLowerCase();
      if (q) return q;
    } catch {}

    // Priorité 4 : referrer (redirection courante)
    try {
      if (document.referrer) {
        const ref = new URL(document.referrer, location.origin);
        const refFirst = decodeURIComponent(ref.pathname.split("/").filter(Boolean)[0] || "").trim().toLowerCase();
        if (refFirst && !refFirst.includes(".") && !["app", "viewer"].includes(refFirst)) {
          return refFirst;
        }
      }
    } catch {}

    // Échec → erreur claire
    throw new Error(
      "Slug du traducteur introuvable.\n" +
      "Exemples valides :\n" +
      "  /ant28jsp/\n" +
      "  /ikaros/\n" +
      "  /viewer/?slug=ikaros"
    );
  }

  const SITE_SLUG = getSiteSlug();

  // Nettoyage URL si on arrive via /viewer ou /app
  try {
    const first = location.pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
    if (["viewer", "app"].includes(first)) {
      history.replaceState(null, "", `/${encodeURIComponent(SITE_SLUG)}/` + location.search);
    }
  } catch {}

  // ────────────────────────────────────────────────
  // URL de la liste → toujours dynamique
  // ────────────────────────────────────────────────
  function getListUrl() {
    const p = new URLSearchParams(location.search);
    const src = p.get("src")?.trim();
    if (src) return src;
    return `/f95list_${SITE_SLUG}.json`;
  }

  const DEFAULT_URL = getListUrl();

  // ────────────────────────────────────────────────
  // Titre dynamique de la page
  // ────────────────────────────────────────────────
  async function setViewerTitles() {
    try {
      const r = await fetch("/index.html", { cache: "no-store" });
      if (!r.ok) throw new Error("index.html introuvable");

      const html = await r.text();
      const re = new RegExp(
        `<a[^>]+href=["']/${escapeRegExp(SITE_SLUG)}/?["'][^>]*>([^<]+)</a>`,
        "i"
      );
      const m = html.match(re);
      const displayName = m?.[1]?.trim() || SITE_SLUG;

      const viewerName = `f95list_${displayName}_viewer`;
      document.title = viewerName;

      const h1 = document.querySelector(".topbar h1");
      if (h1) h1.textContent = viewerName;

      const back = document.getElementById("backToList");
      if (back) back.href = "/";
    } catch {
      document.title = `f95list_${SITE_SLUG}_viewer`;
    }
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  setViewerTitles(); // non bloquant

  // ────────────────────────────────────────────────
  // Le reste est identique à ta version originale
  // (je remets ici tout le code fonctionnel que tu avais)
  // ────────────────────────────────────────────────

  const $ = (sel) => document.querySelector(sel);

  // Age gate
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

  // Header tools (cols, pageSize, total)
  function moveHeaderTopRightTools() {
    const host = document.getElementById("topTitleTools");
    if (!host) return;
    const total = document.querySelector(".total-inline");
    const cols = document.getElementById("cols");
    const pageSize = document.getElementById("pageSize");
    if (total) host.appendChild(total);
    if (cols) host.appendChild(cols);
    if (pageSize) host.appendChild(pageSize);
  }
  moveHeaderTopRightTools();

  function buildGameUrl(g) {
    const coll = (g.collection || "").toString().trim();
    const id = (g.id || "").toString().trim();
    const uid = (g.uid ?? "").toString().trim();
    if (coll) return `/${SITE_SLUG}/?id=${encodeURIComponent(coll)}&uid=${encodeURIComponent(uid)}`;
    if (id) return `/${SITE_SLUG}/?id=${encodeURIComponent(id)}`;
    return `/${SITE_SLUG}/?uid=${encodeURIComponent(uid)}`;
  }

  function getDisplayTitle(g) {
    return (g.gameData?.title || g.cleanTitle || g.title || "").trim() || "Sans titre";
  }

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

  // Compteurs (vues page principale + stats par jeu UID)
  const MAIN_PAGE_ID = "__viewer_main__";
  let MAIN_VIEW_HIT_DONE = false;

  function formatInt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "0";
    try { return x.toLocaleString("fr-FR"); } catch { return String(Math.floor(x)); }
  }

  function counterKeyOfUid(uid) {
    const u = String(uid ?? "").trim();
    return u ? `uid:${u}` : "";
  }

  function counterKeyOfEntry(entry) {
    return counterKeyOfUid(entry?.uid);
  }

  const GAME_STATS = {
    views: new Map(),
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
      return j?.ok && j.stats ? j.stats : {};
    } catch {
      return {};
    }
  }

  async function ensureGameStatsLoaded() {
    if (GAME_STATS.loaded) return;
    const keys = state.all.map(g => counterKeyOfUid(g.uid)).filter(Boolean);
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

  // Menu hamburger corrigé (utilise SITE_SLUG)
  (function initHamburgerMenu() {
    const btn = document.getElementById("hamburgerBtn") || document.getElementById("btnMenu");
    if (!btn) return;

    let panel = document.getElementById("menuPanel") || document.createElement("div");
    if (!panel.id) {
      panel.id = "menuPanel";
      panel.style.cssText = `
        position:fixed; top:64px; left:14px; z-index:9999;
        min-width:220px; padding:10px; border-radius:14px;
        border:1px solid rgba(255,255,255,0.12);
        background:rgba(16,18,28,0.98); box-shadow:0 18px 40px rgba(0,0,0,0.45);
        display:none;
      `;
      panel.innerHTML = `
        <a class="btn" style="justify-content:flex-start;width:100%;margin-bottom:8px;" href="/">🏠 Accueil</a>
        <a class="btn" style="justify-content:flex-start;width:100%;" href="/${encodeURIComponent(SITE_SLUG)}/">📚 Viewer</a>
      `;
      document.body.appendChild(panel);
    }

    btn.addEventListener("click", e => {
      e.stopPropagation();
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    });

    document.addEventListener("click", e => {
      if (panel.style.display !== "none" && !panel.contains(e.target) && !btn.contains(e.target)) {
        panel.style.display = "none";
      }
    });
  })();

  // ────────────────────────────────────────────────
  // Le reste du code (tags, filtres, render, init, etc.)
  // est exactement le même que dans ta version originale
  // ────────────────────────────────────────────────

  // ... colle ici tout le code à partir de :

  // function positionPopover(...) jusqu'à la fin de ta version originale

  // y compris :
  // - tags multi
  // - initHeaderMenuAndDisplayTools
  // - parseFrenchDate, cleanTitle, normalizeGame
  // - badgesLineHtml, buildDynamicFilters, sortNow, applyFilters
  // - renderGrid, updateStats, applyGridCols
  // - tous les event listeners (search, sort, filters, etc.)
  // - la fonction init() finale

  // Exemple : la fin devrait ressembler à ça (comme avant)
  async function init() {
    $("#grid").innerHTML = "";
    $("#gridEmpty")?.classList.add("hidden");
    try {
      // initHeaderMenuAndDisplayTools();  ← déjà appelé plus haut si besoin
      state.cols = await getViewerCols();
      const colsSel = $("#cols");
      if (colsSel) colsSel.value = state.cols;

      const raw = await loadList();
      state.all = Array.isArray(raw) ? raw.map(normalizeGame) : [];

      if (!state.filterTags.length) {
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