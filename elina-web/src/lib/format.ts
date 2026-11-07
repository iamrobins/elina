export function duration(ms: number | null | undefined) {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}
export function date(value: string) { return new Date(value).toLocaleString(); }
export function cost(value: string | null | undefined) {
  if (value == null) return "Unknown";
  const amount = Number(value);
  if (amount > 0 && amount < 0.00000001) return "<$0.00000001";
  return `$${amount < 0.01 && amount > 0 ? amount.toFixed(8).replace(/0+$/, "").replace(/\.$/, "") : amount.toFixed(4)}`;
}
export function count(value: string | number | null | undefined) {
  return value == null ? "—" : Number(value).toLocaleString();
}

