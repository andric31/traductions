(function () {
  "use strict";

  // Les caches de chargement gardent l'adresse complète, paramètres compris.
  const imageCache = new Map();
  const mediaCache = new Map();
  const IMAGE_TIMEOUT_MS = 8000;
  const MEDIA_TIMEOUT_MS = 12000;

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
      const value = Number(new URL(url, location.origin).searchParams.get("e"));
      return Number.isFinite(value) && value > 0 ? value * 1000 : 0;
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
      if (!url || isGalleryAvatarUrl(url) || (url === THUMB_FALLBACK_URL || url === THUMB_LOADING_URL)) continue;
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

  function isGalleryAvatarUrl(value) {
    const u = cleanUrl(value);
    return /\/data\/avatars?\//i.test(u) ||
      /^https?:\/\/(?:[^/]+\.)?gravatar\.com\/avatar\//i.test(u);
  }

  function getF95ThreadUrl(rawOrUrl, imageUrl) {
    const entry = rawOrUrl && typeof rawOrUrl === "object" ? rawOrUrl : {};
    const candidates = [rawOrUrl, entry.url, entry.threadUrl, entry.f95url,
      entry.f95Url, entry.sourceUrl, entry.gameData?.url,
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

  function imageCandidates(value, preferPreview = false) {
    const original = cleanUrl(value);
    if (!original || isGalleryAvatarUrl(original) || isExpiredImage(original)) return [];
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
    if (!url || isExpiredImage(url)) return Promise.resolve(false);
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
      img.onload = () => finish(usableImage(img, url));
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
    if (url) imageCache.set(url, { promise: Promise.resolve(false), status: "failed", until: Date.now() + 30000 });
  }

  async function findWorkingF95Image(urls, excluded = new Set(), { preferPreview = false } = {}) {
    const tried = new Set(excluded);
    for (const url of preferFreshImages(Array.isArray(urls) ? urls : [])) {
      for (const candidate of imageCandidates(url, preferPreview)) {
        if (tried.has(candidate)) continue;
        tried.add(candidate);
        if (await preloadImage(candidate)) return candidate;
      }
    }
    return "";
  }

  function emptyMedia() {
    return { cover: "", gallery: [] };
  }

  function normalizeMedia(data) {
    if (!data || typeof data !== "object" || data.ok === false) return emptyMedia();
    const gallery = preferFreshImages([data.cover, ...(Array.isArray(data.gallery) ? data.gallery : [])]);
    const coverKey = normalizeF95MediaKey(data.cover);
    const cover = gallery.find(url => normalizeF95MediaKey(url) === coverKey) || gallery[0] || "";
    return { cover, gallery };
  }

  async function requestMedia(threadUrl, refresh = false) {
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
      const response = fetch(`/api/f95gallery?url=${encodeURIComponent(threadUrl)}${refresh ? "&refresh=1" : ""}`, {
        credentials: "same-origin", cache: "no-store", signal: controller.signal,
      }).then((r) => r.ok ? r.json() : null).then(normalizeMedia).catch(emptyMedia);
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

  function fetchF95GalleryMedia(rawOrUrl, imageUrl, { refresh = false } = {}) {
    const threadUrl = getF95ThreadUrl(rawOrUrl, imageUrl);
    if (!threadUrl) return Promise.resolve(emptyMedia());
    const now = Date.now();
    let record = mediaCache.get(threadUrl);
    if (record?.pending) {
      // Une demande forcée attend une demande normale déjà en cours.
      if (refresh && !record.refreshed) {
        return record.promise.then(() => fetchF95GalleryMedia(rawOrUrl, imageUrl, { refresh: true }));
      }
      return record.promise;
    }
    if (record && record.until > now && (!refresh || (record.refreshed && now - record.created < 10000))) return record.promise;
    const previousMedia = record?.media || emptyMedia();
    record = { promise: null, pending: true, refreshed: refresh, created: now, until: now + 15000, media: previousMedia };
    mediaCache.set(threadUrl, record);
    record.promise = requestMedia(threadUrl, refresh).then((media) => {
      if (refresh) {
        forgetFailedImages([imageUrl, previousMedia.cover, ...previousMedia.gallery, media.cover, ...media.gallery]);
      }
      const found = !!(media.cover || media.gallery.length);
      // Une panne de l'API conserve les dernières adresses connues, mais permet un nouvel essai rapide.
      if (found) record.media = media;
      const deadlines = [record.media.cover, ...record.media.gallery].map(imageExpiry).filter(Boolean).map(time => time - 30000);
      record.until = Math.min(Date.now() + (found ? 300000 : 15000), ...deadlines);
      return { cover: record.media.cover, gallery: record.media.gallery.slice() };
    }).finally(() => { record.pending = false; });
    return record.promise;
  }

  function mergeGalleryUrls(baseUrl, media) {
    const remote = normalizeMedia(media);
    return preferFreshImages([cleanUrl(baseUrl), remote.cover, ...remote.gallery]);
  }

  function clearCaches() {
    imageCache.clear();
    mediaCache.clear();
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
              if (urls.length > 1) preloadImage(urls[idx]);
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
    isGalleryAvatarUrl,
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
