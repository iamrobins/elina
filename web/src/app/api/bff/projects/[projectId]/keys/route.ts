import { z } from "zod";
import { uuid } from "@/lib/contracts";
import { elinaApi } from "@/server/elina-api";
import { isAuthenticated, sameOrigin } from "@/server/session";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (!await isAuthenticated()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await context.params).projectId;
  if (!uuid.safeParse(id).success) return Response.json({ error: "Invalid project" }, { status: 400 });
  const response = await elinaApi(`/api/projects/${id}/keys`);
  if (!response.ok) return Response.json({ error: "Keys unavailable" }, { status: 502 });
  return Response.json(await response.json(), { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (!await isAuthenticated()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const id = (await context.params).projectId;
  if (!uuid.safeParse(id).success) return Response.json({ error: "Invalid project" }, { status: 400 });
  let body: unknown;
  try { const text = await request.text(); body = text ? JSON.parse(text) : {}; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = z.object({ kind: z.enum(["write", "read"]).default("write") }).safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid key kind" }, { status: 400 });
  const response = await elinaApi(`/api/projects/${id}/keys`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
  if (!response.ok) return Response.json({ error: "Key creation failed" }, { status: 502 });
  return Response.json(await response.json(), { status: 201, headers: { "Cache-Control": "private, no-store" } });
}

