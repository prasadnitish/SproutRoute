import test from "node:test";
import assert from "node:assert/strict";
import {
  FIT_QUESTIONS,
  toJevRequest,
  toOpenAIRequest,
  fromJevResponse,
  fromOpenAIResponse,
  answersToFit,
  needsEscalation,
  decideFamilyFit,
} from "../../src/backend/services/familyFitDecision.js";
import { assessFamilyFit } from "../../src/backend/services/attractionFit.js";

const PLACE = { name: "Seattle Aquarium", city: "Seattle, WA", primaryType: "aquarium", types: ["aquarium", "tourist_attraction"], priceLevel: 2 };

// Normalized answers as both engines return them after parsing.
function answers({ adultsOnly = 0.02, fineDining = 0.01, bands = 0.9 } = {}) {
  const out = {};
  for (const q of FIT_QUESTIONS) {
    if (q.type === "noul") out[q.name] = { noul: q.name.startsWith("age_") ? bands : 0.3 };
    if (q.type === "choice") out[q.name] = { choice: Object.keys(q.criteria)[0], confidence: 0.9 };
    if (q.type === "score") out[q.name] = { score: 3.5, confidence: 0.8 };
  }
  out.adults_only = { noul: adultsOnly };
  out.fine_dining = { noul: fineDining };
  return out;
}

test("every family-fit field has a question, asked in one request", () => {
  const names = FIT_QUESTIONS.map((q) => q.name);
  for (const n of ["adults_only", "fine_dining", "stroller_friendly", "booking_needed", "kid_appeal", "parent_appeal", "indoor_outdoor", "category", "duration"]) {
    assert.ok(names.includes(n), n);
  }
  assert.equal(names.filter((n) => n.startsWith("age_")).length, 6);
  assert.equal(new Set(names).size, names.length);
});

test("the Jev request uses the System One shape with questions keyed by name", () => {
  const body = toJevRequest(PLACE, { model: "jev-latest" });
  assert.equal(body.model, "jev-latest");
  assert.equal(body.state.name, "Seattle Aquarium");
  assert.equal(body.questions.adults_only.type, "noul");
  assert.ok(body.questions.category.criteria.museum);
  assert.ok(Array.isArray(body.questions.kid_appeal.criteria));
});

test("the OpenAI request uses predicate, choice and score with the same meanings", () => {
  const body = toOpenAIRequest(PLACE, { model: "gpt-6-luna" });
  assert.equal(body.model, "gpt-6-luna");
  assert.match(body.input, /Seattle Aquarium/);
  const byName = Object.fromEntries(body.questions.map((q) => [q.name, q]));
  assert.equal(byName.adults_only.type, "predicate");
  assert.ok(byName.category.choices.some((c) => c.value === "museum"));
  assert.equal(byName.kid_appeal.levels.length, 5);
  assert.equal(byName.adults_only.instructions, toJevRequest(PLACE).questions.adults_only.instructions);
});

test("both response shapes parse to the same normalized answers", () => {
  const jev = fromJevResponse({
    answers: { adults_only: { type: "noul", noul: 0.97 }, category: { type: "choice", choice: "museum", confidence: 0.8 }, kid_appeal: { type: "score", score: 3.2, confidence: 0.7 } },
    usage: { input_tokens: 600 },
  });
  const openai = fromOpenAIResponse({
    answers: [
      { name: "adults_only", type: "predicate", probability: 0.97 },
      { name: "category", type: "choice", choice: "museum", confidence: 0.8 },
      { name: "kid_appeal", type: "score", score: 3.2, confidence: 0.7 },
    ],
    usage: { input_tokens: 600 },
  });
  assert.deepEqual(jev.answers, openai.answers);
  assert.equal(jev.inputTokens, 600);
});

