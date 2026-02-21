"use strict";

const DEFAULT_URL = ""; // et on bloque toute tentative de fallback

// -------- URL helpers (comme viewer) --------
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
    .replace(/\p{Diacritic}/gu, "");
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return await r.json();
}

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

// ✅ ratings bulk (doit exister côté backend)
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

// -------- UI state --------
const els = {
  q: document.getElementById("q"),
  metric: document.getElementById("metric"),
  top: document.getElementById("top"),

  // pages traducteurs
  statusPages: document.getElementById("statusPages"),
  pagesTbody: document.getElementById("pagesTbody"),
  tblPages: document.getElementById("tblPages"),

  statusChart: document.getElementById("statusChart"),
  statusTable: document.getElementById("statusTable"),

  btnChartExpand: document.getElementById("btnChartExpand"),

  chart: document.getElementById("chart"),
  tbody: document.getElementById("tbody"),
  tbl: document.getElementById("tbl"),

  tableWrap: document.querySelector(".table-wrap"),
  chartWrap: document.querySelector(".chart-wrap"),
};

const state = {
  srcUrl: getListUrl(),
  games: [],

  manifest: [], // [{key,name,listUrl,openBase,statsDisabled?}]

  statsByKey: new Map(),   // key -> {views,likes,mega}
  ratingByKey: new Map(),  // key -> {avg,count,sum}

  sortKey: "views",
  sortDir: "desc",

  renderLimit: 50,
  renderStep: 50,

  chartExpanded: false,
};

// ============================================================================
// ✅ Pages traducteurs (vues page d'accueil de chaque dossier)
//   Clé : t:<slug>:page:index
// ============================================================================
function pageKeyOfSlug(slug) {
  const s = String(slug || "root").trim() || "root";
  return `t:${s}:page:index`;
}

function translatorHomeUrl(slug) {
  const s = String(slug || "").trim();
  if (!s) return "/";
  return `/${encodeURIComponent(s)}/`;
}

function renderPagesTable() {
  if (!els.pagesTbody) return;

  const frag = document.createDocumentFragment();
  els.pagesTbody.innerHTML = "";

  const rows = (state.manifest || []).map((t) => {
    const slug = String(t?.key || "root").trim() || "root";
    const name = String(t?.name || slug).trim() || slug;
    const key = pageKeyOfSlug(slug);
    const views = (state.statsByKey.get(key)?.views ?? 0) | 0;
    const gamesCount = (t?._gamesCount ?? 0) | 0;
    const disabled = !!t?.statsDisabled;
    return { slug, name, key, views, gamesCount, disabled };
  });

  // tri par vues desc
  rows.sort((a, b) => (b.views - a.views) || a.name.localeCompare(b.name, "fr"));

  for (const r of rows) {
    const tr = document.createElement("tr");

    // clic => ouvre la page traducteur
    tr.addEventListener("click", () => {
      location.href = translatorHomeUrl(r.slug);
    });

    const tdName = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "pill" + (r.disabled ? " pill-warn" : "");
    badge.textContent = r.slug;
    const label = document.createElement("span");
    label.textContent = r.name;
    tdName.appendChild(badge);
    tdName.appendChild(label);

    const tdViews = document.createElement("td");
    tdViews.className = "num";
    tdViews.textContent = (r.views | 0).toLocaleString("fr-FR");

    const tdGames = document.createElement("td");
    tdGames.className = "num";
    tdGames.textContent = (r.gamesCount | 0).toLocaleString("fr-FR");

    const tdDisabled = document.createElement("td");
    tdDisabled.className = "num";
    tdDisabled.textContent = r.disabled ? "⏸️" : "✅";

    tr.appendChild(tdName);
    tr.appendChild(tdViews);
    tr.appendChild(tdGames);
    tr.appendChild(tdDisabled);
    frag.appendChild(tr);
  }

  els.pagesTbody.appendChild(frag);

  if (els.statusPages) {
    const n = rows.length;
    const totalViews = rows.reduce((a, r) => a + (r.views | 0), 0);
    els.statusPages.textContent = `${n} pages · ${totalViews.toLocaleString("fr-FR")} vues`;
  }
}

