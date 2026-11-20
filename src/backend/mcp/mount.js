import rateLimit from "express-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { mcpAuth } from "./mcpAuth.js";
import { runOrchestrator } from "../agents/orchestrator.js";
import { getAgentTrace } from "../agents/agentRunsLog.js";
import { log } from "../utils/logger.js";

import { createPlanningJobs } from "./planningJobs.js";
import { ITINERARY_RESOURCE_URI, itineraryWebsiteOrigin, registerItineraryResource } from "./itineraryResource.js";
import { planTripTool, searchPlacesTool } from "../../shared/agentTools.js";
import { sanitizeString, validateTripData } from "../utils/sanitize.js";

const job_id = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const place_id = z.string().min(1).max(255);
const placeSchema = z.object({
  name: z.string(), place_id, category: z.string(), rating: z.number().nullable(),
  hours: z.array(z.string()).nullable(), business_status: z.string().nullable(), photo_reference: z.string().nullable(),
});
const planSchema = z.object({
  schema_version: z.literal(1), status: z.enum(["pending", "ready", "failed"]), job_id, destination: z.string(),
  days: z.array(z.object({ day: z.number().int(), date: z.iso.date(), stops: z.array(placeSchema.extend({
    start_time: z.string(), duration_minutes: z.number().positive(), locked: z.boolean(),
  })) })),
  message: z.string().optional(), runId: z.string().optional(), open_url: z.url().optional(),
  packingList: z.unknown().optional(), safety: z.unknown().optional(),
});
const annotations = { readOnlyHint: true, destructiveHint: false };
const ui = { ui: { resourceUri: ITINERARY_RESOURCE_URI } };

function result(structuredContent, text = JSON.stringify(structuredContent)) {
  return { structuredContent, content: [{ type: "text", text }] };
}

function planResult(plan) {
  if (plan.status === "failed") return { ...result(plan, plan.message), isError: true };
  if (plan.status === "pending") {
    return result(plan, `Planning ${plan.destination}. Call get_trip_status with job_id ${plan.job_id} in a few seconds.`);
  }
  const lines = [plan.destination];
  for (const day of plan.days) {
    lines.push(`Day ${day.day} (${day.date})`);
    for (const stop of day.stops) lines.push(`  ${stop.start_time} · ${stop.name} · ${stop.duration_minutes} min${stop.locked ? " · locked" : ""} (${stop.category}, ${stop.place_id})`);
  }
  lines.push(`Job ID: ${plan.job_id}`, `Open in SproutRoute: ${plan.open_url}`);
  return result(plan, lines.join("\n"));
}

function buildMcpServer(jobs, getAgentTraceFn) {
  const server = new McpServer({ name: "sproutroute-orchestrator", version: "2.0.0" });
  registerItineraryResource(server);
  server.registerTool(planTripTool.name, {
    description: planTripTool.description, annotations, _meta: ui, outputSchema: planSchema, inputSchema: z.fromJSONSchema(planTripTool.inputSchema),
  }, async args => {
    const input = { ...args, destination: sanitizeString(args.destination, 200),
      activities: (args.activities || []).map(value => sanitizeString(value, 100)).filter(Boolean),
      children: args.children || [], pets: (args.pets || []).map(pet => ({...pet,
        breed: sanitizeString(pet.breed, 80), name: sanitizeString(pet.name, 80)})) };
    const errors = validateTripData(input, {requireActivities: false});
    if (errors.length) throw new Error(errors.join(" "));
    return planResult(await jobs.start(input));
  });
  server.registerTool("get_trip_status", {
    description: "Check a family itinerary job. Pending jobs can be polled every three seconds.", annotations, _meta: ui, outputSchema: planSchema, inputSchema: {job_id},
  }, async args => planResult(jobs.status(args.job_id)));
  server.registerTool("get_attraction", {
    description: "Read live Places details, hours, rating, business status and photo reference for a verified candidate in this trip.",
    annotations, outputSchema: placeSchema, inputSchema: {job_id, place_id},
  }, async args => result(await jobs.attraction(args.job_id, args.place_id)));
  server.registerTool(searchPlacesTool.name, {
    description: searchPlacesTool.description, annotations, inputSchema: z.fromJSONSchema(searchPlacesTool.inputSchema),
  }, async args => result({places: jobs.search(args.job_id, args.query)}));
  server.registerTool("set_stop_lock", {
    description: "Lock a favorite stop to keep it on the itinerary, or unlock it to allow a swap.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, _meta: ui, outputSchema: planSchema,
    inputSchema: {job_id, day: z.number().int().min(1).max(7), place_id, locked: z.boolean()},
  }, async args => planResult(jobs.setLock(args.job_id, args.day, args.place_id, args.locked)));
  server.registerTool("suggest_alternative", {
    description: "Replace a stop in the temporary itinerary with an unused verified place in its category, open during the same time slot.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }, _meta: ui, outputSchema: planSchema,
    inputSchema: {job_id, day: z.number().int().min(1).max(7), place_id},
  }, async args => planResult(await jobs.swap(args.job_id, args.day, args.place_id)));
  server.registerTool("get_agent_trace", {
    description: "Read the ordered agent handoff trace for a completed trip run.",
    annotations, inputSchema: {runId: z.string().min(1).max(128)},
  }, async ({runId}) => {
    try { return result({ trace: await getAgentTraceFn(runId) }); }
    catch { throw new Error("Trip trace is unavailable."); }
  });
  return server;
}

