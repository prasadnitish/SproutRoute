import test from "node:test";
import assert from "node:assert/strict";
import { buildTripPlanPrompt } from "../../src/backend/services/tripPlanAI.js";
import { parseInput } from "../../src/backend/services/parseInput.js";

const shortlist = [
  { canonical_name: "Seattle Aquarium", category: "wildlife", city_display_name: "Seattle, WA", indoor_outdoor: "both", verification_status: "verified" },
  { canonical_name: "Pacific Science Center", category: "museums", city_display_name: "Seattle, WA", indoor_outdoor: "indoor", verification_status: "verified" },
];

test("the planning prompt does not ask the model to follow opening hours the shortlist never carries", () => {
  const { system } = buildTripPlanPrompt("Seattle, WA", "2026-12-01", "2026-12-03", ["aquarium"], [{ age: 2 }], { summary: "", forecast: [] }, { cachedAttractions: shortlist });
  assert.match(system, /has no opening hours/);
  assert.doesNotMatch(system, /keep to its opening hours/);
  assert.doesNotMatch(system, /see "hours"/);
});

test("the planning prompt does not claim a place is confirmed open", () => {
  const { system } = buildTripPlanPrompt("Seattle, WA", "2026-12-01", "2026-12-03", [], [{ age: 2 }], { summary: "", forecast: [] }, { cachedAttractions: shortlist });
  assert.doesNotMatch(system, /Google Maps confirms/);
  assert.doesNotMatch(system, /exists and is open/);
  assert.match(system, /checked to exist/);
});

test("with a shortlist the prompt does not require a walking tour that is not on it", () => {
  const { system } = buildTripPlanPrompt("Seattle, WA", "2026-12-01", "2026-12-03", [], [{ age: 5 }], { summary: "", forecast: [] }, { cachedAttractions: shortlist });
  assert.doesNotMatch(system, /MUST include a half-day walking\/city tour/);
  assert.match(system, /Do not add walking tours/);
});

test("without a shortlist the prompt still asks for a walking tour on short city trips", () => {
  const { system } = buildTripPlanPrompt("Nowhere, ZZ", "2026-12-01", "2026-12-03", [], [{ age: 5 }], { summary: "", forecast: [] }, {});
  assert.match(system, /MUST include a half-day walking\/city tour/);
});

test("the parse prompt tells the model what to do with a named origin and a travel time", async () => {
  let sent = "";
  await parseInput("A 2 hour drive from Seattle, April 2 to 5, 2027. 2 adults.", { callAI: async (prompt) => { sent = prompt; return "{}"; } });
  assert.match(sent, /names an origin and a travel time/);
  assert.match(sent, /NAMED origin/);
});
