/* Présentation complémentaire : utilise les données et le routage du traducteur.
   Le script game.js propre à chaque traducteur reste inchangé. */
(() => {
  "use strict";
  if (!document.body.classList.contains("mode-game")) return;

  // Seul le dessin change : game.js conserve le stockage, le compteur et le clic.
  const likeButton = document.getElementById("btnLike");
  if (likeButton) {
    const thumbPath = '<path d="M8 21H5.5A1.5 1.5 0 0 1 4 19.5v-7A1.5 1.5 0 0 1 5.5 11H8m0 10V11m0 10h8.2c.8 0 1.4-.5 1.6-1.3l1.1-5.2c.2-.9-.5-1.8-1.5-1.8H13V7.8c0-1-.8-1.8-1.8-1.8h-.1L8 11"/>';
    const observer = new MutationObserver(syncThumb);
    function syncThumb() {
      const liked = likeButton.getAttribute("aria-label") === "Je n’aime plus";
      observer.disconnect();
      const current = likeButton.querySelector(".likeIconSvg");
      if (!current || current.classList.contains("likeIconSvg--liked") !== liked) {
        likeButton.innerHTML = `<svg class="likeIconSvg${liked ? " likeIconSvg--liked" : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${thumbPath}</svg>`;
      }
      likeButton.setAttribute("aria-pressed", String(liked));
      likeButton.title = liked ? "Je n’aime plus" : "J’aime";
      observer.observe(likeButton, { childList: true, attributes: true, attributeFilter: ["aria-label"] });
    }
    syncThumb();
  }

  const dataOf = game => game?.gameData || game || {};
  const tagsOf = game => [...new Set((dataOf(game).tags || game?.tags || [])
    .map(tag => String(tag || "").trim().toLowerCase()).filter(Boolean))];
  const keyOf = game => {
    const { id, uid, collection } = game || {};
    if (collection && uid != null) return `c:${collection}|u:${uid}`;
    if (id) return `id:${id}`;
    return uid != null ? `uid:${uid}` : "";
  };
  const slugOf = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const commonCount = (a, b) => a.filter(value => b.includes(value)).length;
  const timestampOf = game => {
    const data = dataOf(game);
    for (const value of [data.updatedAtLocal, game.updatedAtLocal, data.createdAtLocal, game.createdAtLocal]) {
      const ts = Date.parse(value || "");
      if (Number.isFinite(ts)) return ts;
    }
    return 0;
  };

  function badgeParts(game) {
    const data = dataOf(game);
    const parsed = F95Engines.cleanTitle(data.title || game.title || "");
    return {
      categories: game.collection ? ["Collection"] : parsed.categories,
      engines: F95Engines.enginesFromGame(game, parsed.engines),
      status: data.status || parsed.status || ""
    };
  }

  function sameCollection(a, b) {
    return keyOf(a) === keyOf(b) ||
      (a.id && b.collection && String(a.id) === String(b.collection)) ||
      (b.id && a.collection && String(b.id) === String(a.collection)) ||
      (a.collection && b.collection && String(a.collection) === String(b.collection));
  }

  function titleWords(game) {
    const title = F95Engines.cleanTitle(getDisplayTitle(game)).title;
    return [...new Set(title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\[[^\]]*\]/g, " ").split(/[^a-z0-9]+/).filter(word => word.length >= 4))];
  }

  function score(base, candidate) {
    const tags = tagsOf(candidate);
    const matches = commonCount(tagsOf(base), tags);
    if (!matches) return 0;
    const a = badgeParts(base), b = badgeParts(candidate);
    return matches * 100 + Math.min(30, tags.length) + Math.min(25, matches * 5) +
      commonCount(titleWords(base), titleWords(candidate)) * 8 +
      (commonCount(a.engines, b.engines) ? 20 : 0) +
      (commonCount(a.categories, b.categories) ? 10 : 0);
  }

  function urlFor(path, source) {
    const url = new URL(path, location.origin);
    // Conserve aussi la liste choisie par ?src=, y compris après un clic de recommandation.
    if (source && source !== DEFAULT_URL) url.searchParams.set("src", source);
    return url.pathname + url.search;
  }

  function cardHtml(game, source) {
    const title = getDisplayTitle(game);
    const parts = badgeParts(game);
    const badges = [
      ...parts.categories.map(value => ["cat", value]),
      ...parts.engines.map(value => ["eng", value]),
      ...(parts.status ? [["status", parts.status]] : [])
    ].map(([type, value]) => `<span class="badge ${type} ${type}-${slugOf(value)}">${escapeHtml(value)}</span>`).join("");
    const time = timestampOf(game);
    return `<a class="similarCard card card-link" href="${escapeHtml(urlFor(buildGameUrl(game), source))}" target="_blank" rel="noopener" aria-label="Ouvrir : ${escapeHtml(title)}">
      <img class="similarThumb thumb" alt="" referrerpolicy="no-referrer" loading="lazy" decoding="async">
      <div class="similarBody body">
        <h3 class="similarTitle name clamp-2">${escapeHtml(title)}</h3>
        <div class="similarBadges badges-line">${badges}</div>
        <div class="card-meta"><div class="card-stats" aria-label="Statistiques de la vignette">
          ${time ? `<span class="card-stat" title="${escapeHtml(formatAbsoluteDateTime(time))}"><span class="stat-icon stat-icon-time" aria-hidden="true"></span><span>${escapeHtml(formatRelativeTranslationTime(time))}</span></span>` : ""}
        </div></div>
      </div>
    </a>`;
  }

  async function addStats(card, game) {
    const key = buildCounterKeyFromEntry(game);
    if (!key) return;
    try {
      const stats = await counterGet(key);
      if (!stats?.ok || !card.isConnected) return;
      const row = card.querySelector(".card-stats");
      for (const [field, icon, label] of [["views", "views", "Vues"], ["mega", "downloads", "Téléchargements"], ["likes", "likes", "J’aime"]]) {
        if (stats[field] == null || !Number.isFinite(Number(stats[field]))) continue;
        const item = document.createElement("span");
        item.className = "card-stat";
        item.title = label;
        item.innerHTML = `<span class="stat-icon stat-icon-${icon}" aria-hidden="true"></span><span>${formatInt(stats[field])}</span>`;
        row.appendChild(item);
      }
    } catch (_) { /* Des statistiques indisponibles ne bloquent pas les suggestions. */ }
  }

  function renderSimilar(list, entry, source) {
    const block = document.getElementById("similarGamesBlock");
    const grid = document.getElementById("similarGamesGrid");
    if (!block || !grid) return;
    const seen = new Set();
    const picked = list.filter(game => {
      const key = keyOf(game);
      if (!key || seen.has(key) || sameCollection(entry, game) || !getDisplayTitle(game)) return false;
      seen.add(key);
      return true;
    }).map(game => ({ game, score: score(entry, game), matches: commonCount(tagsOf(entry), tagsOf(game)) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || b.matches - a.matches || getDisplayTitle(a.game).localeCompare(getDisplayTitle(b.game), "fr"))
      .slice(0, 9);
    if (!picked.length) return;

    grid.innerHTML = picked.map(item => cardHtml(item.game, source)).join("") +
      `<a class="similarCard similarMoreCard" href="${escapeHtml(urlFor(APP_PATH, source))}">
        <div class="similarMoreInner"><div class="similarMoreIcon" aria-hidden="true">✨</div>
        <h3 class="similarMoreTitle">Voir plus de jeux</h3>
        <p class="similarMoreText">Parcourir les jeux de cette liste.</p></div></a>`;
    grid.querySelectorAll(".card-link").forEach((card, index) => {
      const game = picked[index].game;
      F95Images.bindCardHoverGallery(card, game, dataOf(game).imageUrl || game.imageUrl || "/favicon.png");
      void addStats(card, game);
    });
    const matches = Math.max(...picked.map(item => item.matches));
    document.getElementById("similarGamesSub").textContent = "Basé sur les tags des jeux de cette liste" +
      (matches > 1 ? ` · jusqu’à ${matches} tags en commun` : "");
    block.style.display = "";
  }

  // Les notes proviennent exclusivement du JSON, déjà rendu par game.js.
  // Liens Markdown et URL simples : même présentation que le site de référence.
  function richText(raw) {
    const tokens = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)/g;
    let out = "", offset = 0;
    for (const match of raw.matchAll(tokens)) {
      out += escapeHtml(raw.slice(offset, match.index));
      let url = match[2] || match[3], suffix = "";
      if (!match[2]) {
        while (/[.,;:!?)]$/.test(url)) { suffix = url.slice(-1) + suffix; url = url.slice(0, -1); }
      }
      out += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[1] || url)}</a>${escapeHtml(suffix)}`;
      offset = match.index + match[0].length;
    }
    return (out + escapeHtml(raw.slice(offset))).replace(/\n/g, "<br>");
  }

  const notes = document.getElementById("notesText");
  if (notes) {
    let rendered = "";
    const observer = new MutationObserver(formatNotes);
    function formatNotes() {
      if (notes.innerHTML === rendered) return;
      const copy = notes.cloneNode(true);
      copy.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
      const raw = copy.textContent || "";
      observer.disconnect();
      notes.innerHTML = richText(raw);
      // Un drapeau lié à un SVG est affiché depuis l'URL réellement fournie.
      notes.querySelectorAll("a").forEach(link => {
        if (!/^[\u{1F1E6}-\u{1F1FF}]{2}$/u.test(link.textContent)) return;
        if (!/\.svg$/i.test(new URL(link.href).pathname)) return;
        const image = document.createElement("img");
        image.className = "flag-icon";
        image.alt = link.textContent;
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => {
          observer.disconnect();
          image.replaceWith(document.createTextNode(image.alt));
          rendered = notes.innerHTML;
          observer.observe(notes, { childList: true, subtree: true, characterData: true });
        }, { once: true });
        image.src = link.href;
        link.replaceChildren(image);
      });
      rendered = notes.innerHTML;
      observer.observe(notes, { childList: true, subtree: true, characterData: true });
    }
    formatNotes();
    observer.observe(notes, { childList: true, subtree: true, characterData: true });
  }

  (async () => {
    try {
      const source = getListUrl();
      const list = extractGames(await fetchJson(source));
      const page = resolveGamePage(getParamsFromUrl(), list);
      if (page.kind === "notfound") return;
      const entry = page.entry;
      const hasActions = [entry.translation, entry.translationsArchive, entry.discordlink, entry.url, entry.notes]
        .some(value => String(value || "").trim()) || (entry.translationsExtra || []).some(item => String(item?.link || "").trim());
      document.querySelector(".gameActionsCard")?.classList.toggle("empty-data", !hasActions);
      document.getElementById("statTranslationWrap")?.classList.toggle("empty-data", !timestampOf(entry));
      document.getElementById("statAddedWrap")?.classList.toggle("empty-data", !Number.isFinite(Date.parse(entry.createdAtLocal || "")));
      renderSimilar(list, entry, source);
    } catch (error) {
      console.warn("Jeux similaires indisponibles", error);
    }
  })();
})();
