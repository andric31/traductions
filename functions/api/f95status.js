// /functions/api/f95status.js  (Cloudflare Pages Function)
export async function onRequest(context) {
  const { request } = context;

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  try {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const f95Url = (url.searchParams.get("url") || "").trim();
    const storedTitle = (url.searchParams.get("storedTitle") || "").trim();
    const storedVersion = (url.searchParams.get("storedVersion") || "").trim();

    if (!f95Url || f95Url.length > 1000) {
      return new Response(JSON.stringify({ ok: false, error: "url invalide" }), { status: 400, headers });
    }
    if ((!storedTitle || storedTitle.length > 800) && (!storedVersion || storedVersion.length > 80)) {
      return new Response(
        JSON.stringify({ ok: false, error: "storedTitle ou storedVersion requis" }),
        { status: 400, headers }
      );
    }

    // sécurité : f95zone uniquement
    let u;
    try { u = new URL(f95Url); }
    catch { return new Response(JSON.stringify({ ok: false, error: "url invalide" }), { status: 400, headers }); }

    const host = (u.hostname || "").toLowerCase();
    if (!host.endsWith("f95zone.to")) {
      return new Response(JSON.stringify({ ok: false, error: "host non autorisé" }), { status: 400, headers });
    }

    // cache 30 min : on stocke UNIQUEMENT l'état F95 (pas les params user)
    const cacheKey = new Request("https://cache.local/f95status?u=" + encodeURIComponent(f95Url), request);
    const cache = caches.default;

    let current = await cache.match(cacheKey);
    let data;

    if (current) {
      data = await current.json();
    } else {
      // Fetch F95 (anti-cache léger)
      const bust = f95Url + (f95Url.includes("?") ? "&" : "?") + "cb=" + Date.now();

      const resp = await fetch(bust, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; andric31-trad/1.0)",
          accept: "text/html,*/*",
        },
        cf: { cacheTtl: 0, cacheEverything: false },
      });

      if (!resp.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: "fetch F95 failed", status: resp.status }),
          { status: 502, headers }
        );
      }

      const html = await resp.text();

      const h1 = extractH1(html);
      const labels = extractLabels(html);

      const currentTitleFull = clean([...(labels || []), h1].filter(Boolean).join(" "));
      const currentTitleH1 = clean(h1);

      const currentVersion = clean(extractVersionFromH1(h1));
      const currentVersionNorm = normVersion(currentVersion);

      data = {
        currentTitleFull,
        currentTitleH1,
        labels,
        currentVersion,
        currentVersionNorm,
      };

      await cache.put(
        cacheKey,
        new Response(JSON.stringify(data), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=1800",
          },
        })
      );
    }

    // =========================
    // Comparaison multi-cas
    // =========================
    const stTitle = clean(storedTitle);
    const stV = clean(storedVersion);
    const stVNorm = normVersion(stV);

    const curFull = clean(data?.currentTitleFull || "");
    const curH1 = clean(data?.currentTitleH1 || "");
    const curV = clean(data?.currentVersion || "");
    const curVNorm = String(data?.currentVersionNorm || normVersion(curV));

    let isUpToDate = false;
    let mode = "none";
    let reason = "no_match";

    // A) match titre complet (labels + H1)
    if (stTitle && curFull && stTitle === curFull) {
      isUpToDate = true;
      mode = "title_full";
      reason = "storedTitle === currentTitleFull";
    }
    // B) match H1 seul (si storedTitle est un cleanTitle)
    else if (stTitle && curH1 && stTitle === curH1) {
      isUpToDate = true;
      mode = "title_h1";
      reason = "storedTitle === currentTitleH1";
    }
    // C) match version (fallback)
    else if (stVNorm && curVNorm && stVNorm === curVNorm) {
      isUpToDate = true;
      mode = "version";
      reason = "storedVersion === currentVersion";
    }
    // D) sinon KO + explication
    else {
      mode = stTitle ? "mismatch" : "version_mismatch";
      reason = stTitle
        ? "title differs (full+h1), and version differs"
        : "version differs";
    }

    return new Response(
      JSON.stringify({
        ok: true,
        isUpToDate,
        mode,
        reason,

        // debug utile (tu peux masquer côté front si tu veux)
        currentTitleFull: data?.currentTitleFull || "",
        currentTitleH1: data?.currentTitleH1 || "",
        currentVersion: data?.currentVersion || "",
        labels: data?.labels || [],

        // pour debug comparaison
        storedTitle: storedTitle || "",
        storedVersion: storedVersion || "",
      }),
      { headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Exception Worker",
        detail: String(err?.message || err),
      }),
      { status: 500, headers }
    );
  }
}

// -------- extractors ----------
function extractH1(html) {
  const m = String(html || "").match(/<h1[^>]*class="[^"]*\bp-title-value\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  const raw = m ? m[1] : "";
  const txt = clean(decodeHtml(stripTags(raw)));
  return txt;
}

function extractLabels(html) {
  const out = [];
  const s = String(html || "");
  // labels dans le header : <a class="labelLink"...><span class="label ...">VN</span>
  const re = /<a[^>]*class="[^"]*\blabelLink\b[^"]*"[^>]*>\s*<span[^>]*class="[^"]*\blabel\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    const t = clean(decodeHtml(stripTags(m[1])));
    if (t) out.push(t);
  }
  // dédoublonnage en conservant l'ordre
  return [...new Set(out)];
}

function extractVersionFromH1(h1) {
  const s = String(h1 || "");

  // [v0.1], [V 0.1a], etc
  let m = s.match(/\[\s*v\s*([0-9][^\]]*)\]/i);
  if (m) return m[1].trim();

  // [0.1], [1.2.3b] etc (évite de capturer [Brainless])
  m = s.match(/\[\s*([0-9]+(?:\.[0-9]+)+(?:[a-z0-9._-]*)?)\s*\]/i);
  if (m) return m[1].trim();

  return "";
}

// -------- helpers ----------
function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, " ");
}

function decodeHtml(s) {
  let out = String(s || "");

  out = out
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/gi, " ");

  out = out.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });

  out = out.replace(/&#x([0-9a-f]+);/gi, (_, hx) => {
    const code = parseInt(hx, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });

  return out;
}

function clean(str) {
  return String(str || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u202F\u2009]/g, " ")
    .replace(/[‐-‒–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// normalise v / espaces / casse
function normVersion(v) {
  const s = clean(v).toLowerCase();
  if (!s) return "";
  // retire crochets éventuels
  const t = s.replace(/^\[|\]$/g, "").trim();
  // normalise "v0.1" "0.1" "V 0.1" -> "0.1"
  return t.replace(/^v\s*/i, "");
}
