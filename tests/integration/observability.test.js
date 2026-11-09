import test from "node:test";
import assert from "node:assert/strict";

// The logger is silent under NODE_ENV=test, which CI sets, and these tests read what it writes. Clear the
// variable before any app module loads; each test file runs in its own process, so nothing else is affected.
delete process.env.NODE_ENV;
const { createApp } = await import("../../src/backend/server.js");
const { log } = await import("../../src/backend/utils/logger.js");
const { planRouteStops } = await import("../../src/backend/services/multiStopPlanner.js");

// Starts the real app on an ephemeral port so middleware, headers and logs are exercised end to end.
async function withApp(deps, run) {
  const server = createApp({ enableRequestLogging: false, ...deps }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// Collects what the logger prints; the logger writes through console outside production.
async function captureLogs(run) {
  const lines = [];
  const originals = { log: console.log, warn: console.warn, error: console.error };
  for (const name of Object.keys(originals)) console[name] = (...args) => lines.push(args.join(" "));
  try {
    const result = await run();
    return { result, lines };
  } finally {
    Object.assign(console, originals);
  }
}

const post = (base, path, body) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("a failing v1 route logs the error name and stack when request logging is off, as in production", async () => {
  const boom = Object.assign(new TypeError("upstream exploded"), { code: "E_UPSTREAM" });
  const { result: status, lines } = await captureLogs(() =>
    withApp({ resolveDestinationQueryFn: async () => { throw boom; } }, async (base) => {
      const res = await post(base, "/api/v1/trip/resolve", { query: "Lisbon" });
      return res.status;
    }),
  );

  assert.equal(status, 500);
  const entry = lines.find((line) => line.includes("v1:trip-resolve-failed"));
  assert.ok(entry, `expected a v1:trip-resolve-failed log line, got:\n${lines.join("\n")}`);
  assert.match(entry, /TypeError/);
  assert.match(entry, /E_UPSTREAM/);
  assert.match(entry, /upstream exploded/);
  assert.match(entry, /observability\.test\.js/, "stack should point at the throwing frame");
});

test("a malformed JSON body gets a structured 400 and a log line, not Express's HTML page", async () => {
  const { result, lines } = await captureLogs(() =>
    withApp({}, async (base) => {
      const res = await fetch(base + "/api/v1/trip/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      });
      return { status: res.status, type: res.headers.get("content-type"), body: await res.json() };
    }),
  );

  assert.equal(result.status, 400);
  assert.match(result.type, /application\/json/);
  assert.equal(result.body.code, "BAD_REQUEST");
  assert.ok(lines.some((line) => line.includes("request:error")), `expected request:error in:\n${lines.join("\n")}`);
});

test("the multi-stop planner logs a scheduler failure instead of swallowing it, and still plans the stop", async () => {
  const stop = { id: "lisbon", name: "Lisbon", displayName: "Lisbon", arrivalDate: "2026-06-01", departureDate: "2026-06-03", nights: 2, dayStart: 1, dayEnd: 2, role: "must_visit" };
  const plan = { overview: "Lisbon", suggestedActivities: [], dailyItinerary: [{ day: "Day 1", activities: [], notes: "" }], tips: [] };
  const { result, lines } = await captureLogs(() =>
    planRouteStops({
      routePlan: { tripShape: "multi_stop", totalDays: 2, stops: [stop], transitLegs: [], warnings: [] },
      baseTrip: { activities: [], children: [], pets: [] },
      geocodeLocationFn: async () => ({ lat: 38.7, lon: -9.1, displayName: "Lisbon, PT", countryCode: "PT" }),
      getWeatherForecastFn: async () => ({ summary: "mild", forecast: [] }),
      generateTripPlanChunkedFn: async (_input, _weather, onChunk) => {
        onChunk(plan, { chunk: 1, totalChunks: 1, dayOffset: 0 });
        return plan;
      },
      scheduleItineraryFn: () => { throw new RangeError("bad slot math"); },
    }),
  );

  assert.equal(result.stopItineraries.lisbon.overview, "Lisbon");
  const entry = lines.find((line) => line.includes("multi-stop:schedule-failed"));
  assert.ok(entry, `expected multi-stop:schedule-failed in:\n${lines.join("\n")}`);
  assert.match(entry, /RangeError/);
});

test("a stream chunk the scheduler cannot handle is logged with the request id and the stream still completes", async () => {
  const { result, lines } = await captureLogs(() =>
    withApp(
      {
        geocodeLocationFn: async () => ({ lat: 38.7, lon: -9.1, displayName: "Lisbon, PT", countryCode: "PT" }),
        getWeatherForecastFn: async () => ({ summary: "mild", forecast: [] }),
        generateTripPlanChunkedFn: async (_input, _weather, onChunk) => {
          onChunk(null, { chunk: 1, totalChunks: 1, dayOffset: 0 });
          return { overview: "x", suggestedActivities: [], dailyItinerary: [], tips: [] };
        },
        attractionMemoryService: { getPlanningCandidates: async () => [], persistPlan: async () => {} },
      },
      async (base) => {
        const res = await fetch(base + "/api/v1/trip/stream", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "text/event-stream" },
          body: JSON.stringify({ destination: "Lisbon, Portugal", startDate: "2026-11-01", endDate: "2026-11-03", activities: ["museums"], adults: 2, childrenAges: [] }),
        });
        return { status: res.status, text: await res.text() };
      },
    ),
  );

  assert.equal(result.status, 200);
  const entry = lines.find((line) => line.includes("stream:schedule-failed"));
  assert.ok(entry, `expected stream:schedule-failed in:\n${lines.join("\n")}`);
  assert.match(entry, /"reqId":"[^"]+"/);
});

test("a failed reverse geocode in parse-input is logged, not silent", async () => {
  const realFetch = globalThis.fetch;
  const { lines } = await captureLogs(() =>
    withApp({}, async (base) => {
      const localFetch = realFetch;
      globalThis.fetch = (url, ...rest) =>
        String(url).includes("nominatim") ? Promise.reject(new TypeError("fetch failed")) : localFetch(url, ...rest);
      try {
        await localFetch(base + "/api/v1/trip/parse-input", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: "weekend trip with a toddler", detectedLat: 47.6, detectedLon: -122.3 }),
        });
      } finally {
        globalThis.fetch = realFetch;
      }
    }),
  );

  assert.ok(lines.some((line) => line.includes("parse-input:geo-failed")), `expected parse-input:geo-failed in:\n${lines.join("\n")}`);
});

