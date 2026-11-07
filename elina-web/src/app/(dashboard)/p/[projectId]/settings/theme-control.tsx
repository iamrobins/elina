"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeControl() {
  const { theme, setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return <label className="theme-control">Theme <select aria-label="Theme" value={ready ? theme : "system"} onChange={(event) => setTheme(event.target.value)} disabled={!ready}><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select></label>;
}
