import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url().refine((value) => /^postgres(ql)?:\/\//.test(value), "Expected a PostgreSQL URL"),
  ADMIN_TOKEN: z.string().min(32),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export function parseEnv(env: Record<string, string | undefined>) {
  return schema.parse(env);
}
