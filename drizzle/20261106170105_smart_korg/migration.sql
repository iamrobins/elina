CREATE TABLE "trace_reviews" (
	"project_id" uuid,
	"trace_id" char(32),
	"verdict" text NOT NULL,
	"note" text,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trace_reviews_pkey" PRIMARY KEY("project_id","trace_id")
);
--> statement-breakpoint
ALTER TABLE "trace_reviews" ADD CONSTRAINT "trace_reviews_m48ENtDz8y2q_fkey" FOREIGN KEY ("project_id","trace_id") REFERENCES "traces"("project_id","trace_id") ON DELETE CASCADE;