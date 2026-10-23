/* Fiches : attendre les nouveaux styles avant de retirer les anciens. */
(() => {
  "use strict";
  const p = new URLSearchParams(location.search);
  if (!((p.get("id") || "").trim() || (p.get("uid") || "").trim())) return;
  if (window.__f95GameStyleFallbackUsed) return;
  const root = document.documentElement;
  const legacy = [...document.querySelectorAll("link[data-game-legacy-style]")];
  const links = [...document.querySelectorAll("link[data-game-style]")];
  // Chaque lien doit être prêt, y compris lors d'une ouverture depuis le cache.
  const ready = links.map(link => new Promise(resolve => {
    const done = ok => {
      link.removeEventListener("load", loaded);
      link.removeEventListener("error", failed);
      resolve(ok);
    };
    const loaded = () => done(true);
    const failed = () => done(false);
    link.addEventListener("load", loaded);
    link.addEventListener("error", failed);
    link.media = "all";
    if (link.sheet) done(true);
  }));
  Promise.all(ready).then(results => {
    if (window.__f95GameStyleFallbackUsed) return;
    if (links.length && results.every(Boolean)) {
      legacy.forEach(link => { link.media = "not all"; });
    } else {
      // Une feuille manquante ne doit laisser ni page blanche ni mise en page hybride.
      links.forEach(link => { link.media = "not all"; });
    }
    clearTimeout(window.__f95GameStyleFallback);
    root.classList.remove("game-styles-loading");
  });
})();
