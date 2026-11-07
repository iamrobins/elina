import "server-only";
import { z } from "zod";

const configSchema = z.object({
  ELINA_API_INTERNAL_URL: z.url(),
  ELINA_BACKEND_ADMIN_TOKEN: z.string().min(32),
  SESSION_SECRET: z.string().regex(/^[a-f0-9]{64,}$/i),
  DASHBOARD_PASSWORD_HASH: z.string().regex(/^scrypt:[a-f0-9]+:[a-f0-9]{128}$/i),
});

export function config() { return configSchema.parse(process.env); }

