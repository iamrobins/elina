import { z } from "zod";
import { tracePageSchema, uuid } from "@/lib/contracts";
import { elinaApi } from "@/server/elina-api";
import { isAuthenticated } from "@/server/session";

const query = z.object({
  projectId: uuid, status: z.enum(["ok", "error", "unset"]).optional(), review: z.enum(["bad", "unreviewed"]).optional(),
  feedback: z.enum(["bad"]).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(),
  cursor: z.string().max(512).optional(), limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: Request) {
  if (!await isAuthenticated()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success || (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to))
    return Response.json({ error: "Invalid filters" }, { status: 400 });
  const params = new URLSearchParams();
  Object.entries(parsed.data).forEach(([key, value]) => { if (value != null) params.set(key, String(value)); });
  const response = await elinaApi(`/api/traces?${params}`);
  if (!response.ok) return Response.json({ error: "Traces unavailable" }, { status: response.status === 400 ? 400 : 502 });
  return Response.json(tracePageSchema.parse(await response.json()), { headers: { "Cache-Control": "private, no-store" } });
}

