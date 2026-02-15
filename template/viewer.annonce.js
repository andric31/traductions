// viewer.annonce.js — Bandeau annonce au-dessus des tuiles (minimisable)
// Dépend uniquement de annonce.html (contenu)
// Fonctionne même si f95list.json échoue.

(() => {
  const SS_KEY = "viewer_annonce_minimized";
  const ANNOUNCE_URL = "/annonce.html";

  function $(sel) { return document.querySelector(sel); }

  function ensureHost() {
    // Host placé dans index.html: <div id="viewerAnnonceHost"></div>
    let host = document.getElementById("viewerAnnonceHost");
    if (host) return host;

    // Fallback si jamais pas dans HTML
    host = document.createElement("div");
    host.id = "viewerAnnonceHost";

    const gridWrap = document.getElementById("gridMode") || document.querySelector(".grid-wrap");
    if (gridWrap) gridWrap.insertBefore(host, gridWrap.firstChild);
    else document.body.insertBefore(host, document.body.firstChild);

    return host;
  }

  function isEmptyHtml(html) {
    const t = String(html || "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
    return t.length === 0;
  }

  function getMinimized() {
    try { return sessionStorage.getItem(SS_KEY) === "1"; }
    catch { return false; }
  }
  
  function setMinimized(v) {
    try { sessionStorage.setItem(SS_KEY, v ? "1" : "0"); } catch {}
  }

  function render(html, opts = {}) {
    const host = ensureHost();
    const minimized = opts.forceOpen ? false : getMinimized();

    // Si annonce vide => on cache totalement
    if (!opts.forceShow && isEmptyHtml(html)) {
      host.innerHTML = "";
      return;
    }

    host.innerHTML = `
      <div class="viewer-annonce ${minimized ? "is-min" : ""}">
        <div class="viewer-annonce__bar">
          <div class="viewer-annonce__title">📢 Annonce</div>
          <button type="button" class="viewer-annonce__btn" id="viewerAnnonceToggle">
            ${minimized ? "Afficher" : "Réduire"}
          </button>
        </div>
        <div class="viewer-annonce__body">${html}</div>
      </div>
    `;

    const btn = host.querySelector("#viewerAnnonceToggle");
    if (btn) {
      btn.addEventListener("click", () => {
        const nowMin = getMinimized();
        setMinimized(!nowMin);
        render(html);
      });
    }
  }

  async function loadAnnonce() {
    const r = await fetch(ANNOUNCE_URL, { cache: "no-store" });
    if (!r.ok) throw new Error("annonce.html introuvable (HTTP " + r.status + ")");
    return await r.text();
  }

  // API publique pour maintenance (appelable depuis viewer.js)
  window.viewerAnnonce = {
    setHtml(html) {
      render(String(html || ""), { forceShow: true, forceOpen: true });
    },
    setMaintenance(message) {
      const msg = String(message || "La page est temporairement indisponible.");
      render(`<b>🚧 Maintenance</b><br>${msg}`, { forceShow: true, forceOpen: true });
    },
    refresh() {
      loadAnnonce()
        .then(html => render(html))
        .catch(() => {
          // si annonce.html ne charge pas -> on n’affiche rien (ou tu peux mettre un fallback)
          render("", { forceShow: false });
        });
    }
  };

  // Init
  document.addEventListener("DOMContentLoaded", () => {
    window.viewerAnnonce.refresh();
  });
})();
