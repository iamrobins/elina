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
