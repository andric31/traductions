(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // =========================
  // Helpers
  // =========================
  function normalize(s){
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractGames(raw){
    if (Array.isArray(raw)) return raw;
    if (!raw || typeof raw !== "object") return [];
    if (Array.isArray(raw.games)) return raw.games;
    if (Array.isArray(raw.items)) return raw.items;
    return [];
  }

  function parseFrenchDateFR(s){
    // "28 décembre 2025" -> Date
    const str = String(s || "").trim();
    const m = str.match(/^(\d{1,2})\s+([a-zéèêëàâîïôöùûç]+)\s+(\d{4})$/i);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const monthName = normalize(m[2]);
    const year = parseInt(m[3], 10);
    const months = {
      janvier:0, fevrier:1, février:1, mars:2, avril:3, mai:4, juin:5, juillet:6,
      aout:7, août:7, septembre:8, octobre:9, novembre:10, decembre:11, décembre:11,
    };
    const mo = months[monthName];
    if (mo === undefined) return null;
    const d = new Date(year, mo, day);
    if (!Number.isFinite(d.getTime())) return null;
    return d;
  }

  function sortKeyDate(g){
    const d = parseFrenchDateFR(g.updatedAtLocal || g.updatedAt || "");
    return d ? d.getTime() : 0;
  }

  function getDisplayTitle(g){
    return String(g.cleanTitle || g.title || "Sans titre").trim() || "Sans titre";
  }

  function getThreadId(g){
    return String(g.collection || g.id || "").trim();
  }

  function buildF95UrlFromEntry(g){
    return String(g.url || "").trim();
  }

  function buildTranslatorGameUrl(tKey, id){
    const base = `/${encodeURIComponent(String(tKey||"").trim())}/`;
    if (id) return `${base}?id=${encodeURIComponent(id)}`;
    return base;
  }

  function escapeHtml(s){
    return String(s||"").replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));
  }

  // =========================
  // State
  // =========================
  const state = {
    manifest: [],
    translators: [], // {key,name,avatarUrl}
    gamesByKey: new Map(), // key -> games[]
    merged: [], // merged cards

    // UI
    q: "",
    sort: "updatedAtLocal-desc",
    cols: "auto",
    pageSize: 50,
    visible: 0,
  };

  // =========================
  // Data loading
  // =========================
  async function fetchJson(url){
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  async function loadManifest(){
    try{
      const j = await fetchJson("/traducteurs_manifest.json");
      state.manifest = Array.isArray(j) ? j : [];
    }catch{
      state.manifest = [];
    }

    state.translators = state.manifest
      .map(x => ({
        key: String(x?.key || "").trim(),
        name: String(x?.name || x?.key || "").trim(),
        avatar: String(x?.avatar || "").trim(),
      }))
      .filter(x => x.key);
  }

  async function loadAllLists(){
    const tasks = state.translators.map(async (t) => {
      const url = `/f95list_${t.key}.json`;
      try{
        const raw = await fetchJson(url);
        const games = extractGames(raw).map(g => ({...g, __tKey: t.key, __tName: t.name}));
        state.gamesByKey.set(t.key, games);
      }catch{
        state.gamesByKey.set(t.key, []);
      }
    });

    await Promise.all(tasks);
  }

  function mergeGames(){
    const byId = new Map();

    for (const t of state.translators){
      const list = state.gamesByKey.get(t.key) || [];
      for (const g of list){
        const id = getThreadId(g);
        if (!id) continue;
        const title = getDisplayTitle(g);

        let m = byId.get(id);
        if (!m){
          m = {
            id,
            title,
            imageUrl: String(g.imageUrl || "").trim(),
            f95url: buildF95UrlFromEntry(g),
            trads: [],
            maxDate: 0,
          };
          byId.set(id, m);
        }

        if (!m.imageUrl && g.imageUrl) m.imageUrl = String(g.imageUrl);
        if (!m.f95url && g.url) m.f95url = String(g.url);

        const d = sortKeyDate(g);
        if (d > m.maxDate) {
          m.maxDate = d;
          m.title = title;
        }

        m.trads.push({
          key: t.key,
          name: t.name,
          uid: g.uid,
          updatedAtLocal: g.updatedAtLocal || g.updatedAt || "",
          entry: g,
        });
      }
    }

    state.merged = [...byId.values()];
  }

  // =========================
  // UI rendering (viewer)
  // =========================
  function applyCols(){
    const grid = $("grid");
    if (!grid) return;
    const v = String(state.cols || "auto");
    grid.style.gridTemplateColumns = (v === "auto")
      ? "repeat(auto-fit, minmax(260px, 1fr))"
      : `repeat(${Math.max(1, parseInt(v,10) || 1)}, minmax(260px, 1fr))`;
  }

  function formatTitle(t){
    return String(t||"").trim();
  }

  function renderCard(m){
    const href = `/liste/?id=${encodeURIComponent(m.id)}`;

    const imgHtml = m.imageUrl
      ? `<img class="thumb" src="${escapeHtml(m.imageUrl)}" alt="" loading="lazy"
             onerror="this.classList.add('is-fallback');this.style.objectFit='contain';this.src='/default-avatar.png';">`
      : `<div class="thumb is-fallback" style="display:flex;align-items:center;justify-content:center;font-weight:900;opacity:.7;">🧩</div>`;

    const badges = (m.trads || [])
      .slice(0, 6)
      .map(t => `<span class="badge">${escapeHtml(t.name)}</span>`)
      .join("");

    const more = (m.trads || []).length > 6 ? `<span class="badge">+${(m.trads.length-6)}</span>` : "";

    return `
      <a class="card card-link" href="${href}">
        ${imgHtml}
        <div class="body">
          <div class="name">${escapeHtml(formatTitle(m.title))}</div>
          <div class="badges-line">${badges}${more}</div>
        </div>
      </a>
    `;
  }

  function applyFilters(){
    const qn = normalize(state.q);
    let arr = state.merged.slice();

    if (qn){
      arr = arr.filter(m => {
        const t = normalize(m.title);
        if (t.includes(qn)) return true;
        return (m.trads || []).some(tr => normalize(tr.name).includes(qn) || normalize(tr.key).includes(qn));
      });
    }

    if (state.sort === "title-asc"){
      arr.sort((a,b) => normalize(a.title).localeCompare(normalize(b.title), 'fr'));
    } else if (state.sort === "title-desc"){
      arr.sort((a,b) => normalize(b.title).localeCompare(normalize(a.title), 'fr'));
    } else {
      arr.sort((a,b) => (b.maxDate||0) - (a.maxDate||0));
    }

    return arr;
  }

  function renderViewer(){
    const grid = $("grid");
    const empty = $("empty");
    const moreWrap = $("moreWrap");
    const total = $("countTotal");

    if (!grid) return;

    const list = applyFilters();
    const pageSize = (String(state.pageSize) === "all") ? list.length : (parseInt(state.pageSize,10) || 50);

    if (state.visible <= 0) state.visible = Math.min(pageSize, list.length);

    const visibleList = list.slice(0, state.visible);

    grid.innerHTML = visibleList.map(renderCard).join("");

    if (total) total.textContent = String(list.length);

    const hasMore = state.visible < list.length;
    if (moreWrap) moreWrap.style.display = hasMore ? "flex" : "none";

    if (empty) empty.style.display = (list.length === 0) ? "block" : "none";
  }

  // =========================
  // UI rendering (game selector)
  // =========================
  function renderGameSelector(id){
    const m = state.merged.find(x => String(x.id) === String(id));

    const titleEl = $("gTitle");
    const subEl = $("gSub");
    const chips = $("gChips");
    const grid = $("tgrid");
    const openF95 = $("openF95");

    if (!m){
      if (titleEl) titleEl.textContent = "Jeu introuvable";
      if (subEl) subEl.textContent = "Impossible de trouver ce jeu dans les listes.";
      if (chips) chips.innerHTML = "";
      if (grid) grid.innerHTML = "";
      if (openF95) openF95.style.display = "none";
      return;
    }

    if (titleEl) titleEl.textContent = m.title;
    if (subEl) subEl.textContent = `Disponible chez ${m.trads.length} traducteur(s).`;

    if (openF95){
      const url = m.f95url || (m.trads[0]?.entry?.url || "");
      if (url){
        openF95.href = url;
        openF95.style.display = "inline-flex";
      }else{
        openF95.style.display = "none";
      }
    }

    if (chips){
      chips.innerHTML = (m.trads || []).map(t => `<span class="chip">${escapeHtml(t.name)}</span>`).join("");
    }

    if (grid){
      const cards = (m.trads || [])
        .sort((a,b) => normalize(a.name).localeCompare(normalize(b.name),'fr'))
        .map(t => {
          const avatar = t.key ? `/${encodeURIComponent(t.key)}/avatar.png` : "/default-avatar.png";
          const href = buildTranslatorGameUrl(t.key, m.id);
          const when = String(t.updatedAtLocal||"").trim();
          return `
            <div class="tcard">
              <img class="tavatar" src="${escapeHtml(avatar)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='/default-avatar.png'">
              <div class="tmeta">
                <div class="tname">${escapeHtml(t.name)}</div>
                <div class="tline">📅 ${escapeHtml(when || "—")}</div>
              </div>
              <div class="tactions">
                <a class="btn-mini" href="${href}">Ouvrir</a>
              </div>
            </div>
          `;
        }).join("");

      grid.innerHTML = cards;
    }
  }

  // =========================
  // Mode routing
  // =========================
  function getParams(){
    try{
      const p = new URLSearchParams(location.search);
      const id = String(p.get("id") || "").trim();
      return { id };
    }catch{ return { id: "" }; }
  }

  function setModeGame(on){
    document.body.classList.toggle("mode-game", !!on);
  }

  // =========================
  // Init
  // =========================
  function bindUI(){
    $("search")?.addEventListener("input", (e) => {
      state.q = e.target.value || "";
      state.visible = 0;
      renderViewer();
    });

    $("sort")?.addEventListener("change", (e) => {
      state.sort = e.target.value || "updatedAtLocal-desc";
      state.visible = 0;
      renderViewer();
    });

    $("cols")?.addEventListener("change", (e) => {
      state.cols = e.target.value || "auto";
      applyCols();
    });

    $("pageSize")?.addEventListener("change", (e) => {
      state.pageSize = e.target.value || 50;
      state.visible = 0;
      renderViewer();
    });

    $("more")?.addEventListener("click", () => {
      const list = applyFilters();
      const pageSize = (String(state.pageSize) === "all") ? list.length : (parseInt(state.pageSize,10) || 50);
      state.visible = Math.min(list.length, (state.visible || 0) + pageSize);
      renderViewer();
    });

    $("refresh")?.addEventListener("click", async () => {
      try{
        $("grid").innerHTML = "";
        state.visible = 0;
        await boot(true);
      }catch{}
    });
  }

  async function boot(forceReload){
    // hamburger : retour accueil (simple)
    $("hamburgerBtnViewer")?.addEventListener("click", () => {
      location.href = "/";
    });

    if (forceReload){
      state.gamesByKey.clear();
      state.merged = [];
    }

    await loadManifest();
    await loadAllLists();
    mergeGames();

    const { id } = getParams();
    if (id){
      setModeGame(true);
      renderGameSelector(id);
    } else {
      setModeGame(false);
      applyCols();
      renderViewer();
    }
  }

  bindUI();
  boot(false);

})();
