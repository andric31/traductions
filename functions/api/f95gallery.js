const CACHE_VERSION = 'gallery-v6';

export async function onRequest(context) {
  const { request } = context;
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'content-type',
  };

  try {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const f95Url = String(url.searchParams.get('url') || '').trim();
    if (!f95Url) return json({ ok: false, error: 'url invalide' }, 400, headers);

    let u;
    try { u = new URL(f95Url); } catch {
      return json({ ok: false, error: 'url invalide' }, 400, headers);
    }
    if (!String(u.hostname || '').toLowerCase().endsWith('f95zone.to')) {
      return json({ ok: false, error: 'host non autorisé' }, 400, headers);
    }

    const cache = caches.default;
    const cacheKey = new Request(`https://cache.local/${CACHE_VERSION}/f95gallery?u=` + encodeURIComponent(f95Url), request);
    const cached = await cache.match(cacheKey);
    if (cached) return new Response(await cached.text(), { headers });

    const resp = await fetch(f95Url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; andric31-trad/1.0)',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9,fr;q=0.8',
        'referer': 'https://f95zone.to/',
      },
    });
    if (!resp.ok) {
      return json({ ok: false, error: 'fetch F95 failed', status: resp.status }, 502, headers);
    }

    const html = await resp.text();
    const firstArticle = extractFirstPostArticle(html);
    const clean = stripJunk(firstArticle);

    const cover = getThreadMainImageUrlFromHtml(clean);
    const gallery = getThreadGalleryUrlsFromHtml(clean);
    const payload = {
      ok: true,
      cover: cover || gallery[0] || '',
      gallery: dedupKeepOrder([...(cover ? [cover] : []), ...gallery]).slice(0, 80),
    };

    const body = JSON.stringify(payload);
    await cache.put(
      cacheKey,
      new Response(body, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=1800',
        },
      })
    );
    return new Response(body, { headers });
  } catch (err) {
    return json({ ok: false, error: 'Exception Worker', detail: String(err?.message || err) }, 500, headers);
  }
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers });
}

function extractFirstPostArticle(html) {
  const s = String(html || '');

  // Priorité : premier article de post.
  const articleMatch = s.match(/<article[^>]*class="[^"]*message--post[^"]*"[\s\S]*?<\/article>/i);
  if (articleMatch?.[0]) return articleMatch[0];

  // Fallback : premier bloc message.
  const messageMatch = s.match(/<div[^>]*class="[^"]*message-inner[^"]*"[\s\S]*?<\/article>/i);
  if (messageMatch?.[0]) return messageMatch[0];

  return s;
}

