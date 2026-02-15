// /functions/api/f95status.js
export async function onRequestGet({ request }) {
  try {
    const u = new URL(request.url);
    const url = (u.searchParams.get("url") || "").trim();
    const storedTitle = (u.searchParams.get("storedTitle") || "").trim();
    const storedVersion = (u.searchParams.get("storedVersion") || "").trim();

    // ✅ Sécurité : accepter
    // - https://f95zone.to/threads/13345/
    // - https://f95zone.to/threads/slug.13345/
    if (!isAllowedF95ThreadUrl(url)) {
      return json({ ok: false, error: "bad_url" }, 400, noStoreHeaders());
    }

    // Anti-cache (évite cache navigateur/CF)
    const bustUrl = url + (url.includes("?") ? "&" : "?") + "cb=" + Date.now();

    const r = await fetch(bustUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9,fr;q=0.8",
        "cache-control": "no-store",
        pragma: "no-cache",
      },
      cf: { cacheTtl: 0, cacheEverything: false },
    });

    if (!r.ok) {
      return json({ ok: false, error: "fetch_http_" + r.status }, 200, noStoreHeaders());
    }

    const html = await r.text();

    // H1 F95 : <h1 class="p-title-value">...</h1>
    const m = html.match(/<h1[^>]*class="[^"]*\bp-title-value\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
    const currentTitle = m ? stripHtml(m[1]) : "";

    if (!currentTitle) {
      return json({ ok: false, error: "no_title_found" }, 200, noStoreHeaders());
    }

    const curTitle = cleanText(currentTitle);
    const stTitle = cleanText(storedTitle);

    // versions
    const currentVersionRaw = extractVersionFromTitle(currentTitle);
    const curV = normalizeVersion(currentVersionRaw);
    const stV = normalizeVersion(storedVersion);

    // Résultat + cause
    const out = {
      ok: true,
      mode: "unknown",
      isUpToDate: false,
      reasonCode: "",
      reasonText: "",
      // infos utiles côté client
      currentTitle,
      currentVersion: currentVersionRaw || "",
      storedTitle,
      storedVersion,
    };

    // =========================
    // ✅ Cas 1 : comparaison par version (si possible)
    // =========================
    if (stV && curV) {
      out.mode = "version";

      if (curV === stV) {
        out.isUpToDate = true;
        out.reasonCode = "version_match";
        out.reasonText = `Version identique (v${stV}).`;
      } else {
        out.isUpToDate = false;
        out.reasonCode = "version_mismatch";
        out.reasonText = `Version différente : stockée v${stV} / F95 v${curV}.`;
      }

      return json(out, 200, noStoreHeaders());
    }

    // =========================
    // ✅ Cas 2 : l’un a une version, l’autre non
    // =========================
    if (stV && !curV) {
      out.mode = "version_missing_on_f95";
      // fallback titre
      if (stTitle && curTitle) {
        const sameTitle = stTitle === curTitle;
        out.isUpToDate = sameTitle; // si titre strict identique, on considère OK
        out.reasonCode = sameTitle ? "title_match_but_no_f95_version" : "no_f95_version_title_diff";
        out.reasonText = sameTitle
          ? `Impossible de détecter la version sur F95, mais le titre est identique.`
          : `Impossible de détecter la version sur F95, et le titre diffère.`;
      } else {
        out.isUpToDate = false;
        out.reasonCode = "missing_titles";
        out.reasonText = `Version stockée mais comparaison impossible (titre manquant).`;
      }
      return json(out, 200, noStoreHeaders());
    }

    if (!stV && curV) {
      out.mode = "version_missing_in_list";
      // fallback titre
      if (stTitle && curTitle) {
        const sameTitle = stTitle === curTitle;
        out.isUpToDate = sameTitle; // si titre identique, ok
        out.reasonCode = sameTitle ? "title_match_but_no_stored_version" : "no_stored_version_title_diff";
        out.reasonText = sameTitle
          ? `Version trouvée sur F95 (v${curV}) mais pas stockée dans ta liste : comparaison par titre OK.`
          : `Version trouvée sur F95 (v${curV}) mais pas stockée : et le titre diffère.`;
      } else {
        out.isUpToDate = false;
        out.reasonCode = "missing_titles";
        out.reasonText = `Version trouvée sur F95 mais comparaison impossible (titre manquant).`;
      }
      return json(out, 200, noStoreHeaders());
    }

    // =========================
    // ✅ Cas 3 : comparaison par titre
    // =========================
    if (stTitle && curTitle) {
      out.mode = "title";
      const same = stTitle === curTitle;

      out.isUpToDate = same;
      out.reasonCode = same ? "title_match" : "title_mismatch";
      out.reasonText = same
        ? `Titre identique.`
        : `Titre différent : stocké ≠ F95.`;

      return json(out, 200, noStoreHeaders());
    }

    out.mode = "unknown";
    out.isUpToDate = false;
    out.reasonCode = "not_enough_data";
    out.reasonText = "Comparaison impossible (données manquantes).";
    return json(out, 200, noStoreHeaders());
  } catch (e) {
    return json(
      { ok: false, error: "exception", message: String(e?.message || e) },
      200,
      noStoreHeaders()
    );
  }
}

// ---------------- helpers ----------------

function isAllowedF95ThreadUrl(url) {
  try {
    const u = new URL(url);
    if (!/f95zone\.to$/i.test(u.hostname)) return false;

    // /threads/13345/
    // /threads/slug.13345/
    const p = u.pathname || "";
    return /^\/threads\/(\d+|[^/]+\.\d+)\/?$/i.test(p);
  } catch {
    return false;
  }
}

function extractVersionFromTitle(title) {
  const s = String(title || "");

  // 1) [v0.1], [V 2.10a], etc.
  let m = s.match(/\[\s*v\s*([0-9][^\]]*)\]/i);
  if (m) return "v" + m[1].trim();

  // 2) [0.1], [1.2.3b] (sans v)
  m = s.match(/\[\s*([0-9]+(?:\.[0-9]+)+[^\]]*)\]/i);
  if (m) return m[1].trim();

  // 3) rien
  return "";
}

function normalizeVersion(v) {
  const s = cleanText(v);
  if (!s) return "";
  // v0.1 => 0.1 ; V 0.1 => 0.1
  return s.replace(/^v\s*/i, "").trim();
}

// ✅ strip tags + decode entités HTML (nbsp, &#039;, etc.)
function stripHtml(s) {
  const raw = String(s || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return cleanText(decodeEntities(raw));
}

// Nettoyage robuste (unicode, espaces invisibles, tirets, etc.)
function cleanText(str) {
  return String(str || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u202F\u2009]/g, " ")
    .replace(/[‐-‒–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(str) {
  return String(str || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#0*39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function noStoreHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    pragma: "no-cache",
  };
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), { status, headers });
}
