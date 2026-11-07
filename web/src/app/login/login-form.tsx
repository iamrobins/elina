"use client";
import { useState } from "react";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <form onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (!response.ok) { setError(response.status === 429 ? "Too many attempts. Try again in a minute." : "Invalid password."); return; }
      window.location.assign("/");
    } catch { setError("Could not connect. Try again."); } finally { setBusy(false); }
  }}>
    <label htmlFor="password">Password</label>
    <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
    {error && <p role="alert" className="error-text">{error}</p>}
    <button disabled={busy} type="submit" className="primary-button">{busy ? "Signing in…" : "Sign in"}</button>
  </form>;
}