// ============================================================================
// ✅ UID ONLY — clé unique
// ============================================================================
function counterKeyOf(g) {
  const slug = String(g?._slug || "root").trim();
  const uid = String(g?.uid ?? "").trim();
  return uid ? `t:${slug}:uid:${uid}` : "";
}

// URL de la page jeu correspondante (uid only)
function getGameUrlForEntry(g) {
  const base = String(g?._openBase || "/game/").trim() || "/game/";
  let u;
  try {
    u = new URL(base, location.origin);
  } catch {
    u = new URL("/game/", location.origin);
  }

  const uid = String(g?.uid ?? "").trim();
  if (uid) u.searchParams.set("uid", uid);

  // on garde src si page andric31 (compat), sinon inutile
  const p = new URLSearchParams(location.search);
  const src = (p.get("src") || "").trim();
  if (src && u.origin === location.origin && u.pathname.startsWith("/game/")) {
    u.searchParams.set("src", src);
  }

  return u.toString();
}

// -------- filtering / sorting --------
function getFiltered() {
  const q = normalize(els.q?.value?.trim() || "");
  let list = state.games;

  if (q) {
    list = list.filter((g) => {
      const hay = normalize(
        [
          g._tradName || "",
          g._slug || "",
          g.id,
          g.uid,
          g.title,
          g.cleanTitle,
          (g.tags || []).join(" "),
          g.collection || "",
          g.updatedAt || "", // filtrable même si plus affiché
        ].join("  ")
      );
      return hay.includes(q);
    });
  }

  // ✅ filtre traducteur (select #translator)
  const tf = (document.body?.dataset?.tradFilter || "all").trim();
  if (tf && tf !== "all") {
    // ✅ andric31 : stats jeux désactivées temporairement
    if (tf === "andric31") {
      list = [];
    } else {
      list = list.filter(g => String(g?._slug || "").trim() === tf);
    }
  }

  for (const g of list) {
    const key = counterKeyOf(g);

    const s = state.statsByKey.get(key) || { views: 0, likes: 0, mega: 0 };
    g._views = s.views | 0;
    g._likes = s.likes | 0;
    g._mega  = s.mega  | 0;

    const r = state.ratingByKey.get(key) || { avg: 0, count: 0, sum: 0 };
    g._ratingAvg = Number(r.avg || 0);
    g._ratingCount = Number(r.count || 0);

    g._ckey = key;
  }

  return list;
}

function sortList(list) {
  const key = state.sortKey;
  const dir = state.sortDir === "asc" ? 1 : -1;

  const getv = (g) => {
    if (key === "title") return String(g.cleanTitle || g.title || "");
    if (key === "views") return g._views | 0;
    if (key === "likes") return g._likes | 0;
    if (key === "mega") return g._mega | 0;
    if (key === "ratingAvg") return Number(g._ratingAvg || 0);
    if (key === "ratingCount") return g._ratingCount | 0;
    return "";
  };

  return list.slice().sort((a, b) => {
    const va = getv(a), vb = getv(b);

    // ratingAvg : float (avec tie-breaker votes)
    if (key === "ratingAvg") {
      if (va !== vb) return (va - vb) * dir;
      const ca = a._ratingCount | 0, cb = b._ratingCount | 0;
      if (ca !== cb) return (ca - cb) * dir;
      return String(a.cleanTitle || a.title || "").localeCompare(String(b.cleanTitle || b.title || ""), "fr");
    }

    // ratingCount : tie-breaker avg
    if (key === "ratingCount") {
      if (va !== vb) return (va - vb) * dir;
      const ra = Number(a._ratingAvg || 0), rb = Number(b._ratingAvg || 0);
      if (ra !== rb) return (ra - rb) * dir;
      return String(a.cleanTitle || a.title || "").localeCompare(String(b.cleanTitle || b.title || ""), "fr");
    }

    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), "fr") * dir;
  });
}

