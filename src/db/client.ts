import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { parseEnv } from "../config/env";

const env = parseEnv(process.env);

export const sql = new SQL({
  url: env.DATABASE_URL,
  max: 10,
  idleTimeout: 30,
  connectionTimeout: 5,
});

export const db = drizzle({ client: sql });
