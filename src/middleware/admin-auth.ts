import { createHash, timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { parseEnv } from "../config/env";

const expected = createHash("sha256").update(parseEnv(process.env).ADMIN_TOKEN).digest();

export const adminAuth = createMiddleware(async (c, next) => {
  const match = /^Bearer (\S+)$/.exec(c.req.header("authorization") ?? "");
  const actual = createHash("sha256").update(match?.[1] ?? "").digest();
  if (!match || !timingSafeEqual(actual, expected)) return c.json({ error: "unauthorized" }, 401);
  await next();
});
