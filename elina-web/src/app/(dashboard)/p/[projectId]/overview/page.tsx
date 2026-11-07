import Link from "next/link";
import type { z } from "zod";
import { metricsSchema, tracePageSchema, trendsSchema } from "@/lib/contracts";
import { cost, count, date, duration } from "@/lib/format";
import { elinaApi } from "@/server/elina-api";
import { RangeSelect } from "../range-select";

export default async function Overview({ params, searchParams }: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { projectId } = await params;
  const range = (await searchParams).range ?? "24h";
  const hours = { "1h": 1, "24h": 24, "7d": 168, "30d": 720 }[range] ?? 24;
  const to = new Date();
  const from = new Date(to.getTime() - hours * 3_600_000).toISOString();
  const query = new URLSearchParams({ projectId, from, to: to.toISOString() });
  const bucketMinutes = { "1h": 5, "24h": 60, "7d": 360, "30d": 1440 }[range] ?? 60;
  const [metricsResponse, trendsResponse, recentResponse, errorsResponse] = await Promise.all([
    elinaApi(`/api/metrics/summary?${query}`),
    elinaApi(`/api/metrics/trends?${query}&bucketMinutes=${bucketMinutes}`),
    elinaApi(`/api/traces?${query}&limit=5`),
    elinaApi(`/api/traces?${query}&status=error&limit=5`),
  ]);
  if (![metricsResponse, trendsResponse, recentResponse, errorsResponse].every((response) => response.ok)) throw new Error("Overview unavailable");
  const metrics = metricsSchema.parse(await metricsResponse.json());
  const trends = trendsSchema.parse(await trendsResponse.json()).items;
  const recent = tracePageSchema.parse(await recentResponse.json()).items;
  const errors = tracePageSchema.parse(await errorsResponse.json()).items;
  return <>
    <div className="page-heading"><div><div className="eyebrow">PROJECT DASHBOARD</div><h1>Overview</h1><p>Understand what your agents have been doing.</p></div><RangeSelect range={range} /></div>
    <div className="metric-grid">
      <Metric label="TOTAL TRACES" value={count(metrics.traceCount)} hint="Executions in this period" />
      <Metric label="MODEL COST" value={metrics.missingCostSpans && Number(metrics.knownCostUsd) === 0 ? "Unknown" : cost(metrics.knownCostUsd)} hint={metrics.missingCostSpans ? `${metrics.missingCostSpans} usage spans unpriced${Number(metrics.knownCostUsd) > 0 ? "; shown cost is partial" : ""}` : "All recorded usage priced"} />
      <Metric label="ERROR RATE" value={`${(metrics.errorRate * 100).toFixed(1)}%`} hint={`${metrics.errorCount} failed traces`} />
      <Metric label="P95 LATENCY" value={duration(metrics.p95LatencyMs)} hint={`Median ${duration(metrics.p50LatencyMs)}`} />
    </div>
    <div className="secondary-stats">Input tokens <strong>{count(metrics.inputTokens)}</strong><span>·</span> Output tokens <strong>{count(metrics.outputTokens)}</strong></div>
    <section className="panel trends-panel"><div className="panel-heading"><h2>Health trends</h2><span className="panel-caption">Select a bucket to inspect its traces · times in UTC</span></div>
      {trends.some((item) => item.traceCount) ? <div className="trend-charts">
        <TrendChart label="Traces" items={trends} projectId={projectId} value={(item) => item.traceCount} display={(item) => count(item.traceCount)} />
        <TrendChart label="Error rate" items={trends} projectId={projectId} value={(item) => item.errorRate} display={(item) => `${(item.errorRate * 100).toFixed(1)}% (${item.errorCount} errors)`} />
        <TrendChart label="P95 latency" items={trends} projectId={projectId} value={(item) => item.p95LatencyMs ?? 0} display={(item) => duration(item.p95LatencyMs)} />
        <TrendChart label="Known cost" items={trends} projectId={projectId} value={(item) => Number(item.knownCostUsd)} display={(item) => `${cost(item.knownCostUsd)}${item.missingCostSpans ? ` · partial (${item.missingCostSpans} unpriced spans)` : ""}`} partial />
      </div> : <p className="empty">No traces in this period.</p>}
    </section>
    <section className="panel quality-panel"><div className="panel-heading"><h2>Human reviewed quality</h2><span className="panel-caption">Good / reviewed traces</span></div><div className="reviewed-quality">{metrics.reviewedCount ? <><strong>{(metrics.goodCount / metrics.reviewedCount * 100).toFixed(1)}%</strong><small>{metrics.goodCount} Good / {metrics.reviewedCount} reviewed in this period</small></> : <span>No reviews in this period.</span>}</div></section>
    <div className="overview-columns">
      <section className="panel"><div className="panel-heading"><h2>Recent activity</h2><Link href={`/p/${projectId}/traces`}>View all →</Link></div>
        {recent.length ? recent.map((trace) => <Link className="activity-row" key={trace.traceId} href={`/p/${projectId}/traces/${trace.traceId}`}><span><strong>{trace.name}</strong><small>{date(trace.startedAt)}</small></span><span className={`status ${trace.status}`}>{trace.status}</span></Link>) : <p className="empty">No traces in this period.</p>}
      </section>
      <section className="panel"><div className="panel-heading"><h2>Recent errors</h2><span className="panel-caption">Needs attention</span></div>
        {errors.length ? errors.map((trace) => <Link className="activity-row" key={trace.traceId} href={`/p/${projectId}/traces/${trace.traceId}`}><span><strong>{trace.name}</strong><small>{date(trace.startedAt)}</small></span><span className="status error">error</span></Link>) : <p className="empty">No errors in this period.</p>}
      </section>
    </div>
  </>;
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="metric"><div className="eyebrow">{label}</div><div className="metric-value">{value}</div><div className="metric-hint">{hint}</div></div>;
}

type Trend = z.infer<typeof trendsSchema>["items"][number];

function TrendChart({ label, items, projectId, value, display, partial = false }: {
  label: string; items: Trend[]; projectId: string; value: (item: Trend) => number; display: (item: Trend) => string; partial?: boolean;
}) {
  const max = Math.max(0, ...items.map(value));
  return <div className="trend-chart"><strong>{label}</strong><div className="trend-bars">
    {items.map((item) => {
      const params = new URLSearchParams({ from: item.from, to: item.to });
      const description = `${new Date(item.from).toLocaleString("en-GB", { timeZone: "UTC" })} UTC: ${display(item)}`;
      return <Link key={item.from} href={`/p/${projectId}/traces?${params}`} aria-label={`${label}, ${description}`} title={description} className="trend-bucket">
        <span className={`trend-bar ${partial && item.missingCostSpans ? "partial" : ""}`} style={{ height: `${max ? value(item) / max * 100 : 0}%` }} />
      </Link>;
    })}
  </div><div className="trend-axis"><span>{new Date(items[0].from).toLocaleString("en-GB", { timeZone: "UTC" })}</span><span>{new Date(items.at(-1)!.to).toLocaleString("en-GB", { timeZone: "UTC" })}</span></div>{partial && items.some((item) => item.missingCostSpans) && <small className="muted">Striped bars have unpriced usage; cost is partial.</small>}</div>;
}

