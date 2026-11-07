import { z } from "zod";

export const uuid = z.uuid();
export const traceId = z.string().regex(/^[a-f0-9]{32}$/);
export const projectSchema = z.object({ id: uuid, name: z.string(), retentionDays: z.number(), createdAt: z.string() });
export const projectPageSchema = z.object({ items: z.array(projectSchema) });
export const traceSchema = z.object({
  traceId, name: z.string(), status: z.string(), startedAt: z.string(), endedAt: z.string(),
  durationMs: z.number().nullable().optional(), spanCount: z.number().optional(),
  inputTokens: z.string().nullable().optional(), outputTokens: z.string().nullable().optional(),
  costUsd: z.string().nullable().optional(), review: z.enum(["good", "bad"]).nullable().optional(),
  feedbackVerdict: z.enum(["good", "bad"]).nullable().optional(), feedbackNote: z.string().nullable().optional(), feedbackAt: z.string().nullable().optional(),
});
export const reviewSchema = z.object({ verdict: z.enum(["good", "bad"]), note: z.string().nullable(), reviewedAt: z.string() });
export const reviewInputSchema = reviewSchema.pick({ verdict: true, note: true }).extend({ note: z.string().trim().max(2000).nullable().default(null) });
export const tracePageSchema = z.object({ items: z.array(traceSchema), nextCursor: z.string().nullable() });
export const spanSchema = z.object({
  spanId: z.string(), parentSpanId: z.string().nullable(), name: z.string(), asType: z.string(),
  startedAt: z.string(), endedAt: z.string(), durationMs: z.number(), status: z.string(),
  statusMessage: z.string().nullable(), model: z.string().nullable(), provider: z.string().nullable(),
  inputTokens: z.string().nullable(), outputTokens: z.string().nullable(), costUsd: z.string().nullable(), costSource: z.string().nullable(),
  attributes: z.record(z.string(), z.unknown()), events: z.array(z.unknown()),
});
export const traceDetailSchema = z.object({ trace: traceSchema, review: reviewSchema.nullable(), spans: z.array(spanSchema) });
export const metricsSchema = z.object({
  traceCount: z.number(), errorCount: z.number(), errorRate: z.number(),
  p50LatencyMs: z.number().nullable(), p95LatencyMs: z.number().nullable(),
  inputTokens: z.string(), outputTokens: z.string(), knownCostUsd: z.string(), missingCostSpans: z.number(),
  reviewedCount: z.number(), goodCount: z.number(), previousReviewedCount: z.number(), previousGoodCount: z.number(),
});
export const trendsSchema = z.object({ items: z.array(z.object({
  from: z.string(), to: z.string(), traceCount: z.number(), errorCount: z.number(), errorRate: z.number(),
  p95LatencyMs: z.number().nullable(), knownCostUsd: z.string(), missingCostSpans: z.number(),
})) });
export type Span = z.infer<typeof spanSchema>;

