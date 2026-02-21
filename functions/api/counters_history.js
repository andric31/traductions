// /api/counter_history

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

  try {
    const q = await env.DB
      .prepare(
        `SELECT day, views, mega, likes
         FROM counter_days
         WHERE id = ?
         ORDER BY day DESC
         LIMIT ${days};`
      )
      .bind(id)
      .all();

    const rows = Array.isArray(q?.results) ? q.results : [];
    rows.reverse();

    return new Response(
      JSON.stringify({ ok: true, id, days, series: rows }),
      { headers: { "content-type": "application/json; charset=utf-8" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "query_failed",
        message: String(e?.message || e),
      }),
      { status: 500, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }
}