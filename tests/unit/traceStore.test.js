import test from "node:test";
import assert from "node:assert/strict";
import { createTraceStore } from "../../src/backend/services/traceStore.js";
import { createTracer } from "../../src/backend/services/tracing.js";

const trace = (runId, startedAt = "2026-11-15T07:00:00.000Z", extra = {}) => ({
  meta: {
    schema_version: 1,
    run_id: runId,
    client: "web",
    service: "sproutroute",
    environment: "production",
    build: "abc123",
    started_at: startedAt,
    duration_ms: 1200,
    ...extra,
  },
  spans: [],
});

// A stand-in for the Supabase client that records each call.
function fakeAdmin({ insertError = null, rows = [], selectError = null, deleteError = null } = {}) {
  const calls = { inserts: [], selects: [], deletes: [] };
  return {
    calls,
    from(table) {
      return {
        insert: async (row) => {
          calls.inserts.push({ table, row });
          return { error: insertError };
        },
        select: (columns) => {
          const q = { table, columns };
          const chain = {
            eq: (col, value) => ((q.eq = [col, value]), chain),
            order: (col, opts) => ((q.order = [col, opts]), chain),
            limit: async (n) => {
              q.limit = n;
              calls.selects.push(q);
              return { data: selectError ? null : rows, error: selectError };
            },
          };
          return chain;
        },
        delete: () => ({
          lt: async (col, value) => {
            calls.deletes.push({ table, col, value });
            return { error: deleteError };
          },
        }),
      };
    },
  };
}

test("append stores one row per trace, with the columns taken from its meta", async () => {
  const admin = fakeAdmin();
  const store = createTraceStore({ enabled: true, getSupabaseAdminFn: () => admin });
  const t = trace("run-1");
  store.append(t);
  await store.flush();
  assert.deepEqual(admin.calls.inserts, [
    {
      table: "request_traces",
      row: {
        run_id: "run-1",
        started_at: "2026-11-15T07:00:00.000Z",
        client: "web",
        service: "sproutroute",
        environment: "production",
        build: "abc123",
        duration_ms: 1200,
        trace: t,
      },
    },
  ]);
  assert.equal(store.health().persisted, 1);
  assert.equal(store.health().error, null);
});

test("a disabled store never touches the database", async () => {
  let asked = 0;
  const store = createTraceStore({ enabled: false, getSupabaseAdminFn: () => (asked++, fakeAdmin()) });
  store.append(trace("run-1"));
  await store.flush();
  assert.deepEqual(await store.recent(), []);
  await store.prune();
  assert.equal(asked, 0);
  assert.equal(store.health().enabled, false);
});

test("a failed insert is counted as dropped and never throws", async () => {
  const store = createTraceStore({ enabled: true, getSupabaseAdminFn: () => fakeAdmin({ insertError: { message: "boom" } }) });
  store.append(trace("run-1"));
  await store.flush();
  assert.equal(store.health().dropped, 1);
  assert.equal(store.health().error, "STORE_WRITE_FAILED");
});

test("a missing Supabase configuration is counted as dropped and never throws", async () => {
  const store = createTraceStore({
    enabled: true,
    getSupabaseAdminFn: () => {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
    },
  });
  store.append(trace("run-1"));
  await store.flush();
  assert.deepEqual(await store.recent(), []);
  assert.equal(store.health().dropped, 1);
  assert.equal(store.health().error, "STORE_READ_FAILED");
});

test("writes beyond the queue limit are dropped, not queued without bound", async () => {
  const admin = fakeAdmin();
  const store = createTraceStore({ enabled: true, maxQueued: 2, getSupabaseAdminFn: () => admin });
  for (const id of ["a", "b", "c"]) store.append(trace(id));
  await store.flush();
  assert.equal(admin.calls.inserts.length, 2);
  assert.equal(store.health().dropped, 1);
});

test("recent returns this environment's latest traces, oldest first, skipping malformed rows", async () => {
  const newer = trace("new", "2026-11-15T08:00:00.000Z");
  const older = trace("old", "2026-11-15T07:00:00.000Z");
  const admin = fakeAdmin({ rows: [{ trace: newer }, { trace: { meta: { schema_version: 2 } } }, { trace: null }, { trace: older }] });
  const store = createTraceStore({ enabled: true, environment: "production", getSupabaseAdminFn: () => admin });
  const out = await store.recent(50);
  assert.deepEqual(out.map((t) => t.meta.run_id), ["old", "new"]);
  assert.deepEqual(admin.calls.selects, [
    { table: "request_traces", columns: "trace", eq: ["environment", "production"], order: ["started_at", { ascending: false }], limit: 50 },
  ]);
});

test("a failed read returns nothing and records the error", async () => {
  const store = createTraceStore({ enabled: true, getSupabaseAdminFn: () => fakeAdmin({ selectError: { message: "boom" } }) });
  assert.deepEqual(await store.recent(), []);
  assert.equal(store.health().error, "STORE_READ_FAILED");
});

test("prune deletes traces older than the retention window", async () => {
  const admin = fakeAdmin();
  const store = createTraceStore({ enabled: true, retentionDays: 30, getSupabaseAdminFn: () => admin });
  await store.prune(new Date("2026-11-15T00:00:00.000Z"));
  assert.deepEqual(admin.calls.deletes, [{ table: "request_traces", col: "started_at", value: "2026-10-16T00:00:00.000Z" }]);
});

test("restored traces go before the ones recorded since boot, without duplicates or exceeding the limit", () => {
  const tracer = createTracer({ limit: 3, initialTraces: [trace("live-1", "2026-11-15T09:00:00.000Z")] });
  tracer.restore([
    trace("stored-1", "2026-11-15T06:00:00.000Z"),
    trace("stored-2", "2026-11-15T07:00:00.000Z"),
    trace("stored-3", "2026-11-15T08:00:00.000Z"),
    trace("live-1", "2026-11-15T09:00:00.000Z"),
  ]);
  assert.deepEqual(tracer.snapshot().map((t) => t.meta.run_id), ["stored-2", "stored-3", "live-1"]);
});
