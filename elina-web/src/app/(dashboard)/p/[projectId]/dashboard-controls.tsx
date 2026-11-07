"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

export function DashboardControls({ projects, currentId }: { projects: { id: string; name: string }[]; currentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <>
    <label className="sr-only" htmlFor="project-switcher">Project</label>
    <select id="project-switcher" className="project-switcher" value={currentId} onChange={(event) => router.push(`/p/${event.target.value}/overview`)}>
      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select>
    <button className="signout" disabled={busy} onClick={async () => {
      setBusy(true);
      const response = await fetch("/api/session", { method: "DELETE" });
      if (response.ok) window.location.assign("/login"); else setBusy(false);
    }}><LogOut size={16} aria-hidden="true" /> Sign out</button>
  </>;
}

