import { Hono } from "hono";
import { sql } from "./db/client";

export const app = new Hono();

app.get("/health/live", (c) => c.json({ status: "ok" }));
app.get("/health/ready", async (c) => {
  try {
    await sql`SELECT 1`;
    return c.json({ status: "ok" });
  } catch {
    return c.json({ status: "unavailable" }, 503);
  }
});