// -------- table render --------
function fmtRating(avg, count) {
  const a = Number(avg || 0);
  const c = Number(count || 0);
  if (c <= 0 || a <= 0) return "—";
  return `${a.toFixed(1)}/4`;
}

function renderTable(list) {
  if (!els.tbody) return;

  els.tbody.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const g of list) {
    const tr = document.createElement("tr");
    tr.addEventListener("click", () => (location.href = getGameUrlForEntry(g)));

    const imgTd = document.createElement("td");
    imgTd.className = "c-cover";
    const img = document.createElement("img");
    img.className = "cover";
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = "";

    // ✅ comme viewer : évite certains refus d’affichage
    img.referrerPolicy = "no-referrer";

    img.src = (g.imageUrl || "").trim() || "/favicon.png";

    // ✅ fallback si hotlink/bad url
    img.onerror = () => {
      img.onerror = null;
      img.src = "/favicon.png";
      img.classList.add("is-fallback");
    };
    imgTd.appendChild(img);

    const titleTd = document.createElement("td");
    const tl = document.createElement("div");
    tl.className = "title-line";

    const badge = document.createElement("span");
    badge.className = "pill";
    badge.textContent = String(g._tradName || g._slug || "");

    const t = document.createElement("div");
    t.textContent = g.cleanTitle || g.title || "";

    tl.appendChild(badge);
    tl.appendChild(t);
    titleTd.appendChild(tl);

    const sub = document.createElement("div");
    sub.className = "small";

    const uid = String(g.uid ?? "").trim();
    const id  = String(g.id  ?? "").trim();

    if (uid && id) sub.textContent = `uid:${uid} | id:${id}`;
    else if (uid) sub.textContent = `uid:${uid}`;
    else if (id) sub.textContent = `id:${id}`;
    else sub.textContent = "(no id)";

    titleTd.appendChild(sub);

    const vTd = document.createElement("td");
    vTd.className = "num";
    vTd.textContent = (g._views | 0).toLocaleString("fr-FR");

    const mTd = document.createElement("td");
    mTd.className = "num";
    mTd.textContent = (g._mega | 0).toLocaleString("fr-FR");

    const lTd = document.createElement("td");
    lTd.className = "num";
    lTd.textContent = (g._likes | 0).toLocaleString("fr-FR");

    const rcTd = document.createElement("td");
    rcTd.className = "num";
    rcTd.textContent = (g._ratingCount | 0).toLocaleString("fr-FR");

    const raTd = document.createElement("td");
    raTd.className = "num";
    raTd.textContent = fmtRating(g._ratingAvg, g._ratingCount);

    tr.appendChild(imgTd);
    tr.appendChild(titleTd);
    tr.appendChild(vTd);
    tr.appendChild(mTd); // 📥
    tr.appendChild(lTd); // ❤️
    tr.appendChild(rcTd);
    tr.appendChild(raTd);

    frag.appendChild(tr);
  }

  els.tbody.appendChild(frag);
}