test("one request id ties together the response header, the v1 error body, the tracer header and the log lines", async () => {
  const { result, lines } = await captureLogs(() =>
    withApp({}, async (base) => {
      const res = await post(base, "/api/v1/trip/resolve", {});
      return { headers: res.headers, body: await res.json() };
    }),
  );

  const id = result.headers.get("x-request-id");
  assert.match(id, /^[a-f0-9]{32}$/);
  assert.equal(result.body.requestId, id);
  assert.equal(result.headers.get("x-trace-id"), id, "tracer run id and request id should be the same value");
  for (const marker of ["req:start", "req:end"]) {
    const entry = lines.find((line) => line.includes(marker));
    assert.ok(entry?.includes(id), `${marker} should log ${id}, got: ${entry}`);
  }
});

test("a body-parser failure still carries the request id, because it is assigned before the parser runs", async () => {
  const res = await withApp({}, (base) =>
    fetch(base + "/api/v1/trip/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: "{nope" }),
  );
  const body = await res.json();
  assert.equal(body.requestId, res.headers.get("x-request-id"));
  assert.ok(body.requestId);
});

test("a log line written deep in a dependency picks up the request id without being passed it", async () => {
  const { result, lines } = await captureLogs(() =>
    withApp(
      {
        resolveDestinationQueryFn: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          log.info("dependency:probe", { note: "no request id passed" });
          return { destination: "Lisbon" };
        },
      },
      async (base) => (await post(base, "/api/v1/trip/resolve", { query: "Lisbon" })).headers.get("x-request-id"),
    ),
  );

  const probe = lines.find((line) => line.includes("dependency:probe"));
  assert.ok(probe?.includes(result), `expected probe line to include ${result}, got: ${probe}`);
});

const fakeSupabase = (limit) => () => ({ from: () => ({ select: () => ({ limit }) }) });
const getJson = async (base, path) => {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
};

test("readiness reports ok when Supabase answers", async () => {
  const out = await withApp({ getSupabaseAdminFn: fakeSupabase(async () => ({ error: null })) }, (base) => getJson(base, "/api/health/ready"));
  assert.equal(out.status, 200);
  assert.equal(out.body.status, "ok");
  assert.equal(out.body.checks.supabase, "ok");
});

test("readiness returns 503 and logs when Supabase errors, without echoing the error to callers", async () => {
  const { result: out, lines } = await captureLogs(() =>
    withApp({ getSupabaseAdminFn: fakeSupabase(async () => ({ error: { message: "connection refused to 10.0.0.5" } })) }, (base) => getJson(base, "/api/health/ready")),
  );
  assert.equal(out.status, 503);
  assert.equal(out.body.status, "degraded");
  assert.equal(out.body.checks.supabase, "error");
  assert.ok(!JSON.stringify(out.body).includes("10.0.0.5"));
  assert.ok(lines.some((line) => line.includes("health:ready-failed")));
});

test("readiness returns 503 when Supabase does not answer within the timeout", async () => {
  const out = await withApp(
    { healthTimeoutMs: 25, getSupabaseAdminFn: fakeSupabase(() => new Promise(() => {})) },
    (base) => getJson(base, "/api/health/ready"),
  );
  assert.equal(out.status, 503);
  assert.equal(out.body.checks.supabase, "timeout");
});

test("liveness stays a cheap 200 even when Supabase is down, so a database blip cannot fail a deploy", async () => {
  const out = await withApp({ getSupabaseAdminFn: fakeSupabase(async () => ({ error: { message: "down" } })) }, (base) => getJson(base, "/api/health"));
  assert.equal(out.status, 200);
  assert.equal(out.body.status, "ok");
});

test("repeated 500s from real routes raise the http_5xx alert", async () => {
  const { aiAlerts } = await import("../../src/backend/services/aiAlerts.js");
  await captureLogs(() =>
    withApp({ resolveDestinationQueryFn: async () => { throw new Error("down"); } }, async (base) => {
      for (let i = 0; i < 5; i++) await post(base, "/api/v1/trip/resolve", { query: "Lisbon" });
      await new Promise((resolve) => setTimeout(resolve, 20));
    }),
  );
  assert.ok(aiAlerts.snapshot().recentAlerts.some((a) => a.kind === "http_5xx"));
});

const streamDeps = (candidates) => ({
  geocodeLocationFn: async () => ({ lat: 38.7, lon: -9.1, displayName: "Lisbon, PT", countryCode: "PT" }),
  getWeatherForecastFn: async () => ({ summary: "mild", forecast: [] }),
  generateTripPlanChunkedFn: async () => ({ overview: "x", suggestedActivities: [], dailyItinerary: [], tips: [] }),
  attractionMemoryService: { getPlanningCandidates: async () => candidates, persistPlan: async () => {} },
});
const streamTrip = async (base) => {
  const res = await fetch(base + "/api/v1/trip/stream", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({ destination: "Lisbon, Portugal", startDate: "2026-11-01", endDate: "2026-11-03", activities: ["museums"], adults: 2, childrenAges: [] }),
  });
  await res.text();
  return res.headers.get("x-request-id");
};
const candidatesEntry = (lines) => {
  const line = lines.find((l) => l.includes("attractions:candidates"));
  return line && JSON.parse(line.slice(line.indexOf("{")));
};

