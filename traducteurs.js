"use strict";

const MANIFEST_URL = "/traducteurs_manifest.json";

const $ = (id) => document.getElementById(id);

function extractGames(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw.games)) return raw.games;
  if (Array.isArray(raw.items)) return raw.items;
  return [];
}

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}


function isExternalUrl(u){
  return /^https?:\/\//i.test(String(u||""));
}

function buildViewerHref(viewerUrl, listUrl, params){
  const base = String(viewerUrl || "").trim() || "#";
  const p = new URLSearchParams();
  if (listUrl) p.set("src", listUrl);
  if (params){
    for (const [k,v] of Object.entries(params)){
      if (v !== undefined && v !== null && String(v).trim() !== "") p.set(k, String(v).trim());
    }
  }
  // viewerUrl peut déjà contenir un "?"
  const sep = base.includes("?") ? "&" : "?";
  const qs = p.toString();
  return qs ? (base + sep + qs) : base;
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
  return await r.json();
}

// Essaie de récupérer une date lisible à partir des champs connus
function getGameUpdatedStamp(g) {
  return (
    g.updatedAtLocal ||
    g.updatedAt ||
    g.releaseDateLocal ||
    g.releaseDate ||
    ""
  );
}

function safeText(s, max = 220) {
  const t = String(s || "").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function makeChip(txt) {
  const el = document.createElement("span");
  el.className = "chip";
  el.textContent = txt;
  return el;
}

function renderTranslatorCard(t, stats) {
  const card = document.createElement("div");
  card.className = "card";

  const h2 = document.createElement("h2");
  const a = document.createElement("a");
  a.href = buildViewerHref(t.viewerUrl, t.listUrl, null);
  a.target = isExternalUrl(t.viewerUrl) ? "_blank" : "_self";
  a.rel = "noopener noreferrer";
  a.textContent = t.name || t.key || "(sans nom)";
  h2.appendChild(a);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = t.description || "";
meta.textContent = t.description || "";

  if (t.originalViewerUrl) {
    const extra = document.createElement("div");
    extra.className = "meta";
    const a2 = document.createElement("a");
    a2.href = t.originalViewerUrl;
    a2.target = "_blank";
    a2.rel = "noopener noreferrer";
    a2.textContent = "Ouvrir le site original";
    extra.appendChild(a2);
    card.appendChild(extra);
  }

  const row = document.createElement("div");
  row.className = "row";

  row.appendChild(makeChip(`Jeux : ${stats.count}`));
  if (stats.tagsCount > 0) row.appendChild(makeChip(`Tags : ${stats.tagsCount}`));
  if (stats.lastUpdate) row.appendChild(makeChip(`Dernière date : ${stats.lastUpdate}`));

  const row2 = document.createElement("div");
  row2.className = "row";

  const rawLink = document.createElement("a");
  rawLink.className = "chip";
  rawLink.href = t.listUrl;
  rawLink.target = "_blank";
  rawLink.rel = "noopener noreferrer";
  rawLink.textContent = "JSON";
  row2.appendChild(rawLink);

  card.appendChild(h2);
  card.appendChild(meta);
  card.appendChild(row);
  card.appendChild(row2);

  return card;
}

function renderGameCard(g) {
  const box = document.createElement("div");
  box.className = "game";

  const title = document.createElement("div");
  title.className = "title";
  const a = document.createElement("a");
  a.href = buildViewerHref(g._viewerUrl, g._listUrl, { uid: g.uid || "", id: g.id || "" });
  a.target = isExternalUrl(g._viewerUrl) ? "_blank" : "_self";
  a.rel = "noopener noreferrer";
  a.textContent = safeText(g.cleanTitle || g.title || "(sans titre)", 180);
  title.appendChild(a);

  const small = document.createElement("div");
  small.className = "small";
  small.textContent = safeText(g._metaLine || "", 240);

  const chips = document.createElement("div");
  chips.className = "chips";
  chips.appendChild(makeChip(`👤 ${g._translatorName || "?"}`));
  if (g.engine) chips.appendChild(makeChip(`⚙️ ${g.engine}`));
  if (g.status) chips.appendChild(makeChip(`📌 ${g.status}`));
  const up = getGameUpdatedStamp(g);
  if (up) chips.appendChild(makeChip(`🕒 ${up}`));

  box.appendChild(title);
  box.appendChild(small);
  box.appendChild(chips);
  return box;
}

let ALL_GAMES = []; // jeux fusionnés

function applyFilter() {
  const q = normalize($("q").value);
  const gamesWrap = $("games");
  const empty = $("empty");
  gamesWrap.innerHTML = "";

  const filtered = !q
    ? ALL_GAMES
    : ALL_GAMES.filter((g) => (g._search || "").includes(q));

  if (!filtered.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  // petite limite pour ne pas exploser le DOM si tu as des énormes bases
  const MAX_SHOW = 800;
  const slice = filtered.slice(0, MAX_SHOW);
  for (const g of slice) gamesWrap.appendChild(renderGameCard(g));
  if (filtered.length > MAX_SHOW) {
    const more = document.createElement("p");
    more.className = "status";
    more.textContent = `Affichage limité à ${MAX_SHOW} résultats (sur ${filtered.length}). Affine ta recherche.`;
    gamesWrap.appendChild(more);
  }
}

async function loadAll() {
  $("status").textContent = "Chargement des traducteurs…";
  $("translators").innerHTML = "";
  $("games").innerHTML = "";
  $("empty").classList.add("hidden");
  ALL_GAMES = [];

  const manifest = await fetchJson(MANIFEST_URL);
  if (!Array.isArray(manifest) || manifest.length === 0) {
    $("status").textContent = "Manifest vide ou invalide.";
    return;
  }

  // Charge toutes les bases en parallèle
  const results = await Promise.all(
    manifest.map(async (t) => {
      try {
        const raw = await fetchJson(t.listUrl);
        const games = extractGames(raw);
        return { ok: true, t, games };
      } catch (e) {
        return { ok: false, t, error: String(e && e.message ? e.message : e) };
      }
    })
  );

  // Rendu cartes traducteurs + merge jeux
  let okCount = 0;
  let totalGames = 0;
  for (const r of results) {
    if (!r.ok) {
      const card = document.createElement("div");
      card.className = "card";
      const h2 = document.createElement("h2");
      h2.textContent = r.t.name || r.t.key || "(sans nom)";
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = (r.t.description ? r.t.description + " · " : "") + "❌ Échec de chargement : " + r.error;
      const row = document.createElement("div");
      row.className = "row";
      const raw = document.createElement("a");
      raw.className = "chip";
      raw.href = r.t.listUrl;
      raw.target = "_blank";
      raw.rel = "noopener noreferrer";
      raw.textContent = "JSON";
      row.appendChild(raw);
      card.appendChild(h2);
      card.appendChild(meta);
      card.appendChild(row);
      $("translators").appendChild(card);
      continue;
    }

    okCount++;
    totalGames += r.games.length;

    // stats traducteur
    const tagsSet = new Set();
    let lastUpdate = "";
    for (const g of r.games) {
      const tags = Array.isArray(g.tags) ? g.tags : [];
      for (const tag of tags) tagsSet.add(String(tag));
      const up = getGameUpdatedStamp(g);
      if (up && up.length > lastUpdate.length) lastUpdate = up; // heuristique simple
    }
    const stats = { count: r.games.length, tagsCount: tagsSet.size, lastUpdate };
    $("translators").appendChild(renderTranslatorCard(r.t, stats));

    // merge + index
    for (const g of r.games) {
      const engine = g.engine || g.gameData?.engine || "";
      const status = g.status || g.gameData?.status || "";
      const tags = Array.isArray(g.tags) ? g.tags : (Array.isArray(g.gameData?.tags) ? g.gameData.tags : []);
      const metaLine = [
        engine ? `Engine: ${engine}` : "",
        status ? `Status: ${status}` : "",
        tags && tags.length ? `Tags: ${tags.slice(0, 14).join(", ")}${tags.length > 14 ? "…" : ""}` : ""
      ].filter(Boolean).join(" · ");

      const gg = Object.assign({}, g);
      gg.engine = engine;
      gg.status = status;
      gg.tags = tags;
      gg._translatorKey = r.t.key;
      gg._viewerUrl = r.t.viewerUrl;
      gg._listUrl = r.t.listUrl;
      gg._translatorType = r.t.type;
      gg._translatorName = r.t.name || r.t.key;
      gg._metaLine = metaLine;
      gg._search = normalize([
        gg._translatorName,
        gg.title,
        gg.cleanTitle,
        gg.engine,
        gg.status,
        (gg.tags || []).join(" ")
      ].join(" "));
      ALL_GAMES.push(gg);
    }
  }

  // tri : d'abord par traducteur puis par titre
  ALL_GAMES.sort((a, b) => {
    const ta = a._translatorName || "";
    const tb = b._translatorName || "";
    if (ta !== tb) return ta.localeCompare(tb);
    const aa = a.cleanTitle || a.title || "";
    const bb = b.cleanTitle || b.title || "";
    return aa.localeCompare(bb);
  });

  $("status").textContent = `Bases chargées : ${okCount}/${results.length} · Jeux total : ${totalGames}`;
  applyFilter();
}

// init
$("q").addEventListener("input", () => applyFilter());
$("reload").addEventListener("click", () => loadAll());

loadAll().catch((e) => {
  $("status").textContent = "Erreur : " + (e && e.message ? e.message : String(e));
});
