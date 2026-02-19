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

  function getHamburgerBtn(){
  return document.getElementById("hamburgerBtn")
      || document.getElementById("hamburgerBtnViewer")
      || document.getElementById("hamburgerBtnGame")
      || null;
}

function closeMenu() {
  const pop = document.getElementById("topMenuPopover");
  if (pop) pop.classList.add("hidden");
  const b = getHamburgerBtn();
  if (b) b.setAttribute("aria-expanded", "false");
}

function positionPopover(btn, pop){
  try{
    const r = btn.getBoundingClientRect();
    const pad = 8;
    // ensure visible to measure
    pop.classList.remove("hidden");
    const w = pop.offsetWidth || 240;
    const h = pop.offsetHeight || 80;
    const maxL = Math.max(pad, window.innerWidth - w - pad);
    const maxT = Math.max(pad, window.innerHeight - h - pad);
    const left = Math.min(maxL, Math.max(pad, r.left));
    const top  = Math.min(maxT, Math.max(pad, r.bottom + 8));
    pop.style.left = left + "px";
    pop.style.top  = top + "px";
  }catch{}
}

function toggleMenu(){
  const btn = getHamburgerBtn();
  const pop = ensureDom();
  if (!btn || !pop) return;

  const isOpen = !pop.classList.contains("hidden");
  if (isOpen) { closeMenu(); return; }

  // re-render (au cas où des items ont été ajoutés après)
  renderMenuItems();
  positionPopover(btn, pop);
  pop.classList.remove("hidden");
  btn.setAttribute("aria-expanded", "true");
}

  function init() {
    ensureDom();
    renderMenuItems();

    if (BOUND) return;
    BOUND = true;

    const btn = getHamburgerBtn();
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleMenu();
      });
    }

    document.addEventListener("click", (e) => {
      const pop = document.getElementById("topMenuPopover");
      const b = getHamburgerBtn();
      if (!pop || pop.classList.contains("hidden")) return;
      const t = e.target;
      if (pop.contains(t)) return;
      if (b && (t === b || b.contains(t))) return;
      closeMenu();
    });

    window.addEventListener("resize", () => {
      const pop = document.getElementById("topMenuPopover");
      const b = getHamburgerBtn();
      if (pop && b && !pop.classList.contains("hidden")) positionPopover(b, pop);
    });


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