test("the attraction candidate set is logged under the request id, so a bad plan can be traced to retrieval", async () => {
  const candidates = [
    { canonical_name: "Oceanário de Lisboa", category: "aquarium", verification_status: "verified", why_recommended: "long private text" },
    { canonical_name: "Pavilhão do Conhecimento", category: "museum", verification_status: "unverified" },
  ];
  const { result: id, lines } = await captureLogs(() => withApp(streamDeps(candidates), streamTrip));

  const entry = candidatesEntry(lines);
  assert.ok(entry, `expected attractions:candidates in:\n${lines.join("\n")}`);
  assert.equal(entry.reqId, id);
  assert.equal(entry.count, 2);
  assert.deepEqual(entry.candidates, [
    { name: "Oceanário de Lisboa", category: "aquarium", status: "verified" },
    { name: "Pavilhão do Conhecimento", category: "museum", status: "unverified" },
  ]);
  assert.ok(!JSON.stringify(entry).includes("long private text"), "descriptions are not logged");
});

test("a large candidate set is capped in the log but still counted", async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ canonical_name: `Place ${i}`, category: "park", verification_status: "verified" }));
  const { lines } = await captureLogs(() => withApp(streamDeps(many), streamTrip));
  const entry = candidatesEntry(lines);
  assert.equal(entry.count, 30);
  assert.equal(entry.candidates.length, 20);
});
