import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { apiKeys } from "../../db/schema";

export function issueKey() {
  const key = `elina_${randomBytes(32).toString("base64url")}`;
  return {
    key,
    keyHash: createHash("sha256").update(key).digest("hex"),
    keyPrefix: key.slice(0, 14),
  };
}

export async function projectForKey(authorization: string | undefined, kind: "write" | "read") {
  const bearer = /^Bearer (\S+)$/.exec(authorization ?? "");
  if (!bearer) return null;
  const keyHash = createHash("sha256").update(bearer[1]).digest("hex");
  const [key] = await db.select({ projectId: apiKeys.projectId }).from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.kind, kind), isNull(apiKeys.revokedAt)));
  return key?.projectId ?? null;
}
