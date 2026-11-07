"use client";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { tracePageSchema } from "@/lib/contracts";
import { cost, count, date, duration } from "@/lib/format";

export function TraceList({ projectId }: { projectId: string }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}><TraceListContent projectId={projectId} /></QueryClientProvider>;
}

function TraceListContent({ projectId }: { projectId: string }) {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const status = search.get("status") ?? "all";
  const review = search.get("review") ?? "all";
  const feedback = search.get("feedback") ?? "all";
  const q = search.get("q") ?? "";
  const [searchText, setSearchText] = useState(q);
  useEffect(() => setSearchText(q), [q]);
  const range = search.get("range") ?? "24h";
  const hours = { "1h": 1, "24h": 24, "7d": 168, "30d": 720 }[range] ?? 24;
  const defaultFrom = useMemo(() => new Date(Date.now() - hours * 3_600_000).toISOString(), [hours]);
  const from = search.get("from") ?? defaultFrom;
  const to = search.get("to") ?? "";
  const detailSearch = new URLSearchParams(search.toString());
  detailSearch.set("from", from);
  const query = useInfiniteQuery({
    queryKey: ["traces", projectId, status, review, feedback, from, to, q], initialPageParam: "",
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ projectId, from, limit: "50" });
      if (status !== "all") params.set("status", status);
      if (review !== "all") params.set("review", review);
      if (feedback !== "all") params.set("feedback", feedback);
      if (q) params.set("q", q);
      if (to) params.set("to", to);
      if (pageParam) params.set("cursor", pageParam);
      const response = await fetch(`/api/bff/traces?${params}`, { signal, cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "Session expired" : "Could not load traces");
      return tracePageSchema.parse(await response.json());
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(search.toString());
    if (key === "range") { next.delete("from"); next.delete("to"); }
    if (!value || (key !== "q" && value === "all")) next.delete(key); else next.set(key, value);
    router.push(`${pathname}?${next}`);
  }
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilter("q", searchText.trim());
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow">EXPLORER</div><h1>Traces</h1><p>Find and inspect every execution.</p></div><button className="ghost-button" onClick={() => query.refetch()}>↻ Refresh</button></div>
    <div className="filter-bar"><form onSubmit={submitSearch}><label>Search <input aria-label="Search traces by name or ID" placeholder="Name or trace ID" maxLength={200} value={searchText} onChange={(event) => setSearchText(event.target.value)} /></label><button type="submit">Search</button></form><label>Status <select value={status} onChange={(event) => setFilter("status", event.target.value)}><option value="all">All statuses</option><option value="ok">Success</option><option value="error">Error</option><option value="unset">Unset</option></select></label><label>Review <select value={review} onChange={(event) => setFilter("review", event.target.value)}><option value="all">All reviews</option><option value="bad">Bad only</option><option value="unreviewed">Unreviewed</option></select></label><label>App feedback <select value={feedback} onChange={(event) => setFilter("feedback", event.target.value)}><option value="all">All feedback</option><option value="bad">Bad only</option></select></label><label>Time range <select value={range} onChange={(event) => setFilter("range", event.target.value)}><option value="1h">Last hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label><span className="filter-count">{rows.length} loaded</span></div>
    <div className="table-wrap"><table><thead><tr><th>Name / ID</th><th>Status</th><th>Review</th><th>App feedback</th><th>Started</th><th>Duration</th><th>Spans</th><th>Tokens</th><th>Known cost</th></tr></thead><tbody>
      {rows.map((trace) => <tr key={trace.traceId}><td><Link className="trace-link" href={`/p/${projectId}/traces/${trace.traceId}?${detailSearch}`}><strong>{trace.name}</strong><small>{trace.traceId}</small></Link></td><td><span className={`status ${trace.status}`}>{trace.status}</span></td><td>{trace.review ? <span className={`status review-${trace.review}`}>{trace.review}</span> : "—"}</td><td>{trace.feedbackVerdict ? <span className={`status review-${trace.feedbackVerdict}`}>{trace.feedbackVerdict}</span> : "—"}</td><td>{date(trace.startedAt)}</td><td>{duration(trace.durationMs)}</td><td>{count(trace.spanCount)}</td><td>{count(Number(trace.inputTokens ?? 0) + Number(trace.outputTokens ?? 0))}</td><td>{cost(trace.costUsd)}</td></tr>)}
    </tbody></table>{query.isPending && <p className="empty">Loading traces…</p>}{query.isError && <p role="alert" className="empty error-text">{query.error.message} <button onClick={() => query.refetch()}>Retry</button></p>}{!query.isPending && !query.isError && !rows.length && <p className="empty">{review === "unreviewed" ? "No unreviewed traces match these filters." : "No traces match these filters."}</p>}</div>
    {query.hasNextPage && <button className="load-more" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? "Loading…" : "Load more traces"}</button>}
  </>;
}

