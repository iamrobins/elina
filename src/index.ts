import { app } from "./app";
import { parseEnv } from "./config/env";
import { sql } from "./db/client";

const { PORT } = parseEnv(process.env);

Bun.serve({ port: PORT, fetch: app.fetch });
console.log(JSON.stringify({ event: "server_started", port: PORT }));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await sql.close();
    process.exit(0);
  });
}
