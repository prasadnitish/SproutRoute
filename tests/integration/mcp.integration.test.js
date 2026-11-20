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

const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0,10);
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
      candidates: [{canonical_name: "Mock park", google_place_id: "verified-place", category: "parks", status: "active", verification_status: "verified", lat: 45, lon: -122}],
      scheduledItinerary: [{date: tomorrow, scheduled: [{placeId: "verified-place", grounded: true, status: "scheduled", duration: 60, scheduledStart: "9:00 AM"}]}],
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
        arguments: { destination: "Portland, OR", startDate: tomorrow, endDate: tomorrow },
      },
    });
    assert.equal(toolCallRes.statusCode, 200);
    assert.ok(toolCallRes.body.includes("Mock park"));
    assert.ok(toolCallRes.body.includes("fixed-run-id"));
  } finally {
    server.close();
    delete process.env.MCP_DEMO_TOKEN;
  }
});

test("plan_trip passes a generous timeout to the orchestrator", async () => {
  process.env.MCP_DEMO_TOKEN = "test-demo-token";
  let capturedOpts = null;
  const app = createApp({
    enableRequestLogging: false,
    runOrchestratorFn: async (input, opts) => {
      capturedOpts = opts;
      return { runId: "t", destination: input.destination, trip: {}, packingList: {}, safety: {} };
    },
  });
  const server = app.listen(0);
  try {
    const port = server.address().port;
    await postMcp(port, "test-demo-token", initializeRequest);
    await postMcp(port, "test-demo-token", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "plan_trip",
        arguments: { destination: "Portland, OR", startDate: tomorrow, endDate: tomorrow },
      },
    });
    assert.ok(capturedOpts, "orchestrator should receive an options arg");
    // A real cold plan (geocode + weather + chunked AI itinerary + safety + packing)
    // can exceed the orchestrator's default 30s budget, so the MCP path grants more.
    assert.equal(capturedOpts.timeoutMs, 90000);
  } finally {
    server.close();
    delete process.env.MCP_DEMO_TOKEN;
  }
});

test("get_agent_trace tool call returns the trace via injected deps", async () => {
  process.env.MCP_DEMO_TOKEN = "test-demo-token";
  const app = createApp({
    enableRequestLogging: false,
    getAgentTraceFn: async (runId) => [
      { agent: "itinerary", status: "done", runId },
      { agent: "packing", status: "done", runId },
    ],
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
        name: "get_agent_trace",
        arguments: { runId: "some-id" },
      },
    });
    assert.equal(toolCallRes.statusCode, 200);
    assert.ok(toolCallRes.body.includes("itinerary"));
    assert.ok(toolCallRes.body.includes("some-id"));
  } finally {
    server.close();
    delete process.env.MCP_DEMO_TOKEN;
  }
});

test("plan_trip tool call surfaces a thrown orchestrator error as a graceful MCP tool error", async () => {
  process.env.MCP_DEMO_TOKEN = "test-demo-token";
  const app = createApp({
    enableRequestLogging: false,
    runOrchestratorFn: async () => {
      throw new Error("orchestrator boom");
    },
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
        arguments: { destination: "Portland, OR", startDate: tomorrow, endDate: tomorrow },
      },
    });
    assert.equal(toolCallRes.statusCode, 200);
    assert.ok(toolCallRes.body.includes('"status":"failed"'));
    assert.ok(!toolCallRes.body.includes("orchestrator boom"));
  } finally {
    server.close();
    delete process.env.MCP_DEMO_TOKEN;
  }
});


