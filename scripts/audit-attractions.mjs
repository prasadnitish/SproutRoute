// Read-only audit of whether itinerary generation really uses the Supabase attractions tables.
//
// Runs the real /api/v1/trip/plan route against production data with three cities and logs:
//   city requested -> DB rows returned -> venue names in the final itinerary.
// Every Supabase write is swallowed (and counted), so the audit leaves no rows behind.
//
// Usage (needs production env; nothing is printed from it):
//   cd <repo with a linked Railway project> && railway run --service SproutRoute -- \
//     node <path>/scripts/audit-attractions.mjs [out.json]
import { writeFileSync } from "node:fs";
import { createApp } from "../src/backend/server.js";
import { getSupabaseAdmin } from "../src/backend/utils/supabaseClient.js";
import {
  areNamesNearDuplicate,
  createAttractionMemoryService,
} from "../src/backend/services/attractionMemory.js";
import { generateTripPlan } from "../src/backend/services/tripPlanAI.js";

const OUT = process.argv[2] || "attractions-audit-runs.json";
const ALL_CASES = [
  { key: "seattle", label: "Seattle (well covered)", destination: "Seattle, WA" },
  { key: "long_tail", label: "Leavenworth, WA (long tail, in DB)", destination: "Leavenworth, WA" },
  { key: "not_in_db", label: "Anchorage, AK (not in DB)", destination: "Anchorage, AK" },
];
const ONLY = (process.env.AUDIT_CASES || "").split(",").map((k) => k.trim()).filter(Boolean);
const CASES = ONLY.length ? ALL_CASES.filter((c) => ONLY.includes(c.key)) : ALL_CASES;
const WRITE_METHODS = new Set(["insert", "update", "upsert", "delete"]);

const state = { queries: [], blockedWrites: [] };
const log = (event, fields = {}) => console.log(JSON.stringify({ event, ...fields }));

// A thenable that accepts any chained call and resolves to an empty, successful result.
function inertWrite(table, method) {
  state.blockedWrites.push({ table, method });
  const stub = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (resolve) => resolve({ data: null, error: null });
      return () => stub;
    },
    apply: () => stub,
  });
  return stub;
}

function trackRead(table, builder, steps) {
  return new Proxy(builder, {
    get(target, prop) {
      if (prop === "then") {
        return (resolve, reject) =>
          target.then((result) => {
            state.queries.push({
              table,
              steps,
              rows: Array.isArray(result?.data) ? result.data.length : result?.data ? 1 : 0,
              error: result?.error?.message || null,
            });
            return resolve(result);
          }, reject);
      }
      const value = target[prop];
      if (typeof value !== "function") return value;
      return (...args) => {
        const next = value.apply(target, args);
        const label = `${String(prop)}(${args.map((a) => (typeof a === "object" ? "{}" : String(a))).join(",")})`;
        return next && typeof next.then === "function" ? trackRead(table, next, [...steps, label]) : next;
      };
    },
  });
}

function readOnlyAdmin() {
  const real = getSupabaseAdmin();
  return {
    from(table) {
      const builder = real.from(table);
      return new Proxy(builder, {
        get(target, prop) {
          if (WRITE_METHODS.has(prop)) return () => inertWrite(table, prop);
          const value = target[prop];
          if (typeof value !== "function") return value;
          return (...args) => {
            const next = value.apply(target, args);
            return next && typeof next.then === "function"
              ? trackRead(table, next, [`${String(prop)}(${args.map((a) => (typeof a === "object" ? "{}" : String(a))).join(",")})`])
              : next;
          };
        },
      });
    },
  };
}

function venueNames(tripPlan) {
  const names = new Map();
  const add = (value, where) => {
    const name = typeof value === "string" ? value : value?.name || value?.title;
    if (name && !names.has(name)) names.set(name, where);
  };
  for (const activity of tripPlan?.suggestedActivities || []) add(activity, "suggestedActivities");
  for (const day of tripPlan?.dailyItinerary || []) {
    for (const activity of day?.activities || []) add(activity, "dailyItinerary");
  }
  return [...names.keys()];
}

const matchesAny = (name, rows) => rows.some((row) => areNamesNearDuplicate(name, row));

