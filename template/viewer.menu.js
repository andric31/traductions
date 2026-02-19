// viewer.menu.js — NOYAU : gère UNIQUEMENT la liste du menu ☰ (items + popover)
(() => {
  "use strict";

  const ITEMS = [];
  let BOUND = false;

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  function ensureDom() {
    // Popover du menu (le bouton ☰ est injecté dans viewer.js)
    let pop = document.getElementById("topMenuPopover");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "topMenuPopover";
      pop.className = "menu-popover hidden";
      document.body.appendChild(pop);
    }
    return pop;
  }

  function renderMenuItems() {
    const pop = ensureDom();

    if (!ITEMS.length) {
      pop.innerHTML = `<div class="menu-empty" style="opacity:.7;padding:10px 12px;">Menu vide</div>`;
      return;
    }

    pop.innerHTML = ITEMS.map((it, i) => {
      const label = escapeHtml(it.label || "");
      return `<button type="button" class="menu-item" data-menu-idx="${i}">${label}</button>`;
    }).join("");

    pop.querySelectorAll("[data-menu-idx]").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-menu-idx"), 10);
        const it = ITEMS[idx];
        closeMenu();
        if (it && typeof it.onClick === "function") it.onClick();
      });
    });
  }

  function addItem(label, onClick) {
    ITEMS.push({ label: String(label || ""), onClick });
    renderMenuItems();
  }

  function clearItems() {
    ITEMS.length = 0;
    renderMenuItems();
  }

  function closeMenu() {
    const pop = document.getElementById("topMenuPopover");
    if (pop) pop.classList.add("hidden");
    const b = document.getElementById("hamburgerBtn");
    if (b) b.setAttribute("aria-expanded", "false");
  }

  function init() {
    ensureDom();
    renderMenuItems();

    // ✅ Hook optionnel : permet de reconstruire les items à chaque ouverture
    // (utile quand on est en mode jeu et qu'on veut "Retour à la liste" dynamique)
    try { window.__onViewerMenuInit?.(); } catch {}

    if (BOUND) return;
    BOUND = true;

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });
  }

  window.ViewerMenu = {
    init,
    addItem,
    clearItems,
    closeMenu
  };
})();
