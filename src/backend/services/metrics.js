/**
 * metrics.js — Comprehensive in-memory metrics collector for Mission Control
 *
 * Tracks: trips, searches, AI calls, user segments, latency, tokens, costs, errors.
 * Rolling 1000-entry window. Resets on deploy (use Supabase for persistent analytics).
 */

const MAX_ENTRIES = 1000;

const store = {
  trips: [],      // full trip data with timing, destination, segments
  searches: [],   // parse-input raw text + results
  aiCalls: [],    // every AI call with timing + tokens
  errors: [],     // errors with context
  requests: [],   // all API requests
  startedAt: new Date().toISOString(),
};

function push(arr, entry) {
  arr.push({ ...entry, ts: new Date().toISOString() });
  if (arr.length > MAX_ENTRIES) arr.shift();
}

export const metrics = {
  recordTrip(data) { push(store.trips, data); },
  recordSearch(data) { push(store.searches, data); },
  recordParse(data) { push(store.searches, data); }, // alias for backward compat
  recordAiCall(data) { push(store.aiCalls, data); },
  recordError(data) { push(store.errors, data); },
  recordRequest(data) { push(store.requests, data); },

  getSnapshot() {
    const now = Date.now();
    const last24h = (arr) => arr.filter(e => now - new Date(e.ts).getTime() < 86400000);
    const lastHour = (arr) => arr.filter(e => now - new Date(e.ts).getTime() < 3600000);

    const trips = last24h(store.trips);
    const searches = last24h(store.searches);
    const aiCalls = last24h(store.aiCalls);
    const requests = last24h(store.requests);
    const errors = last24h(store.errors);
    const tripsHour = lastHour(store.trips);

    // ── Summary cards ───────────────────────────────────────────────────
    const errorCount = requests.filter(r => r.status >= 500).length;
    const errorRate = requests.length > 0 ? (errorCount / requests.length * 100) : 0;

    // ── Latency by stage ────────────────────────────────────────────────
    const latencyByStage = {};
    for (const trip of trips) {
      if (!trip.timing) continue;
      for (const [stage, ms] of Object.entries(trip.timing)) {
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

    // ── Destinations ────────────────────────────────────────────────────
    const destCounts = {};
    for (const t of trips) {
      const d = t.destination || "unknown";
      destCounts[d] = (destCounts[d] || 0) + 1;
    }
    const topDestinations = Object.entries(destCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count }));

    // ── User segments ───────────────────────────────────────────────────
    const withKids = trips.filter(t => (t.childCount || 0) > 0).length;
    const withPets = trips.filter(t => (t.petCount || 0) > 0).length;
    const adultsOnly = trips.filter(t => (t.childCount || 0) === 0 && (t.petCount || 0) === 0).length;

    // Kid age distribution
    const kidAges = {};
    for (const t of trips) {
      for (const age of (t.childAges || [])) {
        kidAges[age] = (kidAges[age] || 0) + 1;
      }
    }

    // Vibe distribution
    const vibes = {};
    for (const s of searches) {
      if (s.vibe) vibes[s.vibe] = (vibes[s.vibe] || 0) + 1;
    }

    // Pet types
    const petTypes = {};
    for (const t of trips) {
      for (const pt of (t.petTypes || [])) {
        petTypes[pt] = (petTypes[pt] || 0) + 1;
      }
    }

    // Trip duration distribution
    const durations = {};
    for (const t of trips) {
      const d = t.duration || 0;
      const bucket = d <= 3 ? "1-3 days" : d <= 7 ? "4-7 days" : d <= 14 ? "8-14 days" : "15+ days";
      durations[bucket] = (durations[bucket] || 0) + 1;
    }

    // ── Model usage & tokens ────────────────────────────────────────────
    const modelUsage = {};
    let totalOutputTokens = 0;
    let totalInputTokensEst = 0;
    for (const call of aiCalls) {
      const key = `${call.provider}/${call.model}`;
      if (!modelUsage[key]) modelUsage[key] = { calls: 0, totalMs: 0, totalOutChars: 0, errors: 0, callers: {} };
      modelUsage[key].calls++;
      modelUsage[key].totalMs += call.ms || 0;
      modelUsage[key].totalOutChars += call.outChars || 0;
      if (!call.success) modelUsage[key].errors++;
      // Track which callers use this model
      const c = call.caller || "unknown";
      modelUsage[key].callers[c] = (modelUsage[key].callers[c] || 0) + 1;
      totalOutputTokens += (call.outChars || 0) / 4;
    }

    // Cost estimation
    const COST_PER_M_OUT = {
      "gemini-2.5-flash": 2.50,
      "claude-sonnet-4-6": 15.00,
      "deepseek-chat": 1.10,
    };
    const COST_PER_M_IN = {
      "gemini-2.5-flash": 0.30,
      "claude-sonnet-4-6": 3.00,
      "deepseek-chat": 0.27,
    };
    let totalCost = 0;
    for (const [key, usage] of Object.entries(modelUsage)) {
      const model = key.split("/").pop();
      const outTokens = usage.totalOutChars / 4;
      const inTokensEst = outTokens * 2; // rough: input usually 2x output
      const outCostRate = COST_PER_M_OUT[model] || 5.0;
      const inCostRate = COST_PER_M_IN[model] || 1.0;
      usage.estOutputTokens = Math.round(outTokens);
      usage.estInputTokens = Math.round(inTokensEst);
      usage.estCost = parseFloat(((outTokens / 1e6 * outCostRate) + (inTokensEst / 1e6 * inCostRate)).toFixed(4));
      usage.avgLatency = usage.calls > 0 ? Math.round(usage.totalMs / usage.calls) : 0;
      totalCost += usage.estCost;
      totalOutputTokens += outTokens;
      totalInputTokensEst += inTokensEst;
    }

    // ── AI call breakdown by caller ─────────────────────────────────────
    const aiByTask = {};
    for (const call of aiCalls) {
      const c = call.caller || "unknown";
      if (!aiByTask[c]) aiByTask[c] = { calls: 0, totalMs: 0, avgMs: 0, errors: 0 };
      aiByTask[c].calls++;
      aiByTask[c].totalMs += call.ms || 0;
      if (!call.success) aiByTask[c].errors++;
    }
    for (const v of Object.values(aiByTask)) {
      v.avgMs = v.calls > 0 ? Math.round(v.totalMs / v.calls) : 0;
    }

    // ── Search analysis ─────────────────────────────────────────────────
    const searchTexts = searches.slice(-20).reverse().map(s => ({
      ts: s.ts,
      text: (s.text || s.rawText || "").slice(0, 100),
      destination: s.destination,
      vibe: s.vibe,
      childCount: s.childCount,
      petCount: s.petCount,
      ms: s.ms,
    }));

    return {
      uptime: store.startedAt,
      asOf: new Date().toISOString(),

      summary: {
        tripsGenerated: trips.length,
        tripsLastHour: tripsHour.length,
        totalApiCalls: requests.length,
        totalAiCalls: aiCalls.length,
        totalErrors: errorCount,
        errorRate: parseFloat(errorRate.toFixed(1)),
        estTotalCost: parseFloat(totalCost.toFixed(4)),
        estOutputTokens: Math.round(totalOutputTokens),
        estInputTokens: Math.round(totalInputTokensEst),
      },

      segments: {
        withKids,
        withPets,
        adultsOnly,
        kidAges,
        petTypes,
        vibes,
        durations,
      },

      latencyByStage: latencyStats,
      topDestinations,
      modelUsage,
      aiByTask,
      recentSearches: searchTexts,

      recentTrips: trips.slice(-15).reverse().map(t => ({
        ts: t.ts,
        destination: t.destination,
        duration: t.duration,
        timing: t.timing,
        childCount: t.childCount,
        petCount: t.petCount,
        vibe: t.vibe,
      })),

      recentErrors: errors.slice(-10).reverse(),
    };
  },
};
