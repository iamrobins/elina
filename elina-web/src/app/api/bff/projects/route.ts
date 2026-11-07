import { projectPageSchema } from "@/lib/contracts";
import { elinaApi } from "@/server/elina-api";
import { isAuthenticated, sameOrigin } from "@/server/session";
import { z } from "zod";

export async function GET() {
  if (!await isAuthenticated()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const response = await elinaApi("/api/projects");
  if (!response.ok) return Response.json({ error: "Projects unavailable" }, { status: 502 });
  return Response.json(projectPageSchema.parse(await response.json()), { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!await isAuthenticated()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = z.object({ name: z.string().trim().min(1).max(200) }).safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid project name" }, { status: 400 });
  const response = await elinaApi("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
  if (!response.ok) return Response.json({ error: "Project creation failed" }, { status: 502 });
  return Response.json(await response.json(), { status: 201, headers: { "Cache-Control": "private, no-store" } });
}

