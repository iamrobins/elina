ALTER TABLE "api_keys" ADD COLUMN "kind" text DEFAULT 'write' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_kind_check" CHECK ("kind" IN ('write', 'read'));