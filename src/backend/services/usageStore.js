/**
 * Persistence for App Attest devices and usage counters (migration 033).
 *
 * consume() is one RPC per metered request: it checks every limit and increments every counter, or
 * none. If Supabase is unreachable or slow, it fails open to an in-process counter with the same
 * rules, so an outage weakens the limits for a while instead of taking planning down.
 */
import { getSupabaseAdmin } from "../utils/supabaseClient.js";
import { log, errorFields } from "../utils/logger.js";

const WARN_INTERVAL_MS = 60 * 1000;

const key = (bucket, period) => `${bucket}|${period}`;

function overLimit(item, row) {
  return (item.limitCount != null && row.count + item.incCount > item.limitCount)
    || (item.limitCost != null && row.cost + item.incCost > item.limitCost);
}

/** Same semantics as public.usage_consume, held in memory. */
export function createMemoryUsage() {
  const counters = new Map();
  const signCounts = new Map();
  return {
    consume(items, device) {
      if (device) {
        const previous = Math.max(signCounts.get(device.keyId) ?? 0, device.knownSignCount ?? 0);
        if (!(device.signCount > previous)) return { replay: true, rows: [] };
        signCounts.set(device.keyId, device.signCount);
      }
      const current = items.map((item) => counters.get(key(item.bucket, item.period)) ?? { count: 0, cost: 0, periodStart: item.periodStart });
      const denied = items.map((item, i) => overLimit(item, current[i]));
      if (denied.some(Boolean)) {
        return { replay: false, rows: items.map((item, i) => ({ bucket: item.bucket, period: item.period, ...pick(current[i]), denied: denied[i] })) };
      }
      const rows = items.map((item, i) => {
        const next = { count: current[i].count + item.incCount, cost: current[i].cost + item.incCost, periodStart: item.periodStart };
        counters.set(key(item.bucket, item.period), next);
        return { bucket: item.bucket, period: item.period, ...pick(next), denied: false };
      });
      return { replay: false, rows };
    },
    purge(cutoffDate) {
      for (const [k, row] of counters) if (row.periodStart < cutoffDate) counters.delete(k);
    },
    get size() {
      return counters.size;
    },
  };
}

const pick = ({ count, cost }) => ({ count, cost });

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    // Not unref'd: this timer is the only thing that ends a hung store call, so on an otherwise idle event loop an
    // unref'd one would let the process exit with the call still pending. It is cleared as soon as the race settles.
    timer = setTimeout(() => reject(new Error(`usage store timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createUsageStore({
  getClient = getSupabaseAdmin,
  timeoutMs = 1500,
  logger = log,
  now = Date.now,
  memory = createMemoryUsage(),
} = {}) {
  let lastWarning = -Infinity;
  function unavailable(op, error) {
    if (now() - lastWarning < WARN_INTERVAL_MS) return;
    lastWarning = now();
    logger.error("cost-control:store-unavailable", { op, failOpen: true, ...errorFields(error) });
  }
  const call = (fn) => withTimeout(Promise.resolve().then(fn), timeoutMs);

  return {
    /**
     * items: [{ bucket, period, periodStart, incCount, incCost, limitCount, limitCost }]
     * device: { keyId, signCount, knownSignCount } or null
     * → { replay, rows: [{ bucket, period, count, cost, denied }], degraded }
     */
    async consume(items, device = null) {
      try {
        const { data, error } = await call(() => getClient().rpc("usage_consume", {
          p_items: items.map((i) => ({
            bucket: i.bucket,
            period: i.period,
            period_start: i.periodStart,
            inc_count: i.incCount,
            inc_cost: i.incCost,
            limit_count: i.limitCount ?? null,
            limit_cost: i.limitCost ?? null,
          })),
          p_device_key_id: device?.keyId ?? null,
          p_device_sign_count: device?.signCount ?? null,
        }));
        if (error) throw error;
        const list = Array.isArray(data) ? data : [];
        if (list.some((r) => r.r_replay)) return { replay: true, rows: [], degraded: false };
        if (list.length !== items.length) throw new Error(`usage_consume returned ${list.length} rows for ${items.length} items`);
        return {
          replay: false,
          degraded: false,
          rows: list.map((r) => ({
            bucket: r.r_bucket,
            period: r.r_period,
            count: Number(r.r_count),
            cost: Number(r.r_cost_cents),
            denied: Boolean(r.r_denied),
          })),
        };
      } catch (error) {
        unavailable("consume", error);
        return { ...memory.consume(items, device), degraded: true };
      }
    },

    /** → { publicKeyPem, environment, signCount } or null. Throws when the store cannot answer. */
    async findDevice(keyId) {
      const { data, error } = await call(() => getClient()
        .from("app_attest_devices")
        .select("public_key, environment, sign_count")
        .eq("key_id", keyId)
        .maybeSingle());
      if (error) {
        unavailable("find-device", error);
        throw error;
      }
      return data ? { publicKeyPem: data.public_key, environment: data.environment, signCount: Number(data.sign_count) } : null;
    },

    /** → { status: "created" } | { status: "exists", device } | { status: "conflict" }. Throws when unavailable. */
    async saveDevice({ keyId, publicKeyPem, environment }) {
      const { error } = await call(() => getClient().from("app_attest_devices").insert({
        key_id: keyId,
        public_key: publicKeyPem,
        sign_count: 0,
        environment,
      }));
      if (!error) return { status: "created" };
      if (error.code !== "23505") {
        unavailable("save-device", error);
        throw error;
      }
      const existing = await this.findDevice(keyId);
      if (existing && existing.publicKeyPem.trim() === publicKeyPem.trim()) return { status: "exists", device: existing };
      return { status: "conflict" };
    },

    async purge({ keepDays = 40 } = {}) {
      const cutoff = new Date(now() - keepDays * 86_400_000).toISOString().slice(0, 10);
      memory.purge(cutoff);
      try {
        const { data, error } = await call(() => getClient().rpc("usage_purge", { p_keep_days: keepDays }));
        if (error) throw error;
        return Number(data) || 0;
      } catch (error) {
        unavailable("purge", error);
        return 0;
      }
    },
  };
}
