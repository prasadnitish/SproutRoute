import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/backend/server.js";

async function postMcp(port, token, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path: "/mcp",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          "Content-Length": Buffer.byteLength(payload),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

const initializeRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0" },
  },
};

test("POST /mcp rejects requests without a valid token", async () => {
  process.env.MCP_DEMO_TOKEN = "test-demo-token";
  const app = createApp({ enableRequestLogging: false });
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const res = await postMcp(port, "wrong-token", initializeRequest);
    assert.equal(res.statusCode, 401);
  } finally {
    server.close();
    delete process.env.MCP_DEMO_TOKEN;
  }
});

test("POST /mcp is disabled entirely when MCP_ENABLED=false", async () => {
  process.env.MCP_DEMO_TOKEN = "test-demo-token";
  process.env.MCP_ENABLED = "false";
  const app = createApp({ enableRequestLogging: false });
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const res = await postMcp(port, "test-demo-token", initializeRequest);
    assert.equal(res.statusCode, 404);
  } finally {
    server.close();
    delete process.env.MCP_DEMO_TOKEN;
    delete process.env.MCP_ENABLED;
  }
});

test("POST /mcp initializes successfully with a valid token", async () => {
  process.env.MCP_DEMO_TOKEN = "test-demo-token";
  const app = createApp({ enableRequestLogging: false });
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const res = await postMcp(port, "test-demo-token", initializeRequest);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes('"protocolVersion"'));
  } finally {
    server.close();
    delete process.env.MCP_DEMO_TOKEN;
  }
});

test("plan_trip tool call runs the orchestrator via injected deps", async () => {
  process.env.MCP_DEMO_TOKEN = "test-demo-token";
  const app = createApp({
    enableRequestLogging: false,
    runOrchestratorFn: async (input) => ({
      runId: "fixed-run-id",
      destination: input.destination,
      trip: { overview: "Mock trip" },
      packingList: { categories: [] },
      safety: { status: "unavailable", reason: "no children or pets" },
    }),
  });
  const server = app.listen(0);
  try {
    const port = server.address().port;
    await postMcp(port, "test-demo-token", initializeRequest);
    const toolCallRes = await postMcp(port, "test-demo-token", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "plan_trip",
        arguments: { destination: "Portland, OR", startDate: "2026-08-01", endDate: "2026-08-04" },
      },
    });
    assert.equal(toolCallRes.statusCode, 200);
    assert.ok(toolCallRes.body.includes("Mock trip"));
    assert.ok(toolCallRes.body.includes("fixed-run-id"));
  } finally {
    server.close();
    delete process.env.MCP_DEMO_TOKEN;
  }
});
