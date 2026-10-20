/* Récupération des images : correction du viewer andric31 du 20/10/2026. */
(() => {
  "use strict";
  const HOVER_GALLERY = {
    cache: new Map(),      // f95 thread url -> Promise<{cover, gallery}>
    timers: new WeakMap(), // card -> interval id
    baseSrc: new WeakMap(),
    baseFallback: new WeakMap(),
    activeToken: new WeakMap(),
    preload: new Map(),    // complete image url -> Promise<boolean>
    images: new WeakMap(), // img -> current request / cover recovery
  };

  const THUMB_FALLBACK_URL = "/favicon.png";

  function getF95ThreadUrl(rawEntry, imageUrl) {
    const entry = rawEntry || {};
    const candidates = [entry.url, entry.threadUrl, entry.f95url, entry.f95Url,
      entry.sourceUrl, entry.gameData?.url, entry.gameData?.threadUrl];
    for (const candidate of candidates) {
      try {
        const u = new URL(String(candidate || "").trim(), location.origin);
        if (!/^https?:$/.test(u.protocol) || !/^(?:www\.)?f95zone\.to$/i.test(u.hostname)) continue;
        const match = u.pathname.match(/^\/threads\/(?:[^/]*\.)?(\d+)(?:\/|$)/i);
        if (match) return `https://f95zone.to/threads/${match[1]}/`;
      } catch {}
    }

    // Certaines entrées ne donnent que la cover : son nom contient l'ID du sujet.
    try {
      const u = new URL(String(imageUrl || "").trim(), location.origin);
      if (!/^https?:$/.test(u.protocol) || !/^(?:www\.)?f95zone\.to$/i.test(u.hostname)) return "";
      const match = u.pathname.match(/^\/data\/covers\/thread\/[^/]+\/\d+\/(\d+)\.(?:jpe?g|png|webp|gif)$/i);
      if (match) return `https://f95zone.to/threads/${match[1]}/`;
    } catch {}
    return "";
  }

  function getF95GalleryApiUrl(f95Url) {
    const u = String(f95Url || "").trim();
    return u ? `/api/f95gallery?url=${encodeURIComponent(u)}` : "";
  }

  function toF95ThumbUrl(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    if (/\/thumb\//i.test(u)) return u;
    if (/^https?:\/\/attachments\.f95zone\.to\//i.test(u)) {
      return u.replace(/^(https?:\/\/attachments\.f95zone\.to\/\d{4}\/\d{2}\/)(?!thumb\/)/i, "$1thumb/");
    }
    return u;
  }

  function toF95PreviewUrl(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    if (/^https?:\/\/preview\.f95zone\.to\//i.test(u)) return u;
    const m = u.match(/^https?:\/\/attachments\.f95zone\.to\/(\d{4})\/(\d{2})\/(.+)$/i);
    if (m) {
      return `https://preview.f95zone.to/${m[1]}/${m[2]}/${m[3]}`;
    }
    return u;
  }

  function f95ImageCandidates(url) {
    const u = String(url || "").trim();
    if (!u || isGalleryAvatarUrl(u)) return [];
    const preview = toF95PreviewUrl(u);
    const original = u.replace(/^https?:\/\/preview\.f95zone\.to\//i, "https://attachments.f95zone.to/");
    // Déduplication exacte : preview et original sont deux essais distincts.
    return [...new Set([preview, original, preview.replace(/(\/\d{4}\/\d{2})\/thumb\//i, "$1/"), original.replace(/(\/\d{4}\/\d{2})\/thumb\//i, "$1/")].filter(Boolean))];
  }

  function preloadImage(url) {
    const u = String(url || "").trim();
    if (!u) return Promise.resolve(false);
    if (HOVER_GALLERY.preload.has(u)) return HOVER_GALLERY.preload.get(u);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.referrerPolicy = "no-referrer";
      const finish = (ok) => {
        clearTimeout(timeout);
        img.onload = img.onerror = null;
        resolve(ok);
      };
      const timeout = setTimeout(() => finish(false), 8000);
      img.onload = () => finish(img.naturalWidth > 0);
      img.onerror = () => finish(false);
      img.src = u;
    });
    HOVER_GALLERY.preload.set(u, p);
    return p;
  }

  async function findWorkingF95Image(urls, excluded = new Set()) {
    const tried = new Set(excluded);
    for (const url of urls) {
      for (const candidate of f95ImageCandidates(url)) {
        if (tried.has(candidate)) continue;
        tried.add(candidate);
        if (await preloadImage(candidate)) return candidate;
      }
    }
    return "";
  }

  function recoverCardCover(context, failedSrc) {
    if (context.coverRecovery) return context.coverRecovery;
    const { card, img, rawEntry, originalSrc } = context;
    HOVER_GALLERY.baseSrc.set(card, THUMB_FALLBACK_URL);
    HOVER_GALLERY.baseFallback.set(card, true);
    if (context.request?.isBase) applyThumbState(img, THUMB_FALLBACK_URL, true, true);

    context.coverRecovery = (async () => {
      const excluded = new Set([failedSrc]);
      let recovered = await findWorkingF95Image([originalSrc], excluded);
      if (!recovered) {
        const media = await fetchF95GalleryMedia(rawEntry, originalSrc);
        // La vraie cover reste prioritaire ; quelques images du même sujet servent de secours.
        recovered = await findWorkingF95Image([media.cover, ...media.gallery.slice(0, 4)], excluded);
      }
      return recovered;
    })().catch(() => "").then((recovered) => {
      const src = recovered || THUMB_FALLBACK_URL;
      HOVER_GALLERY.baseSrc.set(card, src);
      HOVER_GALLERY.baseFallback.set(card, !recovered);
      // Une récupération tardive ne doit pas écraser une image de galerie au survol.
      if (card.isConnected && context.request?.isBase) applyThumbState(img, src, !recovered, true);
      return src;
    });
    return context.coverRecovery;
  }

  function applyThumbState(img, src, isFallback, isBase = false, attempted = new Set()) {
    if (!img) return;
    const requestedSrc = String(src || "").trim() || THUMB_FALLBACK_URL;
    const context = HOVER_GALLERY.images.get(img);
    const request = { src: requestedSrc, isBase };
    if (context) context.request = request;
    img.onerror = () => {
      if (!context || context.request !== request || requestedSrc === THUMB_FALLBACK_URL) return;
      const tried = new Set(attempted);
      tried.add(requestedSrc);
      // Un échec réel prime sur un ancien préchargement réussi.
      HOVER_GALLERY.preload.set(requestedSrc, Promise.resolve(false));
      if (isBase) {
        if (context.coverRecovery) {
          // Une source déjà récupérée peut aussi devenir indisponible : pas de boucle.
          HOVER_GALLERY.baseSrc.set(context.card, THUMB_FALLBACK_URL);
          HOVER_GALLERY.baseFallback.set(context.card, true);
          applyThumbState(img, THUMB_FALLBACK_URL, true, true);
        } else {
          recoverCardCover(context, requestedSrc);
        }
        return;
      }
      findWorkingF95Image([requestedSrc], tried).then((recovered) => {
        if (!context.card.isConnected || context.request !== request) return;
        if (recovered) applyThumbState(img, recovered, false, false, tried);
        else {
          const baseSrc = HOVER_GALLERY.baseSrc.get(context.card);
          if (tried.has(baseSrc)) {
            // La galerie peut repasser sur la cover : ne pas restaurer le même src cassé.
            HOVER_GALLERY.baseSrc.set(context.card, THUMB_FALLBACK_URL);
            HOVER_GALLERY.baseFallback.set(context.card, true);
            applyThumbState(img, THUMB_FALLBACK_URL, true, true);
            if (!context.coverRecovery) recoverCardCover(context, baseSrc);
          } else {
            applyThumbState(img, baseSrc, HOVER_GALLERY.baseFallback.get(context.card), true);
          }
        }
      });
    };
    img.referrerPolicy = "no-referrer";
    img.classList.toggle("is-fallback", !!isFallback);
    if (img.getAttribute("src") !== requestedSrc) img.src = requestedSrc;
  }

  function normalizeF95MediaKey(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    try {
      const x = new URL(u, location.origin);
      const host = (x.hostname || "").toLowerCase();
      let path = (x.pathname || "").replace(/\\/g, "/");

      // preview / attachments / thumb -> même clé logique basée sur le fichier
      if (
        host === "preview.f95zone.to" ||
        host === "attachments.f95zone.to"
      ) {
        path = path.replace(/^\/(\d{4})\/(\d{2})\/(thumb\/)?/i, "/");
        return path.toLowerCase();
      }

      return `${host}${path}`.toLowerCase();
    } catch {
      return u.replace(/[?#].*$/, "").toLowerCase();
    }
  }


  function isGalleryAvatarUrl(url) {
    const u = String(url || "").trim().toLowerCase();
    if (!u) return false;
    return /\/data\/avatars?\//i.test(u) ||
      /^https?:\/\/(?:[^/]+\.)?gravatar\.com\/avatar\//i.test(u);
  }

  function sameImageUrl(a, b) {
    const aa = String(a || "").trim();
    const bb = String(b || "").trim();
    if (!aa || !bb) return false;

    const ka = normalizeF95MediaKey(aa);
    const kb = normalizeF95MediaKey(bb);
    if (ka && kb) return ka === kb;

    return aa === bb;
  }

  async function fetchF95GalleryMedia(rawEntry, imageUrl) {
    const f95Url = getF95ThreadUrl(rawEntry, imageUrl);
    if (!f95Url) return { cover: "", gallery: [] };
    if (!HOVER_GALLERY.cache.has(f95Url)) {
      const api = getF95GalleryApiUrl(f95Url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      HOVER_GALLERY.cache.set(
        f95Url,
        fetch(api, { credentials: "same-origin", cache: "force-cache", signal: controller.signal })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            const raw = Array.isArray(data?.gallery) ? data.gallery : [];
            return {
              cover: String(data?.cover || "").trim(),
              gallery: raw.map((item) => String(item || "").trim()).filter((url) => url && !isGalleryAvatarUrl(url)),
            };
          })
          .catch(() => ({ cover: "", gallery: [] }))
          .finally(() => clearTimeout(timeout))
      );
    }
    return HOVER_GALLERY.cache.get(f95Url);
  }

  async function fetchHoverGalleryUrls(rawEntry, fallbackUrl) {
    const base = String(fallbackUrl || "").trim();
    const media = await fetchF95GalleryMedia(rawEntry, base);
    const cleaned = [];
    const seen = new Set();
    for (const item of [base, media.cover, ...media.gallery]) {
      const original = String(item || "").trim();
      if (!original || original === THUMB_FALLBACK_URL || isGalleryAvatarUrl(original)) continue;
      const preview = original === base ? base : toF95PreviewUrl(original);
      const key = normalizeF95MediaKey(preview) || preview;
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(preview);
    }
    return cleaned;
  }

  function stopCardHoverSlideshow(card) {
    const timer = HOVER_GALLERY.timers.get(card);
    if (timer) clearInterval(timer);
    HOVER_GALLERY.timers.delete(card);

    const img = card?.querySelector(".thumb");
    const baseSrc = HOVER_GALLERY.baseSrc.get(card) || "";
    const baseFallback = !!HOVER_GALLERY.baseFallback.get(card);
    if (img && baseSrc) applyThumbState(img, baseSrc, baseFallback, true);
  }

  function bindCardHoverGallery(card, rawEntry, fallbackUrl) {
    const img = card?.querySelector(".thumb");
    if (!card || !img) return;

    const baseSrc = String(fallbackUrl || "").trim() || img.src;
    const baseFallback = baseSrc === THUMB_FALLBACK_URL;

    HOVER_GALLERY.baseSrc.set(card, baseSrc);
    HOVER_GALLERY.baseFallback.set(card, baseFallback);
    HOVER_GALLERY.images.set(img, { card, img, rawEntry, originalSrc: baseSrc, request: null, coverRecovery: null });
    applyThumbState(img, baseSrc, baseFallback, true);
    if (!baseFallback && img.complete && img.naturalWidth === 0) {
      recoverCardCover(HOVER_GALLERY.images.get(img), baseSrc);
    }

    card.addEventListener("mouseleave", () => {
      HOVER_GALLERY.activeToken.set(card, null);
      stopCardHoverSlideshow(card);
    });

    card.addEventListener("mouseenter", async () => {
      stopCardHoverSlideshow(card);

      const token = Symbol("hover");
      HOVER_GALLERY.activeToken.set(card, token);

      const urls = await fetchHoverGalleryUrls(rawEntry, baseSrc);
      if (!card.isConnected || HOVER_GALLERY.activeToken.get(card) !== token) return;

      if (!Array.isArray(urls) || urls.length < 2) {
        stopCardHoverSlideshow(card);
        return;
      }

      // Si la première URL est la même que la cover, saute directement à la suivante
      let idx = 0;
      if (urls.length > 1 && sameImageUrl(urls[0], baseSrc)) idx = 1;

      let switching = false;
      const showNext = async () => {
        if (switching) return;
        switching = true;
        try {
          // Ignore les images indisponibles, en essayant aussi la pièce jointe originale.
          for (let attempts = 0; attempts < urls.length; attempts++) {
            const next = urls[idx];
            idx = (idx + 1) % urls.length;
            const resolved = await findWorkingF95Image([next]);
            if (!card.isConnected || HOVER_GALLERY.activeToken.get(card) !== token) return false;
            if (!resolved) continue;
            applyThumbState(img, resolved, false);
            preloadImage(urls[idx]);
            return true;
          }
          stopCardHoverSlideshow(card);
          return false;
        } finally {
          switching = false;
        }
      };
      const shown = await showNext();
      if (!shown || !card.isConnected || HOVER_GALLERY.activeToken.get(card) !== token) return;
      const timer = setInterval(() => {
        if (!card.isConnected || !card.matches(":hover")) {
          HOVER_GALLERY.activeToken.set(card, null);
          stopCardHoverSlideshow(card);
          return;
        }
        showNext();
      }, 2000);

      HOVER_GALLERY.timers.set(card, timer);
    });
  }


  globalThis.F95Images = Object.freeze({
    bindCardHoverGallery, getF95ThreadUrl, fetchF95GalleryMedia,
    findWorkingF95Image, normalizeF95MediaKey, isGalleryAvatarUrl,
    markImageFailed(url) { HOVER_GALLERY.preload.set(String(url || "").trim(), Promise.resolve(false)); }
  });
})();
