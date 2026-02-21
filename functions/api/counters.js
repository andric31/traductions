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
    try { body = await request.json(); }
    catch { return new Response(JSON.stringify({ ok: false, error: "JSON invalide" }), { status: 400, headers }); }

    const idsRaw = Array.isArray(body?.ids) ? body.ids : [];
    const ids = idsRaw
      .map(x => String(x || "").trim())
      .filter(id => id && id.length <= 80);

    if (!ids.length) return new Response(JSON.stringify({ ok: true, stats: {} }), { headers });

    // ✅ table si jamais
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS counters (
        id TEXT PRIMARY KEY,
        views INTEGER NOT NULL DEFAULT 0,
        mega INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `).run();

    // ✅ si table existait sans likes → on tente d'ajouter la colonne (ignore si déjà là)
    try {
      await env.DB.prepare(`ALTER TABLE counters ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;`).run();
    } catch { /* déjà présent */ }

    // ✅ IMPORTANT : lot petit pour éviter limites D1
    const CHUNK = 90;
    const stats = {};

    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = ids.slice(i, i + CHUNK);
      const placeholders = batch.map((_, i) => `?${i + 1}`).join(", ");
      const stmt = env.DB
        .prepare(`SELECT id, views, mega, likes FROM counters WHERE id IN (${placeholders})`)
        .bind(...batch);

      const res = await stmt.all();
      const rows = res?.results || [];

      for (const row of rows) {
        stats[row.id] = {
          views: Number(row.views || 0),
          mega: Number(row.mega || 0),
          likes: Number(row.likes || 0),
        };
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