// -------- Chart (canvas, sans lib) --------
function metricValue(g, metric) {
  if (metric === "views") return g._views | 0;
  if (metric === "likes") return g._likes | 0;
  if (metric === "mega") return g._mega | 0;
  if (metric === "ratingCount") return g._ratingCount | 0;
  if (metric === "ratingAvg") return Number(g._ratingAvg || 0);
  return 0;
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function getChartTakeCount(sortedLen) {
  const topN = Number(els.top?.value || 20);
  if (!Number.isFinite(topN)) return Math.min(20, sortedLen);
  if (topN <= 0) return sortedLen; // "Tout"
  return Math.min(topN, sortedLen);
}

function drawChart(sorted) {
  if (!els.chart) return;

  const canvas = els.chart;
  const ctx = canvas.getContext("2d");

  const metric = els.metric?.value || "views";
  const take = getChartTakeCount(sorted.length);

  const items = sorted
    .slice()
    .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
    .slice(0, take);

  const rowPx = 26;
  const padT = 8;
  const padB = 32; // place pour chiffres en bas
  const desiredCssH = padT + padB + items.length * rowPx;

  canvas.style.height = desiredCssH + "px";

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 1200;
  const cssH = desiredCssH;

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssW, cssH);

  const padL = 260, padR = 80;
  const innerW = Math.max(50, cssW - padL - padR);
  const innerH = Math.max(50, cssH - padT - padB);

  ctx.strokeStyle = "rgba(170,178,200,.18)";
  ctx.lineWidth = 1;

  const maxV = Math.max(1e-9, ...items.map((it) => metricValue(it, metric)));
  const gridN = 5;

  for (let i = 0; i <= gridN; i++) {
    const x = padL + (innerW * i) / gridN;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + innerH);
    ctx.stroke();

    const val = (maxV * i) / gridN;
    ctx.fillStyle = "rgba(170,178,200,.7)";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";

    const label =
      metric === "ratingAvg"
        ? val.toFixed(1)
        : Math.round(val).toLocaleString("fr-FR");

    ctx.fillText(label, x, padT + innerH + 18);
  }

  const rowH = innerH / Math.max(1, items.length);
  const barH = Math.max(10, Math.min(18, rowH * 0.62));
  const y0 = padT + rowH / 2;

  ctx.font = "12px system-ui";
  ctx.textBaseline = "middle";

  items.forEach((it, idx) => {
    const y = y0 + idx * rowH;
    const v = metricValue(it, metric);
    const w = Math.max(0, innerW * (v / maxV));

    ctx.fillStyle = "rgba(232,234,240,.92)";
    ctx.textAlign = "right";
    const label = (it.cleanTitle || it.title || "").slice(0, 42);
    ctx.fillText(label, padL - 10, y);

    ctx.fillStyle = "rgba(90,162,255,.55)";
    roundRect(ctx, padL, y - barH / 2, w, barH, 8);
    ctx.fill();

    ctx.fillStyle = "rgba(232,234,240,.86)";
    ctx.textAlign = "left";

    const txt =
      metric === "ratingAvg"
        ? (v > 0 ? v.toFixed(1) + "/4" : "—")
        : Math.round(v).toLocaleString("fr-FR");

    const tx = Math.min(padL + w + 8, cssW - padR + 4);
    ctx.fillText(txt, tx, y);
  });

  canvas.onclick = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (x < padL || x > cssW - padR || y < padT || y > padT + innerH) return;

    const idx = Math.floor((y - padT) / rowH);
    const item = items[idx];
    if (item) location.href = getGameUrlForEntry(item);
  };

  if (els.statusChart) {
    const labelTop = (Number(els.top?.value || 20) <= 0) ? "Tout" : `Top ${take}`;
    els.statusChart.textContent = `${labelTop} — ${take}/${sorted.length} jeux`;
  }
}

// -------- chart expand --------
function applyChartExpandUI() {
  if (!els.chartWrap) return;

  if (state.chartExpanded) {
    els.chartWrap.style.maxHeight = "none";
    els.chartWrap.style.overflow = "visible";
    if (els.btnChartExpand) els.btnChartExpand.textContent = "➖";
  } else {
    els.chartWrap.style.maxHeight = "";
    els.chartWrap.style.overflow = "";
    if (els.btnChartExpand) els.btnChartExpand.textContent = "➕";
  }
}

function toggleChartExpand() {
  state.chartExpanded = !state.chartExpanded;
  applyChartExpandUI();
  rerender({ chart: true });
}

