import "server-only";
import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { config } from "./config";

const cookieName = "elina_session";
const ttlSeconds = 60 * 60 * 12;

function signature(value: string) {
  return createHmac("sha256", config().SESSION_SECRET).update(value).digest("base64url");
}

export function verifyPassword(password: string) {
  const [, salt, expected] = config().DASHBOARD_PASSWORD_HASH.split(":");
  const actual = scryptSync(password, Buffer.from(salt, "hex"), 64);
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

export async function isAuthenticated() {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value) return false;
  const [expires, mac] = value.split(".");
  if (!expires || !mac || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  const expected = Buffer.from(signature(expires));
  const received = Buffer.from(mac);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function setSession() {
  const expires = String(Date.now() + ttlSeconds * 1000);
  (await cookies()).set(cookieName, `${expires}.${signature(expires)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: ttlSeconds,
  });
}

export async function clearSession() { (await cookies()).delete(cookieName); }

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin;
}

