"use client";
import { useEffect, useState } from "react";

type Price = { provider: string; model: string; inputPerMillion: string; outputPerMillion: string; cachedInputPerMillion: string | null };
const empty: Price = { provider: "", model: "", inputPerMillion: "", outputPerMillion: "", cachedInputPerMillion: null };

export function PriceControl({ projectId, catalog }: { projectId: string; catalog: { version: string; items: Price[] } }) {
  const [items, setItems] = useState<Price[]>([]);
  const [form, setForm] = useState<Price>(empty);
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const url = `/api/bff/projects/${projectId}/prices`;
  async function refresh() {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load model prices");
    setItems((await response.json()).items);
  }
  useEffect(() => { refresh().catch(() => setError("Could not load model prices.")); }, [projectId]);
  async function submit(method: "PUT" | "DELETE", value: Price) {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
      if (!response.ok) throw new Error("Could not save model price");
      await refresh();
      if (method === "PUT") { setForm(empty); setEditing(false); setSelected(""); }
    } catch { setError("Could not update model prices. Check the values and try again."); }
    finally { setBusy(false); }
  }
  return <>
    <p>Built-in price snapshot {catalog.version} ships with this Elina build. Select a model to change its price for this project. Overrides apply to new traces only.</p>
    <label className="price-model-select">Model
      <select value={selected} onChange={(event) => {
        const value = event.target.value;
        setSelected(value);
        const bundled = catalog.items.find((item) => `${item.provider}:${item.model}` === value);
        const override = items.find((item) => `${item.provider}:${item.model}` === value);
        setForm(override ?? bundled ?? empty);
        setEditing(Boolean(override));
      }}>
        <option value="">Custom model / choose a model</option>
        {catalog.items.map((item) => <option key={`${item.provider}:${item.model}`} value={`${item.provider}:${item.model}`}>{item.provider} / {item.model}</option>)}
      </select>
    </label>
    {items.length > 0 && <div className="key-list">{items.map((item) => <div className="key-row" key={`${item.provider}:${item.model}`}><span><strong>{item.provider} / {item.model}</strong><small>Per 1M tokens: input ${item.inputPerMillion}, output ${item.outputPerMillion}{item.cachedInputPerMillion && `, cached input $${item.cachedInputPerMillion}`}</small></span><span><button disabled={busy} onClick={() => { setForm(item); setEditing(true); setSelected(catalog.items.some((price) => price.provider === item.provider && price.model === item.model) ? `${item.provider}:${item.model}` : ""); }}>Edit</button><button disabled={busy} onClick={() => { if (window.confirm(`Remove the custom price for ${item.model}?`)) void submit("DELETE", item); }}>Remove</button></span></div>)}</div>}
    <form className="price-form" onSubmit={(event) => { event.preventDefault(); void submit("PUT", form); }}>
      <label>Provider<input required readOnly={editing || !!selected} maxLength={100} placeholder="openai" value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })} /></label>
      <label>Exact model ID<input required readOnly={editing || !!selected} maxLength={200} placeholder="gpt-6-luna" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></label>
      <label>Input / 1M tokens ($)<input required type="number" min="0" step="0.000001" value={form.inputPerMillion} onChange={(event) => setForm({ ...form, inputPerMillion: event.target.value })} /></label>
      <label>Output / 1M tokens ($)<input required type="number" min="0" step="0.000001" value={form.outputPerMillion} onChange={(event) => setForm({ ...form, outputPerMillion: event.target.value })} /></label>
      <label>Cached input / 1M tokens ($)<input type="number" min="0" step="0.000001" placeholder="Same as input" value={form.cachedInputPerMillion ?? ""} onChange={(event) => setForm({ ...form, cachedInputPerMillion: event.target.value || null })} /></label>
      <button className="primary-button compact-button" disabled={busy}>{busy ? "Saving…" : "Save project price"}</button>
      {(editing || selected) && <button type="button" className="ghost-button" onClick={() => { setForm(empty); setEditing(false); setSelected(""); }}>Clear selection</button>}
    </form>
    {error && <p role="alert" className="error-text">{error}</p>}
  </>;
}
