"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function RangeSelect({ range }: { range: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return <label className="range-select">Time range <select value={range} onChange={(event) => {
    const next = new URLSearchParams(params.toString());
    next.set("range", event.target.value);
    router.push(`${pathname}?${next}`);
  }}><option value="1h">Last hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label>;
}

