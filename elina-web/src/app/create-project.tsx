"use client";
import { useState } from "react";

export function CreateProject() {
  const [name, setName] = useState("");
  const [result, setResult] = useState<{ project: { id: string }; writeKey: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <form className="create-project" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/bff/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!response.ok) throw new Error("Could not create project");
      setResult(await response.json());
    } catch { setError("Could not create project. Try again."); } finally { setBusy(false); }
  }}><label htmlFor="project-name">Project name</label><input id="project-name" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder="My agent" disabled={!!result} />
    {!result && <button className="primary-button" disabled={busy}>{busy ? "Creating…" : "Create project"}</button>}
    {error && <p role="alert" className="error-text">{error}</p>}
    {result && <div className="key-result"><strong>Copy your ingestion key now. It will not be shown again.</strong><code>{result.writeKey}</code><button type="button" onClick={() => navigator.clipboard.writeText(result.writeKey)}>Copy key</button><a href={`/p/${result.project.id}/overview`}>Continue to dashboard →</a></div>}
  </form>;
}
