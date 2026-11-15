import { getSupabaseAdmin } from "../utils/supabaseClient.js";

const TABLE = "request_traces";

/**
 * Keeps completed request traces in Supabase so they survive a deploy.
 * Traces hold timings, statuses and labels only, never request or response content.
 * Writes are fire-and-forget: a slow or failing database never delays or fails a request.
 */
export function createTraceStore({
  enabled = false,
  environment = "production",
  retentionDays = 30,
  maxQueued = 100,
  getSupabaseAdminFn = getSupabaseAdmin,
} = {}) {
  const health = { enabled, persisted: 0, dropped: 0, error: null };
  let queue = Promise.resolve(),
    pending = 0;

  function append(trace) {
    if (!enabled) return;
    if (pending >= maxQueued) {
      health.dropped++;
      return;
    }
    pending++;
    const m = trace.meta;
    queue = queue
      .then(async () => {
        const { error } = await getSupabaseAdminFn().from(TABLE).insert({
          run_id: m.run_id,
          started_at: m.started_at,
          client: m.client ?? null,
          service: m.service ?? null,
          environment: m.environment ?? null,
          build: m.build ?? null,
          duration_ms: Number.isFinite(m.duration_ms) ? Math.round(m.duration_ms) : null,
          trace,
        });
        if (error) throw error;
        health.persisted++;
        health.error = null;
      })
      .catch(() => {
        health.dropped++;
        health.error = "STORE_WRITE_FAILED";
      })
      .finally(() => {
        pending--;
      });
  }

  /** The latest stored traces for this environment, oldest first. */
  async function recent(limit = 100) {
    if (!enabled) return [];
    try {
      const { data, error } = await getSupabaseAdminFn()
        .from(TABLE)
        .select("trace")
        .eq("environment", environment)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data
        .map((row) => row.trace)
        .filter((t) => t?.meta?.schema_version === 1 && Array.isArray(t.spans))
        .reverse();
    } catch {
      health.error = "STORE_READ_FAILED";
      return [];
    }
  }

  async function prune(now = new Date()) {
    if (!enabled) return;
    try {
      const cutoff = new Date(now.getTime() - retentionDays * 86_400_000).toISOString();
      const { error } = await getSupabaseAdminFn().from(TABLE).delete().lt("started_at", cutoff);
      if (error) throw error;
    } catch {
      health.error = "STORE_PRUNE_FAILED";
    }
  }

  return {
    append,
    recent,
    prune,
    flush: () => queue,
    health: () => ({ ...health, pending, retention_days: retentionDays }),
  };
}
