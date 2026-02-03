"use strict";

// ────────────────────────────────────────────────
// Détection du slug du traducteur (identique à viewer.js)
// ────────────────────────────────────────────────
function getSiteSlug() {
  // 1. Slug forcé (wrapper spécifique)
  if (window.__SITE_SLUG__) {
    const forced = String(window.__SITE_SLUG__).trim().toLowerCase();
    if (forced) return forced;
  }

  const parts = location.pathname.split("/").filter(Boolean);
  if (parts.length === 0) throw new Error("Aucun slug dans l’URL");

  const first = decodeURIComponent(parts[0]).trim().toLowerCase();

  if (first.includes(".")) {
    throw new Error("Slug invalide : semble être un fichier (" + first + ")");
  }

  if (!["app", "viewer", "static", "api"].includes(first)) {
    return first;
  }

  // Query ?slug= ou ?site=
  try {
    const p = new URLSearchParams(location.search);
    const q = (p.get("slug") || p.get("site") || "").trim().toLowerCase();
    if (q) return q;
  } catch {}

  // Referrer (redirection)
  try {
    if (document.referrer) {
      const ref = new URL(document.referrer, location.origin);
      const refFirst = decodeURIComponent(ref.pathname.split("/").filter(Boolean)[0] || "").trim().toLowerCase();
      if (refFirst && !refFirst.includes(".") && !["app", "viewer"].includes(refFirst)) {
        return refFirst;
      }
    }
  } catch {}

  throw new Error(
    "Slug du traducteur introuvable.\n" +
    "Exemples valides :\n" +
    "  /ant28jsp/?id=12345\n" +
    "  /ikaros/?uid=678\n" +
    "  /viewer/?slug=ikaros&id=12345"
  );
}

const SITE_SLUG = getSiteSlug();

// Base path dynamique : /<slug>/
const APP_PATH = `/${encodeURIComponent(SITE_SLUG)}/`;

// ────────────────────────────────────────────────
// URL de la liste JSON → toujours dynamique
// ────────────────────────────────────────────────
function getListUrl() {
  const p = new URLSearchParams(location.search);
  const src = p.get("src")?.trim();
  if (src) return src;
  return `/f95list_${SITE_SLUG}.json`;
}

const DEFAULT_URL = getListUrl();

// ────────────────────────────────────────────────
// Helpers UI de base
// ────────────────────────────────────────────────
function $(id) {
  return document.getElementById(id);
}

function setBtn(id, href) {
  const el = $(id);
  if (!el) return;
  if (href?.trim()) {
    el.href = href.trim();
    el.style.display = "";
  } else {
    el.removeAttribute("href");
    el.style.display = "none";
  }
}

function setHref(id, href) {
  setBtn(id, href); // alias
}

function setHtml(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html ?? "";
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text ?? "";
}

