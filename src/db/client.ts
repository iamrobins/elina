import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { parseEnv } from "../config/env";

const env = parseEnv(process.env);

export const sql = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
sql.on("error", (error) => console.error(JSON.stringify({ event: "db_pool_error", errorName: error.name })));

export const db = drizzle({ client: sql });
