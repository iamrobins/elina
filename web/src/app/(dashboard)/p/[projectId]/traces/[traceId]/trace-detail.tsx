"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { traceDetailSchema, tracePageSchema } from "@/lib/contracts";
import type { Span } from "@/lib/contracts";
import { cost, count, date, duration } from "@/lib/format";
import { bar, firstErrorSpan, timeline } from "@/lib/timeline";
import { capturedContent } from "@/lib/captured-content";
import { ObservationIcon } from "./observation-icon";

export function TraceDetail(props: { projectId: string; traceId: string }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><TraceDetailContent {...props} /></QueryClientProvider>;
}

function TraceDetailContent({ projectId, traceId }: { projectId: string; traceId: string }) {
  const search = useSearchParams();
  const query = useQuery({
    queryKey: ["trace", projectId, traceId],
    queryFn: async () => {
      const response = await fetch(`/api/bff/traces/${traceId}?projectId=${projectId}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "Trace not found" : "Could not load trace");
      return traceDetailSchema.parse(await response.json());
    },
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
  const [tab, setTab] = useState("Overview");
  const scroll = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => timeline(query.data?.spans ?? [], collapsed), [query.data?.spans, collapsed]);
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroll.current, estimateSize: () => 48, overscan: 12 });
  useEffect(() => {
    if (!jumpTarget) return;
    const index = rows.findIndex((row) => row.span.spanId === jumpTarget);
    if (index < 0) return;
    virtual.scrollToIndex(index, { align: "center" });
    scroll.current?.focus();
    setJumpTarget(null);
  }, [jumpTarget, rows, virtual]);
  const trace = query.data?.trace;
  const spans = query.data?.spans ?? [];
  const errorSpan = firstErrorSpan(spans);
  const usageSpans = spans.filter((span) => span.inputTokens != null || span.outputTokens != null);
  const unpriced = usageSpans.filter((span) => span.costUsd == null).length;
  const active = spans.find((span) => span.spanId === selected) ?? spans[0];
  function toggle(id: string) { setCollapsed((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  return <>
    <div className="detail-back"><Link href={`/p/${projectId}/traces?${search}`}>← All traces</Link></div>
    {query.isPending && <p className="empty">Loading trace…</p>}
    {query.isError && <p role="alert" className="empty error-text">{query.error.message} <button onClick={() => query.refetch()}>Retry</button></p>}
    {trace && <>
      <div className="page-heading detail-heading"><div><div className="eyebrow">TRACE DETAIL</div><h1>{trace.name}</h1><div className="mono muted">{trace.traceId}</div></div><span className={`status ${trace.status}`}>{trace.status}</span></div>
      <div className="detail-meta"><span>Started <strong>{date(trace.startedAt)}</strong></span><span>Duration <strong>{duration(Date.parse(trace.endedAt) - Date.parse(trace.startedAt))}</strong></span><span>Spans <strong>{spans.length}</strong></span><span>Tokens <strong>{count(spans.reduce((sum, span) => sum + Number(span.inputTokens ?? 0) + Number(span.outputTokens ?? 0), 0))}</strong></span><span>Model cost <strong>{unpriced === usageSpans.length && unpriced > 0 ? "Unknown" : unpriced > 0 ? "Partial / unknown" : cost(spans.reduce((sum, span) => sum + Number(span.costUsd ?? 0), 0).toString())}</strong></span></div>
      {errorSpan && <div className="trace-error-summary"><div><strong>{errorSpan.name}</strong><p>{errorSpan.statusMessage?.trim() || "This observation reported an error."}</p></div><button type="button" className="ghost-button" onClick={() => { setCollapsed(new Set()); setSelected(errorSpan.spanId); setTab("Overview"); setJumpTarget(errorSpan.spanId); }}>Jump to error</button></div>}
      {trace.feedbackVerdict && <section className="panel review-panel"><div className="panel-heading"><h2>Application feedback</h2><span className={`status review-${trace.feedbackVerdict}`}>{trace.feedbackVerdict}</span></div>{trace.feedbackNote && <div className="review-body">{trace.feedbackNote}</div>}</section>}
      <Review projectId={projectId} traceId={traceId} review={query.data?.review ?? null} onSaved={() => query.refetch()} />
      <div className="detail-grid"><section className="panel waterfall"><div className="panel-heading"><h2>Execution waterfall</h2><span className="panel-caption">{spans.length} observations</span></div>
        <div className="waterfall-head"><span>OBSERVATION</span><span>TIMELINE</span><span>DURATION</span></div>
        {rows.some((row) => row.unattached) && <div className="orphan-note">Includes unattached observations</div>}
        <div ref={scroll} className="waterfall-scroll" role="listbox" aria-label="Trace observations" tabIndex={0} onKeyDown={(event) => {
          if (event.key === "Escape") setSelected(null);
          if (event.key === "ArrowDown" || event.key === "j" || event.key === "ArrowUp" || event.key === "k") {
            event.preventDefault(); const index = rows.findIndex((row) => row.span.spanId === selected);
            const next = Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" || event.key === "j" ? 1 : -1)));
            setSelected(rows[next]?.span.spanId ?? null); virtual.scrollToIndex(next);
          }
        }}><div style={{ height: virtual.getTotalSize(), position: "relative" }}>
          {virtual.getVirtualItems().map((item) => { const row = rows[item.index]; const span = row.span;
            return <div key={span.spanId} className={`waterfall-row ${active?.spanId === span.spanId ? "active" : ""}`} style={{ position: "absolute", top: item.start, height: item.size, width: "100%" }}>
              <div className="observation-name" style={{ paddingLeft: `${Math.min(row.depth, 12) * 14 + 10}px` }}>
                {row.hasChildren ? <button className="collapse-button" aria-label={`${collapsed.has(span.spanId) ? "Expand" : "Collapse"} ${span.name}`} onClick={() => toggle(span.spanId)}>{collapsed.has(span.spanId) ? "▸" : "▾"}</button> : <span className="collapse-space" />}
                <button className="span-select" role="option" aria-selected={active?.spanId === span.spanId} aria-label={`${span.asType}: ${span.name}`} onClick={() => { setSelected(span.spanId); setTab("Overview"); }}><ObservationIcon type={span.asType} />{span.name}</button>
              </div><div className="timeline-track" title={`${date(span.startedAt)} – ${date(span.endedAt)}`}><div className={`timeline-bar ${span.status}`} style={bar(span.startedAt, span.durationMs, trace.startedAt, trace.endedAt)} /></div><span className="mono row-duration">{duration(span.durationMs)}</span>
            </div>;
          })}
        </div></div>{!spans.length && <p className="empty">This trace has no observations.</p>}
      </section><Inspector span={active} tab={tab} setTab={setTab} /></div>
    </>}
  </>;
}

function Review({ projectId, traceId, review, onSaved }: { projectId: string; traceId: string; review: { verdict: "good" | "bad"; note: string | null; reviewedAt: string } | null; onSaved: () => void }) {
  const router = useRouter();
  const search = useSearchParams();
  const inQueue = search.get("review") === "unreviewed";
  const [verdict, setVerdict] = useState<"good" | "bad" | null>(review?.verdict ?? null);
  const [note, setNote] = useState(review?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { setVerdict(review?.verdict ?? null); setNote(review?.note ?? ""); }, [review?.verdict, review?.note]);
  async function save(method: "PUT" | "DELETE", next = false) {
    if (method === "PUT" && !verdict) return;
    setBusy(true); setError(""); setNotice("");
    let saved = false;
    try {
      const response = await fetch(`/api/bff/traces/${traceId}/review?projectId=${projectId}`, {
        method, ...(method === "PUT" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verdict, note: note.trim() || null }) } : {}),
      });
      if (!response.ok) throw new Error("Could not save review");
      saved = true;
      onSaved();
      if (next) {
        const params = new URLSearchParams({ projectId, review: "unreviewed", limit: "1" });
        for (const key of ["from", "to", "status", "q", "feedback"]) if (search.get(key)) params.set(key, search.get(key)!);
        const nextResponse = await fetch(`/api/bff/traces?${params}`, { cache: "no-store" });
        if (!nextResponse.ok) throw new Error("Could not load next trace");
        const item = tracePageSchema.parse(await nextResponse.json()).items[0];
        if (item) router.push(`/p/${projectId}/traces/${item.traceId}?${search}`);
        else setNotice("Review saved. No unreviewed traces remain in this range.");
      }
    } catch { setError(saved ? "Review saved, but could not load the next trace." : "Could not save review. Try again."); } finally { setBusy(false); }
  }
  return <section className="panel review-panel" aria-label="Trace review"><div className="panel-heading"><h2>Human review</h2>{review && <span className="panel-caption">Reviewed {date(review.reviewedAt)}</span>}</div>
    <div className="review-body"><div className="review-buttons"><button type="button" className={`ghost-button ${verdict === "good" ? "selected" : ""}`} aria-pressed={verdict === "good"} onClick={() => setVerdict("good")}>Good</button><button type="button" className={`ghost-button ${verdict === "bad" ? "selected" : ""}`} aria-pressed={verdict === "bad"} onClick={() => setVerdict("bad")}>Bad</button></div>
      <label>Note (optional)<textarea value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} /></label><div className="review-actions"><button className="primary-button compact-button" disabled={busy || !verdict} onClick={() => save("PUT")}>Save review</button>{inQueue && <button className="ghost-button" disabled={busy || !verdict} onClick={() => save("PUT", true)}>Save &amp; next</button>}{review && <button className="ghost-button" disabled={busy} onClick={() => save("DELETE")}>Clear review</button>}</div>{error && <p role="alert" className="error-text">{error}</p>}{notice && <p role="status" className="muted">{notice}</p>}</div>
  </section>;
}

function Inspector({ span, tab, setTab }: { span?: Span; tab: string; setTab: (tab: string) => void }) {
  const tabs = ["Overview", "Input", "Output", "Attributes", "Events"];
  const content: unknown = !span ? null : tab === "Input" ? capturedContent(span.attributes, ["elinaobs.input", "input.value", "gen_ai.prompt"]) : tab === "Output" ? capturedContent(span.attributes, ["elinaobs.output", "output.value", "gen_ai.completion"]) : tab === "Attributes" ? span.attributes : tab === "Events" ? span.events : null;
  return <aside className="panel inspector"><div className="panel-heading"><h2>Span inspector</h2></div>{span ? <><div className="inspector-title"><strong>{span.name}</strong><span className={`status ${span.status}`}>{span.status}</span><small className="mono">{span.spanId}</small></div><div className="inspector-tabs" role="tablist">{tabs.map((name) => <button role="tab" aria-selected={tab === name} key={name} className={tab === name ? "selected" : ""} onClick={() => setTab(name)}>{name}</button>)}</div>
    {tab === "Overview" ? <dl className="inspector-facts"><dt>Type</dt><dd className="observation-type-value"><ObservationIcon type={span.asType} />{span.asType}</dd><dt>Duration</dt><dd>{duration(span.durationMs)}</dd><dt>Model</dt><dd>{span.model ?? "—"}</dd><dt>Provider</dt><dd>{span.provider ?? "—"}</dd><dt>Input tokens</dt><dd>{count(span.inputTokens)}</dd><dt>Output tokens</dt><dd>{count(span.outputTokens)}</dd><dt>Model cost</dt><dd>{cost(span.costUsd)}</dd><dt>Cost source</dt><dd>{span.costSource?.startsWith("catalog:") ? "Built-in estimate" : span.costSource?.startsWith("project:") ? "Project estimate" : span.costSource === "reported" ? "Reported" : "—"}</dd>{span.statusMessage && <><dt>Error</dt><dd>{span.statusMessage}</dd></>}</dl> : <pre className="json-viewer">{content == null ? "No captured content" : JSON.stringify(content, null, 2)}</pre>}
  </> : <p className="empty">Select an observation to inspect it.</p>}</aside>;
}

