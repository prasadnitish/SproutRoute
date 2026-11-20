import test from "node:test";
import assert from "node:assert/strict";
import { createPlanningJobs } from "../../src/backend/mcp/planningJobs.js";

const input = { destination: "Seattle", startDate: "2026-12-01", endDate: "2026-12-01" };
const row = (id, category = "parks") => ({ google_place_id: id, canonical_name: id, category, status: "active", verification_status: "verified", lat: 47, lon: -122 });
const output = {
  runId: "r", candidates: [row("park-a"), row("museum", "museum"), row("park-b")],
  scheduledItinerary: [{ date: input.startDate, scheduled: [
    { placeId: "park-a", grounded: true, scheduledStart: "9:00 AM", duration: 60, status: "scheduled" },
    { placeId: "made-up", scheduledStart: "1:00 PM", duration: 80, status: "scheduled" },
  ] }],
};
const details = async id => ({ placeId: id, businessStatus: "OPERATIONAL", openingHours: {weekdayDescriptions:["Tuesday: Open 24 hours"]}, rating: 4.7 });
test("job polling, scoped place lookup, swaps, and read-only handoff share the verified schedule", async () => {
  let finish;
  const jobs = createPlanningJobs({ run: () => new Promise(resolve => { finish = resolve; }), details, waitMs: 0 });
  const pending = await jobs.start(input);
  assert.equal(pending.status, "pending");
  finish(output);
  await new Promise(resolve => setImmediate(resolve));
  const plan = jobs.status(pending.job_id);
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.days[0].stops.map(s => s.place_id), ["park-a"]);
  const handoff = new URL(plan.open_url).hash.slice(5);
  assert.throws(() => jobs.status(handoff));
  await assert.rejects(jobs.attraction(plan.job_id, "made-up"));
  assert.equal((await jobs.attraction(plan.job_id, "park-b")).rating, 4.7);
  const swapped = await jobs.swap(plan.job_id, 1, "park-a");
  assert.deepEqual(swapped.days[0].stops.map(s => [s.place_id, s.start_time, s.duration_minutes]), [["park-b", "9:00 AM", 60]]);
  assert.equal(jobs.handoff(handoff).snapshot.tripData.scheduledItinerary[0].scheduled[0].name, "park-b");
  await assert.rejects(jobs.swap(plan.job_id, 1, "park-a"));
});

test("expired jobs, reversed dates and too-long trips cannot trigger generation", async () => {
  let now = 0, calls = 0;
  const jobs = createPlanningJobs({run: async () => { calls++; return output; }, now: () => now, ttlMs: 1000});
  await assert.rejects(jobs.start({...input, endDate:"2027-01-01"}));
  await assert.rejects(jobs.start({...input, endDate:"2026-11-01"}));
  const plan = await jobs.start(input);
  now = 1001;
  assert.throws(() => jobs.status(plan.job_id));
  assert.equal(calls, 1);
});

test("deadline aborts and holds the active slot until the provider drains", async () => {
  let finish, signal;
  const jobs = createPlanningJobs({timeoutMs: 5, maxActive: 1, waitMs: 0, run: (unused, opts) => {
    signal = opts.signal;
    return new Promise(resolve => { finish = resolve; });
  }});
  const plan = await jobs.start(input);
  await new Promise(resolve => setTimeout(resolve, 12));
  assert.equal(signal.aborted, true);
  assert.equal(jobs.status(plan.job_id).status, "failed");
  await assert.rejects(jobs.start(input), /busy/);
  finish(output);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(jobs.status(plan.job_id).status, "failed");
});

test("verified planner reserves costs across provider attempts before any model request", async () => {
  let budget;
  const jobs = createPlanningJobs({run: async (unused, opts) => { budget = opts.reserveModelAttempt; return output; }});
  await jobs.start(input);
  const attempt = {modelId:"gpt-6.1-terra",system:"",user:"",maxTokens:60000};
  budget(attempt);
  assert.throws(() => budget({...attempt, maxTokens: 1e6}), /budget/i);
  assert.throws(() => budget({...attempt, modelId:"unpriced"}), /budget/i);
});

test("locked stops survive polls and web handoff and block swaps until unlocked", async () => {
  let lookups = 0;
  const jobs = createPlanningJobs({run: async () => output, details: async id => {lookups++; return details(id);}});
  const plan = await jobs.start(input);
  const {job_id} = plan;
  assert.equal(plan.days[0].stops[0].locked, false);
  const locked = jobs.setLock(job_id, 1, "park-a", true);
  assert.equal(locked.days[0].stops[0].locked, true);
  assert.equal(jobs.setLock(job_id, 1, "park-a", true), locked);
  assert.equal(jobs.status(job_id).days[0].stops[0].locked, true);
  await assert.rejects(jobs.swap(job_id, 1, "park-a"), /locked/i);
  assert.equal(lookups, 0);
  assert.throws(() => jobs.setLock(job_id, 1, "park-b", true));
  const view = jobs.handoff(new URL(plan.open_url).hash.slice(5));
  assert.equal(view.snapshot.tripData.scheduledItinerary[0].scheduled[0].locked, true);
  jobs.setLock(job_id, 1, "park-a", false);
  assert.equal((await jobs.swap(job_id, 1, "park-a")).days[0].stops[0].locked, false);
});

test("a lock applied during live candidate verification wins over an in-flight swap", async () => {
  let complete;
  const jobs = createPlanningJobs({run: async () => output, details: () => new Promise(resolve => { complete = resolve; })});
  const {job_id} = await jobs.start(input);
  const swapping = jobs.swap(job_id, 1, "park-a");
  jobs.setLock(job_id, 1, "park-a", true);
  complete(await details("park-b"));
  await assert.rejects(swapping, /changed/);
  assert.equal(jobs.status(job_id).days[0].stops[0].locked, true);
});
