// viewer.menu.js — Ant28jsp (menu ☰)
(() => {
  const $ = (id) => document.getElementById(id);

  function ensurePopover() {
    let pop = $("topMenuPopover");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "topMenuPopover";
      pop.className = "menu-popover hidden";
      pop.setAttribute("role", "menu");
      document.body.appendChild(pop);
    }
    return pop;
  }

  function isGameMode() {
    return document.body.classList.contains("mode-game");
  }

  function renderMenu() {
    const pop = ensurePopover();
    const items = [];

    // ✅ Main viewer : seulement Accueil
    items.push({ label: "🏠 Accueil", href: "/index.html" });

    // ✅ Page jeu : on autorise aussi le lien Viewer (retour liste)
    if (isGameMode()) {
      items.push({ label: "📚 Viewer", href: "/ant28jsp/index.html" });
    }

    pop.innerHTML = items
      .map(
        (it) =>
          `<a class="menu-item" role="menuitem" href="${it.href}">${it.label}</a>`
      )
      .join("");
  }

  function closeMenu() {
    const pop = $("topMenuPopover");
    if (pop) pop.classList.add("hidden");
    const btn = $("hamburgerBtn");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function init() {
    renderMenu();
  }

  window.ViewerMenu = { init, closeMenu, renderMenu };
})();
