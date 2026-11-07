import { expect, test } from "bun:test";
import { cost } from "../src/lib/format";

test("shows small model costs without rounding them to zero", () => {
  expect(cost("0.0001004000")).toBe("$0.0001004");
  expect(cost("0.0000000010")).toBe("<$0.00000001");
  expect(cost(null)).toBe("Unknown");
});
