import test from "node:test";
import assert from "node:assert/strict";
import { mcpAuth } from "../../src/backend/mcp/mcpAuth.js";

function mockReqRes(authHeader) {
  const req = { headers: { authorization: authHeader } };
  let statusCode = null;
  let body = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; },
  };
  return { req, res, getResult: () => ({ statusCode, body }) };
}

test("mcpAuth rejects a missing Authorization header", () => {
  process.env.MCP_DEMO_TOKEN = "secret-token";
  const { req, res, getResult } = mockReqRes(undefined);
  let nextCalled = false;
  mcpAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(getResult().statusCode, 401);
});

test("mcpAuth rejects an incorrect token", () => {
  process.env.MCP_DEMO_TOKEN = "secret-token";
  const { req, res, getResult } = mockReqRes("Bearer wrong-token");
  let nextCalled = false;
  mcpAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(getResult().statusCode, 401);
});

test("mcpAuth accepts the correct token and calls next", () => {
  process.env.MCP_DEMO_TOKEN = "secret-token";
  const { req, res } = mockReqRes("Bearer secret-token");
  let nextCalled = false;
  mcpAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  delete process.env.MCP_DEMO_TOKEN;
});

test("mcpAuth rejects a same-length incorrect token", () => {
  process.env.MCP_DEMO_TOKEN = "secret-token";
  const { req, res, getResult } = mockReqRes("Bearer secret-tokeX"); // same length as "secret-token", last char differs
  let nextCalled = false;
  mcpAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(getResult().statusCode, 401);
  delete process.env.MCP_DEMO_TOKEN;
});
