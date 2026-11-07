import { notFound } from "next/navigation";
import { traceId } from "@/lib/contracts";
import { TraceDetail } from "./trace-detail";

export default async function Detail({ params }: { params: Promise<{ projectId: string; traceId: string }> }) {
  const { projectId, traceId: id } = await params;
  if (!traceId.safeParse(id).success) notFound();
  return <TraceDetail projectId={projectId} traceId={id} />;
}

