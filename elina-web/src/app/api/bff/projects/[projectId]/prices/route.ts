import { uuid } from "@/lib/contracts";
import { elinaApi } from "@/server/elina-api";
import { isAuthenticated, sameOrigin } from "@/server/session";

type Context = { params: Promise<{ projectId: string }> };

async function forward(request: Request, context: Context, method: "GET" | "PUT" | "DELETE") {
  if (!await isAuthenticated()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (method !== "GET" && !sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const id = (await context.params).projectId;
  if (!uuid.safeParse(id).success) return Response.json({ error: "Invalid project" }, { status: 400 });
  const response = await elinaApi(`/api/projects/${id}/prices`, {
    method,
    ...(method === "GET" ? {} : { body: await request.text(), headers: { "Content-Type": "application/json" } }),
  });
  return new Response(response.status === 204 ? null : await response.text(), {
    status: response.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

export const GET = (request: Request, context: Context) => forward(request, context, "GET");
export const PUT = (request: Request, context: Context) => forward(request, context, "PUT");
export const DELETE = (request: Request, context: Context) => forward(request, context, "DELETE");
