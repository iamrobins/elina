import { z } from "zod";
import { metricsSchema, uuid } from "@/lib/contracts";
import { elinaApi } from "@/server/elina-api";
import { isAuthenticated } from "@/server/session";

const query = z.object({
  projectId: uuid, from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(),
});

export async function GET(request: Request) {
  if (!await isAuthenticated()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success || (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to))
    return Response.json({ error: "Invalid range" }, { status: 400 });
  const params = new URLSearchParams({ projectId: parsed.data.projectId });
  if (parsed.data.from) params.set("from", parsed.data.from);
  if (parsed.data.to) params.set("to", parsed.data.to);
  const response = await elinaApi(`/api/metrics/summary?${params}`);
  if (!response.ok) return Response.json({ error: "Metrics unavailable" }, { status: 502 });
  return Response.json(metricsSchema.parse(await response.json()), { headers: { "Cache-Control": "private, no-store" } });
}

