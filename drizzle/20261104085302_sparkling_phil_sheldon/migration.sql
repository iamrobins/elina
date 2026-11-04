CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"project_id" uuid NOT NULL,
	"key_hash" char(64) NOT NULL UNIQUE,
	"key_prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retention_days" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spans" (
	"project_id" uuid,
	"trace_id" char(32),
	"span_id" char(16),
	"parent_span_id" char(16),
	"name" text NOT NULL,
	"as_type" text DEFAULT 'span' NOT NULL,
	"kind" smallint NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_ms" double precision NOT NULL,
	"status" text NOT NULL,
	"status_message" text,
	"model" text,
	"provider" text,
	"input_tokens" bigint,
	"output_tokens" bigint,
	"cost_usd" numeric(18,10),
	"cost_source" text,
	"attributes" jsonb DEFAULT '{}' NOT NULL,
	"resource_attributes" jsonb DEFAULT '{}' NOT NULL,
	"scope" jsonb DEFAULT '{}' NOT NULL,
	"events" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spans_pkey" PRIMARY KEY("project_id","trace_id","span_id")
);
--> statement-breakpoint
CREATE TABLE "traces" (
	"project_id" uuid,
	"trace_id" char(32),
	"name" text NOT NULL,
	"root_span_id" char(16),
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "traces_pkey" PRIMARY KEY("project_id","trace_id")
);
--> statement-breakpoint
CREATE INDEX "spans_project_trace_time_idx" ON "spans" ("project_id","trace_id","started_at","span_id");--> statement-breakpoint
CREATE INDEX "spans_project_time_idx" ON "spans" ("project_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "traces_project_time_idx" ON "traces" ("project_id","started_at" DESC NULLS LAST,"trace_id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id");--> statement-breakpoint
ALTER TABLE "spans" ADD CONSTRAINT "spans_project_id_trace_id_traces_project_id_trace_id_fkey" FOREIGN KEY ("project_id","trace_id") REFERENCES "traces"("project_id","trace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "traces" ADD CONSTRAINT "traces_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id");