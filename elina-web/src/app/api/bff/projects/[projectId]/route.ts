import { uuid } from "@/lib/contracts";
import { elinaApi } from "@/server/elina-api";
import { isAuthenticated, sameOrigin } from "@/server/session";

export async function DELETE(request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (!await isAuthenticated()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const id = (await context.params).projectId;
  if (!uuid.safeParse(id).success) return Response.json({ error: "Invalid project" }, { status: 400 });
  const response = await elinaApi(`/api/projects/${id}`, { method: "DELETE" });
  if (response.status === 404) return Response.json({ error: "Project not found" }, { status: 404 });
  if (!response.ok) return Response.json({ error: "Project deletion failed" }, { status: 502 });
  return new Response(null, { status: 204 });
}
