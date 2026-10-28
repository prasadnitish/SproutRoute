import test from "node:test";
import assert from "node:assert/strict";
import { assessFamilyFit, fitToRowUpdate, FAMILY_FIT_VERSION } from "../../src/backend/services/attractionFit.js";

const PLACE = {
  name: "Seattle Aquarium",
  city: "Seattle, WA",
  types: ["aquarium", "tourist_attraction"],
  primaryType: "aquarium",
  rating: 4.6,
  ratingCount: 21000,
  priceLevel: 2,
};

const GOOD = {
  kidAppeal: 9,
  parentAppeal: 7,
  ageBands: ["toddler", "preschool", "elementary"],
  indoorOutdoor: "indoor",
  strollerFriendly: true,
  typicalDurationMinutes: 120,
  category: "museum",
  fineDining: false,
  adultsOnly: false,
  bookingLikelyNeeded: false,
  reason: "Touch pools and a large viewing window suit toddlers through grade school.",
};

const model = (reply) => async (prompt) => ({ responseText: typeof reply === "string" ? reply : JSON.stringify(reply), prompt });

test("a valid reply becomes a family-fit assessment", async () => {
  const result = await assessFamilyFit(PLACE, { callModelFn: model(GOOD) });
  assert.equal(result.ok, true);
  assert.equal(result.fit.kidAppeal, 9);
  assert.equal(result.fit.category, "museum");
});

test("the model sees only facts that came from Google, and is not asked for hours or ratings", async () => {
  let prompt;
  await assessFamilyFit(PLACE, { callModelFn: async (p) => { prompt = p; return { responseText: JSON.stringify(GOOD) }; } });
  assert.equal(prompt.provider, "anthropic");
  assert.equal(prompt.model, "claude-haiku-5-5");
  assert.equal(prompt.effort, "low");
  assert.match(prompt.user, /Seattle Aquarium/);
  assert.match(prompt.user, /aquarium/);
  assert.match(prompt.system, /do not state opening hours|do not invent/i);
  assert.ok(!/temperature/.test(JSON.stringify(prompt)));
});

test("a reply wrapped in a code fence still parses", async () => {
  const result = await assessFamilyFit(PLACE, { callModelFn: model("```json\n" + JSON.stringify(GOOD) + "\n```") });
  assert.equal(result.ok, true);
});

test("a reply with text around the JSON still parses", async () => {
  const result = await assessFamilyFit(PLACE, { callModelFn: model("Here is the assessment: " + JSON.stringify(GOOD) + " Hope that helps.") });
  assert.equal(result.ok, true);
});

test("scores outside 1 to 10 are rejected, not clamped", async () => {
  const result = await assessFamilyFit(PLACE, { callModelFn: model({ ...GOOD, kidAppeal: 14 }) });
  assert.equal(result.ok, false);
  assert.match(result.error, /kidAppeal/);
});

test("an unknown indoor/outdoor value or age band is rejected", async () => {
  assert.equal((await assessFamilyFit(PLACE, { callModelFn: model({ ...GOOD, indoorOutdoor: "underwater" }) })).ok, false);
  assert.equal((await assessFamilyFit(PLACE, { callModelFn: model({ ...GOOD, ageBands: ["toddler", "senior"] }) })).ok, false);
});

test("duration is held to a sane range", async () => {
  assert.equal((await assessFamilyFit(PLACE, { callModelFn: model({ ...GOOD, typicalDurationMinutes: 5 }) })).fit.typicalDurationMinutes, 30);
  assert.equal((await assessFamilyFit(PLACE, { callModelFn: model({ ...GOOD, typicalDurationMinutes: 9999 }) })).fit.typicalDurationMinutes, 480);
});

test("garbage or a thrown error is reported per row and never throws", async () => {
  assert.equal((await assessFamilyFit(PLACE, { callModelFn: model("not json at all") })).ok, false);
  const thrown = await assessFamilyFit(PLACE, { callModelFn: async () => { throw new Error("rate limited"); } });
  assert.equal(thrown.ok, false);
  assert.match(thrown.error, /rate limited/);
});

test("fitToRowUpdate maps the assessment onto the existing columns", () => {
  const update = fitToRowUpdate(GOOD, { model: "claude-haiku-5-5", now: "2026-10-28T00:00:00.000Z" });
  assert.equal(update.kid_appeal_score, 9);
  assert.equal(update.parent_appeal_score, 7);
  assert.deepEqual(update.age_bands_json, ["toddler", "preschool", "elementary"]);
  assert.equal(update.indoor_outdoor, "indoor");
  assert.equal(update.stroller_friendly, true);
  assert.equal(update.duration_bucket, "1_2h");
  assert.equal(update.booking_needed, false);
  assert.equal(update.family_fit_json.version, FAMILY_FIT_VERSION);
  assert.equal(update.family_fit_json.model, "claude-haiku-5-5");
  assert.equal(update.family_fit_json.fineDining, false);
  assert.equal(update.family_fit_json.typicalDurationMinutes, 120);
});

test("duration minutes map to the stored buckets", () => {
  const bucket = (minutes) => fitToRowUpdate({ ...GOOD, typicalDurationMinutes: minutes }, { model: "m", now: "t" }).duration_bucket;
  assert.equal(bucket(45), "under_1h");
  assert.equal(bucket(90), "1_2h");
  assert.equal(bucket(180), "2_4h");
  assert.equal(bucket(300), "half_day");
  assert.equal(bucket(480), "full_day");
});
