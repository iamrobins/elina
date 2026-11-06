import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../../db/client";

const query = z.object({
  projectId: z.uuid(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export const metricsRoutes = new Hono();

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
