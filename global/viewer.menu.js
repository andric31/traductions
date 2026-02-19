"use strict";

/**
 * ViewerMenu (style template) :
 * - registre d'items via ViewerMenu.register()
 * - construit le popover à l'ouverture (ordre garanti)
 * - n'impose aucune logique de la page /global (ça reste dans viewer.js)
 */
(function () {
  const state = {
    items: [],
    inited: false,
    pop: null,
    btn: null,
    isOpen: false,
  };

  function normalizePath(p) {
    // si tu veux des liens absolus, mets directement "/"
    return String(p || "").trim();
  }

  function closeMenu() {
    if (!state.pop) return;
    state.isOpen = false;
    state.pop.classList.remove("open");
    state.pop.setAttribute("aria-hidden", "true");
  }

  function openMenu() {
    if (!state.pop) return;

    // rebuild à chaque ouverture (comme template) => ordre stable + modules OK
    buildMenu();

    state.isOpen = true;
    state.pop.classList.add("open");
    state.pop.setAttribute("aria-hidden", "false");
  }

  function toggleMenu() {
    state.isOpen ? closeMenu() : openMenu();
  }

  function buildMenu() {
    const pop = state.pop;
    if (!pop) return;

    // clear
    pop.innerHTML = "";

    // items triés par order
    const items = [...state.items].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

    for (const it of items) {
      if (!it) continue;

      // separator
      if (it.type === "sep") {
        const hr = document.createElement("div");
        hr.className = "menu-sep";
        pop.appendChild(hr);
        continue;
      }

      // item normal
      const a = document.createElement("a");
      a.className = "menu-item";
      a.href = normalizePath(it.href);
      a.textContent = it.label || "Lien";
      if (it.title) a.title = it.title;

      a.addEventListener("click", () => closeMenu());
      pop.appendChild(a);
    }
  }

  function init() {
    if (state.inited) return;
    state.inited = true;

    state.btn = document.getElementById("hamburgerBtn");
    state.pop = document.getElementById("topMenuPopover");

    if (!state.btn || !state.pop) return;

    // Click bouton
    state.btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });

    // click dehors -> close
    document.addEventListener("click", (e) => {
      if (!state.isOpen) return;
      const t = e.target;
      if (state.pop.contains(t) || state.btn.contains(t)) return;
      closeMenu();
    });

    // ESC -> close
    document.addEventListener("keydown", (e) => {
      if (!state.isOpen) return;
      if (e.key === "Escape") closeMenu();
    });

    // (optionnel) si tu veux repositionner ou adapter largeur,
    // fais-le ici, mais on laisse neutre.
  }

  // API template-like
  window.ViewerMenu = {
    register(item) {
      // item: {label, href, order, title} ou {type:"sep", order}
      state.items.push(item);
    },
    open: openMenu,
    close: closeMenu,
    init,
  };

  // init au DOM ready
  document.addEventListener("DOMContentLoaded", init);

  // ✅ item par défaut: Accueil toujours 1er
  window.ViewerMenu.register({
    label: "🏠 Accueil",
    href: "../",          // depuis /global/ -> remonte vers /
    order: 10,
    title: "Retour à l’accueil",
  });

})();

