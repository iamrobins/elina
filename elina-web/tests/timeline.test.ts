import { expect, test } from "bun:test";
import { timeline, bar, firstErrorSpan } from "../src/lib/timeline";
import type { Span } from "../src/lib/contracts";

const span = (spanId: string, parentSpanId: string | null): Span => ({ spanId, parentSpanId, name: spanId, asType: "span", startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:01.000Z", durationMs: 1000, status: "ok", statusMessage: null, model: null, provider: null, inputTokens: null, outputTokens: null, costUsd: null, costSource: null, attributes: {}, events: [] });

test("tree preserves orphans and cycles", () => {
  const rows = timeline([span("root", null), span("child", "root"), span("orphan", "missing"), span("a", "b"), span("b", "a")], new Set());
  expect(rows.map((row) => row.span.spanId)).toEqual(["root", "child", "orphan", "a", "b"]);
  expect(rows.filter((row) => row.unattached).map((row) => row.span.spanId)).toEqual(["orphan", "a", "b"]);
});

test("collapsed descendants stay hidden", () => {
  expect(timeline([span("root", null), span("child", "root")], new Set(["root"])).map((row) => row.span.spanId)).toEqual(["root"]);
});

test("bar clamps invalid ranges", () => {
  expect(bar("2026-01-01T00:00:02Z", 1000, "2026-01-01T00:00:00Z", "2026-01-01T00:00:01Z")).toEqual({ left: "100%", width: "0%" });
});

test("error summary prefers an observation with a message", () => {
  const parent = { ...span("parent", null), status: "error" };
  const child = { ...span("child", "parent"), status: "error", statusMessage: "Tool failed" };
  expect(firstErrorSpan([parent, child])).toEqual(child);
  expect(firstErrorSpan([parent])).toEqual(parent);
  expect(firstErrorSpan([span("ok", null)])).toBeUndefined();
});

