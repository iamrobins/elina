import { expect, test } from "bun:test";
import { parseEnv } from "../src/config/env";

const valid = {
  DATABASE_URL: "postgres://elina:password@localhost:5432/elina",
  ADMIN_TOKEN: "a".repeat(32),
};

test("environment requires a PostgreSQL URL and strong admin token", () => {
  expect(parseEnv(valid).PORT).toBe(3000);
  expect(() => parseEnv({ ...valid, DATABASE_URL: "https://example.com" })).toThrow();
  expect(() => parseEnv({ ...valid, ADMIN_TOKEN: "short" })).toThrow();
  expect(() => parseEnv({ ...valid, PORT: "0" })).toThrow();
});
