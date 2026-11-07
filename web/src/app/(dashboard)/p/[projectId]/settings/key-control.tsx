"use client";
import { useState } from "react";
import { useEffect } from "react";

export function KeyControl({ projectId }: { projectId: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<{ id: string; keyPrefix: string; kind: "write" | "read"; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    const response = await fetch(`/api/bff/projects/${projectId}/keys`, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load keys");
    const body: { items: typeof items } = await response.json();
    setItems(body.items);
  }
  useEffect(() => { refresh().catch(() => setError("Could not load keys.")).finally(() => setLoading(false)); }, [projectId]);
  async function createKey(kind: "write" | "read") {
    setBusy(true); setError(""); setKey(null);
    try {
      const response = await fetch(`/api/bff/projects/${projectId}/keys`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
      if (!response.ok) throw new Error("Could not create key");
      const body: { writeKey?: string; readKey?: string } = await response.json();
      const issued = kind === "read" ? body.readKey : body.writeKey;
      if (!issued) throw new Error("Key missing from response");
      setKey(issued);
      await refresh();
    } catch { setError("Could not create key. Try again."); } finally { setBusy(false); }
  }
  return <div className="key-control"><div className="review-actions"><button className="primary-button compact-button" disabled={busy} onClick={() => createKey("write")}>{busy ? "Creating…" : "Create ingestion key"}</button><button className="ghost-button" disabled={busy} onClick={() => createKey("read")}>Create MCP read key</button></div>
    {error && <p role="alert" className="error-text">{error}</p>}
    {loading ? <p>Loading keys…</p> : items.length ? <div className="key-list">{items.map((item) => <div className="key-row" key={item.id}><span><code>{item.keyPrefix}…</code><small>{item.kind === "read" ? "MCP read" : "Ingestion"} · {new Date(item.createdAt).toLocaleString()}</small></span><button disabled={busy} onClick={async () => {
      if (!window.confirm(`Revoke key ${item.keyPrefix}…? ${item.kind === "read" ? "MCP access" : "Ingestion"} using it will stop.`)) return;
      setBusy(true); setError("");
      try {
        const response = await fetch(`/api/bff/projects/${projectId}/keys/${item.id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Could not revoke key");
        await refresh();
      } catch { setError("Could not revoke key. Try again."); } finally { setBusy(false); }
    }}>Revoke</button></div>)}</div> : <p>No active keys.</p>}
    {key && <div className="key-result"><strong>Copy this key now. It will not be shown again.</strong><code>{key}</code><button onClick={() => navigator.clipboard.writeText(key)}>Copy key</button><button onClick={() => setKey(null)}>Dismiss</button></div>}
  </div>;
}

