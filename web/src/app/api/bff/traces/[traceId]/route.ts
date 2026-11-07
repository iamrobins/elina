import { traceDetailSchema, traceId, uuid } from "@/lib/contracts";
import { elinaApi } from "@/server/elina-api";
import { isAuthenticated } from "@/server/session";

export async function GET(request: Request, context: { params: Promise<{ traceId: string }> }) {
  if (!await isAuthenticated()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await context.params).traceId;
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!traceId.safeParse(id).success || !uuid.safeParse(projectId).success)
    return Response.json({ error: "Invalid trace request" }, { status: 400 });
  const response = await elinaApi(`/api/traces/${id}?projectId=${projectId}`);
  if (response.status === 404) return Response.json({ error: "Trace not found" }, { status: 404 });
  if (!response.ok) return Response.json({ error: "Trace unavailable" }, { status: 502 });
  return Response.json(traceDetailSchema.parse(await response.json()), { headers: { "Cache-Control": "private, no-store" } });
}

