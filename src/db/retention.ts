import { sql } from "./client";

export async function pruneExpiredTraces() {
  let deleted = 0;
  while (true) {
    const count = await sql.begin(async (tx) => {
      const [lock] = await tx`SELECT pg_try_advisory_xact_lock(1162627406) AS acquired`;
      if (!lock.acquired) return 0;
      const rows = await tx`DELETE FROM traces WHERE (project_id, trace_id) IN (
        SELECT t.project_id, t.trace_id FROM traces t
        JOIN projects p ON p.id = t.project_id
        WHERE t.started_at < now() - p.retention_days * interval '1 day'
        ORDER BY t.started_at LIMIT 500 FOR UPDATE OF t SKIP LOCKED
      ) RETURNING trace_id`;
      return rows.length;
    });
    deleted += count;
    if (count < 500) return deleted;
  }
}

if (import.meta.main) {
  console.log(JSON.stringify({ deleted: await pruneExpiredTraces() }));
  await sql.close();
}
