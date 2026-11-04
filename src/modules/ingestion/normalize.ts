import { toJson } from "@bufbuild/protobuf";
import type { KeyValue } from "../../gen/opentelemetry/proto/common/v1/common_pb";
import { AnyValueSchema } from "../../gen/opentelemetry/proto/common/v1/common_pb";
import type { ExportTraceServiceRequest } from "../../gen/opentelemetry/proto/collector/trace/v1/trace_service_pb";
import { Status_StatusCode } from "../../gen/opentelemetry/proto/trace/v1/trace_pb";

function invalid(message: string): never { throw new Error(message); }

function id(bytes: Uint8Array, length: number, optional = false) {
  if (optional && bytes.length === 0) return null;
  if (bytes.length !== length || bytes.every((value) => value === 0)) invalid("invalid span or trace ID");
  return Buffer.from(bytes).toString("hex");
}

function date(nanos: bigint) {
  const millis = Number(nanos / 1_000_000n);
  const value = new Date(millis);
  if (nanos <= 0n || !Number.isSafeInteger(millis) || Number.isNaN(value.valueOf())) invalid("invalid timestamp");
  return value;
}

function attributes(items: KeyValue[]) {
  if (items.length > 128) invalid("too many attributes");
  const output: Record<string, unknown> = {};
  const denied = new Set((process.env.ATTRIBUTE_DENYLIST ?? "").split(",").map((key) => key.trim()).filter(Boolean));
  for (const item of items) {
    if (!item.key || item.key.length > 256 || item.value === undefined) invalid("invalid attribute");
    const value = toJson(AnyValueSchema, item.value);
    if (JSON.stringify(value).length > 16_384) invalid("attribute too large");
    if (!denied.has(item.key)) output[item.key] = value;
  }
  return output;
}

function scalar(attrs: Record<string, unknown>, key: string) {
  const value = attrs[key] as Record<string, unknown> | undefined;
  return value?.stringValue ?? value?.intValue ?? value?.doubleValue;
}

function token(attrs: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = scalar(attrs, key);
    if (value === undefined) continue;
    const parsed = BigInt(String(value));
    if (parsed < 0n || parsed > 9_223_372_036_854_775_807n) invalid("invalid token count");
    return parsed;
  }
  return null;
}

function reportedCost(attrs: Record<string, unknown>) {
  for (const key of ["gen_ai.usage.cost_usd", "elinaobs.cost.usd", "tinyobs.cost.usd"]) {
    const value = scalar(attrs, key);
    if (value === undefined) continue;
    const cost = typeof value === "number" && Number.isFinite(value) ? value.toFixed(10).replace(/\.?0+$/, "") : String(value);
    if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,10})?$/.test(cost)) invalid("invalid reported cost");
    return cost;
  }
  return null;
}

export function normalize(request: ExportTraceServiceRequest, projectId: string) {
  const spans = [];
  const traces = new Map<string, { projectId: string; traceId: string; name: string; rootSpanId: string | null; startedAt: Date; endedAt: Date; status: string }>();
  const seen = new Set<string>();
  let count = 0;
  for (const resource of request.resourceSpans) {
    const resourceAttributes = attributes(resource.resource?.attributes ?? []);
    for (const scope of resource.scopeSpans) {
      const scopeAttributes = attributes(scope.scope?.attributes ?? []);
      const scopeJson = { name: scope.scope?.name ?? "", version: scope.scope?.version ?? "", attributes: scopeAttributes };
      for (const span of scope.spans) {
        if (++count > 1000) invalid("too many spans");
        const traceId = id(span.traceId, 16)!;
        const spanId = id(span.spanId, 8)!;
        const parentSpanId = id(span.parentSpanId, 8, true);
        const startedAt = date(span.startTimeUnixNano);
        const endedAt = date(span.endTimeUnixNano);
        if (endedAt < startedAt || span.endTimeUnixNano < span.startTimeUnixNano || !span.name || span.name.length > 512) invalid("invalid span timing or name");
        const key = `${traceId}:${spanId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const attrs = attributes(span.attributes);
        if (span.events.length > 128 || span.links.length > 128) invalid("too many events or links");
        const events = span.events.map((event) => ({ name: event.name, time: date(event.timeUnixNano).toISOString(), attributes: attributes(event.attributes) }));
        const links = span.links.map((link) => ({ traceId: id(link.traceId, 16), spanId: id(link.spanId, 8), attributes: attributes(link.attributes) }));
        const status = span.status?.code === Status_StatusCode.ERROR ? "error" : span.status?.code === Status_StatusCode.OK ? "ok" : "unset";
        const type = scalar(attrs, "elinaobs.observation.type") ?? scalar(attrs, "tinyobs.observation.type") ?? "span";
        const model = scalar(attrs, "gen_ai.response.model") ?? scalar(attrs, "gen_ai.request.model");
        const provider = scalar(attrs, "gen_ai.provider.name") ?? scalar(attrs, "gen_ai.system");
        const costUsd = reportedCost(attrs);
        spans.push({
          projectId, traceId, spanId, parentSpanId, name: span.name, asType: String(type), kind: span.kind,
          startedAt, endedAt, durationMs: Number(span.endTimeUnixNano - span.startTimeUnixNano) / 1_000_000,
          status, statusMessage: span.status?.message ?? null, model: model == null ? null : String(model),
          provider: provider == null ? null : String(provider),
          inputTokens: token(attrs, ["gen_ai.usage.input_tokens", "gen_ai.usage.prompt_tokens"]),
          outputTokens: token(attrs, ["gen_ai.usage.output_tokens", "gen_ai.usage.completion_tokens"]),
          costUsd, costSource: costUsd === null ? null : "reported",
          attributes: attrs, resourceAttributes, scope: scopeJson, events, links,
        });
        const trace = traces.get(traceId);
        if (!trace) traces.set(traceId, { projectId, traceId, name: span.name, rootSpanId: parentSpanId ? null : spanId, startedAt, endedAt, status });
        else {
          if (startedAt < trace.startedAt) trace.startedAt = startedAt;
          if (endedAt > trace.endedAt) trace.endedAt = endedAt;
          if (!parentSpanId && !trace.rootSpanId) { trace.rootSpanId = spanId; trace.name = span.name; }
          if (status === "error") trace.status = "error";
          else if (status === "ok" && trace.status === "unset") trace.status = "ok";
        }
      }
    }
  }
  return { spans, traces: [...traces.values()] };
}
