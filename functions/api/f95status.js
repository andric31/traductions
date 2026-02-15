export async function onRequestGet({ request }) {
  try {
    const u = new URL(request.url);
    const url = (u.searchParams.get("url") || "").trim();
    const storedTitle = (u.searchParams.get("storedTitle") || "").trim();
    const storedVersion = (u.searchParams.get("storedVersion") || "").trim();

    if (!/^https:\/\/f95zone\.to\/threads\/\d+\/?/i.test(url)) {
      return json({ ok: false, error: "bad_url" }, 400);
    }

    const bustUrl = url + (url.includes("?") ? "&" : "?") + "cb=" + Date.now();

    const r = await fetch(bustUrl, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept": "text/html",
        "cache-control": "no-store",
        "pragma": "no-cache",
      },
      cf: { cacheTtl: 0, cacheEverything: false },
    });

    if (!r.ok) {
      return json({ ok: false, error: "fetch_http_" + r.status }, 200, noStoreHeaders());
    }

    const html = await r.text();

    // =========================
    // 1) H1
    // =========================
    const h1Match = html.match(/<h1[^>]*p-title-value[^>]*>([\s\S]*?)<\/h1>/i);
    const h1 = h1Match ? stripHtml(h1Match[1]) : "";

    if (!h1) {
      return json({ ok: false, error: "no_title_found" }, 200, noStoreHeaders());
    }

    // =========================
    // 2) LABELS (VN / Ren'Py / Abandoned etc)
    // =========================
    const labels = [];
    const labelRegex = /<a[^>]*class="labelLink"[^>]*>\s*<span[^>]*class="label[^"]*"[^>]*>(.*?)<\/span>/gi;

    let m;
    while ((m = labelRegex.exec(html)) !== null) {
      const t = stripHtml(m[1]);
      if (t) labels.push(t);
    }

    // =========================
    // 3) Titre complet F95
    // =========================
    const currentTitleFull = (labels.join(" ") + " " + h1)
      .replace(/\s+/g, " ")
      .trim();

    // =========================
    // 4) Version
    // =========================
    const currentVersion = extractVersion(h1);

    const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

    const curTitle = clean(currentTitleFull);
    const stTitle  = clean(storedTitle);
    const curV     = clean(currentVersion);
    const stV      = clean(storedVersion);

    let isUpToDate = false;
    let mode = "unknown";

    // priorité : titre complet
    if (stTitle && curTitle) {
      mode = "title";
      isUpToDate = (curTitle === stTitle);
    }

    // fallback version si titre différent
    if (!isUpToDate && stV && curV) {
      mode = "version";
      isUpToDate = (curV === stV);
    }

    return json({
      ok: true,
      mode,
      isUpToDate,
      currentTitle: curTitle,
      currentVersion: curV,
      labels,
      h1
    }, 200, noStoreHeaders());

  } catch (e) {
    return json(
      { ok: false, error: "exception", message: String(e?.message || e) },
      200,
      noStoreHeaders()
    );
  }
}

function extractVersion(title) {
  const s = String(title || "");
  let m = s.match(/\[\s*v\s*([0-9][^\]]*)\]/i);
  if (m) return m[1].trim();
  m = s.match(/\[\s*([0-9]+(?:\.[0-9]+)+[^\]]*)\]/i);
  if (m) return m[1].trim();
  return "";
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
