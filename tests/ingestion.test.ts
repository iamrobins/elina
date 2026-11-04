import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { ExportTraceServiceRequestSchema } from "../src/gen/opentelemetry/proto/collector/trace/v1/trace_service_pb";
import { normalize } from "../src/modules/ingestion/normalize";

test("normalizes child-first spans and deduplicates repeated IDs", () => {
  const traceId = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
  const child = { traceId, spanId: Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 1]), parentSpanId: Uint8Array.from([2, 0, 0, 0, 0, 0, 0, 2]), name: "child", startTimeUnixNano: 1_000_000_000n, endTimeUnixNano: 2_000_000_000n };
  const root = { traceId, spanId: child.parentSpanId, name: "root", startTimeUnixNano: 500_000_000n, endTimeUnixNano: 3_000_000_000n };
  const request = create(ExportTraceServiceRequestSchema, { resourceSpans: [{ scopeSpans: [{ spans: [child, root, child] }] }] });
  const batch = normalize(request, "00000000-0000-4000-8000-000000000001");
  expect(batch.spans).toHaveLength(2);
  expect(batch.traces[0].name).toBe("root");
  expect(batch.traces[0].rootSpanId).toBe("0200000000000002");
  expect(batch.traces[0].endedAt.toISOString()).toBe("1970-01-01T00:00:03.000Z");
  expect(() => normalize(create(ExportTraceServiceRequestSchema, { resourceSpans: [{ scopeSpans: [{ spans: [{ ...root, traceId: new Uint8Array(16) }] }] }] }), "x")).toThrow();
});

test("keeps resource scopes separate and accepts only explicit reported cost", () => {
  const traceId = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
  const span = (id: number) => ({ traceId, spanId: Uint8Array.from([id, 0, 0, 0, 0, 0, 0, 1]), name: `span-${id}`, startTimeUnixNano: 1_000_000_000n, endTimeUnixNano: 2_000_000_000n });
  const attr = (key: string, value: string) => ({ key, value: { value: { case: "stringValue" as const, value } } });
  const request = create(ExportTraceServiceRequestSchema, { resourceSpans: [
    { resource: { attributes: [attr("service.name", "first")] }, scopeSpans: [{ scope: { name: "alpha" }, spans: [{ ...span(1), attributes: [attr("gen_ai.usage.input_tokens", "4"), attr("gen_ai.usage.cost_usd", "0.00125")] }] }] },
    { resource: { attributes: [attr("service.name", "second")] }, scopeSpans: [{ scope: { name: "beta" }, spans: [span(2)] }] },
  ] });
  const batch = normalize(request, "00000000-0000-4000-8000-000000000001");
  expect(batch.spans.map((row) => row.scope.name)).toEqual(["alpha", "beta"]);
  expect(batch.spans.map((row) => (row.resourceAttributes["service.name"] as { stringValue: string }).stringValue)).toEqual(["first", "second"]);
  expect(batch.spans[0].costUsd).toBe("0.00125");
  expect(batch.spans[0].costSource).toBe("reported");
  expect(batch.spans[1].costUsd).toBeNull();
});

test("removes denied attributes before storage", () => {
  const previous = process.env.ATTRIBUTE_DENYLIST;
  process.env.ATTRIBUTE_DENYLIST = "secret.input";
  try {
    const attr = (key: string, value: string) => ({ key, value: { value: { case: "stringValue" as const, value } } });
    const request = create(ExportTraceServiceRequestSchema, { resourceSpans: [{ resource: { attributes: [attr("secret.input", "hidden")] }, scopeSpans: [{ spans: [{
      traceId: Uint8Array.from({ length: 16 }, (_, i) => i + 1), spanId: Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 1]), name: "test", startTimeUnixNano: 1n, endTimeUnixNano: 2n,
      attributes: [attr("secret.input", "hidden"), attr("safe", "shown")],
    }] }] }] });
    const row = normalize(request, "00000000-0000-4000-8000-000000000001").spans[0];
    expect(row.attributes["secret.input"]).toBeUndefined();
    expect(row.resourceAttributes["secret.input"]).toBeUndefined();
    expect(row.attributes["safe"]).toEqual({ stringValue: "shown" });
  } finally {
    if (previous === undefined) delete process.env.ATTRIBUTE_DENYLIST;
    else process.env.ATTRIBUTE_DENYLIST = previous;
  }
});
