/**
 * metrics.js — In-memory metrics collector for ops dashboard
 *
 * Tracks per-request metrics: latency by stage, destinations, model usage, errors.
 * Stored in-memory (resets on deploy). For persistent metrics, use Supabase.
 *
 * Usage:
 *   import { metrics } from "../services/metrics.js";
 *   metrics.recordTrip({ destination, duration, timing, model, children, pets });
 *   metrics.recordParse({ destination, ms, model });
 *   metrics.recordAiCall({ caller, provider, model, ms, outChars, success });
 *   const snapshot = metrics.getSnapshot();
 */

const MAX_ENTRIES = 500; // rolling window

const store = {
  trips: [],        // { ts, destination, duration, timing, model, childCount, petCount, reqId }
  parses: [],       // { ts, destination, ms, model }
  aiCalls: [],      // { ts, caller, provider, model, ms, outChars, success }
  errors: [],       // { ts, path, error, reqId }
  requests: [],     // { ts, method, path, ms, status }
  startedAt: new Date().toISOString(),
};

function push(arr, entry) {
  arr.push({ ...entry, ts: new Date().toISOString() });
  if (arr.length > MAX_ENTRIES) arr.shift();
}

export const metrics = {
  recordTrip(data) { push(store.trips, data); },
  recordParse(data) { push(store.parses, data); },
  recordAiCall(data) { push(store.aiCalls, data); },
  recordError(data) { push(store.errors, data); },
  recordRequest(data) { push(store.requests, data); },

  getSnapshot() {
    const now = Date.now();
    const last24h = (arr) => arr.filter(e => now - new Date(e.ts).getTime() < 86400000);

    const recentTrips = last24h(store.trips);
    const recentAi = last24h(store.aiCalls);
    const recentRequests = last24h(store.requests);
    const recentErrors = last24h(store.errors);

    // Latency by stage
    const latencyByStage = {};
    for (const trip of recentTrips) {
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
        avg: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
        count: values.length,
      };
    }

    // Destinations searched
    const destCounts = {};
    for (const trip of recentTrips) {
      const d = trip.destination || "unknown";
      destCounts[d] = (destCounts[d] || 0) + 1;
    }
    const topDestinations = Object.entries(destCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count }));

    // Model usage & cost estimation
    const modelUsage = {};
    for (const call of recentAi) {
      const key = `${call.provider}/${call.model}`;
      if (!modelUsage[key]) modelUsage[key] = { calls: 0, totalMs: 0, totalChars: 0, errors: 0 };
      modelUsage[key].calls++;
      modelUsage[key].totalMs += call.ms || 0;
      modelUsage[key].totalChars += call.outChars || 0;
      if (!call.success) modelUsage[key].errors++;
    }

    // Rough cost estimation (per 1M tokens, ~4 chars per token)
    const COST_PER_M_OUT = { "gemini/gemini-2.5-flash": 2.50, "anthropic/claude-sonnet-4-6": 15.00 };
    let estimatedCost = 0;
    for (const [key, usage] of Object.entries(modelUsage)) {
      const tokensOut = usage.totalChars / 4;
      const costPerM = COST_PER_M_OUT[key] || 5.0;
      usage.estimatedCost = parseFloat(((tokensOut / 1_000_000) * costPerM).toFixed(4));
      estimatedCost += usage.estimatedCost;
    }

    // Unique users (approximate from unique reqIds)
    const uniqueReqIds = new Set(recentTrips.map(t => t.reqId).filter(Boolean));

    // Error rate
    const errorRate = recentRequests.length > 0
      ? (recentRequests.filter(r => r.status >= 500).length / recentRequests.length * 100).toFixed(1)
      : 0;

    return {
      uptime: store.startedAt,
      summary: {
        tripsGenerated: recentTrips.length,
        uniqueSessions: uniqueReqIds.size,
        totalApiCalls: recentRequests.length,
        totalAiCalls: recentAi.length,
        totalErrors: recentErrors.length,
        errorRate: `${errorRate}%`,
        estimatedCost: `$${estimatedCost.toFixed(4)}`,
      },
      latencyByStage: latencyStats,
      topDestinations,
      modelUsage,
      recentErrors: recentErrors.slice(-10).reverse(),
      recentTrips: recentTrips.slice(-10).reverse().map(t => ({
        ts: t.ts,
        destination: t.destination,
        duration: t.duration,
        timing: t.timing,
        childCount: t.childCount,
        petCount: t.petCount,
      })),
    };
  },
};