test("MCP discovery lists the app resource, polling, swaps and shared search tools", async () => {
  process.env.MCP_DEMO_TOKEN = "discovery-token";
  const server = createApp({enableRequestLogging: false}).listen(0);
  try {
    const port = server.address().port;
    for (const [method, items] of [
      ["tools/list", ["get_trip_status","suggest_alternative","set_stop_lock","get_attraction","search_places","ui://sproutroute/itinerary"]],
      ["resources/list", ["ui://sproutroute/itinerary","text/html;profile=mcp-app"]],
    ]) {
      const res = await postMcp(port, "discovery-token", {jsonrpc:"2.0",id:1,method,params:{}});
      assert.equal(res.statusCode, 200);
      for (const item of items) assert.ok(res.body.includes(item), item);
    }
  } finally { server.close(); delete process.env.MCP_DEMO_TOKEN; }
});

test("anonymous planning rejects non-object envelopes before tool dispatch", async () => {
  process.env.MCP_DEMO_TOKEN = "protocol-token";
  const server = createApp({enableRequestLogging: false}).listen(0);
  try {
    const res = await postMcp(server.address().port, "protocol-token", [initializeRequest]);
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.includes("-32600"));
  } finally { server.close(); delete process.env.MCP_DEMO_TOKEN; }
});

test("family, single-day, and toddler itineraries use the web generator, scheduler, and handoff route", async () => {
  process.env.MCP_DEMO_TOKEN = "contract-token";
  const makeDate = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const attractions = ["River Park", "City Museum", "Nature Center"].map((name, i) => ({
    google_place_id: "verified-" + i, canonical_name: name, category: "parks",
    status: "active", verification_status: "verified", lat: 45, lon: -122,
  }));
  const app = createApp({
    enableRequestLogging: false,
    geocodeLocationFn: async () => ({lat:45, lon:-122, countryCode:"US", stateCode:"OR"}),
    getWeatherForecastFn: async () => ({summary:"Mild", forecast:[]}),
    attractionMemoryService: {getPlanningCandidates: async () => attractions},
    generateTripPlanChunkedFn: async (payload, unusedWeather, unusedChunk, options) => {
      assert.equal(options.requireVerifiedPool, true);
      assert.deepEqual(payload.cachedAttractions, attractions);
      const days = 1 + (Date.parse(payload.endDate) - Date.parse(payload.startDate)) / 86400000;
      const suggestedActivities = attractions.slice(0, days).map((row, i) => ({ id: "a" + i,
        name: row.canonical_name, placeId: row.google_place_id, category:"parks", duration:"1 hour", grounded:true }));
      return { suggestedActivities, dailyItinerary: suggestedActivities.map((a, i) => ({day: "Day " + (i+1), activities:[a.id]})) };
    },
    getCarSeatGuidanceFn: async () => ({status:"unavailable"}),
    getTravelAdvisoryFn: async () => null,
    getNeighborhoodSafetyFn: async () => null,
    logAgentSpanFn: async () => {},
    costControl: {meter: () => (req,res,next) => next(), mountDeviceRoutes() {}},
  });
  const server = app.listen(0);
  try {
    const port = server.address().port;
    for (const [days, children] of [[3,[{age:5}]], [1,[]], [1,[{age:2}]]]) {
      const response = await postMcp(port, "contract-token", {jsonrpc:"2.0",id:1,method:"tools/call",
        params:{name:"plan_trip",arguments:{destination:"Portland",startDate:makeDate(1),endDate:makeDate(days),children}}});
      const message = JSON.parse(response.body.split("\n").find(line => line.startsWith("data: ")).slice(6));
      const plan = message.result.structuredContent;
      assert.equal(plan.status, "ready", JSON.stringify(message.result));
      assert.equal(plan.days.length, days);
      assert.equal(plan.days[0].stops[0].duration_minutes, 60);
      const handoffToken = new URL(plan.open_url).hash.slice(5);
      const responseView = await fetch(`http://localhost:${port}/api/v1/mcp/itinerary/view`, {headers:{"x-trip-share-token":handoffToken}});
      assert.equal(responseView.status, 200);
      assert.equal(responseView.headers.get("cache-control"), "no-store");
      assert.equal((await responseView.json()).snapshot.tripData.scheduledItinerary.length, days);
    }
  } finally { server.close(); delete process.env.MCP_DEMO_TOKEN; }
});
