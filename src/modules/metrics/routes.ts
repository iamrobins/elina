import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../../db/client";

const query = z.object({
  projectId: z.uuid(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export const metricsRoutes = new Hono();

metricsRoutes.get("/metrics/trends", async (c) => {
  const parsed = query.extend({
    from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }),
    bucketMinutes: z.coerce.number().int().refine((value) => [5, 60, 360, 1440].includes(value)),
  }).safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "invalid trends filters" }, 400);
  const { projectId, from, to, bucketMinutes } = parsed.data;
  const start = new Date(from);
  const end = new Date(to);
  const bucketMs = bucketMinutes * 60_000;
  const bucketCount = Math.ceil((end.getTime() - start.getTime()) / bucketMs);
  if (bucketCount < 1 || bucketCount > 30) return c.json({ error: "invalid trends range" }, 400);
  const result = await sql.query(`SELECT floor((extract(epoch FROM t.started_at) - extract(epoch FROM $2::timestamptz)) / ($4 * 60))::integer AS bucket,
    count(*)::integer AS "traceCount",
    count(*) FILTER (WHERE t.status = 'error')::integer AS "errorCount",
    percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (t.ended_at - t.started_at)) * 1000)::double precision AS "p95LatencyMs",
    COALESCE(sum(u.cost), 0)::text AS "knownCostUsd",
    COALESCE(sum(u.missing), 0)::integer AS "missingCostSpans"
    FROM traces t
    LEFT JOIN LATERAL (SELECT sum(s.cost_usd) AS cost,
      count(*) FILTER (WHERE s.cost_usd IS NULL AND (s.input_tokens IS NOT NULL OR s.output_tokens IS NOT NULL)) AS missing
      FROM spans s WHERE s.project_id = t.project_id AND s.trace_id = t.trace_id) u ON true
    WHERE t.project_id = $1 AND t.started_at >= $2 AND t.started_at < $3
    GROUP BY bucket ORDER BY bucket`, [projectId, start, end, bucketMinutes]);
  const rows = new Map(result.rows.map((row) => [row.bucket, row]));
  const items = Array.from({ length: bucketCount }, (_, bucket) => {
    const row = rows.get(bucket);
    return {
      from: new Date(start.getTime() + bucket * bucketMs).toISOString(),
      to: new Date(Math.min(start.getTime() + (bucket + 1) * bucketMs, end.getTime())).toISOString(),
      traceCount: row?.traceCount ?? 0,
      errorCount: row?.errorCount ?? 0,
      errorRate: row?.traceCount ? row.errorCount / row.traceCount : 0,
      p95LatencyMs: row?.p95LatencyMs ?? null,
      knownCostUsd: row?.knownCostUsd ?? "0",
      missingCostSpans: row?.missingCostSpans ?? 0,
    };
  });
  return c.json({ items });
});

metricsRoutes.get("/metrics/summary", async (c) => {
  const parsed = query.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "invalid metrics filters" }, 400);
  const { projectId, from, to } = parsed.data;
  if (from && to && new Date(from) > new Date(to)) return c.json({ error: "invalid time range" }, 400);
  const start = from ? new Date(from) : new Date(0);
  const end = to ? new Date(to) : new Date(8_640_000_000_000_000);
  const [trace, usage, quality] = await Promise.all([
    sql.query(`SELECT count(*)::integer AS "traceCount",
      count(*) FILTER (WHERE status = 'error')::integer AS "errorCount",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000)::double precision AS "p50LatencyMs",
      percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000)::double precision AS "p95LatencyMs"
      FROM traces WHERE project_id = $1 AND started_at >= $2 AND started_at <= $3`, [projectId, start, end]),
    sql.query(`SELECT COALESCE(sum(input_tokens), 0)::text AS "inputTokens",
      COALESCE(sum(output_tokens), 0)::text AS "outputTokens",
      COALESCE(sum(cost_usd), 0)::text AS "knownCostUsd",
      count(*) FILTER (WHERE cost_usd IS NULL AND (input_tokens IS NOT NULL OR output_tokens IS NOT NULL))::integer AS "missingCostSpans"
      FROM spans WHERE project_id = $1 AND started_at >= $2 AND started_at <= $3`, [projectId, start, end]),
    from && to ? sql.query(`SELECT
      count(*) FILTER (WHERE t.started_at >= $2 AND r.verdict IS NOT NULL)::integer AS "reviewedCount",
      count(*) FILTER (WHERE t.started_at >= $2 AND r.verdict = 'good')::integer AS "goodCount",
      count(*) FILTER (WHERE t.started_at < $2 AND r.verdict IS NOT NULL)::integer AS "previousReviewedCount",
      count(*) FILTER (WHERE t.started_at < $2 AND r.verdict = 'good')::integer AS "previousGoodCount"
      FROM traces t JOIN trace_reviews r ON r.project_id = t.project_id AND r.trace_id = t.trace_id
      WHERE t.project_id = $1 AND t.started_at >= $3 AND t.started_at < $4`,
      [projectId, start, new Date(start.getTime() - (end.getTime() - start.getTime())), end]) : Promise.resolve({ rows: [{ reviewedCount: 0, goodCount: 0, previousReviewedCount: 0, previousGoodCount: 0 }] }),
  ]);
  return c.json({
    ...trace.rows[0],
    errorRate: trace.rows[0].traceCount ? trace.rows[0].errorCount / trace.rows[0].traceCount : 0,
    ...usage.rows[0],
    ...quality.rows[0],
  });
});
