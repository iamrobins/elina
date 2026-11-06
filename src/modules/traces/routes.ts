import { and, desc, eq, gte, ilike, lt, lte, or, sql as fragment } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/client";
import { spans, traces } from "../../db/schema";

const listQuery = z.object({
  projectId: z.uuid(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  status: z.enum(["ok", "error", "unset"]).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(512).optional(),
});
const detailQuery = z.object({ projectId: z.uuid() });
const cursorShape = z.object({ startedAt: z.iso.datetime(), traceId: z.string().regex(/^[a-f0-9]{32}$/) });

function decodeCursor(value: string) {
  return cursorShape.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
}

export const traceRoutes = new Hono();

traceRoutes.get("/traces", async (c) => {
  const parsed = listQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "invalid trace filters" }, 400);
  const { projectId, from, to, status, q, limit, cursor } = parsed.data;
  let after: z.infer<typeof cursorShape> | undefined;
  try { if (cursor) after = decodeCursor(cursor); } catch { return c.json({ error: "invalid cursor" }, 400); }
  if (from && to && new Date(from) > new Date(to)) return c.json({ error: "invalid time range" }, 400);
  const pattern = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : undefined;

  const where = and(
    eq(traces.projectId, projectId),
    from ? gte(traces.startedAt, new Date(from)) : undefined,
    to ? lte(traces.startedAt, new Date(to)) : undefined,
    status ? eq(traces.status, status) : undefined,
    pattern ? or(ilike(traces.name, pattern), ilike(traces.traceId, pattern)) : undefined,
    after ? or(lt(traces.startedAt, new Date(after.startedAt)), and(eq(traces.startedAt, new Date(after.startedAt)), lt(traces.traceId, after.traceId))) : undefined,
  );
  const rows = await db.select({
    traceId: traces.traceId,
    name: traces.name,
    status: traces.status,
    startedAt: traces.startedAt,
    endedAt: traces.endedAt,
    durationMs: fragment<number>`(EXTRACT(EPOCH FROM (${traces.endedAt} - ${traces.startedAt})) * 1000)::double precision`,
    spanCount: fragment<number>`count(${spans.spanId})::integer`,
    inputTokens: fragment<string>`COALESCE(SUM(${spans.inputTokens}), 0)::text`,
    outputTokens: fragment<string>`COALESCE(SUM(${spans.outputTokens}), 0)::text`,
    costUsd: fragment<string | null>`SUM(${spans.costUsd})::text`,
  }).from(traces).leftJoin(spans, and(eq(spans.projectId, traces.projectId), eq(spans.traceId, traces.traceId)))
    .where(where).groupBy(traces.projectId, traces.traceId)
    .orderBy(desc(traces.startedAt), desc(traces.traceId)).limit(limit + 1);
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor = rows.length > limit && last ? Buffer.from(JSON.stringify({ startedAt: last.startedAt.toISOString(), traceId: last.traceId })).toString("base64url") : null;
  return c.json({ items, nextCursor });
});

traceRoutes.get("/traces/:traceId", async (c) => {
  const parsed = detailQuery.safeParse(c.req.query());
  const traceId = c.req.param("traceId");
  if (!parsed.success || !/^[a-f0-9]{32}$/.test(traceId)) return c.json({ error: "invalid trace request" }, 400);
  const projectId = parsed.data.projectId;
  const [trace] = await db.select().from(traces).where(and(eq(traces.projectId, projectId), eq(traces.traceId, traceId)));
  if (!trace) return c.json({ error: "trace not found" }, 404);
  const rows = await db.select().from(spans).where(and(eq(spans.projectId, projectId), eq(spans.traceId, traceId))).orderBy(spans.startedAt, spans.spanId);
  return c.json({ trace, spans: rows.map((row) => ({ ...row, inputTokens: row.inputTokens?.toString() ?? null, outputTokens: row.outputTokens?.toString() ?? null })) });
});
