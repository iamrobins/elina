import { redirect } from "next/navigation";
import { projectPageSchema } from "@/lib/contracts";
import { elinaApi } from "@/server/elina-api";
import { isAuthenticated } from "@/server/session";
import { CreateProject } from "./create-project";

export default async function Home() {
  if (!await isAuthenticated()) redirect("/login");
  const response = await elinaApi("/api/projects");
  if (!response.ok) throw new Error("Projects unavailable");
  const projects = projectPageSchema.parse(await response.json());
  if (projects.items[0]) redirect(`/p/${projects.items[0].id}/overview`);
  return <main className="empty-home"><div className="brand">elina<span>.</span></div><h1>Create your first project</h1><p>A project groups traces and issues an ingestion key for your SDK.</p><CreateProject /></main>;
}

