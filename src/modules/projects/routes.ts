import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/client";
import { apiKeys, modelPrices, projects, traces } from "../../db/schema";
import { issueKey } from "./keys";
import { catalog, catalogVersion } from "../ingestion/pricing";

const createProject = z.object({
  name: z.string().trim().min(1).max(200),
  retentionDays: z.number().int().min(1).max(3650).default(30),
});
const uuid = z.uuid();
const priceIdentity = z.object({ provider: z.string().trim().min(1).max(100), model: z.string().trim().min(1).max(200) });
const rate = z.string().regex(/^(?:0|[1-9]\d{0,5})(?:\.\d{1,6})?$/);
const priceInput = priceIdentity.extend({ inputPerMillion: rate, outputPerMillion: rate, cachedInputPerMillion: rate.nullable() });
const keyInput = z.object({ kind: z.enum(["write", "read"]).default("write") });

export const projectRoutes = new Hono();

projectRoutes.get("/prices/catalog", (c) => c.json({ version: catalogVersion, items: catalog }));

projectRoutes.get("/projects/:id/prices", async (c) => {
  const projectId = c.req.param("id");
  if (!uuid.safeParse(projectId).success) return c.json({ error: "invalid project ID" }, 400);
  const items = await db.select().from(modelPrices).where(eq(modelPrices.projectId, projectId)).orderBy(modelPrices.provider, modelPrices.model);
  return c.json({ items });
});

projectRoutes.put("/projects/:id/prices", async (c) => {
  const projectId = c.req.param("id");
  if (!uuid.safeParse(projectId).success) return c.json({ error: "invalid project ID" }, 400);
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
  const parsed = priceInput.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid model price" }, 400);
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) return c.json({ error: "project not found" }, 404);
  const [item] = await db.insert(modelPrices).values({ projectId, ...parsed.data }).onConflictDoUpdate({
    target: [modelPrices.projectId, modelPrices.provider, modelPrices.model],
    set: { inputPerMillion: parsed.data.inputPerMillion, outputPerMillion: parsed.data.outputPerMillion, cachedInputPerMillion: parsed.data.cachedInputPerMillion, updatedAt: new Date() },
  }).returning();
  return c.json({ item });
});

projectRoutes.delete("/projects/:id/prices", async (c) => {
  const projectId = c.req.param("id");
  if (!uuid.safeParse(projectId).success) return c.json({ error: "invalid project ID" }, 400);
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
  const parsed = priceIdentity.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid model price" }, 400);
  const [row] = await db.delete(modelPrices).where(and(eq(modelPrices.projectId, projectId), eq(modelPrices.provider, parsed.data.provider), eq(modelPrices.model, parsed.data.model))).returning({ projectId: modelPrices.projectId });
  return row ? c.body(null, 204) : c.json({ error: "model price not found" }, 404);
});

projectRoutes.get("/projects/:id/keys", async (c) => {
  const projectId = c.req.param("id");
  if (!uuid.safeParse(projectId).success) return c.json({ error: "invalid project ID" }, 400);
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) return c.json({ error: "project not found" }, 404);
  const items = await db.select({ id: apiKeys.id, keyPrefix: apiKeys.keyPrefix, kind: apiKeys.kind, createdAt: apiKeys.createdAt })
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

projectRoutes.delete("/projects/:id", async (c) => {
  const projectId = c.req.param("id");
  if (!uuid.safeParse(projectId).success) return c.json({ error: "invalid project ID" }, 400);
  const deleted = await db.transaction(async (tx) => {
    const [project] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).for("update");
    if (!project) return false;
    await tx.delete(traces).where(eq(traces.projectId, projectId));
    await tx.delete(modelPrices).where(eq(modelPrices.projectId, projectId));
    await tx.delete(apiKeys).where(eq(apiKeys.projectId, projectId));
    await tx.delete(projects).where(eq(projects.id, projectId));
    return true;
  });
  return deleted ? c.body(null, 204) : c.json({ error: "project not found" }, 404);
});

projectRoutes.post("/projects/:id/keys", async (c) => {
  const projectId = c.req.param("id");
  if (!uuid.safeParse(projectId).success) return c.json({ error: "invalid project ID" }, 400);
  let body: unknown;
  try { const text = await c.req.text(); body = text ? JSON.parse(text) : {}; } catch { return c.json({ error: "invalid JSON" }, 400); }
  const input = keyInput.safeParse(body);
  if (!input.success) return c.json({ error: "invalid key kind" }, 400);
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) return c.json({ error: "project not found" }, 404);

  const issued = issueKey();
  const [row] = await db.insert(apiKeys).values({ projectId, keyHash: issued.keyHash, keyPrefix: issued.keyPrefix, kind: input.data.kind }).returning({ id: apiKeys.id });
  return c.json({ id: row.id, ...(input.data.kind === "read" ? { readKey: issued.key } : { writeKey: issued.key }) }, 201);
});

projectRoutes.delete("/keys/:id", async (c) => {
  const id = c.req.param("id");
  if (!uuid.safeParse(id).success) return c.json({ error: "invalid key ID" }, 400);
  const [row] = await db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt))).returning({ id: apiKeys.id });
  if (!row) return c.json({ error: "key not found or already revoked" }, 404);
  return c.body(null, 204);
});
