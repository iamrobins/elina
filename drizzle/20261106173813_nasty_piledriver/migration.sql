ALTER TABLE "traces" ADD COLUMN "feedback_verdict" text;--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "feedback_note" text;--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "feedback_at" timestamp with time zone;