export function mountMcpRoutes(app, deps = {}) {
  if (process.env.MCP_ENABLED === "false") return;
  const configuredTimeout = Number(process.env.MCP_PLAN_TIMEOUT_MS);
  const jobs = createPlanningJobs({
    run: (input, options) => (deps.runOrchestratorFn || runOrchestrator)(input, {...deps, ...options}),
    websiteOrigin: itineraryWebsiteOrigin, details: deps.placeDetailsFn, waitMs: deps.mcpWaitMs,
    timeoutMs: configuredTimeout > 0 ? Math.min(configuredTimeout, 180000) : 90000,
  });
  const limit = (max, skip) => rateLimit({
    windowMs: 60 * 60_000, max, skip, standardHeaders: true, legacyHeaders: false,
    // The demo has one shared credential. Never use its spelling or raw secret as a key.
    keyGenerator: () => "planning-connector",
    handler: (req, res) => res.status(429).json({ jsonrpc: "2.0", id: null, error: {code: -32000, message: "Connector rate limit reached. Try again later."} }),
  });
  const skipExcept = names => req => req.body?.method !== "tools/call" || !names.includes(req.body.params?.name);
  app.get("/api/v1/mcp/itinerary/view", rateLimit({windowMs: 60000, max: 60}), (req, res) => {
    res.set({"Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"});
    try { res.json(jobs.handoff(req.get("x-trip-share-token"))); }
    catch { res.status(404).json({code: "SHARE_UNAVAILABLE", message: "This itinerary is unavailable or has expired."}); }
  });
  app.get("/mcp", (req, res) => res.set("Allow", "POST").sendStatus(405));
  const meterKind = kind => deps.meterMcp?.(kind) || ((req, res, next) => next());
  const meterPlan = meterKind("plan");
  const meterPlaces = meterKind("places");
  const meterTool = (req, res, next) => {
    if (!skipExcept(["plan_trip"])(req)) return meterPlan(req, res, next);
    if (!skipExcept(["get_attraction", "suggest_alternative"])(req)) return meterPlaces(req, res, next);
    next();
  };
  function requireEnvelope(req, res, next) {
    if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) return next();
    return res.status(400).json({jsonrpc: "2.0", id: null, error: {code: -32600, message: "Send one JSON-RPC request per HTTP request."}});
  }
  app.post("/mcp", mcpAuth, requireEnvelope, limit(1800), limit(10, skipExcept(["plan_trip"])), limit(60, skipExcept(["get_attraction", "suggest_alternative"])), meterTool, async (req, res) => {
    const server = buildMcpServer(jobs, deps.getAgentTraceFn || getAgentTrace);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      log.error("mcp:request-failed", { error: error.message });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
      transport.close();
      server.close();
    }
  });
}
