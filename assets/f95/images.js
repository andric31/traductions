/* Images F95 : liens signés, renouvellement et secours sans image cassée. */
(() => {
  "use strict";
  const HOVER_GALLERY = {
    cache: new Map(),      // sujet -> requête et échéance du cache
    timers: new WeakMap(), // card -> interval id
    baseSrc: new WeakMap(),
    baseFallback: new WeakMap(),
    activeToken: new WeakMap(),
    preload: new Map(),    // URL complète -> résultat et échéance
    images: new WeakMap(), // img -> current request / cover recovery
  };

  const THUMB_FALLBACK_URL = "/assets/f95/image-unavailable.svg";
  const THUMB_LOADING_URL = "/assets/f95/image-loading.svg";

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

  function markImageFailed(url) {
    HOVER_GALLERY.preload.set(String(url || "").trim(), { promise: Promise.resolve(false), until: Date.now() + 30000 });
  }

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
    if (!u || isGalleryAvatarUrl(u) || isExpiredImage(u)) return [];
    // Une signature est liée à l'adresse reçue : ne changer ni hôte ni chemin.
    if (hasImageSignature(u)) return [u];
    const preview = toF95PreviewUrl(u);
    const original = u.replace(/^https?:\/\/preview\.f95zone\.to\//i, "https://attachments.f95zone.to/");
    return [...new Set([u, preview, original, preview.replace(/(\/\d{4}\/\d{2})\/thumb\//i, "$1/"), original.replace(/(\/\d{4}\/\d{2})\/thumb\//i, "$1/")].filter(Boolean))];
  }

  function preloadImage(url) {
    const u = String(url || "").trim();
    if (!u || isExpiredImage(u)) return Promise.resolve(false);
    const cached = HOVER_GALLERY.preload.get(u);
    if (cached && cached.until > Date.now()) return cached.promise;
    const entry = { promise: null, until: Date.now() + 8000 };
    const p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.referrerPolicy = "no-referrer";
      const finish = (ok) => {
        clearTimeout(timeout);
        img.onload = img.onerror = null;
        entry.until = Math.min(Date.now() + (ok ? 300000 : 30000), imageExpiry(u) || Infinity);
        resolve(ok);
      };
      const timeout = setTimeout(() => finish(false), 8000);
      img.onload = () => finish(usableImage(img, u));
      img.onerror = () => finish(false);
      img.src = u;
    });
    entry.promise = p;
    HOVER_GALLERY.preload.set(u, entry);
    return p;
  }

  async function findWorkingF95Image(urls, excluded = new Set()) {
    const tried = new Set(excluded);
    for (const url of preferFreshImages(urls)) {
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
    HOVER_GALLERY.baseSrc.set(card, THUMB_LOADING_URL);
    HOVER_GALLERY.baseFallback.set(card, true);
    if (context.request?.isBase) applyThumbState(img, THUMB_LOADING_URL, true, true);

    context.coverRecovery = (async () => {
      const excluded = new Set([failedSrc]);
      let recovered = await findWorkingF95Image([originalSrc], excluded);
      if (!recovered) {
        const media = await fetchF95GalleryMedia(rawEntry, originalSrc, { refresh: true });
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
      if (!context || context.request !== request || (requestedSrc === THUMB_FALLBACK_URL || requestedSrc === THUMB_LOADING_URL)) return;
      const tried = new Set(attempted);
      tried.add(requestedSrc);
      // Un échec réel prime sur un ancien préchargement réussi.
      markImageFailed(requestedSrc);
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
    img.onload = () => {
      if (context && context.request !== request) return;
      if (!isFallback && !usableImage(img, requestedSrc)) img.onerror();
    };
    img.referrerPolicy = "no-referrer";
    const isLoading = requestedSrc === THUMB_LOADING_URL;
    img.title = isLoading ? "Chargement de l’image…" : isFallback ? "Image indisponible : aucun lien F95 accessible pour le moment." : "";
    img.setAttribute("aria-busy", String(isLoading));
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

  async function fetchF95GalleryMedia(rawEntry, imageUrl, options = {}) {
    const f95Url = getF95ThreadUrl(rawEntry, imageUrl);
    if (!f95Url) return { cover: "", gallery: [] };
    const now = Date.now(), cached = HOVER_GALLERY.cache.get(f95Url);
    if (cached && (cached.pending || (cached.until > now && (!options.refresh || (cached.refreshed && now - cached.created < 10000))))) return cached.promise;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const record = { refreshed: !!options.refresh, created: now, until: now + 15000, pending: true, promise: null };
    const api = getF95GalleryApiUrl(f95Url) + (options.refresh ? "&refresh=1" : "");
    record.promise = fetch(api, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const gallery = preferFreshImages([data?.cover, ...(Array.isArray(data?.gallery) ? data.gallery : [])]);
        const coverKey = normalizeF95MediaKey(data?.cover || "");
        const cover = gallery.find(url => normalizeF95MediaKey(url) === coverKey) || gallery[0] || "";
        const deadlines = gallery.map(imageExpiry).filter(Boolean).map(time => time - 30000);
        record.until = Math.min(Date.now() + (gallery.length ? 300000 : 15000), ...deadlines);
        return { cover, gallery };
      })
      .catch(() => ({ cover: "", gallery: [] }))
      .finally(() => { record.pending = false; clearTimeout(timeout); });
    HOVER_GALLERY.cache.set(f95Url, record);
    return record.promise;
  }

  async function fetchHoverGalleryUrls(rawEntry, fallbackUrl) {
    const base = String(fallbackUrl || "").trim();
    const media = await fetchF95GalleryMedia(rawEntry, base);
    return preferFreshImages([base, media.cover, ...media.gallery]);
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

    const supplied = String(fallbackUrl || "").trim() || img.getAttribute("src") || "";
    const baseSrc = supplied === "/favicon.png" ? "" : supplied;
    const baseFallback = !baseSrc || baseSrc === THUMB_FALLBACK_URL || baseSrc === THUMB_LOADING_URL;

    HOVER_GALLERY.baseSrc.set(card, THUMB_LOADING_URL);
    HOVER_GALLERY.baseFallback.set(card, true);
    const context = { card, img, rawEntry, originalSrc: baseSrc, request: null, coverRecovery: null };
    HOVER_GALLERY.images.set(img, context);
    // La source distante n'est affichée qu'après validation, pour éviter les croix.
    applyThumbState(img, THUMB_LOADING_URL, true, true);
    const load = async () => {
      const resolved = baseFallback ? "" : await findWorkingF95Image([baseSrc]);
      if (resolved) {
        HOVER_GALLERY.baseSrc.set(card, resolved);
        HOVER_GALLERY.baseFallback.set(card, false);
        if (card.isConnected && context.request?.isBase) applyThumbState(img, resolved, false, true);
      } else {
        await recoverCardCover(context, baseSrc);
      }
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
    preferFreshImages, isExpiredImage, markImageFailed
  });
})();
