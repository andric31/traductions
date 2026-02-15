// /functions/api/f95status.js
export async function onRequestGet({ request }) {
  try {
    const u = new URL(request.url);
    const url = (u.searchParams.get("url") || "").trim();
    const storedTitle = (u.searchParams.get("storedTitle") || "").trim();
    const storedVersion = (u.searchParams.get("storedVersion") || "").trim();

    if (!isAllowedF95ThreadUrl(url)) {
      return json({ ok: false, error: "bad_url" }, 400, noStoreHeaders());
    }

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

    // ===== EXTRACTION TITRE =====
    const m = html.match(/<h1[^>]*class="[^"]*\bp-title-value\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
    const currentTitle = m ? stripHtml(m[1]) : "";

    if (!currentTitle) {
      return json({ ok: false, error: "no_title_found" }, 200, noStoreHeaders());
    }

    const curTitle = cleanText(currentTitle);
    const stTitle = cleanText(storedTitle);

    // ===== VERSION (INFORMATIF UNIQUEMENT) =====
    const currentVersionRaw = extractVersionFromTitle(currentTitle);
    const curV = normalizeVersion(currentVersionRaw);
    const stV = normalizeVersion(storedVersion);

    const out = {
      ok: true,
      mode: "title",
      isUpToDate: false,
      reasonCode: "",
      reasonText: "",
      currentTitle,
      currentVersion: currentVersionRaw || "",
      storedTitle,
      storedVersion,
    };

    // ===== SOURCE DE VERITE = TITRE =====
    if (stTitle && curTitle) {

      const same = stTitle === curTitle;
      out.isUpToDate = same;

      if (same) {
        out.reasonCode = "title_match";
        out.reasonText = "Titre identique.";
        return json(out, 200, noStoreHeaders());
      }

      // titre différent → expliquer
      if (stV && curV && stV !== curV) {
        out.reasonCode = "version_changed";
        out.reasonText = `Version différente : stockée v${stV} / F95 v${curV}.`;
      } else {
        out.reasonCode = "title_mismatch";
        out.reasonText = "Titre différent : stocké ≠ F95.";
      }

      return json(out, 200, noStoreHeaders());
    }

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
    const p = u.pathname || "";
    return /^\/threads\/(\d+|[^/]+\.\d+)\/?$/i.test(p);
  } catch {
    return false;
  }
}

function extractVersionFromTitle(title) {
  const s = String(title || "");
  let m = s.match(/\[\s*v\s*([0-9][^\]]*)\]/i);
  if (m) return "v" + m[1].trim();

  m = s.match(/\[\s*([0-9]+(?:\.[0-9]+)+[^\]]*)\]/i);
  if (m) return m[1].trim();

  return "";
}

function normalizeVersion(v) {
  const s = cleanText(v);
  if (!s) return "";
  return s.replace(/^v\s*/i, "").trim();
}

function stripHtml(s) {
  const raw = String(s || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return cleanText(decodeEntities(raw));
}

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
