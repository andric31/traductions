/* Fiche pilote : styles de référence, uniquement en mode jeu. */
(() => {
  "use strict";
  const p = new URLSearchParams(location.search);
  if (!((p.get("id") || "").trim() || (p.get("uid") || "").trim())) return;
  document.querySelectorAll("link[data-game-legacy-style]").forEach(link => { link.media = "not all"; });
  document.querySelectorAll("link[data-game-style]").forEach(link => { link.media = "all"; });
})();
