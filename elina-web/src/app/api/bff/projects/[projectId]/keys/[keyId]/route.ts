import { uuid } from "@/lib/contracts";
import { elinaApi } from "@/server/elina-api";
import { isAuthenticated, sameOrigin } from "@/server/session";

export async function DELETE(request: Request, context: { params: Promise<{ projectId: string; keyId: string }> }) {
  if (!await isAuthenticated()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const { projectId, keyId } = await context.params;
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(keyId).success) return Response.json({ error: "Invalid key" }, { status: 400 });
  const keys = await elinaApi(`/api/projects/${projectId}/keys`);
  if (!keys.ok) return Response.json({ error: "Keys unavailable" }, { status: 502 });
  const list: { items: { id: string }[] } = await keys.json();
  if (!list.items.some((item) => item.id === keyId)) return Response.json({ error: "Key not found" }, { status: 404 });
  const response = await elinaApi(`/api/keys/${keyId}`, { method: "DELETE" });
  if (!response.ok) return Response.json({ error: "Key revocation failed" }, { status: 502 });
  return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}
