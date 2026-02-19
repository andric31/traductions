// viewer.annonce.js — Bandeau annonce au-dessus des tuiles (minimisable)
// ✅ Supporte une annonce GÉNÉRALE (racine) + une annonce LOCALE (dossier traducteur)
// - Générale : /annonce.html
// - Locale   : ./annonce.html
// Fonctionne même si f95list.json échoue.

(() => {
  const SS_KEY = "viewer_annonce_minimized";

  // ✅ générale + locale
  const GLOBAL_URL = "/annonce.html";
  const LOCAL_URL  = "./annonce.html";

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

  function buildMergedHtml(globalHtml, localHtml) {
    const g = String(globalHtml || "");
    const l = String(localHtml || "");

    const gEmpty = isEmptyHtml(g);
    const lEmpty = isEmptyHtml(l);

    if (gEmpty && lEmpty) return "";

    // ✅ Si identiques (cas racine /annonce.html == ./annonce.html), on n'affiche qu'une fois
    const gNorm = g.replace(/\s+/g, " ").trim();
    const lNorm = l.replace(/\s+/g, " ").trim();
    if (!gEmpty && !lEmpty && gNorm && lNorm && gNorm === lNorm) return g;

    if (!gEmpty && lEmpty) return g;
    if (gEmpty && !lEmpty) return l;

    // Les deux : on empile avec de petits titres
    return `
      <div style="margin-bottom:10px">
        <div style="opacity:.8;font-size:12px;font-weight:700;margin-bottom:6px">🌍 Annonce générale</div>
        <div>${g}</div>
      </div>
      <div style="height:1px;background:rgba(255,255,255,.12);margin:10px 0"></div>
      <div>
        <div style="opacity:.8;font-size:12px;font-weight:700;margin-bottom:6px">👤 Annonce traducteur</div>
        <div>${l}</div>
      </div>
    `;
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

  async function safeFetchText(url) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return "";
      return await r.text();
    } catch {
      return "";
    }
  }

  async function loadMergedAnnonce() {
    // On charge les deux en parallèle
    const [g, l] = await Promise.all([
      safeFetchText(GLOBAL_URL),
      safeFetchText(LOCAL_URL),
    ]);
    return buildMergedHtml(g, l);
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
      loadMergedAnnonce()
        .then(html => render(html))
        .catch(() => render("", { forceShow: false }));
    }
  };

  // Init
  document.addEventListener("DOMContentLoaded", () => {
    window.viewerAnnonce.refresh();
  });
})();
