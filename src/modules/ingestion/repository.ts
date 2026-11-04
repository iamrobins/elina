import { and, eq, inArray, sql as fragment } from "drizzle-orm";
import { db } from "../../db/client";
import { spans, traces } from "../../db/schema";
import { normalize } from "./normalize";

export async function persist(batch: ReturnType<typeof normalize>) {
  const inserted = await db.transaction(async (tx) => {
    let inserted = 0;
    for (const trace of batch.traces) {
      await tx.insert(traces).values(trace).onConflictDoUpdate({
        target: [traces.projectId, traces.traceId],
        set: {
          startedAt: fragment`LEAST(${traces.startedAt}, excluded.started_at)`,
          endedAt: fragment`GREATEST(${traces.endedAt}, excluded.ended_at)`,
          rootSpanId: fragment`COALESCE(${traces.rootSpanId}, excluded.root_span_id)`,
          name: fragment`CASE WHEN ${traces.rootSpanId} IS NULL AND excluded.root_span_id IS NOT NULL THEN excluded.name ELSE ${traces.name} END`,
          status: fragment`CASE WHEN ${traces.status} = 'error' OR excluded.status = 'error' THEN 'error' WHEN ${traces.status} = 'ok' OR excluded.status = 'ok' THEN 'ok' ELSE 'unset' END`,
          updatedAt: new Date(),
        },
      });
    }
    for (let i = 0; i < batch.spans.length; i += 100) {
      inserted += (await tx.insert(spans).values(batch.spans.slice(i, i + 100)).onConflictDoNothing().returning({ spanId: spans.spanId })).length;
    }
    return inserted;
  });
  if (batch.spans.length) {
    const rows = await db.select({ traceId: spans.traceId, spanId: spans.spanId }).from(spans).where(and(
      eq(spans.projectId, batch.spans[0].projectId),
      inArray(fragment`(${spans.traceId}, ${spans.spanId})`, batch.spans.map((span) => fragment`(${span.traceId}, ${span.spanId})`)),
    ));
    const stored = new Set(rows.map((row) => `${row.traceId}:${row.spanId}`));
    if (batch.spans.some((span) => !stored.has(`${span.traceId}:${span.spanId}`))) throw new Error("commit not visible");
  }
  return inserted;
}
