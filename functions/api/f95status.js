// /functions/api/f95status.js
export async function onRequestGet({ request }) {
  try {
    const u = new URL(request.url);
    const url = (u.searchParams.get("url") || "").trim();
    const storedTitle = (u.searchParams.get("storedTitle") || "").trim();
    const storedVersion = (u.searchParams.get("storedVersion") || "").trim();

    // Sécurité : on accepte uniquement les threads F95
    if (!/^https:\/\/f95zone\.to\/threads\/\d+\/?/i.test(url)) {
      return json({ ok: false, error: "bad_url" }, 400);
    }

    // Anti-cache (et évite cache CF)
    const bustUrl = url + (url.includes("?") ? "&" : "?") + "cb=" + Date.now();

    const r = await fetch(bustUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9,fr;q=0.8",
        "cache-control": "no-store",
        "pragma": "no-cache",
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

    const currentVersion = extractVersion(currentTitle);

    // ✅ Compare robuste :
    // - si version stockée ET version F95 détectée -> compare version
    // - sinon -> compare titre (comme viewer threads)
    const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

    const curTitle = clean(currentTitle);
    const stTitle  = clean(storedTitle);
    const curV     = clean(currentVersion);
    const stV      = clean(storedVersion);

    let isUpToDate = false;
    let mode = "unknown";

    if (stV && curV) {
      mode = "version";
      isUpToDate = (curV === stV);
    } else if (stTitle && curTitle) {
      mode = "title";
      isUpToDate = (curTitle === stTitle);
    }

    return json(
      {
        ok: true,
        mode,
        isUpToDate,
        currentTitle,
        currentVersion,
      },
      200,
      noStoreHeaders()
    );
  } catch (e) {
    return json(
      { ok: false, error: "exception", message: String(e?.message || e) },
      200,
      noStoreHeaders()
    );
  }
}

function extractVersion(title) {
  // prend le premier [vX] ou [X] si format F95
  const s = String(title || "");
  let m = s.match(/\[\s*v\s*([0-9][^\]]*)\]/i); // [v2.00]
  if (m) return m[1].trim();
  m = s.match(/\[\s*([0-9]+(?:\.[0-9]+)+[^\]]*)\]/i); // [2.00] ou [1.2.3b]
  if (m) return m[1].trim();
  return "";
}

// ✅ strip + decode entités HTML (nbsp, &#039;, etc.)
function stripHtml(s) {
  const raw = String(s || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(raw)
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(str) {
  return String(str || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#0*39;/gi, "'")     // &#039;
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
    "pragma": "no-cache",
  };
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), { status, headers });
}
