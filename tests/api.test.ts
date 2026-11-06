import { expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { create, toBinary } from "@bufbuild/protobuf";
import { ExportTraceServiceRequestSchema } from "../src/gen/opentelemetry/proto/collector/trace/v1/trace_service_pb";
import { Status_StatusCode } from "../src/gen/opentelemetry/proto/trace/v1/trace_pb";

const base = process.env.ELINA_BASE_URL;
const admin = process.env.ADMIN_TOKEN;

test.skipIf(!base || !admin)("live API keeps metrics idempotent and project scoped", async () => {
  const adminHeaders = { Authorization: `Bearer ${admin}` };
  const createProject = async () => {
    const response = await fetch(`${base}/api/projects`, { method: "POST", headers: { ...adminHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ name: `integration-${crypto.randomUUID()}`, retentionDays: 1 }) });
    expect(response.status).toBe(201);
    return response.json() as Promise<{ project: { id: string }; writeKey: string }>;
  };
  const [first, second] = await Promise.all([createProject(), createProject()]);
  const traceId = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
  const attr = (key: string, value: string) => ({ key, value: { value: { case: "stringValue" as const, value } } });
  const send = (key: string, n: number, durationMs: number, error = false) => {
    const bytes = toBinary(ExportTraceServiceRequestSchema, create(ExportTraceServiceRequestSchema, { resourceSpans: [{ scopeSpans: [{ spans: [{
      traceId: Uint8Array.from([...traceId.slice(0, 15), n]), spanId: Uint8Array.from([n, 0, 0, 0, 0, 0, 0, 1]), name: `trace-${n}`,
      startTimeUnixNano: 1_800_000_000_000_000_000n, endTimeUnixNano: 1_800_000_000_000_000_000n + BigInt(durationMs) * 1_000_000n,
      status: { code: error ? Status_StatusCode.ERROR : Status_StatusCode.OK },
      attributes: [attr("gen_ai.usage.input_tokens", "10"), ...(n === 1 ? [attr("gen_ai.usage.cost_usd", "0.0025")] : [])],
    }] }] }] }));
    return fetch(`${base}/v1/traces`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-protobuf" }, body: bytes });
  };
  expect((await send(first.writeKey, 1, 10)).status).toBe(200);
  expect((await send(first.writeKey, 1, 10)).status).toBe(200);
  const responses = await Promise.all([send(first.writeKey, 2, 100, true), send(first.writeKey, 3, 1000), send(first.writeKey, 3, 1000), send(second.writeKey, 1, 10)]);
  expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
  const metrics = async (projectId: string) => (await fetch(`${base}/api/metrics/summary?projectId=${projectId}`, { headers: adminHeaders })).json();
  const firstMetrics = await metrics(first.project.id);
  expect(firstMetrics).toMatchObject({ traceCount: 3, errorCount: 1, p50LatencyMs: 100, inputTokens: "30", knownCostUsd: "0.0025000000", missingCostSpans: 2 });
  expect(firstMetrics.p95LatencyMs).toBeCloseTo(910);
  expect(await metrics(second.project.id)).toMatchObject({ traceCount: 1, inputTokens: "10", knownCostUsd: "0.0025000000" });
  const list = await (await fetch(`${base}/api/traces?projectId=${first.project.id}&limit=1`, { headers: adminHeaders })).json();
  expect(list.items).toHaveLength(1);
  expect(list.nextCursor).toBeTruthy();
  const next = await (await fetch(`${base}/api/traces?projectId=${first.project.id}&limit=1&cursor=${encodeURIComponent(list.nextCursor)}`, { headers: adminHeaders })).json();
  expect(next.items[0].traceId).not.toBe(list.items[0].traceId);
  const searched = await (await fetch(`${base}/api/traces?projectId=${first.project.id}&q=trace-2`, { headers: adminHeaders })).json();
  expect(searched.items.map((item: { name: string }) => item.name)).toEqual(["trace-2"]);
  const searchedId = await (await fetch(`${base}/api/traces?projectId=${first.project.id}&q=${searched.items[0].traceId.slice(-4)}`, { headers: adminHeaders })).json();
  expect(searchedId.items.map((item: { traceId: string }) => item.traceId)).toEqual([searched.items[0].traceId]);
  const otherSearch = await (await fetch(`${base}/api/traces?projectId=${second.project.id}&q=TRACE-2`, { headers: adminHeaders })).json();
  expect(otherSearch.items).toHaveLength(0);
  const otherTrace = await (await fetch(`${base}/api/traces?projectId=${second.project.id}`, { headers: adminHeaders })).json();
  expect(otherTrace.items).toHaveLength(1);
  expect(otherTrace.items[0].traceId).toBe(Buffer.from([...traceId.slice(0, 15), 1]).toString("hex"));
  expect((await fetch(`${base}/api/traces/${Buffer.from([...traceId.slice(0, 15), 2]).toString("hex")}?projectId=${second.project.id}`, { headers: adminHeaders })).status).toBe(404);
  const malformed = await fetch(`${base}/v1/traces`, { method: "POST", headers: { Authorization: `Bearer ${first.writeKey}`, "Content-Type": "application/x-protobuf", "Content-Encoding": "gzip" }, body: gzipSync(Buffer.alloc(5 * 1024 * 1024)) });
  expect(malformed.status).toBe(400);
  expect((await fetch(`${base}/v1/traces`, { method: "POST", headers: { Authorization: `Bearer ${first.writeKey}`, "Content-Type": "application/x-protobuf" }, body: Uint8Array.from([255]) })).status).toBe(400);
  expect((await fetch(`${base}/v1/traces`, { method: "POST", headers: { Authorization: "Bearer wrong", "Content-Type": "application/x-protobuf" }, body: new Uint8Array() })).status).toBe(401);
  const keyResponse = await fetch(`${base}/api/projects/${first.project.id}/keys`, { method: "POST", headers: adminHeaders });
  const key = await keyResponse.json();
  const activeKeys = await (await fetch(`${base}/api/projects/${first.project.id}/keys`, { headers: adminHeaders })).json();
  expect(activeKeys.items.some((item: { id: string }) => item.id === key.id)).toBe(true);
  expect(JSON.stringify(activeKeys)).not.toContain(key.writeKey);
  expect((await fetch(`${base}/api/keys/${key.id}`, { method: "DELETE", headers: adminHeaders })).status).toBe(204);
  const remainingKeys = await (await fetch(`${base}/api/projects/${first.project.id}/keys`, { headers: adminHeaders })).json();
  expect(remainingKeys.items.some((item: { id: string }) => item.id === key.id)).toBe(false);
  expect((await send(key.writeKey, 4, 10)).status).toBe(401);
  const price = { provider: "openai", model: "test-model", inputPerMillion: "1", outputPerMillion: "2", cachedInputPerMillion: null };
  expect((await fetch(`${base}/api/projects/${first.project.id}/prices`, { method: "PUT", headers: { ...adminHeaders, "Content-Type": "application/json" }, body: JSON.stringify(price) })).status).toBe(200);
  expect((await fetch(`${base}/api/projects/${first.project.id}`, { method: "DELETE", headers: adminHeaders })).status).toBe(204);
  expect((await fetch(`${base}/api/projects/${first.project.id}`, { method: "DELETE", headers: adminHeaders })).status).toBe(404);
  expect((await fetch(`${base}/api/projects/not-a-uuid`, { method: "DELETE", headers: adminHeaders })).status).toBe(400);
  const projects = await (await fetch(`${base}/api/projects`, { headers: adminHeaders })).json();
  expect(projects.items.some((item: { id: string }) => item.id === first.project.id)).toBe(false);
  expect((await send(first.writeKey, 5, 10)).status).toBe(401);
  expect((await (await fetch(`${base}/api/traces?projectId=${first.project.id}`, { headers: adminHeaders })).json()).items).toHaveLength(0);
  expect((await (await fetch(`${base}/api/projects/${first.project.id}/prices`, { headers: adminHeaders })).json()).items).toHaveLength(0);
  expect((await (await fetch(`${base}/api/traces?projectId=${second.project.id}`, { headers: adminHeaders })).json()).items).toHaveLength(1);
  expect((await fetch(`${base}/api/projects/${second.project.id}`, { method: "DELETE", headers: adminHeaders })).status).toBe(204);
});
