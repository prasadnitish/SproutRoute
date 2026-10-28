/**
 * metrics.js — Persistent + in-memory metrics for ops dashboard
 *
 * Writes every metric to Supabase trip_metrics table (survives deploys).
 * Also keeps in-memory rolling window for real-time dashboard.
 * Dashboard reads from Supabase for historical, in-memory for live.
 */

import { getSupabaseAdmin } from "../utils/supabaseClient.js";
import { log } from "../utils/logger.js";
import { bucketTextLength } from "./privacyTelemetry.js";

const MAX_MEMORY = 200;

const mem = {
  trips: [],
  searches: [],
  aiCalls: [],
  errors: [],
  startedAt: new Date().toISOString(),
};

function pushMem(arr, entry) {
  arr.push({ ...entry, ts: new Date().toISOString() });
  if (arr.length > MAX_MEMORY) arr.shift();
}

// Fire-and-forget Supabase insert — never blocks the request
function persistAsync(row) {
  try {
    const admin = getSupabaseAdmin();
    admin.from("trip_metrics").insert(row).then(({ error }) => {
      if (error) log.warn("metrics:persist-fail", { error: error.message });
    });
  } catch { /* Supabase not configured — silently skip */ }
}

export const metrics = {
  recordTrip(data) {
    pushMem(mem.trips, data);
    persistAsync({
      event_type: "trip",
      destination: data.destination,
      duration_days: data.duration,
      child_count: data.childCount || 0,
      pet_count: data.petCount || 0,
      vibe: data.vibe || null,
      timing_json: data.timing || {},
      latency_ms: data.timing?.total || null,
      req_id: data.reqId,
    });
  },

  recordSearch(data) {
    const safeSearch = {
      destination: data.destination,
      textLengthBucket: data.textLengthBucket || bucketTextLength(data.text || ""),
      vibe: data.vibe || null,
      childCount: data.childCount || 0,
      petCount: data.petCount || 0,
      ms: data.ms || null,
    };
    pushMem(mem.searches, safeSearch);
    persistAsync({
      event_type: "search",
      destination: safeSearch.destination,
      search_text: null,
      text_length_bucket: safeSearch.textLengthBucket,
      vibe: safeSearch.vibe,
      child_count: safeSearch.childCount,
      pet_count: safeSearch.petCount,
      latency_ms: safeSearch.ms,
    });
  },

  recordParse(data) { this.recordSearch(data); },

  recordAiCall(data) {
    pushMem(mem.aiCalls, data);
    persistAsync({
      event_type: "ai_call",
      provider: data.provider,
      model: data.model,
      caller: data.caller,
      latency_ms: data.ms || null,
      output_chars: data.outChars || 0,
      success: data.success !== false,
      // timing_json is the existing jsonb column; reusing it avoids a schema change.
      timing_json: Number.isFinite(data.inputTokens) || Number.isFinite(data.outputTokens)
        ? { inputTokens: data.inputTokens ?? null, outputTokens: data.outputTokens ?? null, costUsd: data.costUsd ?? null }
        : null,
    });
  },

  /** Estimated AI spend from stored ai_call rows: today, the last 7 days, per day and per model. */
  async getSpend({ getAdmin = getSupabaseAdmin, now = Date.now, days = 7 } = {}) {
    const empty = { available: false, today: { usd: 0, calls: 0 }, last7Days: { usd: 0, calls: 0 }, byDay: {}, byModel: {} };
    let rows;
    try {
      const since = new Date(now() - days * 86400000).toISOString();
      const { data, error } = await getAdmin()
        .from("trip_metrics")
        .select("created_at, provider, model, timing_json")
        .eq("event_type", "ai_call")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20000);
      if (error) throw new Error(error.message);
      rows = data || [];
    } catch {
      return empty;
    }
    const today = new Date(now()).toISOString().slice(0, 10);
    const spend = { available: true, today: { usd: 0, calls: 0 }, last7Days: { usd: 0, calls: 0 }, byDay: {}, byModel: {}, truncated: rows.length >= 20000 };
    for (const row of rows) {
      const usage = row.timing_json || {};
      const cost = Number.isFinite(usage.costUsd) ? usage.costUsd : null;
      const day = String(row.created_at).slice(0, 10);
      const key = `${row.provider || "?"}/${row.model || "?"}`;
      const model = (spend.byModel[key] ||= { calls: 0, usd: 0, inputTokens: 0, outputTokens: 0, unpricedCalls: 0 });
      model.calls += 1;
      model.inputTokens += usage.inputTokens || 0;
      model.outputTokens += usage.outputTokens || 0;
      spend.last7Days.calls += 1;
      if (day === today) spend.today.calls += 1;
      if (cost === null) {
        model.unpricedCalls += 1;
        continue;
      }
      model.usd = Math.round((model.usd + cost) * 1e6) / 1e6;
      spend.byDay[day] = Math.round(((spend.byDay[day] || 0) + cost) * 1e6) / 1e6;
      spend.last7Days.usd = Math.round((spend.last7Days.usd + cost) * 1e6) / 1e6;
      if (day === today) spend.today.usd = Math.round((spend.today.usd + cost) * 1e6) / 1e6;
    }
    return spend;
  },

  recordError(data) {
    pushMem(mem.errors, data);
    persistAsync({
      event_type: "error",
      error_message: (data.error || "").slice(0, 500),
      req_id: data.reqId,
    });
  },

  recordRequest(data) {
    // Don't persist every request (too noisy) — only errors
    if (data.status >= 500) {
      this.recordError({
        ms: data.ms,
        error: `HTTP ${data.status} on ${data.path}`,
        reqId: data.reqId,
      });
    }
  },

  // ── Dashboard data ──────────────────────────────────────────────────
  async getSnapshot({ getAdmin = getSupabaseAdmin } = {}) {
    // Try Supabase for historical data; fall back to in-memory
    let dbTrips = [], dbSearches = [], dbAiCalls = [], dbErrors = [];
    let dbTimeRange = "in-memory only";

    try {
      const admin = getAdmin();

      const [tripsRes, searchesRes, aiRes, errorsRes] = await Promise.all([
        admin.from("trip_metrics").select("*").eq("event_type", "trip").order("created_at", { ascending: false }).limit(200),
        admin.from("trip_metrics").select("*").eq("event_type", "search").order("created_at", { ascending: false }).limit(200),
        admin.from("trip_metrics").select("*").eq("event_type", "ai_call").order("created_at", { ascending: false }).limit(500),
        admin.from("trip_metrics").select("*").eq("event_type", "error").order("created_at", { ascending: false }).limit(50),
      ]);

      if ([tripsRes, searchesRes, aiRes, errorsRes].some(result => result.error)) throw new Error("Metrics store unavailable");
      dbTrips = tripsRes.data || [];
      dbSearches = searchesRes.data || [];
      dbAiCalls = aiRes.data || [];
      dbErrors = errorsRes.data || [];

      if (dbTrips.length > 0) {
        const oldest = dbTrips[dbTrips.length - 1]?.created_at;
        dbTimeRange = `since ${new Date(oldest).toLocaleDateString()}`;
      }
    } catch {
      // Fall back to in-memory
      dbTrips = [...mem.trips].reverse().map(t => ({ ...t, created_at: t.ts, timing_json: t.timing }));
      dbSearches = [...mem.searches].reverse().map(s => ({
        ...s,
        created_at: s.ts,
        text_length_bucket: s.textLengthBucket,
      }));
      dbAiCalls = [...mem.aiCalls].reverse().map(a => ({ ...a, created_at: a.ts, latency_ms: a.ms, output_chars: a.outChars }));
      dbErrors = [...mem.errors].reverse().map(e => ({ ...e, created_at: e.ts, error_message: e.error }));
      dbTimeRange = "in-memory (Supabase unavailable)";
    }

    // Compute stats from DB data
    const now = Date.now();
    const last24h = (arr) => arr.filter(e => now - new Date(e.created_at).getTime() < 86400000);
    const lastHour = (arr) => arr.filter(e => now - new Date(e.created_at).getTime() < 3600000);

    const trips24h = last24h(dbTrips);
    const tripsHour = lastHour(dbTrips);

    // Latency by stage (from timing_json)
    const latencyByStage = {};
    for (const trip of dbTrips) {
      const timing = trip.timing_json || trip.timing || {};
      for (const [stage, ms] of Object.entries(timing)) {
        if (typeof ms !== "number") continue;
        if (!latencyByStage[stage]) latencyByStage[stage] = [];
        latencyByStage[stage].push(ms);
      }
    }
    const latencyStats = {};
    for (const [stage, values] of Object.entries(latencyByStage)) {
      const sorted = [...values].sort((a, b) => a - b);
      latencyStats[stage] = {
        p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
        p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
        min: sorted[0] || 0,
        max: sorted[sorted.length - 1] || 0,
        avg: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
        count: values.length,
      };
    }

    // Destinations
    const destCounts = {};
    for (const t of dbTrips) {
      const d = t.destination || "unknown";
      destCounts[d] = (destCounts[d] || 0) + 1;
    }
    const topDestinations = Object.entries(destCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 20)
      .map(([name, count]) => ({ name, count }));

    // Segments
    const withKids = dbTrips.filter(t => (t.child_count || t.childCount || 0) > 0).length;
    const withPets = dbTrips.filter(t => (t.pet_count || t.petCount || 0) > 0).length;
    const adultsOnly = dbTrips.filter(t => !(t.child_count || t.childCount) && !(t.pet_count || t.petCount)).length;

    // Vibes
    const vibes = {};
    for (const s of dbSearches) { if (s.vibe) vibes[s.vibe] = (vibes[s.vibe] || 0) + 1; }

    // Model usage
    const modelUsage = {};
    const COST_OUT = { "gemini-2.5-flash": 2.50, "claude-sonnet-4-6": 15.00 };
    const COST_IN = { "gemini-2.5-flash": 0.30, "claude-sonnet-4-6": 3.00 };
    let totalCost = 0;
    for (const call of dbAiCalls) {
      const key = `${call.provider || "?"}/${call.model || "?"}`;
      if (!modelUsage[key]) modelUsage[key] = { calls: 0, totalMs: 0, totalOutChars: 0, errors: 0, callers: {} };
      modelUsage[key].calls++;
      modelUsage[key].totalMs += call.latency_ms || call.ms || 0;
      modelUsage[key].totalOutChars += call.output_chars || call.outChars || 0;
      if (call.success === false) modelUsage[key].errors++;
      const c = call.caller || "unknown";
      modelUsage[key].callers[c] = (modelUsage[key].callers[c] || 0) + 1;
    }
    for (const [key, usage] of Object.entries(modelUsage)) {
      const model = key.split("/").pop();
      const outTokens = usage.totalOutChars / 4;
      const inTokensEst = outTokens * 2;
      usage.estOutputTokens = Math.round(outTokens);
      usage.estInputTokens = Math.round(inTokensEst);
      usage.estCost = parseFloat(((outTokens / 1e6 * (COST_OUT[model] || 5)) + (inTokensEst / 1e6 * (COST_IN[model] || 1))).toFixed(4));
      usage.avgLatency = usage.calls > 0 ? Math.round(usage.totalMs / usage.calls) : 0;
      totalCost += usage.estCost;
    }

    // AI by task
    const aiByTask = {};
    for (const call of dbAiCalls) {
      const c = call.caller || "unknown";
      if (!aiByTask[c]) aiByTask[c] = { calls: 0, totalMs: 0, avgMs: 0, errors: 0 };
      aiByTask[c].calls++;
      aiByTask[c].totalMs += call.latency_ms || call.ms || 0;
      if (call.success === false) aiByTask[c].errors++;
    }
    for (const v of Object.values(aiByTask)) { v.avgMs = v.calls > 0 ? Math.round(v.totalMs / v.calls) : 0; }

    return {
      uptime: mem.startedAt,
      dataSource: dbTimeRange,
      asOf: new Date().toISOString(),

      summary: {
        tripsTotal: dbTrips.length,
        trips24h: trips24h.length,
        tripsLastHour: tripsHour.length,
        totalAiCalls: dbAiCalls.length,
        totalErrors: dbErrors.length,
        estTotalCost: parseFloat(totalCost.toFixed(4)),
      },

      segments: { withKids, withPets, adultsOnly, vibes },
      latencyByStage: latencyStats,
      topDestinations,
      modelUsage,
      aiByTask,
      spend: await this.getSpend({ getAdmin }),

      recentSearches: dbSearches.slice(0, 20).map(s => ({
        ts: s.created_at || s.ts,
        textLengthBucket: s.text_length_bucket || s.textLengthBucket || "unknown",
        destination: s.destination,
        vibe: s.vibe,
        childCount: s.child_count || s.childCount || 0,
        petCount: s.pet_count || s.petCount || 0,
        ms: s.latency_ms || s.ms,
      })),

      recentTrips: dbTrips.slice(0, 15).map(t => ({
        ts: t.created_at || t.ts,
        destination: t.destination,
        duration: t.duration_days || t.duration,
        timing: t.timing_json || t.timing || {},
        childCount: t.child_count || t.childCount || 0,
        petCount: t.pet_count || t.petCount || 0,
        vibe: t.vibe,
      })),

      recentErrors: dbErrors.slice(0, 10).map(e => ({
        ts: e.created_at || e.ts,
        error: e.error_message || e.error,
        reqId: e.req_id || e.reqId,
      })),
    };
  },
};