// -------- rendering --------
function resetLimit() {
  state.renderLimit = state.renderStep;
  if (els.tableWrap) els.tableWrap.scrollTop = 0;
}

function rerender(opts = { chart: true }) {
  const filtered = getFiltered();
  const sorted = sortList(filtered);

  const visible = sorted.slice(0, state.renderLimit);
  renderTable(visible);

  if (opts.chart) drawChart(sorted);

  if (els.statusTable) {
    const total = state.games.length;
    els.statusTable.textContent =
      `${visible.length}/${sorted.length} affichés (filtrés) — total liste: ${total}`;
  }
}

// -------- events --------
function wireEvents() {
  let t = null;
  const deb = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      resetLimit();
      rerender();
    }, 120);
  };

  if (els.q) els.q.addEventListener("input", deb);

  if (els.metric) {
    els.metric.addEventListener("change", () => {
      rerender({ chart: true });
    });
  }

  if (els.top) {
    els.top.addEventListener("change", () => {
      if (els.chartWrap) els.chartWrap.scrollTop = 0;
      rerender({ chart: true });
    });
  }

  if (els.btnChartExpand) {
    els.btnChartExpand.addEventListener("click", toggleChartExpand);
  }

  // ✅ tri
  if (els.tbl) {
    els.tbl.querySelectorAll("thead th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const k = th.getAttribute("data-sort");
        if (!k) return;

        if (state.sortKey === k) state.sortDir = (state.sortDir === "asc") ? "desc" : "asc";
        else {
          state.sortKey = k;
          state.sortDir = (k === "title") ? "asc" : "desc";
        }

        if (k === "ratingAvg") state.sortDir = "desc";
        if (k === "ratingCount") state.sortDir = "desc";

        resetLimit();
        rerender();
      });
    });
  }

  window.addEventListener("resize", () => rerender({ chart: true }));

  // Scroll intelligent (table)
  const tryLoadMore = () => {
    const sorted = sortList(getFiltered());
    if (state.renderLimit >= sorted.length) return;

    const threshold = 260;

    const wrap = els.tableWrap;
    const tableIsScrollable = wrap && wrap.scrollHeight > wrap.clientHeight + 5;

    if (tableIsScrollable) {
      const nearBottomTable =
        (wrap.scrollTop + wrap.clientHeight) >= (wrap.scrollHeight - threshold);
      if (!nearBottomTable) return;
    } else {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const winH = window.innerHeight || doc.clientHeight || 0;
      const fullH = Math.max(doc.scrollHeight, document.body.scrollHeight);

      const nearBottomPage = (scrollTop + winH) >= (fullH - threshold);
      if (!nearBottomPage) return;
    }

    state.renderLimit = Math.min(state.renderLimit + state.renderStep, sorted.length);
    rerender({ chart: false });
  };

  let raf = 0;

  window.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tryLoadMore);
  }, { passive: true });

  if (els.tableWrap) {
    els.tableWrap.addEventListener("scroll", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tryLoadMore);
    }, { passive: true });
  }
}