test("answers become the same fit object the Haiku call produces", () => {
  const fit = answersToFit(answers());
  assert.equal(fit.adultsOnly, false);
  assert.equal(fit.fineDining, false);
  assert.deepEqual(fit.ageBands, ["infant", "toddler", "preschool", "elementary", "tween", "teen"]);
  assert.ok(Number.isInteger(fit.kidAppeal) && fit.kidAppeal >= 1 && fit.kidAppeal <= 10);
  assert.ok(fit.typicalDurationMinutes >= 30);
  assert.equal(fit.reason, "");
});

test("an adults-only venue may have no age bands", () => {
  const fit = answersToFit(answers({ adultsOnly: 0.98, bands: 0.05 }));
  assert.equal(fit.adultsOnly, true);
  assert.deepEqual(fit.ageBands, []);
});

test("unsure answers on the two filtering flags escalate", () => {
  assert.equal(needsEscalation(answers({ adultsOnly: 0.03 })), false);
  assert.equal(needsEscalation(answers({ adultsOnly: 0.95 })), false);
  assert.equal(needsEscalation(answers({ adultsOnly: 0.5 })), true);
  assert.equal(needsEscalation(answers({ fineDining: 0.6 })), true);
});

test("decideFamilyFit reports engine, latency and tokens", async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ answers: Object.fromEntries(Object.entries(answers()).map(([k, v]) => [k, { ...v, type: v.noul !== undefined ? "noul" : v.choice ? "choice" : "score" }])), usage: { input_tokens: 700 } }) });
  const result = await decideFamilyFit(PLACE, { engine: "jev", fetchFn, apiKey: "k" });
  assert.equal(result.ok, true);
  assert.equal(result.engine, "jev");
  assert.equal(result.inputTokens, 700);
  assert.ok(Number.isFinite(result.ms));
  assert.ok(result.costUsd > 0);
});

test("decideFamilyFit fails cleanly without a key or on an HTTP error", async () => {
  assert.equal((await decideFamilyFit(PLACE, { engine: "jev", apiKey: "" })).ok, false);
  const bad = await decideFamilyFit(PLACE, { engine: "openai", apiKey: "k", fetchFn: async () => ({ ok: false, status: 403, text: async () => "not enabled" }) });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /403/);
});

test("assessFamilyFit uses a decision engine when asked and falls back to Haiku when it is unsure", async () => {
  let haikuCalls = 0;
  const callModelFn = async () => {
    haikuCalls += 1;
    return { responseText: JSON.stringify({ kidAppeal: 2, parentAppeal: 6, ageBands: [], indoorOutdoor: "indoor", strollerFriendly: false, typicalDurationMinutes: 120, category: "other", fineDining: false, adultsOnly: true, bookingLikelyNeeded: false, reason: "A bar." }) };
  };
  const sure = await assessFamilyFit(PLACE, { engine: "jev", callModelFn, decideFn: async () => ({ ok: true, engine: "jev", answers: answers(), fit: answersToFit(answers()), escalate: false }) });
  assert.equal(sure.ok, true);
  assert.equal(sure.engine, "jev");
  assert.equal(haikuCalls, 0);

  const unsure = await assessFamilyFit(PLACE, { engine: "jev", callModelFn, decideFn: async () => ({ ok: true, engine: "jev", answers: answers({ adultsOnly: 0.5 }), fit: answersToFit(answers({ adultsOnly: 0.5 })), escalate: true }) });
  assert.equal(unsure.engine, "haiku");
  assert.equal(unsure.escalatedFrom, "jev");
  assert.equal(haikuCalls, 1);
});

test("the Haiku call accepts an empty age list for an adults-only venue", async () => {
  const reply = { kidAppeal: 1, parentAppeal: 6, ageBands: [], indoorOutdoor: "indoor", strollerFriendly: false, typicalDurationMinutes: 120, category: "other", fineDining: false, adultsOnly: true, bookingLikelyNeeded: false, reason: "A nightclub." };
  const result = await assessFamilyFit(PLACE, { callModelFn: async () => ({ responseText: JSON.stringify(reply) }) });
  assert.equal(result.ok, true);
  assert.deepEqual(result.fit.ageBands, []);
});
