"use client";
import { useState } from "react";

export function DeleteProject({ projectId, name }: { projectId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (!window.confirm(`Delete "${name}"? This permanently removes its traces, ingestion keys, and model prices. This cannot be undone.`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/bff/projects/${projectId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete project");
      window.location.assign("/");
    } catch { setError("Could not delete project. Try again."); setBusy(false); }
  }
  return <><button type="button" className="ghost-button delete-project-button" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Delete project"}</button>{error && <p role="alert" className="error-text">{error}</p>}</>;
}
