// viewer.menu.about.js — Entrée menu : À propos
(() => {
  "use strict";

  const ABOUT_TEXT = `
Pour tout renseignement, aide ou autre, rejoignez le serveur Discord :
https://discord.gg/Jr8Ykf8yMd
`.trim();

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  function linkify(text) {
    const esc = escapeHtml(text);
    return esc.replace(
      /(https?:\/\/[^\s<]+)/g,
      (m) => `<a href="${m}" target="_blank" rel="noopener">${m}</a>`
    );
  }

  function ensureDom() {
    let overlay = document.getElementById("aboutOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "aboutOverlay";
      overlay.className = "modal-overlay hidden";
      overlay.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="aboutTitle">
          <div class="modal-head">
            <div class="modal-title" id="aboutTitle">À propos</div>
            <button type="button" class="modal-close" id="aboutClose" aria-label="Fermer">✕</button>
          </div>
          <div class="modal-body" id="aboutBody"></div>
          <div class="modal-foot">
            <button type="button" class="modal-btn" id="aboutOk">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      document.getElementById("aboutClose")?.addEventListener("click", close);
      document.getElementById("aboutOk")?.addEventListener("click", close);
      overlay.addEventListener("click", (e) => {
        if (e.target && e.target.id === "aboutOverlay") close();
      });
    }
  }

  function open() {
    ensureDom();
    const body = document.getElementById("aboutBody");
    if (body) body.innerHTML = `<div class="aboutText">${linkify(ABOUT_TEXT).replace(/\n/g, "<br>")}</div>`;
    document.getElementById("aboutOverlay")?.classList.remove("hidden");
  }

  function close() {
    document.getElementById("aboutOverlay")?.classList.add("hidden");
  }

  
  const EXT_TEXT = `
🧩 Extension Chrome — f95list_andric31

Cette page (viewer) peut être utilisée seule, mais l’extension permet surtout :
- d’ajouter un jeu à ta liste directement depuis F95Zone
- d’afficher les badges ✅ / 🔄 sur les threads + vignettes
- de gérer f95list.json plus facilement

Infos / support : Discord (voir “À propos”).
`.trim();

  function ensureExtDom() {
    let overlay = document.getElementById("extOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "extOverlay";
      overlay.className = "about-overlay hidden";
      overlay.innerHTML = `
        <div class="about-card" role="dialog" aria-modal="true" aria-label="Extension">
          <div class="about-head">
            <div class="about-title">🧩 Extension</div>
            <button type="button" class="about-close" aria-label="Fermer">✖</button>
          </div>
          <div class="about-body">
            <div class="about-text">${linkify(EXT_TEXT).replace(/\n/g, "<br>")}</div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeExt();
      });
      overlay.querySelector(".about-close").addEventListener("click", closeExt);
    }
    return overlay;
  }

  function openExt() {
    const overlay = ensureExtDom();
    overlay.classList.remove("hidden");
  }

  function closeExt() {
    const overlay = document.getElementById("extOverlay");
    if (overlay) overlay.classList.add("hidden");
  }


  // Register menu item
  function register() {
    if (!window.ViewerMenu?.addItem) return false;
    window.ViewerMenu.addItem("ℹ️ À propos", open);
    window.ViewerMenu.addItem("🧩 Extension", openExt);
    window.ViewerMenuExt = { open: openExt, close: closeExt };
    window.ViewerMenuAbout = { open, close };
    return true;
  }

  // wait for ViewerMenu
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (register() || tries > 80) clearInterval(t);
  }, 50);
})();
