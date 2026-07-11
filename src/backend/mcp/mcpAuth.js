import crypto from "node:crypto";

function jsonRpcUnauthorized(res) {
  return res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized" },
    id: null,
  });
}

// Constant-time bearer-token check against MCP_DEMO_TOKEN. This endpoint is
// internet-facing and triggers real paid LLM calls, so a timing-safe compare
// matters even for a single shared demo token.
export function mcpAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const expected = process.env.MCP_DEMO_TOKEN || "";

  if (!expected || !token) return jsonRpcUnauthorized(res);

  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expected);
  const valid = tokenBuf.length === expectedBuf.length && crypto.timingSafeEqual(tokenBuf, expectedBuf);

  if (!valid) return jsonRpcUnauthorized(res);
  next();
}
