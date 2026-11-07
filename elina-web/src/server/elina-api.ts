import "server-only";
import { config } from "./config";

export async function elinaApi(path: string, init?: RequestInit) {
  const env = config();
  const response = await fetch(new URL(path, env.ELINA_API_INTERNAL_URL), {
    ...init,
    headers: { Authorization: `Bearer ${env.ELINA_BACKEND_ADMIN_TOKEN}`, ...init?.headers },
    cache: "no-store",
  });
  return response;
}

