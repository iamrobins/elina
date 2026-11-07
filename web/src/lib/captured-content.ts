import type { Span } from "./contracts";

export function capturedContent(attributes: Span["attributes"], keys: string[]) {
  const value = keys.map((key) => attributes[key]).find((item) => item != null);
  if (value == null || typeof value !== "object" || !("stringValue" in value)) return value;
  const text = value.stringValue;
  if (typeof text !== "string") return value;
  try { return JSON.parse(text); } catch { return text; }
}
