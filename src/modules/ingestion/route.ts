import { createHash } from "node:crypto";
import { create, fromBinary, fromJsonString, toBinary, toJsonString } from "@bufbuild/protobuf";
import { eq, isNull, and } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../db/client";
import { apiKeys } from "../../db/schema";
import { ExportTraceServiceRequestSchema, ExportTraceServiceResponseSchema } from "../../gen/opentelemetry/proto/collector/trace/v1/trace_service_pb";
import { StatusSchema } from "../../gen/google/rpc/status_pb";
import { normalize } from "./normalize";
import { persist } from "./repository";

const MAX_BYTES = 4 * 1024 * 1024;

async function bounded(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("request timeout")), 15_000); });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { void reader.cancel(); throw new Error("request too large"); }
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer!);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function replyStatus(code: number, message: string, http: number, json: boolean, retry = false) {
  const status = create(StatusSchema, { code, message });
  return new Response(json ? toJsonString(StatusSchema, status) : Buffer.from(toBinary(StatusSchema, status)), {
    status: http,
    headers: {
      "Content-Type": json ? "application/json" : "application/x-protobuf",
      ...(retry ? { "Retry-After": "1" } : {}),
    },
  });
}

export const ingestionRoutes = new Hono();

ingestionRoutes.post("/v1/traces", async (c) => {
  const started = performance.now();
  const requestId = crypto.randomUUID();
  const json = c.req.header("content-type")?.split(";", 1)[0].trim().toLowerCase() === "application/json";
  const protobuf = c.req.header("content-type")?.split(";", 1)[0].trim().toLowerCase() === "application/x-protobuf";
  if (!json && !protobuf) return replyStatus(3, "unsupported content type", 415, false);
  const encoding = c.req.header("content-encoding")?.toLowerCase();
  if (encoding && encoding !== "gzip") return replyStatus(3, "unsupported content encoding", 415, json);
  const bearer = /^Bearer (\S+)$/.exec(c.req.header("authorization") ?? "");
  if (!bearer) return replyStatus(16, "unauthorized", 401, json);

  let projectId: string;
  try {
    const keyHash = createHash("sha256").update(bearer[1]).digest("hex");
    const [key] = await db.select({ projectId: apiKeys.projectId }).from(apiKeys).where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)));
    if (!key) return replyStatus(16, "unauthorized", 401, json);
    projectId = key.projectId;
  } catch {
    return replyStatus(14, "storage unavailable", 503, json, true);
  }

  let batch: ReturnType<typeof normalize>;
  try {
    if (Number(c.req.header("content-length") ?? 0) > MAX_BYTES) throw new Error("request too large");
    const compressed = await bounded(c.req.raw.body);
    const body = encoding === "gzip" ? await bounded(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))) : compressed;
    const request = json ? fromJsonString(ExportTraceServiceRequestSchema, new TextDecoder("utf-8", { fatal: true }).decode(body)) : fromBinary(ExportTraceServiceRequestSchema, body);
    batch = normalize(request, projectId);
  } catch (error) {
    if (error instanceof Error && error.message === "request timeout") return replyStatus(4, "request timeout", 408, json, true);
    console.warn(JSON.stringify({ event: "ingest_rejected", requestId, projectId, status: 400 }));
    return replyStatus(3, "invalid trace payload", 400, json);
  }

  try {
    const dbStarted = performance.now();
    const inserted = await persist(batch);
    console.log(JSON.stringify({ event: "ingest_complete", requestId, projectId, spanCount: inserted, duplicateCount: batch.spans.length - inserted, dbMs: Math.round(performance.now() - dbStarted), durationMs: Math.round(performance.now() - started), status: 200 }));
  } catch {
    console.error(JSON.stringify({ event: "ingest_failed", requestId, projectId, spanCount: batch.spans.length, durationMs: Math.round(performance.now() - started), status: 503 }));
    return replyStatus(14, "storage unavailable", 503, json, true);
  }
  const response = create(ExportTraceServiceResponseSchema);
  return new Response(json ? toJsonString(ExportTraceServiceResponseSchema, response) : Buffer.from(toBinary(ExportTraceServiceResponseSchema, response)), {
    status: 200,
    headers: { "Content-Type": json ? "application/json" : "application/x-protobuf" },
  });
});
