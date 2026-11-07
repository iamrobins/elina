import { notFound } from "next/navigation";
import { projectPageSchema } from "@/lib/contracts";
import { elinaApi } from "@/server/elina-api";
import { KeyControl } from "./key-control";
import { ThemeControl } from "./theme-control";
import { PriceControl } from "./price-control";
import { DeleteProject } from "./delete-project";

export default async function Settings({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [response, catalogResponse] = await Promise.all([elinaApi("/api/projects"), elinaApi("/api/prices/catalog")]);
  if (!response.ok || !catalogResponse.ok) throw new Error("Settings unavailable");
  const catalog: { version: string; items: { provider: string; model: string; inputPerMillion: string; outputPerMillion: string; cachedInputPerMillion: string | null }[] } = await catalogResponse.json();
  const project = projectPageSchema.parse(await response.json()).items.find((item) => item.id === projectId);
  if (!project) notFound();
  return <><div className="page-heading"><div><div className="eyebrow">PROJECT SETTINGS</div><h1>Settings</h1><p>Project details and access.</p></div></div>
    <div className="settings-stack"><section className="panel settings-panel"><h2>Project</h2><dl className="settings-facts"><dt>Name</dt><dd>{project.name}</dd><dt>Project ID</dt><dd className="mono">{project.id}</dd><dt>Retention</dt><dd>{project.retentionDays} days</dd></dl><p className="muted">Retention is read-only until the backend supports updates.</p></section>
    <section className="panel settings-panel"><h2>Access keys</h2><p>Ingestion keys send traces. MCP read keys let agents inspect this project's metrics and traces at <code>/mcp</code>. Each full key appears once.</p><KeyControl projectId={projectId} /></section>
    <section className="panel settings-panel"><h2>Model prices</h2><PriceControl projectId={projectId} catalog={catalog} /></section>
    <section className="panel settings-panel"><h2>Display</h2><ThemeControl /></section>
    <section className="panel settings-panel"><h2>Delete project</h2><p>Permanently removes this project's traces, access keys, and model prices.</p><DeleteProject projectId={projectId} name={project.name} /></section></div>
  </>;
}

