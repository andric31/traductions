// viewer.menu.about.js — Entrée menu : À propos
(() => {
  "use strict";

  const ABOUT_TEXT = `
Pour tout renseignement, aide ou autre, rejoignez mon serveur Discord :
https://discord.gg/Jr8Ykf8yMd

Contact Discord :
https://discord.com/users/@andric31

Vous pouvez aussi me contacter sur F95zone :
Profil https://f95zone.to/members/andric31.247797/
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

  // Register menu item
  function register() {
    if (!window.ViewerMenu?.addItem) return false;
    window.ViewerMenu.addItem("ℹ️ À propos", open);
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
