import { createHash, randomBytes } from "node:crypto";

export function issueKey() {
  const key = `elina_${randomBytes(32).toString("base64url")}`;
  return {
    key,
    keyHash: createHash("sha256").update(key).digest("hex"),
    keyPrefix: key.slice(0, 14),
  };
}
