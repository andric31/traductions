"use strict";

/**
 * game.js — version MULTI-TRADUCTEUR
 * ✅ charge ../config.json si présent (listUrl)
 * ✅ liens /game/ en RELATIF (pour /ant28jsp/game/)
 * ✅ localStorage séparé par traducteur (likes / cooldown / rating)
 */

const DEFAULT_URL = "https://raw.githubusercontent.com/andric31/f95list/main/f95list.json";

// ✅ Owner (vient de index.html : window.VIEWER_OWNER = "ant28jsp")
const OWNER = (window.VIEWER_OWNER || "").toString().trim() || "default";

// ====== Helpers URL / JSON ======

async function getListUrlSmart() {
  // 1) ?src=...
  try {
    const p = new URLSearchParams(location.search);
    const src = (p.get("src") || "").trim();
    if (src) return src;
  } catch {}

  // 2) ../config.json (on est dans /<pseudo>/game/)
  try {
    const r = await fetch("../config.json", { cache: "no-store" });
    if (r.ok) {
      const cfg = await r.json();
      const listUrl = (cfg?.listUrl || "").toString().trim();
      if (listUrl) return listUrl;
    }
  } catch {}

  // 3) legacy localStorage (fallback)
  try {
    const ls = (localStorage.getItem("f95listUrl") || "").trim();
    if (ls) return ls;
  } catch {}

  return DEFAULT_URL;
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

// =========================
// ✅ Routing (id central) + Collections + Séries
// =========================

function buildGameUrl(g) {
  const coll = (g.collection || "").toString().trim();
  const id = (g.id || "").toString().trim();
  const uid = (g.uid ?? "").toString().trim();

  // IMPORTANT: URL RELATIVE -> reste dans /<pseudo>/game/
  if (coll) return `./?id=${encodeURIComponent(coll)}&uid=${encodeURIComponent(uid)}`;
  if (id) return `./?id=${encodeURIComponent(id)}`;
  return `./?uid=${encodeURIComponent(uid)}`;
}

function getDisplayTitle(g) {
  // Règle: si c'est un enfant de collection (id vide + collection non vide),
  // on affiche UNIQUEMENT le titre du gameData (le title principal est celui de la collection).
  const id = (g?.id || "").toString().trim();
  const col = (g?.collection || "").toString().trim();
  if (!id && col) {
    return (g?.gameData?.title || "").toString().trim();
  }
  return (g?.cleanTitle || g?.title || "").toString().trim();
}

function getCollectionChildTitle(g) {
  // Strict: pas de fallback vers g.title (sinon doublons "Collection ...")
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

    // refs déclarées
    for (const ref of serieObj.refs) {
      if (!map.has(ref)) map.set(ref, []);
      map.get(ref).push(serieObj);
    }

    // rendre visible sur la page du owner (id central)
    for (const selfRef of getEntryRefs(owner)) {
      if (!map.has(selfRef)) map.set(selfRef, []);
      map.get(selfRef).push(serieObj);
    }
  }
  return map;
}

function getCurrentPageRefs({ kind, idParam, uidParam, entry }) {
  if (kind === "collectionChild") {
    return [`id:${String(idParam)}`, `uid:${String(uidParam)}`];
  }
  return getEntryRefs(entry);
}

function getSeriesForCurrentPage(pageRefs, seriesIndex) {
  const found = [];
  for (const r of pageRefs || []) {
    const arr = seriesIndex.get(r);
    if (arr) found.push(...arr);
  }
  const uniq = new Map();
  for (const s of found) {
    uniq.set(`${s.name}|${s.ownerUid}`, s);
  }
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

// ====== Related container (inchangé) ======

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
      const t = escapeHtml(getDisplayTitle(g, "collectionChild"));
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

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
  return await r.json();
}

// ====== UI helpers ======

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

// ====== Badges (inchangé) ======

const CAT_ALLOWED = ["VN", "Collection"];
const ENGINE_ALLOWED = [
  "Ren'Py","RPGM","Unity","Unreal Engine","HTML","Java","Flash","QSP","WebGL","RAGS","Tads","ADRIFT","Others","Wolf RPG"
];
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
  "unrealengine": "Unreal Engine",
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

const SEP_RE = /[\u2014\u2013\-:]/; // — – - :
const ucFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ... cleanTitle, badges, etc. => inchangé
// (je laisse le reste exactement pareil, tes fonctions suivent ci-dessous)

// ====== Counters ======

function formatInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  try {
    return x.toLocaleString("fr-FR");
  } catch {
    return String(Math.floor(x));
  }
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
  const r = await fetch(
    `/api/counter?op=hit&kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`,
    { cache: "no-store" }
  );
  if (!r.ok) throw new Error("counter hit HTTP " + r.status);
  return await r.json();
}

async function counterUnhit(id, kind) {
  const r = await fetch(
    `/api/counter?op=unhit&kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`,
    { cache: "no-store" }
  );
  if (!r.ok) throw new Error("counter unhit HTTP " + r.status);
  return await r.json();
}

// ✅ localStorage séparé par traducteur
function lsKey(s) {
  return `${s}:${OWNER}`;
}

