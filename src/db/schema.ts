import {
  bigint, char, doublePrecision, foreignKey, index, integer, jsonb, numeric,
  pgTable, primaryKey, smallint, text, timestamp, uuid,
} from "drizzle-orm/pg-core";

const time = (name: string) => timestamp(name, { withTimezone: true });

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: time("created_at").defaultNow().notNull(),
  retentionDays: integer("retention_days").notNull().default(30),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  keyHash: char("key_hash", { length: 64 }).notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  createdAt: time("created_at").defaultNow().notNull(),
  revokedAt: time("revoked_at"),
});

export const modelPrices = pgTable("model_prices", {
  projectId: uuid("project_id").notNull().references(() => projects.id),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  inputPerMillion: numeric("input_per_million", { precision: 12, scale: 6 }).notNull(),
  outputPerMillion: numeric("output_per_million", { precision: 12, scale: 6 }).notNull(),
  cachedInputPerMillion: numeric("cached_input_per_million", { precision: 12, scale: 6 }),
  updatedAt: time("updated_at").defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.projectId, table.provider, table.model] })]);

export const traces = pgTable("traces", {
  projectId: uuid("project_id").notNull().references(() => projects.id),
  traceId: char("trace_id", { length: 32 }).notNull(),
  name: text("name").notNull(),
  rootSpanId: char("root_span_id", { length: 16 }),
  startedAt: time("started_at").notNull(),
  endedAt: time("ended_at").notNull(),
  status: text("status").notNull(),
  createdAt: time("created_at").defaultNow().notNull(),
  updatedAt: time("updated_at").defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.traceId] }),
  index("traces_project_time_idx").on(table.projectId, table.startedAt.desc(), table.traceId.desc()),
]);

export const traceReviews = pgTable("trace_reviews", {
  projectId: uuid("project_id").notNull(),
  traceId: char("trace_id", { length: 32 }).notNull(),
  verdict: text("verdict").notNull(),
  note: text("note"),
  reviewedAt: time("reviewed_at").defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.traceId] }),
  foreignKey({ columns: [table.projectId, table.traceId], foreignColumns: [traces.projectId, traces.traceId] }).onDelete("cascade"),
]);

export const spans = pgTable("spans", {
  projectId: uuid("project_id").notNull(),
  traceId: char("trace_id", { length: 32 }).notNull(),
  spanId: char("span_id", { length: 16 }).notNull(),
  parentSpanId: char("parent_span_id", { length: 16 }),
  name: text("name").notNull(),
  asType: text("as_type").notNull().default("span"),
  kind: smallint("kind").notNull(),
  startedAt: time("started_at").notNull(),
  endedAt: time("ended_at").notNull(),
  durationMs: doublePrecision("duration_ms").notNull(),
  status: text("status").notNull(),
  statusMessage: text("status_message"),
  model: text("model"),
  provider: text("provider"),
  inputTokens: bigint("input_tokens", { mode: "bigint" }),
  outputTokens: bigint("output_tokens", { mode: "bigint" }),
  costUsd: numeric("cost_usd", { precision: 18, scale: 10 }),
  costSource: text("cost_source"),
  attributes: jsonb("attributes").notNull().default({}),
  resourceAttributes: jsonb("resource_attributes").notNull().default({}),
  scope: jsonb("scope").notNull().default({}),
  events: jsonb("events").notNull().default([]),
  links: jsonb("links").notNull().default([]),
  createdAt: time("created_at").defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.traceId, table.spanId] }),
  foreignKey({ columns: [table.projectId, table.traceId], foreignColumns: [traces.projectId, traces.traceId] }).onDelete("cascade"),
  index("spans_project_trace_time_idx").on(table.projectId, table.traceId, table.startedAt, table.spanId),
  index("spans_project_time_idx").on(table.projectId, table.startedAt.desc()),
]);
