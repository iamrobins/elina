import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { Hono } from "hono";
import { z } from "zod";
import { metricsRoutes } from "../metrics/routes";
import { projectForKey } from "../projects/keys";
import { traceRoutes } from "../traces/routes";

const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const failed = () => ({ isError: true, content: [{ type: "text" as const, text: "Elina could not load the requested data." }] });

export const mcpHandler = createMcpHandler(({ authInfo }) => {
  const projectId = authInfo!.clientId;
  const server = new McpServer({ name: "elina", version: "0.1.0" });

  server.registerTool("get_health", {
    description: "Read this project's trace count, error rate, latency, token usage, and known cost for a time range.",
    inputSchema: z.object({ from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional() }),
  }, async ({ from, to }) => {
    const params = new URLSearchParams({ projectId });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const response = await metricsRoutes.request(`/metrics/summary?${params}`);
    return response.ok ? result(await response.json()) : failed();
  });

  server.registerTool("list_traces", {
    description: "Search up to 20 traces in this project by time, status, review, application feedback, name, or trace ID. Use nextCursor for another page.",
    inputSchema: z.object({
      from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(),
      status: z.enum(["ok", "error", "unset"]).optional(), review: z.enum(["bad", "unreviewed"]).optional(),
      feedback: z.enum(["bad"]).optional(), q: z.string().trim().min(1).max(200).optional(),
      limit: z.number().int().min(1).max(20).default(10), cursor: z.string().max(512).optional(),
    }),
  }, async (input) => {
    const params = new URLSearchParams({ projectId, limit: String(input.limit) });
    for (const key of ["from", "to", "status", "review", "feedback", "q", "cursor"] as const)
      if (input[key]) params.set(key, input[key]);
    const response = await traceRoutes.request(`/traces?${params}`);
    if (!response.ok) return failed();
    const page = await response.json();
    return result({ ...page, items: page.items.map((item: { name: string }) => ({ ...item, name: item.name.slice(0, 200) })) });
  });

  server.registerTool("get_trace", {
    description: "Read a trace's status and up to 100 observation summaries. Captured inputs, outputs, and raw attributes are excluded.",
    inputSchema: z.object({ traceId: z.string().regex(/^[a-f0-9]{32}$/) }),
  }, async ({ traceId }) => {
    const response = await traceRoutes.request(`/traces/${traceId}?projectId=${projectId}`);
    if (!response.ok) return failed();
    const { trace, spans } = await response.json();
    return result({
      trace: { traceId: trace.traceId, name: trace.name.slice(0, 200), status: trace.status, startedAt: trace.startedAt, endedAt: trace.endedAt },
      spans: spans.slice(0, 100).map((span: Record<string, unknown>) => ({
        spanId: span.spanId, parentSpanId: span.parentSpanId, name: String(span.name).slice(0, 200), asType: span.asType,
        status: span.status, statusMessage: typeof span.statusMessage === "string" ? span.statusMessage.slice(0, 500) : null, startedAt: span.startedAt, durationMs: span.durationMs,
        provider: span.provider, model: span.model, costUsd: span.costUsd,
      })),
      totalSpans: spans.length,
    });
  });

  return server;
});

export const mcpRoutes = new Hono();

mcpRoutes.all("/mcp", async (c) => {
  let projectId: string | null;
  try { projectId = await projectForKey(c.req.header("authorization"), "read"); }
  catch { return c.json({ error: "storage unavailable" }, 503); }
  if (!projectId) return c.json({ error: "unauthorized" }, 401);
  return mcpHandler.fetch(c.req.raw, { authInfo: { token: "", clientId: projectId, scopes: ["read"] } });
});
