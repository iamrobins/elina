import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "next-themes";

export const metadata: Metadata = { title: "Elina — Traces", description: "LLM trace observability" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>{children}</ThemeProvider></body></html>;
}

