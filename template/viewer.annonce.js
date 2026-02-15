// viewer.annonce.js — Bandeau annonce au-dessus des tuiles (minimisable)
// Dépend uniquement de annonce.html (contenu)
// ✅ Reload (F5) => force déplié
// ✅ Réouverture plus tard => respecte l'état réduit (localStorage)

(() => {
  const LS_KEY = "viewer_annonce_minimized"; // persiste entre sessions
  const ANNOUNCE_URL = "./annonce.html";     // ✅ relatif (template GitHub Pages)

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

  function navIsReload() {
    try {
      const nav = performance.getEntriesByType?.("navigation")?.[0];
      if (nav && typeof nav.type === "string") return nav.type === "reload";
    } catch {}
    // fallback ancien
    try {
      return performance.navigation && performance.navigation.type === 1;
    } catch {}
    return false;
  }

  function getMinimized() {
    try { return localStorage.getItem(LS_KEY) === "1"; }
    catch { return false; }
  }

  function setMinimized(v) {
    try { localStorage.setItem(LS_KEY, v ? "1" : "0"); } catch {}
  }

  function render(html, opts = {}) {
    const host = ensureHost();

    // ✅ Si c'est un reload (F5), on force open
    const minimized = (opts.forceOpen || navIsReload()) ? false : getMinimized();

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
        render(html, { forceOpen: false, forceShow: true });
      });
    }
  }

  async function loadAnnonce() {
    // ✅ cache-bust léger + no-store pour GitHub Pages/CDN
    const url = `${ANNOUNCE_URL}?v=${Date.now()}`;
    const r = await fetch(url, { cache: "no-store" });
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
        .catch(() => render("", { forceShow: false }));
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    window.viewerAnnonce.refresh();
  });
})();
