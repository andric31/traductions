// functions/api/ratings4s.js
// Bulk ratings4: POST { ids: ["uid:123", ...] } -> { ok:true, stats:{ "uid:123":{avg,count,sum}, ... } }

export async function onRequest(context) {
  const { request, env } = context;

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Méthode invalide" }), { status: 405, headers });
  }

  try {
    if (!env?.DB) {
      return new Response(JSON.stringify({ ok: false, error: "DB non liée" }), { status: 500, headers });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "JSON invalide" }), { status: 400, headers });
    }

    const idsRaw = Array.isArray(body?.ids) ? body.ids : [];
    const ids = idsRaw
      .map((x) => String(x || "").trim())
      .filter((id) => id && id.length <= 80);

    if (!ids.length) return new Response(JSON.stringify({ ok: true, stats: {} }), { headers });

    // Table safety (comme rating4.js)
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS ratings4 (
        id TEXT PRIMARY KEY,
        sum INTEGER NOT NULL DEFAULT 0,
        count INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `).run();

    const CHUNK = 90; // comme counters.js
    const stats = {};

    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = ids.slice(i, i + CHUNK);
      const placeholders = batch.map((_, idx) => `?${idx + 1}`).join(", ");

      const stmt = env.DB
        .prepare(`SELECT id, sum, count FROM ratings4 WHERE id IN (${placeholders})`)
        .bind(...batch);

      const res = await stmt.all();
      const rows = res?.results || [];

      for (const row of rows) {
        const sum = Number(row.sum || 0);
        const count = Number(row.count || 0);
        const avg = count > 0 ? sum / count : 0;

        stats[String(row.id)] = { sum, count, avg };
      }
    }

    return new Response(JSON.stringify({ ok: true, stats }), { headers });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: "Erreur serveur", details: String(e?.message || e) }),
      { status: 500, headers }
    );
  }
}
