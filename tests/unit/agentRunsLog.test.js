import test from "node:test";
import assert from "node:assert/strict";
import { logAgentSpan, getAgentTrace } from "../../src/backend/agents/agentRunsLog.js";

function mockAdmin(insertedRows, selectResult) {
  return {
    from(table) {
      assert.equal(table, "agent_runs");
      return {
        insert: (row) => {
          insertedRows.push(row);
          return Promise.resolve({ error: null });
        },
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: selectResult, error: null }),
          }),
        }),
      };
    },
  };
}

test("logAgentSpan writes a row with the expected shape", async () => {
  const rows = [];
  await logAgentSpan(
    { runId: "r1", childAgent: "retrieval", status: "ok", latencyMs: 42, edgeSummary: { petCheck: "skipped" } },
    { getSupabaseAdminFn: () => mockAdmin(rows, []) },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].run_id, "r1");
  assert.equal(rows[0].child_agent, "retrieval");
  assert.equal(rows[0].parent_agent, "orchestrator");
  assert.equal(rows[0].status, "ok");
  assert.equal(rows[0].latency_ms, 42);
  assert.deepEqual(rows[0].edge_summary, { petCheck: "skipped" });
});

test("logAgentSpan silently no-ops when Supabase is not configured", async () => {
  await logAgentSpan(
    { runId: "r1", childAgent: "retrieval", status: "ok", latencyMs: 1 },
    { getSupabaseAdminFn: () => { throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set"); } },
  );
  // Must not throw — assertion is simply that we reach this line.
});

test("getAgentTrace returns spans for a run_id ordered by timestamp", async () => {
  const fakeSpans = [
    { span_id: "1", run_id: "r1", child_agent: "retrieval", status: "ok" },
    { span_id: "2", run_id: "r1", child_agent: "itinerary", status: "ok" },
  ];
  const result = await getAgentTrace("r1", { getSupabaseAdminFn: () => mockAdmin([], fakeSpans) });
  assert.equal(result.length, 2);
  assert.equal(result[0].child_agent, "retrieval");
});