function stripJunk(html) {
  let s = String(html || '');
  s = s.replace(/<blockquote[^>]*class="[^"]*bbCodeBlock--quote[^"]*"[^>]*>[\s\S]*?<\/blockquote>/gi, '');
  s = s.replace(/<div[^>]*class="[^"]*bbCodeSpoiler[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  s = s.replace(/<blockquote[^>]*class="[^"]*bbCodeSpoiler[^"]*"[^>]*>[\s\S]*?<\/blockquote>/gi, '');
  s = s.replace(/<img[^>]*class="[^"]*smilie[^"]*"[^>]*>/gi, '');
  return s;
}

function getThreadMainImageUrlFromHtml(op) {
  try {
    const zoomerBlock = extractContainerBlock(op, 'lbContainer-zoomer');
    const u1 = pickFromContainerBlock(zoomerBlock);
    if (u1) return u1;

    const lbBlock = extractContainerBlock(op, 'lbContainer');
    const u2 = pickFromContainerBlock(lbBlock);
    if (u2) return u2;

    const lightboxLinks = extractLightboxUrls(op);
    if (lightboxLinks.length) return lightboxLinks[0];

    const imgs = extractStandaloneImageUrls(op);
    return imgs[0] || '';
  } catch {
    return '';
  }
}

function extractContainerBlock(html, className) {
  const s = String(html || '');
  const re = new RegExp(`<[^>]+class="[^"]*${escapeRegExp(className)}[^"]*"[^>]*>[\\s\\S]*?<\\/[^>]+>`, 'i');
  const m = s.match(re);
  return m?.[0] || '';
}

function pickFromContainerBlock(block) {
  if (!block) return '';

  const linkMatches = matchAll(block, /<a[^>]*class="[^"]*js-lbImage[^"]*"[^>]*href="([^"]+)"/gi)
    .map(x => upgradeF95Url(decodeHtml(x[1] || '')))
    .filter(Boolean)
    .filter(u => !/\/thumb\//i.test(u));
  if (linkMatches.length) return linkMatches[0];

  const imgMatches = matchAll(block, /<img[^>]+(?:data-src|src)="([^"]+)"[^>]*>/gi)
    .map(x => upgradeF95Url(decodeHtml(x[1] || '')))
    .filter(Boolean)
    .filter(u => !/\/thumb\//i.test(u))
    .filter(u => !/smilie|emoji/i.test(u));
  return imgMatches[0] || '';
}

function getThreadGalleryUrlsFromHtml(op) {
  try {
    const urls = [];
    urls.push(...extractLightboxUrls(op));
    urls.push(...extractStandaloneImageUrls(op));
    urls.push(...extractAttachmentPreviewUrls(op));
    return dedupKeepOrder(urls);
  } catch {
    return [];
  }
}

function extractLightboxUrls(html) {
  return matchAll(String(html || ''), /<a[^>]*class="[^"]*js-lbImage[^"]*"[^>]*href="([^"]+)"/gi)
    .map(m => upgradeF95Url(decodeHtml(m[1] || '')))
    .filter(Boolean)
    .filter(u => !/\/thumb\//i.test(u));
}

function extractStandaloneImageUrls(html) {
  const out = [];
  const s = String(html || '');
  const tags = matchAll(s, /<img([^>]+)>/gi);
  for (const m of tags) {
    const attrs = m[1] || '';
    if (/smilie|emoji/i.test(attrs)) continue;
    const srcm = attrs.match(/(?:data-src|src)="([^"]+)"/i);
    const u = upgradeF95Url(decodeHtml(srcm?.[1] || ''));
    if (!u || /\/thumb\//i.test(u)) continue;
    out.push(u);
  }
  return out;
}

function extractAttachmentPreviewUrls(html) {
  return matchAll(String(html || ''), /(https?:)?\/\/attachments\.f95zone\.to\/[^"]+/gi)
    .map(m => upgradeF95Url(decodeHtml(m[0] || '')))
    .filter(Boolean)
    .map(u => u.replace(/["'>].*$/, ''))
    .filter(u => !/\/thumb\//i.test(u))
    .filter(isAllowedImageUrl);
}

function dedupKeepOrder(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    const u = String(raw || '').trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function isAllowedImageUrl(u) {
  const s = String(u || '').trim().toLowerCase();
  if (!s) return false;
  return /\.(jpg|jpeg|png|webp|gif|avif)(?:[?#].*)?$/.test(s);
}

function isPollutingUrl(u) {
  const s = String(u || '').trim().toLowerCase();
  if (!s) return true;
  if (/\/thumb\//i.test(s)) return true;
  if (/\/data\/avatars\//i.test(s)) return true;
  if (/smilie|emoji/i.test(s)) return true;
  if (/\.(zip|rar|7z|pdf|txt)(?:[?#].*)?$/.test(s)) return true;
  return false;
}

function upgradeF95Url(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  const out = s.startsWith('//')
    ? 'https:' + s
    : s.startsWith('/')
      ? 'https://f95zone.to' + s
      : s.replace(/&amp;/g, '&');
  return isPollutingUrl(out) ? '' : out;
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function matchAll(s, re) {
  const out = [];
  let m;
  while ((m = re.exec(s))) out.push(m);
  return out;
}

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
