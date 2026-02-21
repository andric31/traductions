// /api/counters_history (POST)

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const ids = Array.isArray(body?.ids)
    ? body.ids.map(x => String(x || "").trim()).filter(Boolean)
    : [];

  const days = Math.max(1, Math.min(365, parseInt(body?.days, 10) || 30));

  if (!ids.length) {
    return json({ ok: true, days, history: {} });
  }

  try {
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

    const history = {};
    const offset = `-${Math.max(0, days - 1)} days`;

    for (const id of ids) {

      const q = await env.DB.prepare(`
        SELECT day, views, mega, likes
        FROM counter_days
        WHERE id = ?
          AND day >= date('now', ?)
        ORDER BY day ASC;
      `)
      .bind(id, offset)
      .all();

      history[id] = (q.results || []).map(r => ({
        day: r.day,
        views: Number(r.views || 0),
        mega: Number(r.mega || 0),
        likes: Number(r.likes || 0),
      }));
    }

    return json({ ok: true, days, history });

  } catch (e) {
    return json({
      ok: false,
      error: "server_error",
      message: String(e?.message || e)
    }, 500);
  }
}