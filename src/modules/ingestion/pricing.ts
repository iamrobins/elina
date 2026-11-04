import type { normalize } from "./normalize";

type Span = ReturnType<typeof normalize>["spans"][number];
type Price = { provider: string; model: string; inputPerMillion: string; outputPerMillion: string; cachedInputPerMillion: string | null; maxInputTokens?: number; updatedAt?: Date };

// Standard short-context USD prices per million tokens, bundled with this build.
export const catalogVersion = "2026-11-04.2";
export const catalog: Price[] = [
  { provider: "openai", model: "gpt-6-luna", inputPerMillion: "0.10", outputPerMillion: "0.50", cachedInputPerMillion: "0.01", maxInputTokens: 272000 },
  { provider: "openai", model: "gpt-6.1-sol", inputPerMillion: "2", outputPerMillion: "10", cachedInputPerMillion: "0.10", maxInputTokens: 272000 },
  { provider: "openai", model: "gpt-6.1-terra", inputPerMillion: "1", outputPerMillion: "5", cachedInputPerMillion: "0.05", maxInputTokens: 272000 },
  { provider: "openai", model: "gpt-6-astra", inputPerMillion: "10", outputPerMillion: "50", cachedInputPerMillion: "1", maxInputTokens: 272000 },
  { provider: "gcp.gemini", model: "gemini-3-flash-preview", inputPerMillion: "0.50", outputPerMillion: "3", cachedInputPerMillion: "0.05" },
  { provider: "gcp.gemini", model: "gemini-3.1-pro-preview", inputPerMillion: "2", outputPerMillion: "12", cachedInputPerMillion: "0.20", maxInputTokens: 200000 },
  { provider: "gcp.gemini", model: "gemini-2.5-flash", inputPerMillion: "0.30", outputPerMillion: "2.50", cachedInputPerMillion: "0.03" },
  { provider: "anthropic", model: "claude-sonnet-4-6", inputPerMillion: "3", outputPerMillion: "15", cachedInputPerMillion: "0.30" },
  { provider: "anthropic", model: "claude-haiku-4-5-20251001", inputPerMillion: "1", outputPerMillion: "5", cachedInputPerMillion: "0.10" },
  { provider: "anthropic", model: "claude-opus-4-5-20251101", inputPerMillion: "5", outputPerMillion: "25", cachedInputPerMillion: "0.50" },
];

function scalar(attrs: Record<string, unknown>, key: string) {
  const value = attrs[key] as Record<string, unknown> | undefined;
  return value?.stringValue ?? value?.intValue ?? value?.doubleValue;
}

function microDollars(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

export function priceSpan(span: Span, overrides: Price[] = []) {
  if (span.costUsd !== null || span.inputTokens === null || span.outputTokens === null || !span.model || !span.provider) return;
  const tier = scalar(span.attributes, "gen_ai.response.service_tier") ?? scalar(span.attributes, "gen_ai.request.service_tier") ?? scalar(span.attributes, "openai.response.service_tier") ?? scalar(span.attributes, "gen_ai.openai.response.service_tier");
  if (tier && tier !== "default" && tier !== "standard") return;
  const override = overrides.find((price) => price.provider === span.provider && price.model === span.model);
  const price = override ?? catalog.find((item) => item.provider === span.provider && item.model === span.model);
  if (!price || (!override && price.maxInputTokens !== undefined && span.inputTokens > BigInt(price.maxInputTokens))) return;
  const cachedValue = scalar(span.attributes, "gen_ai.usage.cache_read.input_tokens") ?? scalar(span.attributes, "gen_ai.openai.usage.input_tokens_details.cached_tokens");
  const cacheWriteValue = scalar(span.attributes, "gen_ai.usage.cache_creation.input_tokens");
  let cached = 0n;
  try {
    cached = cachedValue === undefined ? 0n : BigInt(String(cachedValue));
    if (cacheWriteValue !== undefined && BigInt(String(cacheWriteValue)) !== 0n) return;
  } catch { return; }
  if (cached < 0n || cached > span.inputTokens) return;
  const units = ((span.inputTokens - cached) * microDollars(price.inputPerMillion)
    + cached * microDollars(price.cachedInputPerMillion ?? price.inputPerMillion)
    + span.outputTokens * microDollars(price.outputPerMillion) + 50n) / 100n;
  if (units >= 1_000_000_000_000_000_000n) return;
  span.costUsd = `${units / 10_000_000_000n}.${String(units % 10_000_000_000n).padStart(10, "0")}`;
  span.costSource = override ? `project:${override.updatedAt!.toISOString()}:${price.inputPerMillion}:${price.outputPerMillion}:${price.cachedInputPerMillion ?? price.inputPerMillion}` : `catalog:${catalogVersion}`;
}
