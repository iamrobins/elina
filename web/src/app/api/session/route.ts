import { NextResponse } from "next/server";
import { clearSession, sameOrigin, setSession, verifyPassword } from "@/server/session";

const attempts = new Map<string, { count: number; until: number }>();

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const ip = request.headers.get("x-real-ip") ?? "local";
  const now = Date.now();
  const attempt = attempts.get(ip);
  if (attempt && attempt.until > now && attempt.count >= 5) return NextResponse.json({ error: "Try again later" }, { status: 429 });
  const body = await request.json().catch(() => null);
  if (typeof body?.password !== "string" || body.password.length > 1024 || !verifyPassword(body.password)) {
    // shortcut: process-local throttling; use a shared limiter before multi-instance deployment.
    attempts.set(ip, { count: (attempt?.until ?? 0) > now ? attempt!.count + 1 : 1, until: now + 60_000 });
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  attempts.delete(ip);
  await setSession();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  await clearSession();
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

