import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ObservationIcon } from "../src/app/(dashboard)/p/[projectId]/traces/[traceId]/observation-icon";

test("supported observation types have distinct icons", () => {
  const types = ["span", "event", "generation", "agent", "tool", "chain", "retriever", "evaluator", "embedding", "guardrail"];
  const icons = types.map((type) => renderToStaticMarkup(createElement(ObservationIcon, { type })));
  expect(new Set(icons).size).toBe(types.length);
  expect(icons.every((icon) => icon.includes("aria-hidden=\"true\""))).toBe(true);
});
