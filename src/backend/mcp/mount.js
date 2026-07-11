import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { mcpAuth } from "./mcpAuth.js";
import { runOrchestrator } from "../agents/orchestrator.js";
import { getAgentTrace } from "../agents/agentRunsLog.js";
import { log } from "../utils/logger.js";

function buildMcpLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10, // 10 plan_trip/get_agent_trace calls per hour per token — these trigger real paid LLM calls.
    standardHeaders: true,
    legacyHeaders: false,
    // Must funnel any req.ip fallback through ipKeyGenerator — express-rate-limit
    // v8 validates custom keyGenerators for this and otherwise logs a
    // ValidationError (ERR_ERL_KEY_GEN_IPV6) on every request: an un-normalized
    // IPv6 address lets one client rotate through its /64 block to bypass the
    // per-key limit.
    keyGenerator: (req) => req.headers.authorization || ipKeyGenerator(req.ip),
    handler: (req, res) => {
      res.status(429).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Too many MCP requests. Try again in an hour." },
        id: null,
      });
    },
  });
}

function buildMcpServer({ runOrchestratorFn, getAgentTraceFn }) {
  const server = new McpServer({ name: "sproutroute-orchestrator", version: "1.0.0" }, { capabilities: {} });

  server.registerTool(
    "plan_trip",
    {
      description:
        "Plans a family trip end-to-end: itinerary, packing list, and safety guidance (car seat + pet travel, when applicable).",
      inputSchema: {
        destination: z.string().describe("Destination, e.g. 'Portland, OR'"),
        startDate: z.string().describe("ISO date YYYY-MM-DD"),
        endDate: z.string().describe("ISO date YYYY-MM-DD"),
        children: z.array(z.object({ age: z.number() })).optional().describe("Children traveling, with ages"),
        pets: z
          .array(
            z.object({
              type: z.enum(["dog", "cat", "small_animal"]),
              breed: z.string(),
              weightLbs: z.number(),
              name: z.string().optional(),
            }),
          )
          .optional(),
        activities: z.array(z.string()).optional().describe("Activity slugs, e.g. ['parks', 'hiking']"),
      },
    },
    async (args) => {
      const result = await runOrchestratorFn(args);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    "get_agent_trace",
    {
      description: "Returns the ordered agent handoff trace for a previous plan_trip call.",
      inputSchema: {
        runId: z.string().describe("The runId returned in a prior plan_trip response"),
      },
    },
    async ({ runId }) => {
      const trace = await getAgentTraceFn(runId);
      return { content: [{ type: "text", text: JSON.stringify(trace) }] };
    },
  );

  return server;
}

// Mounts POST /mcp on an existing Express app. Additive only — no changes to
// any other route. Gated by MCP_ENABLED so it can be disabled instantly
// (no redeploy) if the demo token leaks or costs spike.
export function mountMcpRoutes(app, deps = {}) {
  if (process.env.MCP_ENABLED === "false") return;

  const { runOrchestratorFn = runOrchestrator, getAgentTraceFn = getAgentTrace } = deps;
  const mcpLimiter = buildMcpLimiter();

  app.post("/mcp", mcpAuth, mcpLimiter, async (req, res) => {
    const server = buildMcpServer({ runOrchestratorFn, getAgentTraceFn });
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      log.error("mcp:request-failed", { error: error.message });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });
}
