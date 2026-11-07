import { TraceList } from "./trace-list";

export default async function Traces({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <TraceList projectId={projectId} />;
}

