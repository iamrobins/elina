import { Activity, Binary, Bot, CircleDot, Link2, ListChecks, Search, ShieldCheck, Sparkles, Wrench } from "lucide-react";

const icons = {
  span: Activity,
  event: CircleDot,
  generation: Sparkles,
  agent: Bot,
  tool: Wrench,
  chain: Link2,
  retriever: Search,
  evaluator: ListChecks,
  embedding: Binary,
  guardrail: ShieldCheck,
};

export function ObservationIcon({ type }: { type: string }) {
  const Icon = icons[type as keyof typeof icons] ?? Activity;
  return <Icon className="observation-type-icon" aria-hidden="true" />;
}