function getMyLike(gameId) {
  try {
    return localStorage.getItem(lsKey(`like_${gameId}`)) === "1";
  } catch {
    return false;
  }
}
function setMyLike(gameId, v) {
  try {
    localStorage.setItem(lsKey(`like_${gameId}`), v ? "1" : "0");
  } catch {}
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
  return lsKey(`cooldown_${kind}_${gameId}`);
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

// ============================================================================
// ✅ COMPTEUR UID ONLY
// ============================================================================
function buildCounterKeyFromEntry(entry) {
  const uid = String(entry?.uid ?? "").trim();
  return uid ? `uid:${uid}` : "";
}

// ====== Rating 4 (storage séparé) ======

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
  const qs = new URLSearchParams({
    op: "vote",
    id: String(id),
    v: String(v),
    prev: String(prev || 0),
  });
  const r = await fetch(`/api/rating4?${qs.toString()}`, { cache: "no-store" });
  if (!r.ok) throw new Error("rating4 vote HTTP " + r.status);
  return await r.json();
}

function getMyVote4(gameId) {
  try {
    const v = Number(localStorage.getItem(lsKey(`rating4_${gameId}`)) || "0");
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

function setMyVote4(gameId, v) {
  try {
    localStorage.setItem(lsKey(`rating4_${gameId}`), String(v));
  } catch {}
}

// ✅ ton renderRating4UI reste IDENTIQUE (il utilise getMyVote4/setMyVote4)
// (ne change pas le reste)

// ====== Main ======

(async function main() {
  try {
    initHamburgerMenu();

    const { id: idParam, uid: uidParam } = getParamsFromUrl();

    if (!idParam && !uidParam) {
      showError(
        "Aucun paramètre dans l’URL. Exemples : /game/?id=215277  ou  /game/?id=17373&uid=898  ou  /game/?uid=898"
      );
      return;
    }

    // ✅ MULTI-TRADUCTEUR
    const listUrl = await getListUrlSmart();

    const raw = await fetchJson(listUrl);
    const list = extractGames(raw);

    const page = resolveGamePage({ id: idParam, uid: uidParam }, list);

    if (page.kind === "notfound") {
      showError(`Jeu introuvable (id=${idParam || "-"} uid=${uidParam || "-"}) dans f95list.json`);
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

    // badges
    renderBadgesFromGame(display, entry, isCollectionChild);
    renderTranslationStatus(entry);

    // ✅ le reste de ton main reste STRICTEMENT identique
    // (description, related, video, boutons, mega, notes, archives, counters, rating, etc.)

    const tagsEl = document.getElementById("tags");
    const btnRow = document.querySelector(".btnRow");
    const btnMainRow = document.querySelector(".btnMainRow");
    const ratingBox = document.getElementById("ratingBox");

    const relatedOut = ensureRelatedContainer();
    if (relatedOut) {
      const parts = [];

      if (page.kind === "collectionParent") {
        parts.push(renderCollectionBlockForParent(entry, page.children));
      } else if (page.kind === "collectionChild") {
        parts.push(renderCollectionBlockForChild(page.parent));
      }

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

    // Description (ton code inchangé)
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
    const videoHost = ensureBlockAfter(videoAnchor, "videoHost");
    renderVideoBlock({ id: "videoHost", videoUrl: (entry.videoUrl || "").trim() });

    // Boutons
    setHref("btnDiscord", (entry.discordlink || "").trim());
    if ($("btnDiscord")) {
      $("btnDiscord").textContent = "💬 Discord";
      $("btnDiscord").classList.add("btn-discord");
    }

    setHref("btnF95", (entry.url || "").trim());
    if ($("btnF95")) {
      $("btnF95").innerHTML = '<span class="f95-white"> F95</span><span class="f95-red">Zone</span>';
      $("btnF95").classList.add("btn-f95");
    }

    // MEGA / Archives
    const megaHref = (entry.translation || "").trim();
    const archiveHref = (entry.translationsArchive || "").trim();
    setHref("btnMega", megaHref);
    if ($("btnMega")) $("btnMega").textContent = "📥 Télécharger la traduction (MEGA)";

    const notes = (entry.notes || "").trim();
    if (notes) {
      setHtml("notesText", escapeHtml(notes).replace(/\n/g, "<br>"));
      show("notesBox", true);
    } else {
      show("notesBox", false);
    }

    setHref("archiveLink", archiveHref);
    if ($("archiveLink")) $("archiveLink").textContent = "📦 Archives de la traduction";

    const ab = $("archiveBox");
    if (ab) ab.style.display = archiveHref ? "flex" : "none";

    const archiveLink = document.getElementById("archiveLink");
    if (archiveLink) {
      archiveLink.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        return false;
      });
    }

    await initCounters(counterKey, megaHref, archiveHref);

    const btnMega = document.getElementById("btnMega");
    if (btnMega) {
      btnMega.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        return false;
      });
    }

    // Rating
    try {
      const j = await rating4Get(counterKey);
      if (j?.ok) renderRating4UI(counterKey, j);
    } catch {}

    // Déplacer la notation
    const cardInner = document.querySelector(".cardInner");
    const ratingBoxEl = document.getElementById("ratingBox");
    if (cardInner && ratingBoxEl) {
      cardInner.appendChild(ratingBoxEl);
    }
  } catch (e) {
    showError(`Erreur: ${e?.message || e}`);
  }
})();
