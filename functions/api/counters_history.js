// /api/counters_history (POST)
// Body: { ids: string[], days?: number }
// Returns: { ok:true, days, history: { [id]: [{day,views,mega,likes}, ...] } }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const ids = Array.isArray(body?.ids) ? body.ids.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const days = Math.max(1, Math.min(365, parseInt(body?.days, 10) || 30));

  if (!ids.length) return json({ ok: true, days, history: {} });
  if (ids.length > 3000) return json({ ok: false, error: "too_many_ids" }, 413);

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

  const out = {};
  for (const id of ids) out[id] = [];

  // chunk IN() to keep SQL reasonable
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const ph = chunk.map(() => "?").join(",");

    // last N days (UTC)
    const q = await env.DB
      .prepare(
        `SELECT id, day, views, mega, likes
         FROM counter_days
         WHERE id IN (${ph})
           AND day >= date('now', '-' || (?${chunk.length + 1}) || ' days')
         ORDER BY id ASC, day ASC;`
      )
      .bind(...chunk, String(days - 1))
      .all();

    const rows = Array.isArray(q?.results) ? q.results : [];
    for (const r of rows) {
      const key = String(r.id || "");
      if (!out[key]) out[key] = [];
      out[key].push({
        day: r.day,
        views: Number(r.views || 0),
        mega: Number(r.mega || 0),
        likes: Number(r.likes || 0),
      });
    }
  }

  return json({ ok: true, days, history: out });
}
