/* Présentation v250 : ne s'active jamais sur une fiche jeu. */
(() => {
  "use strict";
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  if (root.dataset.v250Page === "viewer" &&
      ((params.get("id") || "").trim() || (params.get("uid") || "").trim())) return;
  root.classList.add("v250-ui");
  document.querySelectorAll("link[data-v250-style]").forEach(link => { link.media = "all"; });
  try {
    const theme = (localStorage.getItem("viewerTheme") || "auto").trim() || "auto";
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  } catch (_) {}
})();
