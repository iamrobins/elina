import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { ExportTraceServiceRequestSchema } from "../src/gen/opentelemetry/proto/collector/trace/v1/trace_service_pb";
import { normalize } from "../src/modules/ingestion/normalize";
import { priceSpan } from "../src/modules/ingestion/pricing";

const attr = (key: string, value: string) => ({ key, value: { value: { case: "stringValue" as const, value } } });
function span() {
  const request = create(ExportTraceServiceRequestSchema, { resourceSpans: [{ scopeSpans: [{ spans: [{
    traceId: Uint8Array.from({ length: 16 }, (_, i) => i + 1), spanId: Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 1]), name: "model",
    startTimeUnixNano: 1n, endTimeUnixNano: 2n,
    attributes: [attr("gen_ai.provider.name", "openai"), attr("gen_ai.request.model", "gpt-6-luna"), attr("gen_ai.usage.input_tokens", "144"), attr("gen_ai.usage.output_tokens", "172")],
  }] }] }] });
  return normalize(request, "00000000-0000-4000-8000-000000000001").spans[0];
}

test("prices known model usage and snapshots source", () => {
  const item = span();
  priceSpan(item);
  expect(item.costUsd).toBe("0.0001004000");
  expect(item.costSource).toBe("catalog:2026-11-04.2");
});

test("project price overrides catalog and accounts for cached input", () => {
  const item = span();
  item.attributes["gen_ai.usage.cache_read.input_tokens"] = { intValue: "44" };
  priceSpan(item, [{ provider: "openai", model: "gpt-6-luna", inputPerMillion: "1", outputPerMillion: "2", cachedInputPerMillion: "0.5", updatedAt: new Date("2026-11-04T00:00:00Z") }]);
  expect(item.costUsd).toBe("0.0004660000");
  expect(item.costSource).toBe("project:2026-11-04T00:00:00.000Z:1:2:0.5");
});

test("reported cost wins and unsupported tiers stay unknown", () => {
  const reported = span();
  reported.costUsd = "0.01"; reported.costSource = "reported";
  priceSpan(reported);
  expect(reported.costUsd).toBe("0.01");
  const unsupported = span();
  unsupported.attributes["openai.response.service_tier"] = { stringValue: "fast" };
  priceSpan(unsupported);
  expect(unsupported.costUsd).toBeNull();
});

test("prices bundled Gemini and Anthropic models by exact provider and model", () => {
  for (const [provider, model, cost] of [
    ["gcp.gemini", "gemini-3-flash-preview", "0.0005880000"],
    ["gcp.gemini", "gemini-3.1-pro-preview", "0.0023520000"],
    ["gcp.gemini", "gemini-2.5-flash", "0.0004732000"],
    ["anthropic", "claude-sonnet-4-6", "0.0030120000"],
    ["anthropic", "claude-haiku-4-5-20251001", "0.0010040000"],
    ["anthropic", "claude-opus-4-5-20251101", "0.0050200000"],
  ] as const) {
    const item = span(); item.provider = provider; item.model = model;
    priceSpan(item);
    expect(item.costUsd).toBe(cost);
    expect(item.costSource).toBe("catalog:2026-11-04.2");
  }
});

test("leaves Gemini long context and Anthropic cache writes unknown", () => {
  const longContext = span();
  longContext.provider = "gcp.gemini"; longContext.model = "gemini-3.1-pro-preview";
  longContext.inputTokens = 200001n;
  priceSpan(longContext);
  expect(longContext.costUsd).toBeNull();

  const cacheWrite = span();
  cacheWrite.provider = "anthropic"; cacheWrite.model = "claude-sonnet-4-6";
  cacheWrite.attributes["gen_ai.usage.cache_creation.input_tokens"] = { intValue: "20" };
  priceSpan(cacheWrite);
  expect(cacheWrite.costUsd).toBeNull();
});
