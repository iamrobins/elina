import { expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.ADMIN_TOKEN ??= "test-admin-token-at-least-32-characters";
const { mcpHandler } = await import("../src/modules/mcp/route");

test("MCP exposes only bounded read tools", async () => {
  const response = await mcpHandler.fetch(new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  }), { authInfo: { token: "", clientId: crypto.randomUUID(), scopes: ["read"] } });
  expect(response.status).toBe(200);
  const text = await response.text();
  const body = JSON.parse(text.startsWith("event:") ? text.match(/^data: (.*)$/m)?.[1] ?? "" : text);
  expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["get_health", "list_traces", "get_trace"]);
  expect(body.result.tools.find((tool: { name: string }) => tool.name === "list_traces").inputSchema.properties).not.toHaveProperty("projectId");
});
