import assert from "node:assert/strict";
import test from "node:test";
import { createTracer } from "../../src/backend/services/tracing.js";
import { summarizeUnitCosts } from "../../src/backend/services/unitCosts.js";
import { prepareImport } from "../../src/backend/services/socialSave.js";
import { tracing } from "../../src/backend/services/tracing.js";

test("counts priced rejected attempts, groups trip retries, and keeps unknown cost unknown", async () => {
  const tracer = createTracer();
  const journey_id = "1".repeat(32);
  const run = (path, operation) => tracer.run("POST " + path, { journey_id }, operation);
  await run("/api/v1/trip/parse-input", () => tracer.span("ai.attempt", {}, () => ({ aiUsage: { costUsd: 0.01 } })));
  await run("/api/v1/trip/stream", async () => {
    await assert.rejects(tracer.span("ai.attempt", {}, async () => { throw Object.assign(new Error(), { aiUsage: { costUsd: 0.05 } }); }));
    await tracer.span("ai.attempt", {}, () => ({ aiUsage: { costUsd: 0.04 } }));
  });
  await run("/api/v1/trip/bundle", () => {});
  await run("/api/v1/trip/shares", () => {});
  const traces = tracer.snapshot();
  const { trip, share } = summarizeUnitCosts([...traces, ...traces]);
  assert.equal(trip.units, 1);
  assert.equal(trip.usdPerUnit, 0.1);
  assert.equal(trip.attempts, 3);
  assert.equal(share.units, 1);
  assert.equal(share.usdPerUnit, 0);
  await run("/api/safety/travel-tips", () => tracer.span("ai.attempt", {}, () => ({})));
  const unknown = summarizeUnitCosts(tracer.snapshot()).trip;
  assert.equal(unknown.unpricedAttempts, 1);
  assert.equal(unknown.usdPerUnit, null);
});

test("counts verified places and empty extractions without retaining evidence or counting cached tool reads", async () => {
  const text = "Visit River Park for play.";
  const model = () => tracing.span("ai.attempt", {}, () => ({
    responseText: JSON.stringify({candidates: [{name:"River Park",evidence:text,tip:"for play",family:"for play"}, {name:"Fake",evidence:text}]}),
    aiUsage: {costUsd:0.04}
  }));
  await tracing.run("POST /api/v1/social-save/mcp", {}, () => prepareImport({source:"https://example.org",text}, {model}));
  await tracing.run("POST /api/v1/social-save/extract", {}, () => prepareImport({source:"https://example.org"}));
  await tracing.run("POST /api/v1/social-save/mcp", {}, () => {});
  const traces = tracing.snapshot().slice(-3);
  const { extraction, fact, candidate } = summarizeUnitCosts(traces);
  assert.equal(extraction.units, 1);
  assert.equal(candidate.units, 1);
  assert.equal(fact.units, 2);
  assert.equal(extraction.usdPerUnit, 0.04);
  assert.equal(fact.usdPerUnit, 0.02);
  assert.ok(!JSON.stringify(traces).includes("River Park"));
});

test("direct safety research includes both JSON attempts without retaining source material", async t => {
  const { researchCarSeatRulesFromOfficialSource } = await import("../../src/backend/services/safetyLawResearch.js");
  const previous = process.env.ANTHROPIC_API_KEY;
  t.after(() => { if (previous === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previous; });
  process.env.ANTHROPIC_API_KEY = "fixture";
  let calls = 0;
  await tracing.run("research", {}, () => researchCarSeatRulesFromOfficialSource({sourceUrl:"https://example.org"}, {
    fetchFn: async () => ({ok:true, text: async () => "PRIVATE SOURCE"}),
    anthropicFactory: () => ({messages:{create: async () => ({
      content:[{type:"text",text: ++calls === 1 ? "bad JSON" : '{"rules":[]}'}],
      usage:{input_tokens:1000,output_tokens:200}
    })}})
  }));
  const trace = tracing.snapshot().at(-1);
  assert.deepEqual(trace.spans.filter(s => s.label === "ai.attempt").map(s => s.cost_usd), [0.002, 0.002]);
  assert.ok(!JSON.stringify(trace).includes("PRIVATE SOURCE"));
});
