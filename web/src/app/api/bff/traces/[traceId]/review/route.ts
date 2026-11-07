import { reviewInputSchema, reviewSchema, traceId, uuid } from "@/lib/contracts";
import { elinaApi } from "@/server/elina-api";
import { isAuthenticated } from "@/server/session";

async function requestReview(request: Request, context: { params: Promise<{ traceId: string }> }, method: "PUT" | "DELETE") {
  if (!await isAuthenticated()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await context.params).traceId;
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!traceId.safeParse(id).success || !uuid.safeParse(projectId).success)
    return Response.json({ error: "Invalid trace request" }, { status: 400 });
  let body: unknown;
  if (method === "PUT") {
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
    const parsed = reviewInputSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid review" }, { status: 400 });
    body = parsed.data;
  }
  const response = await elinaApi(`/api/traces/${id}/review?projectId=${projectId}`, {
    method, ...(method === "PUT" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (response.status === 404) return Response.json({ error: "Review or trace not found" }, { status: 404 });
  if (!response.ok) return Response.json({ error: "Could not save review" }, { status: 502 });
  return method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ review: reviewSchema.parse((await response.json()).review) });
}

export const PUT = (request: Request, context: { params: Promise<{ traceId: string }> }) => requestReview(request, context, "PUT");
export const DELETE = (request: Request, context: { params: Promise<{ traceId: string }> }) => requestReview(request, context, "DELETE");
