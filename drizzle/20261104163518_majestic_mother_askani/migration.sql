CREATE TABLE "model_prices" (
	"project_id" uuid,
	"provider" text,
	"model" text,
	"input_per_million" numeric(12,6) NOT NULL,
	"output_per_million" numeric(12,6) NOT NULL,
	"cached_input_per_million" numeric(12,6),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_prices_pkey" PRIMARY KEY("project_id","provider","model")
);
--> statement-breakpoint
ALTER TABLE "model_prices" ADD CONSTRAINT "model_prices_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id");
--> statement-breakpoint
UPDATE "spans" AS s SET
  "cost_usd" = (s."input_tokens" * p.input_rate + s."output_tokens" * p.output_rate) / 1000000,
  "cost_source" = 'catalog:2026-11-04'
FROM (VALUES
  ('gpt-6-luna', 0.10::numeric, 0.50::numeric),
  ('gpt-6.1-sol', 2::numeric, 10::numeric),
  ('gpt-6.1-terra', 1::numeric, 5::numeric),
  ('gpt-6-astra', 10::numeric, 50::numeric)
) AS p(model, input_rate, output_rate)
WHERE s."provider" = 'openai' AND s."model" = p.model AND s."cost_usd" IS NULL
  AND s."input_tokens" IS NOT NULL AND s."output_tokens" IS NOT NULL AND s."input_tokens" <= 272000
  AND NOT (s."attributes" ? 'gen_ai.usage.cache_read.input_tokens')
  AND NOT (s."attributes" ? 'gen_ai.openai.usage.input_tokens_details.cached_tokens')
  AND NOT (s."attributes" ? 'openai.response.service_tier')
  AND NOT (s."attributes" ? 'gen_ai.openai.response.service_tier');
