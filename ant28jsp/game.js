"use strict";

// ============================================================================
// ✅ Harmonisation DOM (IDs/classes) avec game.andric31.js
// Objectif : pouvoir réutiliser exactement le même CSS de thème.
// - Ne change pas les liens / la logique métier
// - Renomme uniquement (ou crée des alias) côté DOM quand nécessaire
// ============================================================================
function normalizeDomIdsForSharedTheme() {
  const aliasId = (fromId, toId) => {
    const to = document.getElementById(toId);
    if (to) return to;
    const from = document.getElementById(fromId);
    if (!from) return null;
    try { from.id = toId; } catch {}
    return from;
  };

  // Hamburger: on force l'ID "hamburgerBtn" (game.andric31)
  aliasId("hamburgerBtnGame", "hamburgerBtn");
  aliasId("hamburgerBtnViewer", "hamburgerBtn");

  // Boutons principaux : si un ancien id existe, on le renomme vers l'id standard
  aliasId("discordBtn", "btnDiscord");
  aliasId("f95Btn", "btnF95");
  aliasId("megaBtn", "btnMega");
  aliasId("archivesBtn", "archiveLink");

  // Like
  aliasId("likeBtn", "btnLike");
}

// ============================================================================
// ✅ Détection universelle SLUG + chemins
// ============================================================================
function detectSlug() {
  // 1) override possible depuis index.html : window.__SITE_SLUG__ = "ikaros";
  try {
    const forced = (window.__SITE_SLUG__ || "").toString().trim();
    if (forced) return forced.toLowerCase();
  } catch {}

  // 2) sinon, 1er segment du pathname : /ikaros/ -> ikaros
  const segs = (location.pathname || "/").split("/").filter(Boolean);
  const s = (segs[0] || "").trim().toLowerCase();
  return s;
}

const SLUG = detectSlug();                           // "ikaros" / "ant28jsp" / "..."
const APP_PATH = SLUG ? `/${SLUG}/` : `/`;           // base pour cette mini-app (pas de /game)
const DEFAULT_URL = SLUG ? `/f95list_${SLUG}.json` : `/f95list.json`;

// ============================================================================
// Helpers URL / JSON
// ============================================================================
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

function getParamsFromUrl() {
  try {
    const p = new URLSearchParams(location.search);
    const id = (p.get("id") || "").trim();
    const uid = (p.get("uid") || "").trim();
    return { id: id || "", uid: uid || "" };
  } catch {
    return { id: "", uid: "" };
  }
}

function extractGames(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const candidates = ["games", "list", "items", "data", "rows", "results"];
  for (const k of candidates) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  for (const k of Object.keys(raw)) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
  return await r.json();
}

