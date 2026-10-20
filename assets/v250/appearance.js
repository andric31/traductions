/* Habillage uniquement : les scripts des catalogues et des fiches restent inchangés. */
(() => {
  "use strict";
  const root = document.documentElement;
  if (!root.classList.contains("v250-ui")) return;
  function init() {
    const select = document.getElementById("theme");
    const applyTheme = value => {
      if (!value || value === "auto") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", value);
    };
    if (select) {
      let saved = "auto";
      try { saved = localStorage.getItem("viewerTheme") || "auto"; } catch (_) {}
      select.value = saved;
      if (!select.value) select.value = "auto";
      applyTheme(select.value);
      // Ant28jsp possède déjà son gestionnaire de thème.
      if (select.dataset.bound !== "1") {
        select.dataset.bound = "1";
        select.addEventListener("change", () => {
          applyTheme(select.value);
          try { localStorage.setItem("viewerTheme", select.value); } catch (_) {}
        });
      }
      window.addEventListener("storage", event => {
        if (event.key !== "viewerTheme") return;
        select.value = event.newValue || "auto";
        if (!select.value) select.value = "auto";
        applyTheme(select.value);
      });
    }
    if (root.dataset.v250Page === "viewer" && location.pathname.split("/").filter(Boolean)[0] === "liste") {
      document.title = "Liste globale des traductions";
      const title = document.getElementById("viewerTitle");
      if (title) title.textContent = "Liste globale des traductions";
    }
    const topbar = document.querySelector(".topbar");
    if (topbar) {
      const measure = () => root.style.setProperty("--topbar-h", `${Math.ceil(topbar.getBoundingClientRect().height)}px`);
      measure();
      if ("ResizeObserver" in window) new ResizeObserver(measure).observe(topbar);
      else window.addEventListener("resize", measure);
      window.addEventListener("load", measure, { once: true });
    }
    document.querySelectorAll(".translator-avatar").forEach(img => {
      img.addEventListener("error", () => {
        if (!img.src.endsWith("/default-avatar.png")) img.src = "/default-avatar.png";
      });
      if (img.complete && img.naturalWidth === 0) img.src = "/default-avatar.png";
    });
  }
  if (document.readyState === "complete") init();
  else window.addEventListener("DOMContentLoaded", init, { once: true });
})();