function show(id, cond) {
  const el = $(id);
  if (el) el.style.display = cond ? "" : "none";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function makeBtn(href, label, emoji = "") {
  const a = document.createElement("a");
  a.className = "btn";
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.href = href || "#";
  if (!href) a.classList.add("disabled");
  a.textContent = (emoji ? emoji + " " : "") + label;
  return a;
}

// ────────────────────────────────────────────────
// Parsing dates françaises
// ────────────────────────────────────────────────
function parseFrenchDateFR(s) {
  const str = String(s || "").trim().toLowerCase();
  if (!str) return 0;
  const months = {
    "janvier": 0, "février": 1, "fevrier": 1, "mars": 2, "avril": 3,
    "mai": 4, "juin": 5, "juillet": 6, "août": 7, "aout": 7,
    "septembre": 8, "octobre": 9, "novembre": 10, "décembre": 11, "decembre": 11
  };
  const m = str.match(/(\d{1,2})\s+([a-zéûîôàèùç]+)\s+(\d{4})/i);
  if (!m) return 0;
  const day = parseInt(m[1], 10);
  const mon = months[m[2]];
  const year = parseInt(m[3], 10);
  if (!Number.isFinite(day) || !Number.isFinite(year) || mon === undefined) return 0;
  const d = new Date(year, mon, day, 12, 0, 0);
  return d.getTime();
}

// ────────────────────────────────────────────────
// Nettoyage titre + badges (inchangé)
// ────────────────────────────────────────────────
const CAT_ALLOWED = ["VN", "Collection"];
const ENGINE_ALLOWED = ["Ren'Py", "RPGM", "Unity", "Unreal Engine", "HTML", "Java", "Flash", "QSP", "WebGL", "RAGS", "Tads", "ADRIFT", "Others", "Wolf RPG"];
const STATUS_ALLOWED = ["Completed", "Abandoned", "Onhold"];

const ENGINE_RAW = {
  renpy: "Ren'Py", "ren'py": "Ren'Py",
  rpgm: "RPGM", rpgmaker: "RPGM", rpgmakermv: "RPGM", rpgmakermz: "RPGM",
  unity: "Unity",
  unreal: "Unreal Engine", "unrealengine": "Unreal Engine", "unreal engine": "Unreal Engine", ue4: "Unreal Engine", ue5: "Unreal Engine",
  html: "HTML", html5: "HTML", web: "HTML",
  java: "Java", flash: "Flash", qsp: "QSP", webgl: "WebGL", rags: "RAGS",
  tads: "Tads", adrift: "ADRIFT",
  others: "Others", other: "Others",
  wolf: "Wolf RPG", wolfrpg: "Wolf RPG"
};

function slug(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const SEP_RE = /[\u2014\u2013\-:]/;
const ucFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

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

    if (norm === "wolf" && tokens[i + 1]?.toLowerCase().replace(/[^\w']/g, "") === "rpg") {
      if (!engines.includes("Wolf RPG")) engines.push("Wolf RPG");
      cut = i + 2; i++;
      continue;
    }

    if (norm === "wolf") break;

    if (norm === "flash") {
      if (!engines.includes("Flash")) engines.push("Flash");
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

  categories = categories.filter(c => CAT_ALLOWED.includes(c));
  engines = engines.filter(e => ENGINE_ALLOWED.includes(e));

  if (!othersExplicit && engines.includes("Others") && engines.some(e => e !== "Others")) {
    engines = engines.filter(e => e !== "Others");
  }

  return { title: t, categories, engines, status };
}

// ────────────────────────────────────────────────
// Routing + Collections + Séries (adapté avec SITE_SLUG)
// ────────────────────────────────────────────────
function buildGameUrl(g) {
  const coll = String(g.collection || "").trim();
  const id = String(g.id || "").trim();
  const uid = String(g.uid ?? "").trim();

  if (coll) return `${APP_PATH}?id=${encodeURIComponent(coll)}&uid=${encodeURIComponent(uid)}`;
  if (id) return `${APP_PATH}?id=${encodeURIComponent(id)}`;
  return `${APP_PATH}?uid=${encodeURIComponent(uid)}`;
}

function getDisplayTitle(g) {
  const id = String(g?.id || "").trim();
  const col = String(g?.collection || "").trim();
  if (!id && col) {
    return String(g?.gameData?.title || "").trim();
  }
  return String(g?.cleanTitle || g?.title || "").trim();
}

function getCollectionChildTitle(g) {
  return String(g?.gameData?.title || "").trim();
}

// ... (le reste du code pour series, resolveGamePage, etc. reste identique à ta version originale)

(async function main() {
  try {
    initHamburgerMenu(); // ← utilise SITE_SLUG maintenant

    const { id: idParam, uid: uidParam } = getParamsFromUrl();
    if (!idParam && !uidParam) {
      showError(`Aucun paramètre dans l’URL. Exemples :\n${APP_PATH}?id=12345\n${APP_PATH}?uid=678`);
      return;
    }

    const listUrl = getListUrl();
    const raw = await fetch(listUrl, { cache: "no-store" }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status} sur ${listUrl}`);
      return r.json();
    });

    const list = extractGames(raw);
    const page = resolveGamePage({ id: idParam, uid: uidParam }, list);

    if (page.kind === "notfound") {
      showError(`Jeu introuvable (id=${idParam || "-"} uid=${uidParam || "-"})`);
      return;
    }

    // ... (le reste de la logique de rendu reste exactement comme dans ton code original)

    // Seul changement notable : counterKey basé sur UID uniquement
    const counterKey = buildCounterKeyFromEntry(page.entry);
    await initCounters(counterKey, megaHref, archiveHref);

    // Rating, stats, etc. inchangés

  } catch (e) {
    showError(`Erreur: ${e?.message || String(e)}`);
    console.error(e);
  }
})();
