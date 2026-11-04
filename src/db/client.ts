import { SQL } from "bun";
import { parseEnv } from "../config/env";

const env = parseEnv(process.env);

export const sql = new SQL({
  url: env.DATABASE_URL,
  max: 10,
  idleTimeout: 30,
  connectionTimeout: 5,
});
