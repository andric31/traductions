"use strict";

/*
  game.js — page jeu à la RACINE (SANS /game)
  ✅ Base LOCALE: ./f95list_ant28jsp.json
  ✅ Thème via ./config.json
  ✅ Stats séparées par traducteur: `${OWNER}|uid:<uid>`
  ✅ LocalStorage séparé (likes/cooldowns/rating)
  ✅ Liens internes: ./?id=... ./?uid=...
*/

const DEFAULT_URL = "./f95list_ant28jsp.json";

// ✅ Multi-trad : owner (défini par index.html via window.VIEWER_OWNER)
const OWNER = (window.VIEWER_OWNER || "").toString().trim() || "default";

// =========================
// Config + thème
// =========================
async function loadOwnerConfigGame() {
  try {
    const r = await fetch("./config.json", { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function applyThemeGame(theme) {
  if (!theme) return;
  const root = document.documentElement;
  const set = (k, v) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      root.style.setProperty(k, String(v));
    }
  };
  set("--accent", theme.accent);
  set("--accent2", theme.accent2);
  set("--bgTop", theme.bgTop);
  set("--bgBottom", theme.bgBottom);
  set("--card", theme.card);
  set("--border", theme.border);
  set("--fg", theme.fg);
  set("--muted", theme.muted);
  set("--radius", theme.radius);
}

// ====== Helpers URL / JSON ======
function getListUrl(ownerCfg) {
  // 1) ?src=... (override)
  try {
    const p = new URLSearchParams(location.search);
    const src = (p.get("src") || "").trim();
    if (src) return src;
  } catch {}

  // 2) config.json
  const cfgUrl = (ownerCfg?.listUrl || "").toString().trim();
  if (cfgUrl) return cfgUrl;

  // 3) localStorage séparé
  try {
    return (localStorage.getItem(`f95listUrl:${OWNER}`) || "").trim() || DEFAULT_URL;
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

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html ?? "";
}

function show(id, cond) {
  const el = document.getElementById(id);
  if (el) el.style.display = cond ? "" : "none";
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
  return await r.json();
}

function $(id) {
  return document.getElementById(id);
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

// =========================
// Routing (id central) + Collections + Séries
// =========================
function buildGameUrl(g) {
  const coll = (g.collection || "").toString().trim();
  const id = (g.id || "").toString().trim();
  const uid = (g.uid ?? "").toString().trim();

  // ✅ liens internes à la RACINE
  if (coll) return `./?id=${encodeURIComponent(coll)}&uid=${encodeURIComponent(uid)}`;
  if (id) return `./?id=${encodeURIComponent(id)}`;
  return `./?uid=${encodeURIComponent(uid)}`;
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
  const map = new Map();
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
    const parentOrGame = (games || []).find((g) => String(g?.id) === String(id) && !g?.collection) || null;
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

// ====== Related container
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
  const href = parentId ? `./?id=${encodeURIComponent(parentId)}` : "";
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
      const href = `./?id=${encodeURIComponent(parent.id)}&uid=${encodeURIComponent(g.uid)}`;
      return `<li><a href="${href}">${t}</a></li>`;
    })
    .join("");

  return `
    <div class="game-block collection-block">
      <h3>📦 Collection</h3>
      <ul class="collection-list">
        ${items}
      </ul>
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

// ====== Badges (ton bloc complet inchangé) ======
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

function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
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
    const w = tokens[i].toLowerCase();
    const norm = w.replace(/[^\w']/g, "");

    if (norm === "vn") { if (!categories.includes("VN")) categories.push("VN"); cut = i + 1; continue; }

    if (norm === "wolf" && tokens[i + 1] && tokens[i + 1].toLowerCase().replace(/[^\w']/g, "") === "rpg") {
      if (!engines.includes("Wolf RPG")) engines.push("Wolf RPG");
      cut = i + 2; i++; continue;
    }
    if (norm === "wolf") break;

    if (norm === "flash") { if (!engines.includes("Flash")) engines.push("Flash"); cut = i + 1; continue; }

    if (norm === "others" || norm === "other") {
      if (!engines.includes("Others")) engines.push("Others");
      othersExplicit = true;
      cut = i + 1; continue;
    }

    if (ENGINE_RAW[norm] !== undefined) {
      const eng = ENGINE_RAW[norm];
      if (eng && !engines.includes(eng)) engines.push(eng);
      cut = i + 1; continue;
    }

    const pretty = ucFirst(norm);
    if (STATUS_ALLOWED.includes(pretty)) { status = pretty; cut = i + 1; continue; }

    if (w === "&" || w === "and" || w === "/") { cut = i + 1; continue; }
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

async function renderTranslationStatus(game) {
  if (!game?.url || !game?.title) return;
  try {
    const r = await fetch(
      `/api/f95status?url=${encodeURIComponent(game.url)}&storedTitle=${encodeURIComponent(game.title)}`,
      { cache: "no-store" }
    );
    if (!r.ok) return;
    const j = await r.json();
    if (!j?.ok || !j?.currentTitle) return;

    const badge = document.createElement("span");
    badge.classList.add("badge");
    if (j.isUpToDate) {
      badge.textContent = "✅ Traduction à jour";
      badge.classList.add("status-updated");
    } else {
      badge.textContent = "🔄 Traduction non à jour";
      badge.classList.add("status-outdated");
    }
    const wrap = $("badges");
    if (wrap) wrap.appendChild(badge);
  } catch {}
}

// =========================
// Counters (stats séparées par OWNER)
function formatInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  try { return x.toLocaleString("fr-FR"); } catch { return String(Math.floor(x)); }
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

function getMyLike(gameId) {
  try { return localStorage.getItem(`like_${OWNER}:${gameId}`) === "1"; } catch { return false; }
}
function setMyLike(gameId, v) {
  try { localStorage.setItem(`like_${OWNER}:${gameId}`, v ? "1" : "0"); } catch {}
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

function cooldownKey(kind, gameId) { return `cooldown_${OWNER}_${kind}_${gameId}`; }

function inCooldown(kind, gameId, ms) {
  try {
    const k = cooldownKey(kind, gameId);
    const last = Number(localStorage.getItem(k) || "0");
    const now = Date.now();
    if (now - last < ms) return true;
    localStorage.setItem(k, String(now));
    return false;
  } catch { return false; }
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
      setText("statViews", "0");
      setText("statMegaClicks", "0");
      if ($("statLikes")) setText("statLikes", "0");
      showStatsBox();
    }
  }

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

function buildCounterKeyFromEntry(entry) {
  const uid = String(entry?.uid ?? "").trim();
  return uid ? `${OWNER}|uid:${uid}` : "";
}

// ====== Rating 4 (identique à ton code) ======
const RATING4_LABELS = { 1:"Traduction à refaire", 2:"Traduction avec des défauts", 3:"Traduction correcte", 4:"Bonne traduction" };

async function rating4Get(id) {
  const r = await fetch(`/api/rating4?op=get&id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!r.ok) throw new Error("rating4 get HTTP " + r.status);
  return await r.json();
}
async function rating4Vote(id, v, prev) {
  const qs = new URLSearchParams({ op:"vote", id:String(id), v:String(v), prev:String(prev || 0) });
  const r = await fetch(`/api/rating4?${qs.toString()}`, { cache: "no-store" });
  if (!r.ok) throw new Error("rating4 vote HTTP " + r.status);
  return await r.json();
}
function getMyVote4(gameId) {
  try {
    const v = Number(localStorage.getItem(`rating4_${OWNER}:${gameId}`) || "0");
    return Number.isFinite(v) ? v : 0;
  } catch { return 0; }
}
function setMyVote4(gameId, v) {
  try { localStorage.setItem(`rating4_${OWNER}:${gameId}`, String(v)); } catch {}
}

function renderRating4UI(gameId, data) {
  const choices = $("ratingChoices");
  const avgEl = $("ratingAvg");
  const countEl = $("ratingCount");
  const msgEl = $("ratingMsg");
  if (!choices || !avgEl || !countEl) return;

  const avg = Number(data?.avg) || 0;
  const count = Number(data?.count) || 0;
  const myVote = getMyVote4(gameId);

  avgEl.textContent = avg > 0 ? avg.toFixed(1) + "/4" : "—";
  countEl.textContent = String(count);
  choices.innerHTML = "";

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

    cancel.addEventListener("mouseenter", () => { setVisual(0); if (msgEl) msgEl.textContent = "Annuler ma note"; });
    cancel.addEventListener("mouseleave", () => { setVisual(null); restoreMsg(); });

    cancel.addEventListener("click", async () => {
      const prev = getMyVote4(gameId);
      if (!prev) return;
      try {
        const res = await rating4Vote(gameId, 0, prev);
        if (res?.ok) {
          try { localStorage.removeItem(`rating4_${OWNER}:${gameId}`); } catch {}
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

    star.addEventListener("mouseenter", () => { setVisual(i); if (msgEl) msgEl.textContent = `${i}/4 — ${RATING4_LABELS[i]}`; });
    star.addEventListener("mouseleave", () => { setVisual(null); restoreMsg(); });

    star.addEventListener("click", async () => {
      const prev = getMyVote4(gameId);
      if (prev === i) { if (msgEl) msgEl.textContent = "C’est déjà ta note actuelle ✅"; return; }
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

// ====== Video block ======
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
  setHtml(id, `
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
  `);
  show(id, true);
}

// ====== MAIN ======
(async function main() {
  try {
    const { id: idParam, uid: uidParam } = getParamsFromUrl();

    // ✅ IMPORTANT: si pas de params => on ne fait rien (c’est le viewer qui doit tourner)
    if (!idParam && !uidParam) return;

    const ownerCfg = await loadOwnerConfigGame();
    if (ownerCfg?.theme) applyThemeGame(ownerCfg.theme);

    const listUrl = getListUrl(ownerCfg);
    const raw = await fetchJson(listUrl);
    const list = extractGames(raw);

    const page = resolveGamePage({ id: idParam, uid: uidParam }, list);
    if (page.kind === "notfound") {
      showError(`Jeu introuvable (id=${idParam || "-"} uid=${uidParam || "-"}) dans f95list_ant28jsp.json`);
      return;
    }

    const entry = page.entry;
    const display = entry?.gameData ? entry.gameData : entry;
    const counterKey = buildCounterKeyFromEntry(entry);
    const isCollectionChild = page.kind === "collectionChild" && entry && entry.gameData;

    const title = (getDisplayTitle(entry) || getDisplayTitle(display) || `Jeu ${idParam || uidParam}`).trim();
    document.title = title;

    // ✅ ici tu relies tes éléments DOM "page jeu" existants
    setText("title", title);
    setCover(display.imageUrl || entry.imageUrl || "");
    renderTags(display.tags || entry.tags || []);
    renderBadgesFromGame(display, entry, isCollectionChild);
    renderTranslationStatus(entry);

    const tagsEl = document.getElementById("tags");

    // Related
    const relatedOut = ensureRelatedContainer();
    if (relatedOut) {
      const parts = [];

      if (page.kind === "collectionParent") parts.push(renderCollectionBlockForParent(entry, page.children));
      else if (page.kind === "collectionChild") parts.push(renderCollectionBlockForChild(page.parent));

      const seriesIndex = buildSeriesIndex(list);
      const pageRefs = getCurrentPageRefs({ kind: page.kind, idParam, uidParam, entry });
      const seriesList = getSeriesForCurrentPage(pageRefs, seriesIndex);

      let canonicalKey = "";
      if (page.kind === "collectionChild") canonicalKey = `c:${page.idParam}|u:${page.uidParam}`;
      else if (entry?.id) canonicalKey = `id:${String(entry.id).trim()}`;
      else canonicalKey = `uid:${String(entry.uid).trim()}`;

      parts.push(renderSeriesBlocks(seriesList, list, canonicalKey));
      relatedOut.innerHTML = parts.filter(Boolean).join("");
    }

    // Description
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

    // Vidéo
    const videoAnchor = (descBox && descBox.style.display !== "none") ? descBox : (relatedOut || tagsEl);
    ensureBlockAfter(videoAnchor, "videoHost");
    renderVideoBlock({ id: "videoHost", videoUrl: (entry.videoUrl || "").trim() });

    // Boutons
    setHref("btnDiscord", (entry.discordlink || "").trim());
    if ($("btnDiscord")) { $("btnDiscord").textContent = "💬 Discord"; $("btnDiscord").classList.add("btn-discord"); }

    setHref("btnF95", (entry.url || "").trim());
    if ($("btnF95")) { $("btnF95").innerHTML = '<span class="f95-white"> F95</span><span class="f95-red">Zone</span>'; $("btnF95").classList.add("btn-f95"); }

    // MEGA + Archives
    const megaHref = (entry.translation || "").trim();
    const archiveHref = (entry.translationsArchive || "").trim();
    setHref("btnMega", megaHref);
    if ($("btnMega")) $("btnMega").textContent = "📥 Télécharger la traduction (MEGA)";

    const notes = (entry.notes || "").trim();
    if (notes) { setHtml("notesText", escapeHtml(notes).replace(/\n/g, "<br>")); show("notesBox", true); }
    else show("notesBox", false);

    setHref("archiveLink", archiveHref);
    if ($("archiveLink")) $("archiveLink").textContent = "📦 Archives de la traduction";
    const ab = $("archiveBox");
    if (ab) ab.style.display = archiveHref ? "flex" : "none";

    document.getElementById("archiveLink")?.addEventListener("contextmenu", (e) => { e.preventDefault(); return false; });
    document.getElementById("btnMega")?.addEventListener("contextmenu", (e) => { e.preventDefault(); return false; });

    // Stats
    await initCounters(counterKey, megaHref, archiveHref);

    // Rating
    try {
      const j = await rating4Get(counterKey);
      if (j?.ok) renderRating4UI(counterKey, j);
    } catch {}

    // Move rating (si présent)
    const cardInner = document.querySelector(".cardInner");
    const ratingBoxEl = document.getElementById("ratingBox");
    if (cardInner && ratingBoxEl) cardInner.appendChild(ratingBoxEl);

  } catch (e) {
    showError(`Erreur: ${e?.message || e}`);
  }
})();
