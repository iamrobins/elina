import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/client";
import { apiKeys, projects } from "../../db/schema";
import { issueKey } from "./keys";

const createProject = z.object({
  name: z.string().trim().min(1).max(200),
  retentionDays: z.number().int().min(1).max(3650).default(30),
});
const uuid = z.uuid();

export const projectRoutes = new Hono();

projectRoutes.get("/projects/:id/keys", async (c) => {
  const projectId = c.req.param("id");
  if (!uuid.safeParse(projectId).success) return c.json({ error: "invalid project ID" }, 400);
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) return c.json({ error: "project not found" }, 404);
  const items = await db.select({ id: apiKeys.id, keyPrefix: apiKeys.keyPrefix, createdAt: apiKeys.createdAt })
    .from(apiKeys).where(and(eq(apiKeys.projectId, projectId), isNull(apiKeys.revokedAt))).orderBy(apiKeys.createdAt);
  return c.json({ items });
});

projectRoutes.post("/projects", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
  const parsed = createProject.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid project" }, 400);

  const issued = issueKey();
  const project = await db.transaction(async (tx) => {
    const [row] = await tx.insert(projects).values(parsed.data).returning();
    await tx.insert(apiKeys).values({ projectId: row.id, keyHash: issued.keyHash, keyPrefix: issued.keyPrefix });
    return row;
  });
  return c.json({ project, writeKey: issued.key }, 201);
});

projectRoutes.get("/projects", async (c) => {
  const items = await db.select().from(projects).orderBy(projects.createdAt);
  return c.json({ items });
});

projectRoutes.post("/projects/:id/keys", async (c) => {
  const projectId = c.req.param("id");
  if (!uuid.safeParse(projectId).success) return c.json({ error: "invalid project ID" }, 400);
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) return c.json({ error: "project not found" }, 404);

  const issued = issueKey();
  const [row] = await db.insert(apiKeys).values({ projectId, keyHash: issued.keyHash, keyPrefix: issued.keyPrefix }).returning({ id: apiKeys.id });
  return c.json({ id: row.id, writeKey: issued.key }, 201);
});

projectRoutes.delete("/keys/:id", async (c) => {
  const id = c.req.param("id");
  if (!uuid.safeParse(id).success) return c.json({ error: "invalid key ID" }, 400);
  const [row] = await db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt))).returning({ id: apiKeys.id });
  if (!row) return c.json({ error: "key not found or already revoked" }, 404);
  return c.body(null, 204);
});
