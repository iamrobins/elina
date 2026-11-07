import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { projectPageSchema, uuid } from "@/lib/contracts";
import { elinaApi } from "@/server/elina-api";
import { isAuthenticated } from "@/server/session";
import { DashboardControls } from "./dashboard-controls";

export default async function ProjectLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ projectId: string }>;
}) {
  if (!await isAuthenticated()) redirect("/login");
  const { projectId } = await params;
  if (!uuid.safeParse(projectId).success) notFound();
  const response = await elinaApi("/api/projects");
  if (!response.ok) throw new Error("Projects unavailable");
  const projects = projectPageSchema.parse(await response.json()).items;
  const project = projects.find((item) => item.id === projectId);
  if (!project) notFound();
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand">elina<span>.</span></Link>
      <div className="workspace-label">WORKSPACE</div>
      <DashboardControls projects={projects} currentId={projectId} />
      <nav className="main-nav" aria-label="Main navigation">
        <Link href={`/p/${projectId}/overview`}>▦ <span>Overview</span></Link>
        <Link href={`/p/${projectId}/traces`}>≡ <span>Traces</span></Link>
        <Link href={`/p/${projectId}/settings`}>⚙ <span>Settings</span></Link>
      </nav>
    </aside>
    <div className="main-area"><header className="topbar"><span className="top-project">{project.name}</span><span className="top-subtitle">Developer observability</span></header><main className="content">{children}</main></div>
  </div>;
}

