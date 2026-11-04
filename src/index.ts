import { app } from "./app";
import { parseEnv } from "./config/env";
import { sql } from "./db/client";
import { pruneExpiredTraces } from "./db/retention";

const { PORT } = parseEnv(process.env);

Bun.serve({ port: PORT, fetch: app.fetch });
console.log(JSON.stringify({ event: "server_started", port: PORT }));

async function runRetention() {
  try {
    const deleted = await pruneExpiredTraces();
    console.log(JSON.stringify({ event: "retention_complete", deleted }));
  } catch {
    console.error(JSON.stringify({ event: "retention_failed" }));
  }
}
void runRetention();
const retentionTimer = setInterval(() => void runRetention(), 24 * 60 * 60 * 1000);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    clearInterval(retentionTimer);
    await sql.close();
    process.exit(0);
  });
}
