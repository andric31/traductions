(function () {
  "use strict";

  // Les caches de chargement gardent l'adresse complète, paramètres compris.
  const imageCache = new Map();
  const originalChecks = new Map();
  const mediaCache = new Map();
  const IMAGE_TIMEOUT_MS = 8000;
  const MEDIA_TIMEOUT_MS = 12000;
  const MEDIA_STORAGE_KEY = "f95-gallery-v14";
  const PAUSE_STORAGE_KEY = "f95-gallery-pause-v1";
  const mediaQueue = [];
  let mediaQueueActive = false, mediaQueueTimer, lastMediaStart = 0, pausedUntil = 0;

  // Visuels intégrés : aucune requête réseau, même si un fichier SVG manque au déploiement.
  const THUMB_FALLBACK_URL = "data:image/svg+xml;charset=utf-8," + encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"480\" height=\"270\" viewBox=\"0 0 480 270\"><rect width=\"480\" height=\"270\" fill=\"#1c2030\"/><g fill=\"none\" stroke=\"#8993ac\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"212\" y=\"82\" width=\"56\" height=\"44\" rx=\"7\"/><circle cx=\"251\" cy=\"95\" r=\"4\"/><path d=\"m216 120 15-16 11 11 8-7 14 15\"/></g><text x=\"240\" y=\"165\" fill=\"#bbc3d6\" font-family=\"Arial,sans-serif\" font-size=\"19\" text-anchor=\"middle\">Image indisponible</text></svg>");
  const THUMB_LOADING_URL = "data:image/svg+xml;charset=utf-8," + encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"480\" height=\"270\" viewBox=\"0 0 480 270\"><rect width=\"480\" height=\"270\" fill=\"#1c2030\"/><g fill=\"none\" stroke=\"#8993ac\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"212\" y=\"82\" width=\"56\" height=\"44\" rx=\"7\"/><circle cx=\"251\" cy=\"95\" r=\"4\"/><path d=\"m216 120 15-16 11 11 8-7 14 15\"/></g><text x=\"240\" y=\"165\" fill=\"#bbc3d6\" font-family=\"Arial,sans-serif\" font-size=\"18\" text-anchor=\"middle\">Chargement de l’image…</text></svg>");

  function isF95ImageUrl(url) {
    try { return /^(?:attachments|preview|www)\.f95zone\.to$|^f95zone\.to$/i.test(new URL(url, location.origin).hostname); }
    catch { return false; }
  }

  function imageExpiry(url) {
    if (!isF95ImageUrl(url)) return 0;
    try {
      const value = new URL(url, location.origin).searchParams.get("e") || "";
      return /^\d{10}(?:\d{3})?$/.test(value) ? Number(value) * (value.length === 10 ? 1000 : 1) : 0;
    } catch { return 0; }
  }

  function hasImageSignature(url) {
    if (!isF95ImageUrl(url)) return false;
    try { const p = new URL(url, location.origin).searchParams; return p.has("h") || p.has("e"); }
    catch { return false; }
  }

  function isExpiredImage(url) {
    const expiry = imageExpiry(url);
    return !!expiry && expiry <= Date.now() + 1000;
  }

  // Même fichier : privilégier une signature récente sans déplacer la galerie.
  function preferFreshImages(urls) {
    const out = [], positions = new Map();
    for (const raw of urls || []) {
      const url = String(raw || "").trim();
      if (!url || !isRemoteImageUrl(url) || isGalleryAvatarUrl(url) || isExpiredImage(url)) continue;
      const key = normalizeF95MediaKey(url);
      if (!positions.has(key)) { positions.set(key, out.length); out.push(url); continue; }
      const index = positions.get(key), previous = out[index];
      const expired = isExpiredImage(url), previousExpired = isExpiredImage(previous);
      if (expired !== previousExpired) {
        if (!expired) out[index] = url;
      } else if ((hasImageSignature(url) && !hasImageSignature(previous)) ||
          (hasImageSignature(url) === hasImageSignature(previous) && imageExpiry(url) >= imageExpiry(previous))) out[index] = url;
    }
    return out;
  }

  function usableImage(img, url) {
    // Les petites icônes d'erreur F95 peuvent être servies avec un HTTP 200.
    return img.naturalWidth > 0 && img.naturalHeight > 0 &&
      !(isF95ImageUrl(url) && img.naturalWidth <= 64 && img.naturalHeight <= 64);
  }

  function cleanUrl(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function parseUrl(value) {
    const origin = typeof location !== "undefined" && location.origin
      ? location.origin : "https://local.invalid";
    return new URL(value, origin);
  }

  function isRemoteImageUrl(value) {
    if (!cleanUrl(value)) return false;
    try { return /^https?:$/.test(parseUrl(value).protocol); }
    catch { return false; }
  }

  function isF95Thumbnail(value) {
    try {
      const url = parseUrl(value);
      return isF95ImageUrl(value) && (url.hostname.toLowerCase() === "preview.f95zone.to" ||
        /\/thumb\//i.test(url.pathname) || /^\/data\/covers\/thread\//i.test(url.pathname));
    } catch { return false; }
  }

  function originalImageUrls(urls) {
    return preferFreshImages((Array.isArray(urls) ? urls : []).flatMap(value => imageCandidates(value, false, true)));
  }

  function isGalleryAvatarUrl(value) {
    const u = cleanUrl(value);
    try {
      const parsed = parseUrl(u);
      if (isF95ImageUrl(u) && /^\/(?:assets\/|styles\/)/i.test(decodeURIComponent(parsed.pathname))) return true;
    } catch { return true; }
    return /\/data\/avatars?\//i.test(u) ||
      /^https?:\/\/(?:[^/]+\.)?gravatar\.com\/avatar\//i.test(u) ||
      /smilie|emoji|favicon|blank\.gif|loading\.gif/i.test(u.split(/[?#]/)[0]);
  }

  function getF95ThreadUrl(rawOrUrl, imageUrl) {
    const entry = rawOrUrl && typeof rawOrUrl === "object" ? rawOrUrl : {};
    const candidates = [rawOrUrl, entry.url, entry.threadUrl, entry.f95url,
      entry.f95Url, entry.f95_url, entry.sourceUrl, entry.gameData?.url,
      entry.gameData?.threadUrl, entry.gameData?.f95url, entry.gameData?.f95Url];
    for (const candidate of candidates) {
      const value = cleanUrl(candidate);
      if (!value) continue;
      try {
        const u = parseUrl(value);
        if (!/^https?:$/.test(u.protocol) || !/^(?:www\.)?f95zone\.to$/i.test(u.hostname)) continue;
        const match = u.pathname.match(/^\/threads\/(?:[^/]*\.)?(\d+)(?:\/|$)/i);
        if (match) return `https://f95zone.to/threads/${match[1]}/`;
      } catch {}
    }
    // Les nouvelles pièces jointes n'incluent plus l'identifiant du sujet.
    // Utiliser l'id F95 explicite ; ne jamais confondre avec l'uid local.
    for (const candidate of [entry.collection, entry.id]) {
      const id = String(candidate ?? "").trim();
      if (/^[1-9]\d*$/.test(id)) return `https://f95zone.to/threads/${id}/`;
    }
    for (const candidate of [imageUrl, entry.gameData?.imageUrl, entry.imageUrl, rawOrUrl]) {
      const value = cleanUrl(candidate);
      if (!value) continue;
      try {
        const u = parseUrl(value);
        if (!/^https?:$/.test(u.protocol) || !/^(?:www\.)?f95zone\.to$/i.test(u.hostname)) continue;
        const match = u.pathname.match(/^\/data\/covers\/thread\/[^/]+\/\d+\/(\d+)\.(?:jpe?g|png|webp|gif)$/i);
        if (match) return `https://f95zone.to/threads/${match[1]}/`;
      } catch {}
    }
    return "";
  }

  function toF95PreviewUrl(value) {
    const original = cleanUrl(value);
    if (!original || hasImageSignature(original)) return original;
    try {
      const u = parseUrl(original);
      if (/^https?:$/.test(u.protocol) && u.hostname.toLowerCase() === "attachments.f95zone.to" &&
          /^\/\d{4}\/\d{2}\//.test(u.pathname)) {
        u.protocol = "https:";
        u.hostname = "preview.f95zone.to";
        return u.href;
      }
    } catch {}
    return original;
  }

  function imageCandidates(value, preferPreview = false, originalsOnly = false) {
    const original = cleanUrl(value);
    if (!original || !isRemoteImageUrl(original) || isGalleryAvatarUrl(original) || isExpiredImage(original)) return [];
    if (originalsOnly) {
      if (!isF95Thumbnail(original)) return [original];
      // Une vignette signée ne permet pas de reconstruire l'original signé.
      if (hasImageSignature(original)) return [];
      const url = parseUrl(original);
      if (/^\/data\/covers\/thread\//i.test(url.pathname)) return [];
      if (url.hostname.toLowerCase() === "preview.f95zone.to") url.hostname = "attachments.f95zone.to";
      url.pathname = url.pathname.replace(/(\/\d{4}\/\d{2})\/thumb\//i, "$1/");
      return isF95Thumbnail(url.href) ? [] : [url.href];
    }
    // Les signatures F95 sont liées à leur hôte et à leur chemin exacts.
    if (hasImageSignature(original)) return [original];
    const preview = toF95PreviewUrl(original);
    let attachment = original;
    try {
      const u = parseUrl(original);
      if (/^https?:$/.test(u.protocol) && u.hostname.toLowerCase() === "preview.f95zone.to" &&
          /^\/\d{4}\/\d{2}\//.test(u.pathname)) {
        u.protocol = "https:";
        u.hostname = "attachments.f95zone.to";
        attachment = u.href;
      }
    } catch {}
    return [...new Set(preferPreview
      ? [preview, original, attachment]
      : [original, attachment, preview])];
  }

  function normalizeF95MediaKey(value) {
    const original = cleanUrl(value);
    if (!original) return "";
    try {
      const u = parseUrl(original);
      const host = u.hostname.toLowerCase();
      let path = u.pathname.replace(/\\/g, "/");
      if (host === "attachments.f95zone.to" || host === "preview.f95zone.to") {
        path = path.replace(/^\/(\d{4})\/(\d{2})\/(?:thumb\/)?/i, "/");
        return `f95-media:${path}`;
      }
      return `${host}${path}`;
    } catch {
      return original.replace(/[?#].*$/, "");
    }
  }

  function preloadImage(value) {
    const url = cleanUrl(value);
    if (!url || !isRemoteImageUrl(url) || isGalleryAvatarUrl(url) || isExpiredImage(url)) return Promise.resolve(false);
    const cached = imageCache.get(url);
    if (cached && cached.until > Date.now()) return cached.promise;

    let settle;
    const promise = new Promise((resolve) => { settle = resolve; });
    const entry = { promise, status: "pending", until: Date.now() + IMAGE_TIMEOUT_MS };
    imageCache.set(url, entry);
    let img;
    let timeout;
    let finished = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      entry.status = ok ? "ready" : "failed";
      if (ok && img) { entry.width = img.naturalWidth; entry.height = img.naturalHeight; }
      entry.until = Math.min(Date.now() + (ok ? 300000 : 30000), imageExpiry(url) || Infinity);
      if (img) {
        img.onload = img.onerror = null;
        if (!ok) {
          try { img.removeAttribute("src"); } catch {}
        }
      }
      settle(!!ok);
    };
    try {
      img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.referrerPolicy = "no-referrer";
      img.onload = () => {
        if (!usableImage(img, url)) { finish(false); return; }
        // Résoudre après décodage pour ne pas exposer une image encore en préparation.
        if (typeof img.decode === 'function') img.decode().then(() => finish(true), () => finish(false));
        else finish(true);
      };
      img.onerror = () => finish(false);
      timeout = setTimeout(() => finish(false), IMAGE_TIMEOUT_MS);
      img.src = url;
    } catch {
      finish(false);
    }
    return promise;
  }

  function markImageFailed(value) {
    const url = cleanUrl(value);
    if (url) {
      imageCache.set(url, { promise: Promise.resolve(false), status: "failed", until: Date.now() + 30000 });
      originalChecks.set(url, {promise:Promise.resolve(false), ok:false, until:Date.now() + 600000});
    }
  }

  function firstWorkingVariant(candidates) {
    return new Promise(resolve => {
      let next = 0, pending = 0, timer, finished = false;
      const finish = value => { if (finished) return; finished = true; clearTimeout(timer); resolve(value); };
      const start = () => {
        clearTimeout(timer);
        if (finished || next >= candidates.length) return;
        const candidate = candidates[next++];
        pending++;
        preloadImage(candidate).then(ok => {
          pending--;
          if (finished) return;
          if (ok) finish(candidate);
          else if (next < candidates.length) start();
          else if (!pending) finish("");
        });
        // Un original lent ne doit pas bloquer son aperçu pendant 8 secondes.
        // Seules les variantes de cette image sont essayées, sans modifier les signatures.
        if (next < candidates.length) timer = setTimeout(start, 150);
      };
      if (candidates.length) start(); else finish("");
    });
  }

  async function findWorkingF95Image(urls, excluded = new Set(), { preferPreview = false, originalsOnly = false } = {}) {
    const tried = new Set(excluded);
    const sources = originalsOnly ? originalImageUrls(urls) : preferFreshImages(Array.isArray(urls) ? urls : []);
    for (const url of sources) {
      const candidates = imageCandidates(url, preferPreview, originalsOnly).filter(candidate => !tried.has(candidate));
      candidates.forEach(candidate => tried.add(candidate));
      const ready = candidates.find(candidate => {
        const cached = imageCache.get(candidate);
        return cached?.status === "ready" && cached.until > Date.now();
      });
      if (ready) return ready;
      const resolved = await firstWorkingVariant(candidates);
      if (resolved) return resolved;
    }
    return "";
  }

  async function findHigherResolutionImage(displayedUrl, knownOriginals = [], isCurrent = () => true) {
    if (!isF95Thumbnail(displayedUrl) || !isCurrent()) return "";
    const key = normalizeF95MediaKey(displayedUrl);
    const matching = (Array.isArray(knownOriginals) ? knownOriginals : [])
      .filter(url => normalizeF95MediaKey(url) === key);
    // Une adresse candidate n'est un original utilisable qu'après chargement.
    // Aucune signature d'aperçu n'est déplacée vers un autre hôte ou chemin.
    const candidates = originalImageUrls([...matching, displayedUrl]);
    const preview = imageCache.get(displayedUrl);
    if (!preview?.width || !preview?.height) return "";
    for (const candidate of candidates) {
      if (!isCurrent()) return "";
      const loaded = imageCache.get(candidate);
      // Le cooldown concerne la recherche de métadonnées, pas les fichiers
      // image déjà connus. Leurs échecs ont leur propre cache ci-dessous.
      let checked = originalChecks.get(candidate);
      if (!checked || checked.until <= Date.now() || (checked.ok && (!loaded || loaded.until <= Date.now()))) {
        checked = {promise:null, until:Date.now() + IMAGE_TIMEOUT_MS};
        originalChecks.set(candidate, checked);
        checked.promise = preloadImage(candidate).then(ok => {
          checked.ok = ok;
          checked.until = Math.min(Date.now() + (ok ? 300000 : 600000), imageExpiry(candidate) || Infinity);
          return ok;
        });
      }
      if (!await checked.promise || !isCurrent()) continue;
      const original = imageCache.get(candidate);
      // Une image d'erreur ou de taille identique ne constitue pas une amélioration.
      if (original?.status === "ready" && original.until > Date.now() &&
          original.width >= preview.width && original.height >= preview.height &&
          (original.width > preview.width || original.height > preview.height)) return candidate;
    }
    return "";
  }

  function emptyMedia() {
    return { cover: "", gallery: [] };
  }

  function normalizeMedia(data) {
    if (!data || typeof data !== "object" || data.ok === false) return emptyMedia();
    const sources = [data.cover, ...(Array.isArray(data.gallery) ? data.gallery : []),
      ...(Array.isArray(data.originals) ? data.originals : [])];
    const gallery = preferFreshImages(sources);
    const coverKey = normalizeF95MediaKey(data.cover);
    const cover = gallery.find(url => normalizeF95MediaKey(url) === coverKey) || gallery[0] || "";
    // Garder les originaux séparément : une miniature signée ne doit pas
    // faire disparaître l'adresse originale du même fichier pour la fiche.
    // Ne pas fabriquer d'originaux à partir des aperçus : une deuxième
    // normalisation leur donnerait la priorité sur les vraies URL reçues.
    return { cover, gallery, originals: preferFreshImages(sources.filter(value => !isF95Thumbnail(value))) };
  }

  function readStoredMedia(threadUrl) {
    try {
      const saved = JSON.parse(localStorage.getItem(MEDIA_STORAGE_KEY) || "{}")[threadUrl];
      const keepUntil = saved?.keepUntil || Number(saved?.until) + 86400000;
      if (!saved || !(keepUntil > Date.now())) return null;
      const media = normalizeMedia(saved.media);
      return media.gallery.length ? { until:saved.until, keepUntil, media } : null;
    } catch { return null; }
  }

  function storeMedia(threadUrl, media, until) {
    try {
      const saved = JSON.parse(localStorage.getItem(MEDIA_STORAGE_KEY) || "{}");
      const kept = Object.entries(saved).filter(([key, value]) => key !== threadUrl && (value?.keepUntil || Number(value?.until) + 86400000) > Date.now()).slice(-79);
      kept.push([threadUrl, {until, keepUntil:Date.now() + 86400000, media}]);
      localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
    } catch {}
  }

  function pauseDeadline() {
    try { pausedUntil = Math.max(pausedUntil, Number(localStorage.getItem(PAUSE_STORAGE_KEY)) || 0); } catch {}
    return pausedUntil;
  }

  function pauseRequests(response, data) {
    const raw = response.headers?.get('retry-after') || '';
    let deadline = /^\d+$/.test(raw) ? Date.now() + Number(raw) * 1000 : Date.parse(raw);
    if (!(deadline > Date.now())) deadline = Date.now() + (Number(data?.retryAfter) > 0 ? Number(data.retryAfter) : 300) * 1000;
    pausedUntil = Math.max(pauseDeadline(), deadline);
    try { localStorage.setItem(PAUSE_STORAGE_KEY, String(pausedUntil)); } catch {}
    return pausedUntil;
  }

  function pausedMedia() {
    return {...emptyMedia(), retryAt:pauseDeadline()};
  }

  function pumpMediaQueue() {
    if (mediaQueueActive || !mediaQueue.length) return;
    clearTimeout(mediaQueueTimer);
    if (pauseDeadline() > Date.now()) {
      for (const job of mediaQueue.splice(0)) job.resolve(pausedMedia());
      return;
    }
    const delay = lastMediaStart + 750 - Date.now();
    if (delay > 0) { mediaQueueTimer = setTimeout(pumpMediaQueue, delay); return; }
    const job = mediaQueue.shift();
    mediaQueueActive = true;
    lastMediaStart = Date.now();
    Promise.resolve().then(job.run).then(job.resolve, () => job.resolve(emptyMedia())).finally(() => {
      mediaQueueActive = false;
      pumpMediaQueue();
    });
  }

  function requestMedia(threadUrl, refresh = false, title = "") {
    return new Promise(resolve => {
      mediaQueue.push({run:() => performMediaRequest(threadUrl, refresh, title), resolve});
      pumpMediaQueue();
    });
  }

  function getTitleHint(rawEntry) {
    if (!rawEntry || typeof rawEntry !== "object") return "";
    return cleanUrl((rawEntry.collection && rawEntry.gameData?.title) || rawEntry.cleanTitle || rawEntry.title || rawEntry.gameData?.title).slice(0, 300);
  }

  async function performMediaRequest(threadUrl, refresh = false, title = "") {
    let timeout;
    let controller;
    try {
      controller = new AbortController();
      const expired = new Promise((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(emptyMedia());
        }, MEDIA_TIMEOUT_MS);
      });
      const response = fetch(`/api/f95gallery?url=${encodeURIComponent(threadUrl)}${title ? "&title=" + encodeURIComponent(title) : ""}${refresh ? "&refresh=1" : ""}`, {
        credentials: "same-origin", cache: "no-store", signal: controller.signal,
      }).then(async r => {
        const data = await r.json().catch(() => null);
        const limited = r.status === 429 || data?.code === 'F95_RATE_LIMITED' || (data?.stale && data?.retryAfter > 0);
        const retryAt = limited ? pauseRequests(r, data) : 0;
        return {...normalizeMedia(r.ok ? data : null), retryAt, stale:!!data?.stale};
      }).catch(emptyMedia);
      return await Promise.race([response, expired]);
    } catch {
      return emptyMedia();
    } finally {
      clearTimeout(timeout);
    }
  }

  function forgetFailedImages(urls) {
    for (const url of urls) {
      for (const candidate of imageCandidates(url)) {
        if (imageCache.get(candidate)?.status === "failed") imageCache.delete(candidate);
      }
    }
  }

  function fetchF95GalleryMedia(rawOrUrl, imageUrl, { refresh = false, title = "" } = {}) {
    const threadUrl = getF95ThreadUrl(rawOrUrl, imageUrl);
    if (!threadUrl) return Promise.resolve(emptyMedia());
    const now = Date.now();
    let record = mediaCache.get(threadUrl);
    if (!record) {
      const saved = readStoredMedia(threadUrl);
      if (saved) {
        record = { ...saved, pending:false, refreshed:false, created:now, promise:Promise.resolve(saved.media) };
        mediaCache.set(threadUrl, record);
      }
    }
    if (pauseDeadline() > now) return Promise.resolve(normalizeMedia({ok:true, ...(record?.media || emptyMedia())}));
    if (record?.pending) {
      // Survol, récupération et actualisation partagent la même demande.
      return record.promise;
    }
    if (record?.retryAt > now) return record.promise;
    if (record && record.until > now && (!refresh || (record.refreshed && now - record.created < 10000))) return record.promise;
    const previousMedia = record?.media || emptyMedia();
    record = { promise: null, pending: true, refreshed: refresh, created: now, until: now + 15000, media: previousMedia };
    mediaCache.set(threadUrl, record);
    record.promise = requestMedia(threadUrl, refresh, cleanUrl(title).slice(0, 300) || getTitleHint(rawOrUrl)).then((media) => {
      if (refresh) {
        forgetFailedImages([imageUrl, previousMedia.cover, ...previousMedia.gallery, media.cover, ...media.gallery]);
      }
      const found = !!(media.cover || media.gallery.length);
      // Une panne de l'API conserve les dernières adresses connues, mais permet un nouvel essai rapide.
      record.media = found ? media : normalizeMedia({ok:true, ...record.media});
      record.retryAt = Math.max(Number(media.retryAt) || 0, found ? 0 : Date.now() + 60000);
      const deadlines = [record.media.cover, ...record.media.gallery].map(imageExpiry).filter(Boolean).map(time => time - 30000);
      record.until = Math.min(Date.now() + (found && !media.stale ? 3600000 : 60000), ...deadlines);
      if (found && mediaCache.get(threadUrl) === record) storeMedia(threadUrl, record.media, record.until);
      return { cover: record.media.cover, gallery: record.media.gallery.slice(), originals: (record.media.originals || []).slice() };
    }).finally(() => { record.pending = false; });
    return record.promise;
  }

  function mergeGalleryUrls(baseUrl, media, { originalsOnly = false } = {}) {
    const remote = normalizeMedia(media);
    const urls = originalsOnly ? [cleanUrl(baseUrl), ...(remote.originals || [])]
      : [cleanUrl(baseUrl), remote.cover, ...remote.gallery];
    return originalsOnly ? originalImageUrls(urls) : preferFreshImages(urls);
  }

  function clearCaches() {
    imageCache.clear();
    for (const [key, record] of mediaCache) if (!record.pending) mediaCache.delete(key);
    // Une actualisation invalide la fraîcheur, sans effacer le dernier succès
    // ni la pause imposée par F95 : ils servent encore en cas de panne.
    try {
      const saved = JSON.parse(localStorage.getItem(MEDIA_STORAGE_KEY) || "{}");
      for (const value of Object.values(saved)) {
        value.keepUntil ||= Number(value.until) + 86400000;
        value.until = 0;
      }
      localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify(saved));
    } catch {}
  }

  function setPlaceholder(img, loading = true) {
    if (!img) return;
    img.onload = img.onerror = null;
    img.title = loading ? "Chargement de l’image…" : "Image indisponible : aucun lien accessible pour le moment.";
    img.setAttribute("aria-busy", String(loading));
    img.src = loading ? THUMB_LOADING_URL : THUMB_FALLBACK_URL;
  }

  const HOVER_GALLERY = {
    timers: new WeakMap(),
    activeToken: new WeakMap(),
    baseSrc: new WeakMap(),
    baseFallback: new WeakMap(),
    images: new WeakMap(),
  };

  function sameImageUrl(a, b) {
    if (!a || !b) return false;
    return globalThis.F95Images.normalizeF95MediaKey(a) === globalThis.F95Images.normalizeF95MediaKey(b);
  }

  async function loadHoverGallery(context, refresh = false) {
    const media = await globalThis.F95Images.fetchF95GalleryMedia(context.rawEntry, context.originalSrc, { refresh });
    const base = HOVER_GALLERY.baseSrc.get(context.card);
    return globalThis.F95Images.mergeGalleryUrls((base === THUMB_FALLBACK_URL || base === THUMB_LOADING_URL) ? context.originalSrc : base, media);
  }

  function recoverCardCover(context, failedSrc, refreshOnly = false) {
    if (context.coverRecovering) return context.coverRecovery;
    if (context.coverRecovery && (!refreshOnly || context.coverRefreshUsed)) return context.coverRecovery;
    const { card, img, rawEntry, originalSrc } = context;
    HOVER_GALLERY.baseSrc.set(card, THUMB_LOADING_URL);
    HOVER_GALLERY.baseFallback.set(card, true);
    if (context.request?.isBase) setCardImage(img, THUMB_LOADING_URL, true, true);
    context.coverRecovering = true;
    context.coverRecovery = (async () => {
      const excluded = new Set([failedSrc]);
      let recovered = refreshOnly ? "" : await findWorkingF95Image([originalSrc], excluded);
      if (!recovered && !refreshOnly) {
        const media = await globalThis.F95Images.fetchF95GalleryMedia(rawEntry, originalSrc);
        recovered = await findWorkingF95Image([media.cover, ...media.gallery.slice(0, 4)], excluded);
      }
      // Une ancienne adresse peut avoir été remplacée sur le sujet F95.
      if (!recovered && !context.coverRefreshUsed) {
        context.coverRefreshUsed = true;
        const media = await globalThis.F95Images.fetchF95GalleryMedia(rawEntry, originalSrc, { refresh: true });
        recovered = await findWorkingF95Image([media.cover, ...media.gallery.slice(0, 4)], excluded);
      }
      return recovered;
    })().catch(() => "").then((recovered) => {
      const src = recovered || THUMB_FALLBACK_URL;
      HOVER_GALLERY.baseSrc.set(card, src);
      HOVER_GALLERY.baseFallback.set(card, !recovered);
      if (card.isConnected && context.request?.isBase) setCardImage(img, src, !recovered, true);
      return src;
    }).finally(() => { context.coverRecovering = false; });
    return context.coverRecovery;
  }

  function recoverOrRestoreBase(context, failedSrc) {
    HOVER_GALLERY.baseSrc.set(context.card, THUMB_FALLBACK_URL);
    HOVER_GALLERY.baseFallback.set(context.card, true);
    if (context.coverRecovering) {
      HOVER_GALLERY.baseSrc.set(context.card, THUMB_LOADING_URL);
      setCardImage(context.img, THUMB_LOADING_URL, true, true);
    } else if (!context.coverRecovery) recoverCardCover(context, failedSrc);
    else if (!context.coverRefreshUsed) recoverCardCover(context, failedSrc, true);
    else setCardImage(context.img, THUMB_FALLBACK_URL, true, true);
  }

  function setCardImage(img, src, isFallback, isBase = false, attempted = new Set()) {
    if (!img) return;
    const requestedSrc = String(src || "").trim() || THUMB_FALLBACK_URL;
    const context = HOVER_GALLERY.images.get(img);
    const request = { src: requestedSrc, isBase };
    if (context) context.request = request;
    img.onerror = () => {
      if (!context || context.request !== request || (requestedSrc === THUMB_FALLBACK_URL || requestedSrc === THUMB_LOADING_URL)) return;
      const tried = new Set(attempted);
      tried.add(requestedSrc);
      globalThis.F95Images.markImageFailed(requestedSrc);
      if (isBase) {
        recoverOrRestoreBase(context, requestedSrc);
        return;
      }
      findWorkingF95Image([requestedSrc], tried).then((recovered) => {
        if (!context.card.isConnected || context.request !== request) return;
        if (recovered) setCardImage(img, recovered, false, false, tried);
        else {
          const baseSrc = HOVER_GALLERY.baseSrc.get(context.card);
          if (tried.has(baseSrc)) recoverOrRestoreBase(context, baseSrc);
          else setCardImage(img, baseSrc, HOVER_GALLERY.baseFallback.get(context.card), true);
        }
      }).catch(() => {
        if (context.card.isConnected && context.request === request) {
          setCardImage(img, HOVER_GALLERY.baseSrc.get(context.card), HOVER_GALLERY.baseFallback.get(context.card), true);
        }
      });
    };
    img.onload = () => {
      if (context && context.request !== request) return;
      if (!isFallback && !usableImage(img, requestedSrc)) img.onerror();
    };
    img.referrerPolicy = "no-referrer";
    const loading = requestedSrc === THUMB_LOADING_URL;
    img.title = loading ? "Chargement de l’image…" : isFallback ? "Image indisponible : aucun lien accessible pour le moment." : "";
    img.setAttribute("aria-busy", String(loading));
    img.classList.toggle("is-fallback", !!isFallback);
    if (img.getAttribute("src") !== requestedSrc) img.src = requestedSrc;
  }

  function stopCardHoverSlideshow(card) {
    const timer = HOVER_GALLERY.timers.get(card);
    if (timer) clearInterval(timer);
    HOVER_GALLERY.timers.delete(card);
    const img = card?.querySelector(".thumb, .similarThumb");
    const baseSrc = HOVER_GALLERY.baseSrc.get(card) || THUMB_FALLBACK_URL;
    setCardImage(img, baseSrc, !!HOVER_GALLERY.baseFallback.get(card), true);
  }

  function bindCardHoverGallery(card, rawEntry, fallbackUrl) {
    const img = card?.querySelector(".thumb, .similarThumb");
    if (!card || !img) return;
    const supplied = String(fallbackUrl || img.getAttribute("src") || "").trim();
    const baseSrc = supplied === "/favicon.png" ? "" : supplied;
    const baseFallback = !baseSrc || baseSrc === THUMB_FALLBACK_URL || baseSrc === THUMB_LOADING_URL;
    const context = {
      card, img, rawEntry, originalSrc: baseSrc, request: null,
      coverRecovery: null, coverRecovering: false, coverRefreshUsed: false, galleryRefreshUsed: false,
    };
    HOVER_GALLERY.baseSrc.set(card, THUMB_LOADING_URL);
    HOVER_GALLERY.baseFallback.set(card, true);
    HOVER_GALLERY.images.set(img, context);
    setCardImage(img, THUMB_LOADING_URL, true, true);
    // Ne jamais exposer une image distante avant sa validation.
    const load = async () => {
      const resolved = baseFallback ? "" : await findWorkingF95Image([baseSrc]);
      if (resolved) {
        HOVER_GALLERY.baseSrc.set(card, resolved);
        HOVER_GALLERY.baseFallback.set(card, false);
        if (card.isConnected && context.request?.isBase) setCardImage(img, resolved, false, true);
      } else await recoverCardCover(context, baseSrc);
    };
    if ("IntersectionObserver" in globalThis) {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        void load();
      }, { rootMargin: "300px" });
      observer.observe(card);
    } else void load();

    card.addEventListener("mouseleave", () => {
      HOVER_GALLERY.activeToken.set(card, null);
      stopCardHoverSlideshow(card);
    });

    card.addEventListener("mouseenter", async () => {
      stopCardHoverSlideshow(card);
      const token = Symbol("hoverGallery");
      HOVER_GALLERY.activeToken.set(card, token);
      const isActive = () => card.isConnected && HOVER_GALLERY.activeToken.get(card) === token;
      let urls;
      try { urls = await loadHoverGallery(context); }
      catch { if (isActive()) stopCardHoverSlideshow(card); return; }
      if (!isActive()) return;
      if (urls.length < 2 && !context.galleryRefreshUsed) {
        context.galleryRefreshUsed = true;
        urls = await loadHoverGallery(context, true);
        if (!isActive()) return;
      }
      let idx = 0;
      const resetIndex = () => {
        const currentBase = HOVER_GALLERY.baseSrc.get(card);
        idx = urls.length > 1 && sameImageUrl(urls[0], currentBase) ? 1 : 0;
      };
      resetIndex();
      let switching = false;
      const showNext = async () => {
        if (switching) return true;
        switching = true;
        try {
          let failedPreview = false;
          for (let pass = 0; pass < 2; pass++) {
            for (let attempts = 0; attempts < urls.length; attempts++) {
              const next = urls[idx];
              idx = (idx + 1) % urls.length;
              const isCover = sameImageUrl(next, HOVER_GALLERY.baseSrc.get(card));
              // Avant de retomber sur la cover, cherche les nouvelles adresses des aperçus cassés.
              if (isCover && failedPreview && !context.galleryRefreshUsed) break;
              const resolved = await findWorkingF95Image([next]);
              if (!isActive()) return false;
              if (!resolved) { if (!isCover) failedPreview = true; continue; }
              setCardImage(img, resolved, false);
              if (urls.length > 1) void findWorkingF95Image([urls[idx]]);
              return true;
            }
            if (context.galleryRefreshUsed) break;
            context.galleryRefreshUsed = true;
            urls = await loadHoverGallery(context, true);
            if (!isActive()) return false;
            resetIndex();
            failedPreview = false;
          }
          if (isActive()) stopCardHoverSlideshow(card);
          return false;
        } catch {
          if (isActive()) stopCardHoverSlideshow(card);
          return false;
        } finally { switching = false; }
      };
      if (!await showNext() || !isActive()) return;
      if (urls.length < 2) { stopCardHoverSlideshow(card); return; }
      const timer = setInterval(() => {
        if (!isActive() || !card.matches(":hover")) {
          HOVER_GALLERY.activeToken.set(card, null);
          stopCardHoverSlideshow(card);
          return;
        }
        showNext().then((shown) => { if (!shown && isActive()) stopCardHoverSlideshow(card); });
      }, 2000);
      HOVER_GALLERY.timers.set(card, timer);
    });
  }

  globalThis.F95Images = Object.freeze({
    bindCardHoverGallery, clearCaches, setPlaceholder, preferFreshImages, isExpiredImage,
    isGalleryAvatarUrl, originalImageUrls, findHigherResolutionImage, isF95Thumbnail,
    getF95ThreadUrl,
    fetchF95GalleryMedia,
    findWorkingF95Image,
    preloadImage,
    markImageFailed,
    normalizeF95MediaKey,
    toF95PreviewUrl,
    mergeGalleryUrls,
  });
})();