// "25 décembre 2024" -> timestamp (ms)
function parseFrenchDateFR(s) {
  const str = String(s || "").trim().toLowerCase();
  if (!str) return 0;
  const months = {
    "janvier": 0,
    "février": 1, "fevrier": 1,
    "mars": 2,
    "avril": 3,
    "mai": 4,
    "juin": 5,
    "juillet": 6,
    "août": 7, "aout": 7,
    "septembre": 8,
    "octobre": 9,
    "novembre": 10,
    "décembre": 11, "decembre": 11,
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

// ============================================================================
// UI helpers
// ============================================================================
function formatRelativeTranslationTime(ts) {
  const t = Number(ts || 0);
  if (!Number.isFinite(t) || t <= 0) return "—";

  const delta = Math.max(0, Date.now() - t);
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
    return `${n} heure${n > 1 ? "s" : ""}`;
  }

  if (delta < WEEK) {
    const n = Math.max(1, Math.floor(delta / DAY));
    return `${n} jour${n > 1 ? "s" : ""}`;
  }

  if (delta < 5 * WEEK) {
    const n = Math.max(1, Math.floor(delta / WEEK));
    return `${n} semaine${n > 1 ? "s" : ""}`;
  }

  if (delta < YEAR) {
    const n = Math.max(1, Math.floor(delta / MONTH));
    return `${n} mois`;
  }

  const n = Math.max(1, Math.floor(delta / YEAR));
  return `${n} an${n > 1 ? "s" : ""}`;
}

function formatAbsoluteDateTime(ts, fallback = "Date inconnue") {
  const t = Number(ts || 0);
  if (!Number.isFinite(t) || t <= 0) return fallback;
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

function formatAbsoluteDateOnly(ts, fallback = "Date inconnue") {
  const t = Number(ts || 0);
  if (!Number.isFinite(t) || t <= 0) return fallback;
  try {
    return new Date(t).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return new Date(t).toISOString().slice(0, 10);
  }
}

function setStatMeta(entry) {
  const updatedAtLocalRaw = entry?.updatedAtLocal || "";
  const createdAtLocalRaw = entry?.createdAtLocal || "";
  const updatedAtRaw = entry?.updatedAt || "";

  const updatedAtLocalTs = updatedAtLocalRaw ? Date.parse(updatedAtLocalRaw) : NaN;
  const createdAtLocalTs = createdAtLocalRaw ? Date.parse(createdAtLocalRaw) : NaN;
  const lastTranslationTs = !Number.isNaN(updatedAtLocalTs)
    ? updatedAtLocalTs
    : (!Number.isNaN(createdAtLocalTs) ? createdAtLocalTs : 0);

  setText("statTranslationTime", formatRelativeTranslationTime(lastTranslationTs));

  const translationWrap = $("statTranslationWrap");
  if (translationWrap) {
    translationWrap.title = formatAbsoluteDateTime(lastTranslationTs, updatedAtRaw || "Date de traduction inconnue");
  }

  setText("statAddedDate", formatAbsoluteDateOnly(!Number.isNaN(createdAtLocalTs) ? createdAtLocalTs : 0, "—"));
  const addedWrap = $("statAddedWrap");
  if (addedWrap) {
    addedWrap.title = formatAbsoluteDateTime(!Number.isNaN(createdAtLocalTs) ? createdAtLocalTs : 0, "Date d’ajout inconnue");
  }
}

function setStatRating(avg, count) {
  const a = Number(avg || 0);
  const c = Number(count || 0);
  const text = c > 0 && a > 0 ? `${a.toFixed(1)}/4` : "—";
  setText("statRating", text);
  const wrap = $("statRatingWrap");
  if (wrap) wrap.title = c > 0 && a > 0 ? `${a.toFixed(1)}/4 · ${c} vote${c > 1 ? "s" : ""}` : "Aucune note pour le moment";
}

function $(id) { return document.getElementById(id); }

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setHtml(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html ?? "";
}

function show(id, cond) {
  const el = $(id);
  if (el) el.style.display = cond ? "" : "none";
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text ?? "";
}

function setHref(id, href) {
  const el = $(id);
  if (!el) return;
  if (!href) {
    el.style.display = "none";
    el.removeAttribute("href");
  } else {
    el.style.display = "";
    el.href = href;
  }
}

function showError(msg) {
  const err = $("errBox");
  const card = $("card");
  const stats = $("statsOut");
  if (card) card.style.display = "none";
  if (stats) stats.style.display = "none";
  if (err) {
    err.style.display = "block";
    err.textContent = msg;
  }
}

/**
 * IMPORTANT:
 * - Si pas d'image => on laisse la cover en "placeholder" (PAS de favicon)
 * - Si image cassée => on repasse en placeholder (PAS de favicon)
 */
function setCover(url) {
  const img = $("cover");
  if (!img) return;

  const u = (url || "").trim();
  img.referrerPolicy = "no-referrer";

  if (!u) {
    img.removeAttribute("src");
    img.classList.add("is-placeholder");
    return;
  }

  img.classList.remove("is-placeholder");
  img.src = u;

  img.onerror = () => {
    img.onerror = null;
    img.removeAttribute("src");
    img.classList.add("is-placeholder");
  };
}

function renderTags(tags) {
  const box = $("tags");
  if (!box) return;
  box.innerHTML = "";
  (tags || []).forEach((t) => {
    if (!t) return;
    const s = document.createElement("span");
    s.className = "tagPill";
    s.textContent = String(t);
    box.appendChild(s);
  });
}

// ============================================================================
// ✅ Routing (id central) + Collections + Séries
// ============================================================================
function buildGameUrl(g) {
  const coll = (g.collection || "").toString().trim();
  const id = (g.id || "").toString().trim();
  const uid = (g.uid ?? "").toString().trim();

  if (coll) return `${APP_PATH}?id=${encodeURIComponent(coll)}&uid=${encodeURIComponent(uid)}`;
  if (id) return `${APP_PATH}?id=${encodeURIComponent(id)}`;
  return `${APP_PATH}?uid=${encodeURIComponent(uid)}`;
}

function getDisplayTitle(g) {
  const id = (g?.id || "").toString().trim();
  const col = (g?.collection || "").toString().trim();
  if (!id && col) return (g?.gameData?.title || "").toString().trim();
  return (g?.cleanTitle || g?.title || "").toString().trim();
}

function getCollectionChildTitle(g) {
  return (g?.gameData?.title || "").toString().trim();
}

function getEntryRefs(g) {
  const refs = [];
  const id = (g?.id || "").toString().trim();
  if (id) refs.push(`id:${id}`);
  if (g?.uid !== undefined && g?.uid !== null) refs.push(`uid:${String(g.uid)}`);
  return refs;
}

function buildSeriesIndex(games) {
  const map = new Map(); // ref => [serieObj]
  for (const owner of games || []) {
    const s = owner?.serie;
    if (!s?.name || !Array.isArray(s.refs)) continue;

    const serieObj = {
      name: String(s.name),
      refs: s.refs.map((x) => String(x)),
      ownerUid: owner?.uid,
      ownerId: owner?.id || "",
    };

    for (const ref of serieObj.refs) {
      if (!map.has(ref)) map.set(ref, []);
      map.get(ref).push(serieObj);
    }

    for (const selfRef of getEntryRefs(owner)) {
      if (!map.has(selfRef)) map.set(selfRef, []);
      map.get(selfRef).push(serieObj);
    }
  }
  return map;
}

function getCurrentPageRefs({ kind, idParam, uidParam, entry }) {
  if (kind === "collectionChild") return [`id:${String(idParam)}`, `uid:${String(uidParam)}`];
  return getEntryRefs(entry);
}

function getSeriesForCurrentPage(pageRefs, seriesIndex) {
  const found = [];
  for (const r of pageRefs || []) {
    const arr = seriesIndex.get(r);
    if (arr) found.push(...arr);
  }
  const uniq = new Map();
  for (const s of found) uniq.set(`${s.name}|${s.ownerUid}`, s);
  return [...uniq.values()];
}

function resolveSerieRefsToEntries(serie, games) {
  const out = [];
  for (const ref of serie?.refs || []) {
    const [type, value] = String(ref).split(":");
    if (type === "id") {
      const g = (games || []).find((x) => String(x?.id) === String(value) && !x?.collection);
      if (g) out.push(g);
    } else if (type === "uid") {
      const g = (games || []).find((x) => String(x?.uid) === String(value));
      if (g) out.push(g);
    }
  }
  return out;
}

function resolveGamePage(params, games) {
  const id = (params?.id || "").toString().trim();
  const uid = (params?.uid || "").toString().trim();

  // 1) Sous-jeu de collection
  if (id && uid) {
    const child = (games || []).find(
      (g) => String(g?.uid) === String(uid) && String(g?.collection) === String(id)
    );
    if (!child) return { kind: "notfound" };

    const parent = (games || []).find((g) => String(g?.id) === String(id) && !g?.collection) || null;
    const siblings = (games || [])
      .filter((g) => String(g?.collection) === String(id))
      .sort((a, b) => Number(a?.uid) - Number(b?.uid));

    return { kind: "collectionChild", idParam: id, uidParam: uid, entry: child, parent, siblings };
  }

  // 2) id seul
  if (id) {
    const parentOrGame =
      (games || []).find((g) => String(g?.id) === String(id) && !g?.collection) || null;
    if (!parentOrGame) return { kind: "notfound" };

    const children = (games || [])
      .filter((g) => String(g?.collection) === String(id))
      .sort((a, b) => Number(a?.uid) - Number(b?.uid));

    if (children.length) return { kind: "collectionParent", idParam: id, entry: parentOrGame, children };
    return { kind: "normal", idParam: id, entry: parentOrGame };
  }

  // 3) uid seul
  if (uid) {
    const g = (games || []).find((x) => String(x?.uid) === String(uid)) || null;
    if (!g) return { kind: "notfound" };
    return { kind: "uidOnly", uidParam: uid, entry: g };
  }

  return { kind: "notfound" };
}

// Related container (inséré après tags)
function ensureRelatedContainer() {
  const anchor = document.getElementById("tags");
  if (!anchor) return null;

  let out = document.getElementById("relatedOut");
  if (!out) {
    out = document.createElement("div");
    out.id = "relatedOut";
    out.style.marginTop = "12px";
    out.style.display = "grid";
    out.style.gap = "10px";
    anchor.parentNode.insertBefore(out, anchor.nextSibling);
  }
  return out;
}

function renderCollectionBlockForChild(parent) {
  const parentId = parent?.id ? String(parent.id) : "";
  const href = parentId ? `${APP_PATH}?id=${encodeURIComponent(parentId)}` : "";
  const label = parent ? (parent.cleanTitle || parent.title || parentId) : "Voir la collection";

  return `
    <div class="game-block collection-child-block">
      <h3>📦 Fait partie de la collection</h3>
      ${href ? `<a class="collection-parent-link" href="${href}">${escapeHtml(label)}</a>` : ``}
    </div>
  `;
}

function renderCollectionBlockForParent(parent, children) {
  if (!children || !children.length) return "";

  const items = children
    .map((g) => {
      const t = escapeHtml(getDisplayTitle(g));
      const href = `${APP_PATH}?id=${encodeURIComponent(parent.id)}&uid=${encodeURIComponent(g.uid)}`;
      return `<li><a href="${href}">${t}</a></li>`;
    })
    .join("");

  return `
    <div class="game-block collection-block">
      <h3>📦 Collection</h3>
      <ul class="collection-list">${items}</ul>
    </div>
  `;
}

function renderSeriesBlocks(seriesList, games, currentCanonicalKey) {
  if (!Array.isArray(seriesList) || !seriesList.length) return "";

  return seriesList
    .map((serie) => {
      const items = resolveSerieRefsToEntries(serie, games);
      const li = items
        .map((g) => {
          const t = getCollectionChildTitle(g) || getDisplayTitle(g);
          const href = buildGameUrl(g);

          let key = "";
          const id = (g.id || "").toString().trim();
          const coll = (g.collection || "").toString().trim();
          if (coll) key = `c:${coll}|u:${g.uid}`;
          else if (id) key = `id:${id}`;
          else key = `uid:${g.uid}`;

          const isCurrent = key === currentCanonicalKey;

          return `<li style="margin:4px 0;">
            <a href="${href}" class="btn-link" style="${isCurrent ? "font-weight:700;text-decoration:underline;" : ""}">
              ${escapeHtml(t || "Sans titre")}
            </a>
          </li>`;
        })
        .join("");

      return `
        <div class="game-block serie-block">
          <h3>📚 Série : ${escapeHtml(serie.name)}</h3>
          <ul style="margin:0;padding-left:18px;">${li}</ul>
        </div>
      `;
    })
    .join("");
}

// ============================================================================
// Badges
// ============================================================================
const CAT_ALLOWED = ["VN", "Collection"];
const ENGINE_ALLOWED = ["Ren'Py", "RPGM", "Unity", "Unreal Engine", "HTML", "Java", "Flash", "QSP", "WebGL", "RAGS", "Tads", "ADRIFT", "Others", "Wolf RPG"];
const STATUS_ALLOWED = ["Completed", "Abandoned", "Onhold"];

const ENGINE_RAW = {
  renpy: "Ren'Py",
  "ren'py": "Ren'Py",
  rpgm: "RPGM",
  rpgmaker: "RPGM",
  rpgmakermv: "RPGM",
  rpgmakermz: "RPGM",
  unity: "Unity",
  unreal: "Unreal Engine",
  unrealengine: "Unreal Engine",
  "unreal engine": "Unreal Engine",
  ue4: "Unreal Engine",
  ue5: "Unreal Engine",
  html: "HTML",
  html5: "HTML",
  web: "HTML",
  java: "Java",
  flash: "Flash",
  qsp: "QSP",
  webgl: "WebGL",
  rags: "RAGS",
  tads: "Tads",
  adrift: "ADRIFT",
  others: "Others",
  other: "Others",
  wolf: "Wolf RPG",
  wolfrpg: "Wolf RPG",
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

    if (norm === "wolf" && tokens[i + 1] && tokens[i + 1].toLowerCase().replace(/[^\w']/g, "") === "rpg") {
      if (!engines.includes("Wolf RPG")) engines.push("Wolf RPG");
      cut = i + 2;
      i++;
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

  categories = categories.filter((c) => CAT_ALLOWED.includes(c));
  engines = engines.filter((e) => ENGINE_ALLOWED.includes(e));

  if (!othersExplicit && engines.includes("Others") && engines.some((e) => e !== "Others")) {
    engines = engines.filter((e) => e !== "Others");
  }

  return { title: t, categories, engines, status };
}

function makeBadge(type, value) {
  const b = document.createElement("span");
  b.className = `badge ${type}-${slug(value)}`;
  b.textContent = value;
  return b;
}

function renderBadgesFromGame(display, entry, isCollectionChild) {
  const wrap = $("badges");
  if (!wrap) return;
  wrap.innerHTML = "";

  const childTitle = String(display?.title || "");
  const parentTitle = String(entry?.title || "");

  if (isCollectionChild) wrap.appendChild(makeBadge("cat", "Collection"));

  let c = cleanTitle(isCollectionChild ? childTitle : parentTitle);

  if (!isCollectionChild && c.categories.includes("Collection")) wrap.appendChild(makeBadge("cat", "Collection"));
  if (!isCollectionChild && c.categories.includes("VN")) wrap.appendChild(makeBadge("cat", "VN"));

  if (isCollectionChild) {
    if (display?.engine) {
      const eng = ENGINE_RAW[slug(display.engine)] || display.engine;
      c.engines = [eng];
    } else if (!c.engines || c.engines.length === 0) {
      const cp = cleanTitle(parentTitle);
      c.engines = cp.engines || [];
    }

    if (display?.status) c.status = display.status;
    else if (!c.status) {
      const cp = cleanTitle(parentTitle);
      if (cp.status) c.status = cp.status;
    }
  }

  for (const eng of c.engines || []) wrap.appendChild(makeBadge("eng", eng));
  if (c.status) wrap.appendChild(makeBadge("status", c.status));
}

// ============================================================================
// ✅ Traduction status (F95) — UI propre (version stockée depuis TITLE)
// ============================================================================
async function renderTranslationStatus(game) {
  if (!game?.url) return;

  const maj = document.getElementById("majState");
  const badgesWrap = document.getElementById("badges");
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

  // ✅ storedTitle = titre complet (source de vérité)
  const storedTitle = clean(game.rawTitle || game.title || "");

  // ✅ version "fiable" = extraite du title (pas game.version)
  // ex: "... [v0.12.0] ..." -> "0.12.0"
  const extractVersionFromTitleLocal = (title) => {
    const s = String(title || "");
    let m = s.match(/\[\s*v\s*([0-9][^\]]*)\]/i);
    if (m) return m[1].trim(); // sans le "v"
    m = s.match(/\[\s*([0-9]+(?:\.[0-9]+)+[^\]]*)\]/i);
    if (m) return m[1].trim();
    return "";
  };

  const storedVersionFromTitle = clean(extractVersionFromTitleLocal(storedTitle));
  // On envoie quand même storedVersion au worker (utile si tu veux), mais on ne l'affiche plus comme "stockée"
  const storedVersion = storedVersionFromTitle;

  const SEP = " · ";

  if (maj) {
    maj.style.display = "";
    maj.classList.remove("maj-ok", "maj-ko");
    maj.textContent = "⏳ Vérification F95…";
  }

  try {
    const qs =
      `url=${encodeURIComponent(game.url)}` +
      `&storedTitle=${encodeURIComponent(storedTitle)}` +
      `&storedVersion=${encodeURIComponent(storedVersion)}`;

    const r = await fetch(`/api/f95status?${qs}`, { cache: "no-store" });
    const j = await r.json();

    if (!j?.ok) {
      if (maj) {
        maj.textContent = "⚠️ Vérif F95Zone impossible";
        maj.classList.remove("maj-ok", "maj-ko");
        maj.classList.add("maj-ko");
      }
      return;
    }

    if (!maj) return;
    maj.classList.remove("maj-ok", "maj-ko");

    // ✅ Badge (même logique que game.andric31.js) — pour un CSS partagé
    if (badgesWrap) {
      // évite les doublons
      const prev = badgesWrap.querySelector(".badge[data-f95status='1']");
      if (prev) prev.remove();

      const badge = document.createElement("span");
      badge.classList.add("badge");
      badge.setAttribute("data-f95status", "1");

      if (j.isUpToDate) {
        badge.textContent = "✅ Traduction à jour";
        badge.classList.add("status-updated");
      } else {
        badge.textContent = "🔄 Traduction non à jour";
        badge.classList.add("status-outdated");
      }
      badgesWrap.appendChild(badge);
    }

    if (j.isUpToDate) {
      if (maj) {
        maj.textContent = "✅ Traduction à jour";
        maj.classList.add("maj-ok");
      }
      return;
    }

    // =========================
    // 🔄 NON A JOUR
    // =========================
    let reasonText = clean(j.reasonText || "");

    // ✅ On remplace la "version stockée" par la version extraite du TITLE
    // Pattern worker actuel: "Version différente : stockée vX / F95 vY."
    if (storedVersionFromTitle) {
      reasonText = reasonText.replace(
        /Version différente\s*:\s*stockée\s*v?([0-9][0-9a-zA-Z.\-]*)\s*\/\s*F95\s*v?([0-9][0-9a-zA-Z.\-]*)\.?/i,
        `Version différente : v${storedVersionFromTitle} → v$2`
      );
    } else {
      // fallback si on ne peut pas extraire la version du title
      reasonText = reasonText.replace(
        /Version différente\s*:\s*stockée\s*v?([0-9][0-9a-zA-Z.\-]*)\s*\/\s*F95\s*v?([0-9][0-9a-zA-Z.\-]*)\.?/i,
        "Version différente : v$1 → v$2"
      );
    }

    // Titre différent : stocké ≠ F95. -> Titre différent
    reasonText = reasonText.replace(
      /Titre différent\s*:\s*stocké\s*≠\s*F95\.?/i,
      "Titre différent"
    );

    // enlève point final
    reasonText = reasonText.replace(/\.\s*$/, "");

    let text = "🔄 Traduction non à jour";
    if (reasonText) text += SEP + reasonText;

    maj.textContent = text;
    maj.classList.add("maj-ko");
  } catch {
    if (maj) {
      maj.textContent = "⚠️ Vérif F95Zone impossible";
      maj.classList.remove("maj-ok", "maj-ko");
      maj.classList.add("maj-ko");
    }
  }
}

// ============================================================================
// ✅ MENU ☰ (page game) — réutilise menu racine
// ============================================================================
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

function initHamburgerMenu() {
  // support: viewer + game buttons (IDs differ) + legacy id
  const btns = [];
  const seen = new Set();
  ["hamburgerBtnGame", "hamburgerBtnViewer", "hamburgerBtn"].forEach((id) => {
    const b = document.getElementById(id);
    if (b && !seen.has(b)) { btns.push(b); seen.add(b); }
  });
  if (!btns.length) return;

  try { window.ViewerMenu?.init?.(); } catch {}

  const bindOne = (btn) => {
    if (btn.dataset.boundHamburger === "1") return;
    btn.dataset.boundHamburger = "1";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
    
      // ✅ reconstruit le menu à chaque ouverture (prend le nom à jour)
      try { window.ViewerMenu?.init?.(); } catch {}
    
      const pop = document.getElementById("topMenuPopover");
      if (!pop) return;
    
      const isOpen = !pop.classList.contains("hidden");
      if (isOpen) {
        try { window.ViewerMenu?.closeMenu?.(); } catch { pop.classList.add("hidden"); }
        btn.setAttribute("aria-expanded", "false");
        return;
      }
    
      pop.classList.remove("hidden");
      btn.setAttribute("aria-expanded", "true");
      positionPopover(pop, btn);
    });
  };

  btns.forEach(bindOne);

  if (document.body.dataset.boundHamburgerGlobal === "1") return;
  document.body.dataset.boundHamburgerGlobal = "1";

  document.addEventListener("click", (e) => {
    const pop = document.getElementById("topMenuPopover");
    if (!pop) return;

    const target = e.target;
    // close if click outside pop AND outside all hamburger buttons
    const clickedBtn = btns.some((b) => b.contains(target));
    if (!pop.contains(target) && !clickedBtn) {
      try { window.ViewerMenu?.closeMenu?.(); } catch { pop.classList.add("hidden"); }
      btns.forEach((b) => b.setAttribute("aria-expanded", "false"));
    }
  });

  window.addEventListener("resize", () => {
    const pop = document.getElementById("topMenuPopover");
    if (pop && !pop.classList.contains("hidden")) {
      // reposition relative to the first visible/available button
      const btn = btns.find((b) => b.offsetParent !== null) || btns[0];
      positionPopover(pop, btn);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    try { window.ViewerMenu?.closeMenu?.(); } catch {}
    try { window.ViewerMenuExtension?.close?.(); } catch {}
    try { window.ViewerMenuAbout?.close?.(); } catch {}
  });
}

// ============================================================================
// Counters (UID ONLY) + Like + anti-spam
// ============================================================================
function formatInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  try { return x.toLocaleString("fr-FR"); }
  catch { return String(Math.floor(x)); }
}

function showStatsBox() {
  const stats = $("statsOut");
  if (stats) stats.style.display = "";
}

async function counterGet(id) {
  const r = await fetch(`/api/counter?op=get&id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!r.ok) throw new Error("counter get HTTP " + r.status);
  return await r.json();
}
async function counterHit(id, kind) {
  const r = await fetch(`/api/counter?op=hit&kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!r.ok) throw new Error("counter hit HTTP " + r.status);
  return await r.json();
}
async function counterUnhit(id, kind) {
  const r = await fetch(`/api/counter?op=unhit&kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!r.ok) throw new Error("counter unhit HTTP " + r.status);
  return await r.json();
}

// ✅ scope par slug (sinon likes partagés entre traducteurs)
function likeKey(gameId){ return `like_${SLUG || "root"}_${gameId}`; }

function getMyLike(gameId) {
  try { return localStorage.getItem(likeKey(gameId)) === "1"; }
  catch { return false; }
}
function setMyLike(gameId, v) {
  try { localStorage.setItem(likeKey(gameId), v ? "1" : "0"); } catch {}
}
function updateLikeBtn(gameId) {
  const b = $("btnLike");
  if (!b) return;
  const liked = getMyLike(gameId);
  b.textContent = liked ? "❤️" : "🤍";
  b.setAttribute("aria-label", liked ? "Je n’aime plus" : "J’aime");
}

function setLikesFromJson(j) {
  if (!$("statLikes")) return;
  const val = Number(j?.likes);
  setText("statLikes", Number.isFinite(val) ? formatInt(val) : "0");
}

function cooldownKey(kind, gameId) {
  return `cooldown_${SLUG || "root"}_${kind}_${gameId}`;
}

function inCooldown(kind, gameId, ms) {
  try {
    const k = cooldownKey(kind, gameId);
    const last = Number(localStorage.getItem(k) || "0");
    const now = Date.now();
    if (now - last < ms) return true;
    localStorage.setItem(k, String(now));
    return false;
  } catch {
    return false;
  }
}

async function initCounters(gameId, megaHref, archiveHref) {
  const VIEW_COOLDOWN_MS = 10 * 60 * 1000;
  const MEGA_COOLDOWN_MS = 5 * 60 * 1000;

  const skipViewHit = inCooldown("view", gameId, VIEW_COOLDOWN_MS);

  try {
    const j = skipViewHit ? await counterGet(gameId) : await counterHit(gameId, "view");
    if (j?.ok) {
      setText("statViews", formatInt(j.views));
      setText("statMegaClicks", formatInt(j.mega));
      setLikesFromJson(j);
      showStatsBox();
    }
  } catch {
    try {
      const j = await counterGet(gameId);
      if (j?.ok) {
        setText("statViews", formatInt(j.views));
        setText("statMegaClicks", formatInt(j.mega));
        setLikesFromJson(j);
        showStatsBox();
      }
    } catch {
      setText("statViews", "—");
      setText("statMegaClicks", "—");
      if ($("statLikes")) setText("statLikes", "—");
      showStatsBox();
    }
  }

  // 📥 Téléchargements (MEGA + Archives → même compteur)
  const bindDownload = (btnId, href) => {
    if (!href) return;
    const btn = $(btnId);
    if (!btn) return;
    if (btn.dataset.boundMega === "1") return;
    btn.dataset.boundMega = "1";

    btn.addEventListener("click", async () => {
      if (inCooldown("megaClick", gameId, MEGA_COOLDOWN_MS)) return;
      try {
        const j = await counterHit(gameId, "mega");
        if (j?.ok) {
          setText("statMegaClicks", formatInt(j.mega));
          showStatsBox();
        }
      } catch {}
    }, { passive: true });
  };

  bindDownload("btnMega", megaHref);
  bindDownload("archiveLink", archiveHref);

  // ❤️ Like
  const btnLike = $("btnLike");
  if (btnLike && $("statLikes")) {
    updateLikeBtn(gameId);
    if (btnLike.dataset.boundLike === "1") return;
    btnLike.dataset.boundLike = "1";

    btnLike.addEventListener("click", async () => {
      if (inCooldown("likeClick", gameId, 1500)) return;

      const liked = getMyLike(gameId);

      try {
        let j;
        if (!liked) {
          j = await counterHit(gameId, "like");
          if (j?.ok) {
            setMyLike(gameId, true);
            setLikesFromJson(j);
            updateLikeBtn(gameId);
            showStatsBox();
          }
          return;
        }

        j = await counterUnhit(gameId, "like");
        if (j?.ok) {
          setMyLike(gameId, false);
          setLikesFromJson(j);
          updateLikeBtn(gameId);
          showStatsBox();
        }
      } catch {}
    });
  }
}

// ✅ UID ONLY
function buildCounterKeyFromEntry(entry) {
  const uid = String(entry?.uid ?? "").trim();
  const slug = String(SLUG || "root").trim();
  return uid ? `t:${slug}:uid:${uid}` : "";
}

// ============================================================================
// Rating 4 (scope slug sur stockage local)
// ============================================================================
const RATING4_LABELS = {
  1: "Traduction à refaire",
  2: "Traduction avec des défauts",
  3: "Traduction correcte",
  4: "Bonne traduction",
};

async function rating4Get(id) {
  const r = await fetch(`/api/rating4?op=get&id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!r.ok) throw new Error("rating4 get HTTP " + r.status);
  return await r.json();
}
async function rating4Vote(id, v, prev) {
  const qs = new URLSearchParams({ op: "vote", id: String(id), v: String(v), prev: String(prev || 0) });
  const r = await fetch(`/api/rating4?${qs.toString()}`, { cache: "no-store" });
  if (!r.ok) throw new Error("rating4 vote HTTP " + r.status);
  return await r.json();
}

function voteKey(gameId){ return `rating4_${SLUG || "root"}_${gameId}`; }

function getMyVote4(gameId) {
  try {
    const v = Number(localStorage.getItem(voteKey(gameId)) || "0");
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}
function setMyVote4(gameId, v) {
  try { localStorage.setItem(voteKey(gameId), String(v)); } catch {}
}

function renderRating4UI(gameId, data, enabled = true) {
  const choices = $("ratingChoices");
  const avgEl = $("ratingAvg");
  const countEl = $("ratingCount");
  const msgEl = $("ratingMsg");
  if (!choices || !avgEl || !countEl) return;

  const avg = Number(data?.avg) || 0;
  const count = Number(data?.count) || 0;
  const myVote = getMyVote4(gameId);

  enabled = !!enabled && !!data?.ok;

  avgEl.textContent = avg > 0 ? avg.toFixed(1) + "/4" : "—";
  countEl.textContent = String(count);
  setStatRating(avg, count);
  choices.innerHTML = "";

  if (!enabled) {
    for (let i = 1; i <= 4; i++) {
      const star = document.createElement("button");
      star.type = "button";
      star.className = "ratingStar";
      star.textContent = "☆";
      star.disabled = true;
      star.setAttribute("aria-label", `${i}/4`);
      choices.appendChild(star);
    }
    if (msgEl) msgEl.textContent = "Notation désactivée.";
    return;
  }

  const setVisual = (hoverValue) => {
    const v = (hoverValue === 0 || typeof hoverValue === "number") ? hoverValue : (getMyVote4(gameId) || 0);
    [...choices.querySelectorAll(".ratingStar")].forEach((btn, idx) => {
      btn.textContent = idx + 1 <= v ? "★" : "☆";
    });
  };

  const restoreMsg = () => {
    const v = getMyVote4(gameId);
    if (!msgEl) return;
    msgEl.textContent = v
      ? `Ta note : ${v}/4 — ${RATING4_LABELS[v]} (tu peux changer ta note)`
      : "Clique sur les étoiles pour noter la traduction.";
  };

  if (myVote) {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "ratingCancel";
    cancel.textContent = "🗑️";
    cancel.setAttribute("aria-label", "Annuler ma note");

    cancel.addEventListener("mouseenter", () => {
      setVisual(0);
      if (msgEl) msgEl.textContent = "Annuler ma note";
    });
    cancel.addEventListener("mouseleave", () => {
      setVisual(null);
      restoreMsg();
    });

    cancel.addEventListener("click", async () => {
      const prev = getMyVote4(gameId);
      if (!prev) return;
      try {
        const res = await rating4Vote(gameId, 0, prev);
        if (res?.ok) {
          try { localStorage.removeItem(voteKey(gameId)); } catch {}
          renderRating4UI(gameId, res);
          if (msgEl) msgEl.textContent = "Note supprimée ✅";
        }
      } catch {
        if (msgEl) msgEl.textContent = "Erreur lors de l’annulation.";
      }
    });

    choices.appendChild(cancel);
  }

  for (let i = 1; i <= 4; i++) {
    const star = document.createElement("button");
    star.type = "button";
    star.className = "ratingStar";
    star.textContent = "☆";
    star.setAttribute("aria-label", `${i}/4 — ${RATING4_LABELS[i]}`);

    star.addEventListener("mouseenter", () => {
      setVisual(i);
      if (msgEl) msgEl.textContent = `${i}/4 — ${RATING4_LABELS[i]}`;
    });
    star.addEventListener("mouseleave", () => {
      setVisual(null);
      restoreMsg();
    });

    star.addEventListener("click", async () => {
      const prev = getMyVote4(gameId);
      if (prev === i) {
        if (msgEl) msgEl.textContent = "C’est déjà ta note actuelle ✅";
        return;
      }
      try {
        const res = await rating4Vote(gameId, i, prev);
        if (res?.ok) {
          setMyVote4(gameId, i);
          renderRating4UI(gameId, res);
          if (msgEl) msgEl.textContent = prev ? "Note modifiée ✅" : "Merci pour ton vote ⭐";
        }
      } catch {
        if (msgEl) msgEl.textContent = "Erreur lors du vote.";
      }
    });

    choices.appendChild(star);
  }

  setVisual(null);
  restoreMsg();
}

// ============================================================================
// Blocs (videoHost etc.) — helpers
// ============================================================================
function ensureBlockAfter(anchorEl, id) {
  if (!anchorEl || !anchorEl.parentNode) return null;

  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    anchorEl.parentNode.insertBefore(el, anchorEl.nextSibling);
  }
  return el;
}

function renderVideoBlock({ id, videoUrl }) {
  const u = (videoUrl || "").trim();
  if (!u) { show(id, false); return; }
  setHtml(
    id,
    `
    <div class="game-block">
      <iframe
        src="${escapeHtml(u)}"
        referrerpolicy="strict-origin-when-cross-origin"
        style="width:100%; aspect-ratio:16/9; border-radius:12px; border:1px solid var(--border);"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen>
      </iframe>
    </div>
  `
  );
  show(id, true);
}

// ============================================================================
// MAIN
// ============================================================================
(async function main() {
  try {
    // ✅ Assure que les IDs/structures DOM correspondent à game.andric31.js
    // (permet d'utiliser un seul CSS de thème)
    try { normalizeDomIdsForSharedTheme(); } catch {}

    initHamburgerMenu();

    const { id: idParam, uid: uidParam } = getParamsFromUrl();
    if (!idParam && !uidParam) {
      showError(
        `Aucun paramètre dans l’URL. Exemples : ${APP_PATH}?id=215277  ou  ${APP_PATH}?id=17373&uid=898  ou  ${APP_PATH}?uid=898`
      );
      return;
    }

    const listUrl = getListUrl();
    const raw = await fetchJson(listUrl);
    const list = extractGames(raw);

    const page = resolveGamePage({ id: idParam, uid: uidParam }, list);
    if (page.kind === "notfound") {
      showError(`Jeu introuvable (id=${idParam || "-"} uid=${uidParam || "-"}) dans la liste`);
      return;
    }

    const entry = page.entry;
    const display = entry?.gameData ? entry.gameData : entry;

    const counterKey = buildCounterKeyFromEntry(entry);
    const isCollectionChild = page.kind === "collectionChild" && entry && entry.gameData;

    const title = (getDisplayTitle(entry) || getDisplayTitle(display) || `Jeu ${idParam || uidParam}`).trim();
    document.title = title;

    // 1) Titre + cover + tags
    setText("title", title);
    setCover(display.imageUrl || entry.imageUrl || "");
    renderTags(display.tags || entry.tags || []);

    // Badges + status
    renderBadgesFromGame(display, entry, isCollectionChild);
    renderTranslationStatus(entry);

    // 2) Related (après tags)
    const relatedOut = ensureRelatedContainer();
    if (relatedOut) {
      const parts = [];

      if (page.kind === "collectionParent") parts.push(renderCollectionBlockForParent(entry, page.children));
      else if (page.kind === "collectionChild") parts.push(renderCollectionBlockForChild(page.parent));

      const seriesIndex = buildSeriesIndex(list);
      const pageRefs = getCurrentPageRefs({ kind: page.kind, idParam: idParam, uidParam: uidParam, entry });
      const seriesList = getSeriesForCurrentPage(pageRefs, seriesIndex);

      let canonicalKey = "";
      if (page.kind === "collectionChild") canonicalKey = `c:${page.idParam}|u:${page.uidParam}`;
      else if (entry?.id) canonicalKey = `id:${String(entry.id).trim()}`;
      else canonicalKey = `uid:${String(entry.uid).trim()}`;

      parts.push(renderSeriesBlocks(seriesList, list, canonicalKey));
      relatedOut.innerHTML = parts.filter(Boolean).join("");
    }

    // 3) Description (force placement)
    const tagsEl = document.getElementById("tags");
    const descAnchor = relatedOut || tagsEl;

    const descBox = document.getElementById("descriptionBox");
    const descTextEl = document.getElementById("descriptionText");

    if (descBox && descAnchor && descAnchor.parentNode) {
      descAnchor.parentNode.insertBefore(descBox, descAnchor.nextSibling);
    }

    const description = (entry.description || "").trim();
    if (description && descBox && descTextEl) {
      descTextEl.innerHTML = escapeHtml(description).replace(/\n/g, "<br>");
      descBox.style.display = "";
    } else if (descBox) {
      descBox.style.display = "none";
    }

    // 4) Vidéo sous description
    const videoAnchor = (descBox && descBox.style.display !== "none") ? descBox : (relatedOut || tagsEl);
    const videoHost = ensureBlockAfter(videoAnchor, "videoHost");
    renderVideoBlock({ id: "videoHost", videoUrl: (entry.videoUrl || "").trim() });

    // 5) Boutons Discord + F95
    setHref("btnDiscord", (entry.discordlink || "").trim());
    if ($("btnDiscord")) {
      $("btnDiscord").textContent = "💬 Discord";
      $("btnDiscord").classList.add("btn-discord");
    }

    setHref("btnF95", (entry.url || "").trim());
    if ($("btnF95")) {
      $("btnF95").innerHTML = '<span class="f95-logo"><span class="f95-white">F95</span><span class="f95-red">Zone</span></span>';
      $("btnF95").classList.add("btn-f95");
    }

    // 6) MEGA + Archives
    function getHostClass(url){
      const u = (url || "").toLowerCase();
    
      if (u.includes("mega.nz")) return "btn-mega";
      if (u.includes("f95zone")) return "btn-f95";
      if (u.includes("drive.google")) return "btn-host-drive";
      if (u.includes("gofile")) return "btn-host-gofile";
    
      return "btn-host-default";
    }
    
    const megaHref = (entry.translation || "").trim();
    const archiveHref = (entry.translationsArchive || "").trim();
    
    setHref("btnMega", megaHref);
    if ($("btnMega")) $("btnMega").textContent = "📥 Télécharger la traduction · MEGA";
    
    
    // ⭐⭐⭐⭐⭐ FIX IMPORTANT ⭐⭐⭐⭐⭐
    // on cache aussi la ligne entière sinon le margin crée un trou
    const megaRow = document.getElementById("btnMega")?.closest(".btnMainRow");
    if (megaRow){
      megaRow.style.display = megaHref ? "flex" : "none";
    }
    
    
    setHref("archiveLink", archiveHref);
    if ($("archiveLink")) $("archiveLink").textContent = "📦 Archives de la traduction";
    
    const ab = $("archiveBox");
    if (ab) ab.style.display = archiveHref ? "flex" : "none";

    // 6b) Extra links — même DOM/classes que game.andric31.js (pour CSS partagé)
    const extra = Array.isArray(entry.translationsExtra) ? entry.translationsExtra : [];
    const extraValid = extra.filter((x) => x && (x.link || "").trim());

    // wrapper colonne (sous MEGA, dans la même ligne)
    let extraWrap = document.querySelector(".extraLinksCol");
    if (!extraWrap) {
      extraWrap = document.createElement("div");
      extraWrap.className = "extraLinksCol";
      extraWrap.style.display = "flex";
      extraWrap.style.flexDirection = "column";
      extraWrap.style.gap = "10px";
      extraWrap.style.alignItems = "center";
      extraWrap.style.width = "auto";

      // insère juste après le bouton MEGA si possible
      const megaBtn = document.getElementById("btnMega");
      if (megaRow && megaBtn && megaBtn.parentNode === megaRow) {
        megaRow.insertBefore(extraWrap, megaBtn.nextSibling);
      } else if (megaRow) {
        megaRow.appendChild(extraWrap);
      }
    }

    if (extraWrap) {
      extraWrap.innerHTML = "";

      extraValid.forEach((x) => {
        const name = String(x.name || "Lien").trim();
        const link = String(x.link || "").trim();
        const hostCls = getHostClass(link);

        const a = document.createElement("a");
        a.className = `btnLike ${hostCls} extraLinkBtn`;
        a.target = "_blank";
        a.rel = "noopener";
        a.href = link;
        a.style.width = "auto";
        a.style.margin = "0 auto";
        a.style.justifyContent = "center";

        // Patch : si name == Patch
        if (name.toLowerCase() === "patch") {
          a.textContent = "📥 Télécharger · Patch";
        } else {
          if (hostCls === "btn-f95" && /f95\s*zone/i.test(name)) {
            a.innerHTML = `📥 Télécharger la traduction · <span class="f95-logo"><span class="f95-white">F95</span><span class="f95-red">Zone</span></span>`;
          } else {
            a.textContent = `📥 Télécharger la traduction · ${name}`;
          }
        }

        extraWrap.appendChild(a);
      });
    }

    // ✅ Cache/affiche la ligne MEGA selon (MEGA OU extras)
    if (megaRow) {
      const hasMega = !!megaHref;
      const hasExtra = extraValid.length > 0;
      megaRow.style.display = (hasMega || hasExtra) ? "flex" : "none";
    }

    // 7) Notes
    const notes = (entry.notes || "").trim();
    if (notes) {
      setHtml("notesText", escapeHtml(notes).replace(/\n/g, "<br>"));
      show("notesBox", true);
    } else {
      show("notesBox", false);
    }

    // ⛔ Bloquer clic droit MEGA/archives
    $("btnMega")?.addEventListener("contextmenu", (e) => { e.preventDefault(); return false; });
    $("archiveLink")?.addEventListener("contextmenu", (e) => { e.preventDefault(); return false; });

    // Métadonnées de traduction
    setStatMeta(entry);

    // Counters (UID only)
    await initCounters(counterKey, megaHref, archiveHref);

    // Rating
    try {
      const j = await rating4Get(counterKey);
      if (j?.ok) renderRating4UI(counterKey, j, true);
    } catch {
      renderRating4UI(counterKey, { ok: false, avg: 0, count: 0 }, false);
    }

    // Déplacer la notation en bas de l'encadré principal
    const cardInner = document.querySelector(".cardInner");
    const ratingBoxEl = document.getElementById("ratingBox");
    if (cardInner && ratingBoxEl) cardInner.appendChild(ratingBoxEl);

  } catch (e) {
    showError(`Erreur: ${e?.message || e}`);
  }
})();
