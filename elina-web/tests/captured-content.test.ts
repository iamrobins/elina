import { expect, test } from "bun:test";
import { capturedContent } from "../src/lib/captured-content";

test("shows SDK captured JSON from OTLP string attributes", () => {
  expect(capturedContent({ "elinaobs.input": { stringValue: '{"prompt":"hello"}' }, "input.value": { stringValue: "old" } }, ["elinaobs.input", "input.value"])).toEqual({ prompt: "hello" });
  expect(capturedContent({ "elinaobs.output": { stringValue: '"done"' } }, ["elinaobs.output"])).toBe("done");
  expect(capturedContent({ "gen_ai.prompt": { stringValue: "plain text" } }, ["elinaobs.input", "gen_ai.prompt"])).toBe("plain text");
});
