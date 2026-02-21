// /api/counter_history
// Retourne l'historique par jour (UTC) d'un compteur (views/mega/likes)

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = (url.searchParams.get("id") || "").trim();
  const daysRaw = (url.searchParams.get("days") || "30").trim();

  const days = Math.max(1, Math.min(365, parseInt(daysRaw, 10) || 30));

  if (!id) {
    return new Response(JSON.stringify({ ok: false, error: "missing_id" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  // ensure table exists
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS counter_days (
      day TEXT NOT NULL,
      id  TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      mega  INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY(day, id)
    );
  `).run();

  const q = await env.DB
    .prepare(
      `SELECT day, views, mega, likes
       FROM counter_days
       WHERE id = ?1
       ORDER BY day DESC
       LIMIT ?2;`
    )
    .bind(id, days)
    .all();

  const rows = Array.isArray(q?.results) ? q.results : [];
  rows.reverse(); // asc

  return new Response(JSON.stringify({ ok: true, id, days, series: rows }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