async function main() {
  const admin = readOnlyAdmin();
  const realService = createAttractionMemoryService({ getAdmin: () => admin });
  const perCase = new Map();
  let active = null;

  const auditedService = {
    async getPlanningCandidates(params) {
      const before = state.queries.length;
      const candidates = await realService.getPlanningCandidates(params);
      active.candidates = candidates.map((row) => ({
        name: row.canonical_name || row.name,
        city: row.city_display_name || "",
        category: row.category,
        source_type: row.source_type,
        verification_status: row.verification_status,
        google_place_id: Boolean(row.google_place_id),
      }));
      active.asked = { destination: params.destination, maxResults: params.maxResults };
      active.queries = state.queries.slice(before).map((q) => ({ ...q }));
      log("db_candidates", { case: active.key, requested: params.destination, returned: candidates.length, queries: active.queries.length });
      return candidates;
    },
    // Audit runs must not teach the DB anything, so persistence is skipped.
    async persistTripAttractions() {
      active.persistSkipped = true;
    },
  };

  const auditedGenerate = async (tripData, weather) => {
    active.shortlistPassed = (tripData.cachedAttractions || []).length;
    const plan = await generateTripPlan(tripData, weather);
    active.plan = plan;
    return plan;
  };

  const app = createApp({
    attractionMemoryService: auditedService,
    generateTripPlanFn: auditedGenerate,
    enableRequestLogging: false,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const results = [];
  for (const testCase of CASES) {
    active = { key: testCase.key, label: testCase.label };
    perCase.set(testCase.key, active);
    log("city_requested", { case: testCase.key, destination: testCase.destination });
    const started = Date.now();
    const response = await fetch(`${base}/api/v1/trip/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        destination: testCase.destination,
        startDate: "2026-12-19",
        endDate: "2026-12-22",
        activities: ["family-friendly", "parks", "city"],
        childrenAges: [3, 7],
        adults: 2,
      }),
    });
    const body = await response.json().catch(() => ({}));
    const elapsedMs = Date.now() - started;
    const plan = body.tripPlan || active.plan;
    const finalNames = venueNames(plan);

    // Every row stored for the cities the service considered, read straight from the tables.
    const cityRows = await realAllRowsForDestination(testCase.destination);
    const shortlistNames = (active.candidates || []).map((c) => c.name);
    const inShortlist = finalNames.filter((n) => matchesAny(n, shortlistNames));
    const inCityRows = finalNames.filter((n) => matchesAny(n, cityRows));
    const outside = finalNames.filter((n) => !matchesAny(n, cityRows));

    const result = {
      case: testCase.key,
      label: testCase.label,
      http: response.status,
      elapsedMs,
      requestedDestination: testCase.destination,
      dbQueries: active.queries || [],
      candidatesReturned: (active.candidates || []).length,
      shortlistPassedToModel: active.shortlistPassed ?? 0,
      finalVenueCount: finalNames.length,
      finalVenuesInShortlist: inShortlist.length,
      finalVenuesInAnyCityRow: inCityRows.length,
      shareInShortlist: finalNames.length ? Number((inShortlist.length / finalNames.length).toFixed(2)) : null,
      shareInAnyCityRow: finalNames.length ? Number((inCityRows.length / finalNames.length).toFixed(2)) : null,
      venuesNotInDb: outside,
      finalVenues: finalNames,
      candidates: active.candidates || [],
      persistSkipped: Boolean(active.persistSkipped),
    };
    results.push(result);
    log("itinerary_venues", {
      case: testCase.key,
      venues: finalNames.length,
      inShortlist: inShortlist.length,
      inAnyCityRow: inCityRows.length,
      notInDb: outside,
    });
  }

  server.close();
  const summary = { ranAt: new Date().toISOString(), blockedWrites: state.blockedWrites, results };
  writeFileSync(OUT, JSON.stringify(summary, null, 2));
  log("done", { out: OUT, blockedWrites: state.blockedWrites.length });
}

// All stored attraction names for the city (and any city whose name matches the destination's first token).
async function realAllRowsForDestination(destination) {
  const admin = getSupabaseAdmin();
  const token = destination.split(",")[0].trim();
  const { data: cities } = await admin.from("cities").select("id").ilike("city_name", `%${token}%`);
  const ids = (cities || []).map((c) => c.id);
  if (!ids.length) return [];
  const { data } = await admin.from("city_attractions").select("canonical_name").in("city_id", ids);
  return (data || []).map((row) => row.canonical_name);
}

main().catch((error) => {
  console.error(JSON.stringify({ event: "audit_failed", message: error.message }));
  process.exit(1);
});
