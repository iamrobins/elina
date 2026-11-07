import type { Span } from "./contracts";

export type TimelineRow = { span: Span; depth: number; unattached: boolean; hasChildren: boolean };

export function firstErrorSpan(spans: Span[]) {
  return spans.find((span) => span.status === "error" && span.statusMessage?.trim())
    ?? spans.find((span) => span.status === "error");
}

export function timeline(spans: Span[], collapsed: Set<string>): TimelineRow[] {
  const ordered = [...spans].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.spanId.localeCompare(b.spanId));
  const byId = new Map(ordered.map((span) => [span.spanId, span]));
  const children = new Map<string, Span[]>();
  const roots: Span[] = [];
  const orphans: Span[] = [];
  for (const span of ordered) {
    if (!span.parentSpanId) roots.push(span);
    else if (!byId.has(span.parentSpanId) || span.parentSpanId === span.spanId) orphans.push(span);
    else {
      const list = children.get(span.parentSpanId) ?? [];
      list.push(span); children.set(span.parentSpanId, list);
    }
  }
  const result: TimelineRow[] = [];
  const visited = new Set<string>();
  function walk(start: Span, unattached: boolean) {
    const stack = [{ span: start, depth: 0 }];
    while (stack.length) {
      const { span, depth } = stack.pop()!;
      if (visited.has(span.spanId)) continue;
      visited.add(span.spanId);
      const descendants = children.get(span.spanId) ?? [];
      result.push({ span, depth: Math.min(depth, 30), unattached, hasChildren: descendants.length > 0 });
      if (!collapsed.has(span.spanId)) for (let i = descendants.length - 1; i >= 0; i--) stack.push({ span: descendants[i], depth: depth + 1 });
      else {
        const hidden = [...descendants];
        while (hidden.length) {
          const child = hidden.pop()!;
          if (visited.has(child.spanId)) continue;
          visited.add(child.spanId);
          hidden.push(...(children.get(child.spanId) ?? []));
        }
      }
    }
  }
  roots.forEach((span) => walk(span, false));
  orphans.forEach((span) => walk(span, true));
  // A cycle can have no root; preserve those spans as unattached observations.
  ordered.forEach((span) => { if (!visited.has(span.spanId)) walk(span, true); });
  return result;
}

export function bar(startedAt: string, durationMs: number, traceStart: string, traceEnd: string) {
  const total = Math.max(1, Date.parse(traceEnd) - Date.parse(traceStart));
  if (!Number.isFinite(total) || !Number.isFinite(durationMs) || !Number.isFinite(Date.parse(startedAt))) return { left: "0%", width: "0%" };
  const offset = Math.max(0, Math.min(100, (Date.parse(startedAt) - Date.parse(traceStart)) / total * 100));
  const width = Math.max(0, Math.min(100 - offset, durationMs / total * 100));
  return { left: `${offset}%`, width: `${width}%` };
}