// -------- init --------
async function init() {
  if (els.statusChart) els.statusChart.textContent = "Chargement manifest…";
  if (els.statusTable) els.statusTable.textContent = "Chargement…";
  if (els.statusPages) els.statusPages.textContent = "Chargement…";

  let manifest = [];
  try {
    manifest = await fetchJson("/traducteurs_manifest.json");
    if (!Array.isArray(manifest)) manifest = [];
  } catch (e) {
    if (els.statusChart) els.statusChart.textContent = "Erreur: manifest introuvable";
    if (els.statusTable) els.statusTable.textContent = "Erreur: manifest introuvable";
    console.error(e);
    return;
  }

  const selTrad = document.getElementById("translator");
  if (selTrad) {
    selTrad.innerHTML =
      `<option value="all">Tous traducteurs</option>` +
      manifest.map(t => {
        const k = String(t.key || "").trim();
        const n = String(t.name || t.key || "").trim();
        const disabled = (k === "andric31");
        const label = disabled ? `${n} (stats jeux désactivées)` : n;
        return `<option value="${k}">${label}</option>`;
      }).join("");
  }

  const games = [];
  const manifestOut = [];
  for (const t of manifest) {
    const slug = String(t?.key || "").trim() || "root";
    const name = String(t?.name || t?.key || slug).trim();
    const listUrl = String(t?.listUrl || "").trim();
    const openBase = String(t?.openBase || "/game/").trim() || "/game/";

    // ⚠️ andric31 : stats jeux désactivées temporairement (les jeux sont sur un autre site)
    const statsDisabled = (slug === "andric31");

    if (!listUrl) continue;

    const mEntry = { key: slug, name, listUrl, openBase, statsDisabled, _gamesCount: 0 };
    manifestOut.push(mEntry);

    try {
      const raw = await fetchJson(listUrl);
      const list = extractGames(raw).map((g) => ({ ...g }));

      // nb de jeux (uid only)
      mEntry._gamesCount = list.filter(x => String(x?.uid ?? "").trim()).length;

      if (statsDisabled) {
        // on n'affiche pas les stats jeux pour ce traducteur
        continue;
      }

      for (const g of list) {
        const uid = String(g?.uid ?? "").trim();
        if (!uid) continue;

        g._slug = slug;
        g._tradName = name;
        g._openBase = openBase;
        games.push(g);
      }
    } catch (e) {
      console.warn("Liste KO:", slug, listUrl, e);
    }
  }

  state.games = games;
  state.manifest = manifestOut;

  if (els.statusChart) els.statusChart.textContent = "Chargement stats…";
  if (els.statusTable) els.statusTable.textContent = "Chargement stats…";

  const gameKeys = state.games.map(counterKeyOf).filter(Boolean);
  const pageKeys = state.manifest.map(t => pageKeyOfSlug(t.key)).filter(Boolean);
  const keys = Array.from(new Set([...gameKeys, ...pageKeys]));

  // 1) counters
  const statsObj = await fetchGameStatsBulk(keys);
  for (const k of keys) {
    const s = statsObj?.[k] || { views: 0, likes: 0, mega: 0 };
    state.statsByKey.set(k, {
      views: Number(s.views || 0),
      likes: Number(s.likes || 0),
      mega: Number(s.mega || 0),
    });
  }

  // 2) ratings
  const ratingsObj = await fetchRatingsBulk(keys);
  for (const k of keys) {
    const r = ratingsObj?.[k] || { avg: 0, count: 0, sum: 0 };
    state.ratingByKey.set(k, {
      avg: Number(r.avg || 0),
      count: Number(r.count || 0),
      sum: Number(r.sum || 0),
    });
  }

  if (els.statusChart) els.statusChart.textContent = `OK · ${state.games.length} jeux`;
  if (els.statusTable) els.statusTable.textContent = `OK · ${state.games.length} jeux`;

  // ✅ pages traducteurs
  renderPagesTable();

  // ✅ filtre traducteur (remplace les résidus renderAll/bindUi)
  if (selTrad) {
    selTrad.addEventListener("change", () => {
      document.body.dataset.tradFilter = selTrad.value || "all";
      resetLimit();

      if ((selTrad.value || "").trim() === "andric31") {
        if (els.statusTable) els.statusTable.textContent = "⏸️ Stats jeux désactivées temporairement pour andric31";
        if (els.statusChart) els.statusChart.textContent = "⏸️ Stats jeux désactivées temporairement pour andric31";
        rerender({ chart: true });
        return;
      }

      rerender({ chart: true });
    });
    document.body.dataset.tradFilter = selTrad.value || "all";
  } else {
    document.body.dataset.tradFilter = "all";
  }

  // ✅ events + rendu initial (remplace bindUi/renderAll)
  wireEvents();
  resetLimit();
  rerender({ chart: true });
}

init();