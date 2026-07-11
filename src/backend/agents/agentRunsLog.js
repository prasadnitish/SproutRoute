import { getSupabaseAdmin } from "../utils/supabaseClient.js";
import { log } from "../utils/logger.js";

// Fire-and-forget write, matching services/metrics.js's exact pattern —
// never blocks or throws into the orchestrator, silently no-ops when
// Supabase isn't configured (e.g. local dev without env vars).
export async function logAgentSpan(
  { runId, childAgent, status, latencyMs, edgeSummary = null },
  deps = {},
) {
  const { getSupabaseAdminFn = getSupabaseAdmin } = deps;
  try {
    const admin = getSupabaseAdminFn();
    const { error } = await admin.from("agent_runs").insert({
      run_id: runId,
      parent_agent: "orchestrator",
      child_agent: childAgent,
      status,
      latency_ms: latencyMs,
      edge_summary: edgeSummary,
    });
    if (error) log.warn("agent-runs:persist-fail", { error: error.message, childAgent });
  } catch {
    // Supabase not configured — silently skip, matches metrics.js pattern.
  }
}

// Read path — failures propagate to the caller (the get_agent_trace MCP tool),
// unlike the write path, since a broken trace lookup should be visible.
export async function getAgentTrace(runId, deps = {}) {
  const { getSupabaseAdminFn = getSupabaseAdmin } = deps;
  const admin = getSupabaseAdminFn();
  const { data, error } = await admin
    .from("agent_runs")
    .select("span_id, run_id, parent_agent, child_agent, status, latency_ms, edge_summary, timestamp")
    .eq("run_id", runId)
    .order("timestamp", { ascending: true });
  if (error) throw new Error(`Failed to fetch agent trace: ${error.message}`);
  return data;
}
