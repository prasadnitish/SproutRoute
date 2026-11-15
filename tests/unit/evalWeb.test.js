import test from "node:test";
import assert from "node:assert/strict";
import { webPayload, webFollowUpBody, webSteps } from "../../scripts/lib/evalWeb.mjs";

const parsed = {
  destination: "San Diego, CA", startDate: "2026-12-18", endDate: "2026-12-22", adults: 2, childrenAges: [3, 7],
  vibe: "beach", pets: [{ type: "dog" }], pacePreference: "relaxed", tripShape: "single_destination",
  childrenAgesAssumed: false, rawInput: "never sent by the website",
};

test("the stream and packing body is what the website's planner sends", () => {
  const payload = webPayload(parsed);
  assert.deepEqual(Object.keys(payload).sort(), [
    "accessibilityNeeds", "accommodationPreferences", "activities", "adults", "avoidances", "budgetSignals",
    "celebrationContext", "childrenAges", "countryTour", "destination", "endDate", "extraContext", "foodPreferences",
    "mustHaves", "pacePreference", "pets", "prefetchedAttractionsByStopId", "savedProfile", "scheduleConstraints",
    "specialNotes", "startDate", "stops", "transportPreferences", "tripGoals", "tripShape",
  ]);
  assert.deepEqual(payload.activities, ["beach"]);
  assert.deepEqual(payload.childrenAges, [3, 7]);
  assert.equal(payload.pacePreference, "relaxed");
  assert.equal(payload.savedProfile, null);
  assert.ok(!("rawInput" in payload) && !("client" in payload) && !("children" in payload));
});

test("the website's background calls, with packing on its own endpoint", () => {
  const payload = webPayload(parsed);
  const trip = { destination: "San Diego, California, USA", countryCode: "US", jurisdictionCode: "CA", startDate: "2026-12-18" };
  assert.deepEqual(webSteps(parsed, payload), [
    ["packing", "/api/generate"], ["travel-tips", "/api/safety/travel-tips"],
    ["car-seat", "/api/safety/car-seat-check"], ["pet", "/api/v1/safety/pet-travel-check"],
  ]);
  assert.equal(webFollowUpBody("packing", parsed, payload, trip), payload);
  assert.deepEqual(webFollowUpBody("travel-tips", parsed, payload, trip),
    { destination: "San Diego, CA", childrenAges: [3, 7], countryCode: "US", startDate: "2026-12-18", endDate: "2026-12-22" });
  assert.deepEqual(webFollowUpBody("car-seat", parsed, payload, trip),
    { destination: "San Diego, California, USA", jurisdictionCode: "CA", tripDate: "2026-12-18", children: [{ age: 3 }, { age: 7 }] });
  assert.deepEqual(webFollowUpBody("pet", parsed, payload, trip),
    { pets: [{ type: "dog" }], destination: "San Diego, CA", countryCode: "US", travelMode: "drive" });
  assert.equal(webFollowUpBody("pet", parsed, payload, { countryCode: "JP" }).travelMode, "fly");
  assert.throws(() => webFollowUpBody("nope", parsed, payload, trip));
});

test("guessed ages: the runner cannot answer the question, so it skips it and makes no car seat call", () => {
  const guessed = { ...parsed, pets: [], childrenAges: [5], childrenAgesAssumed: true };
  assert.deepEqual(webSteps(guessed, webPayload(guessed)), [["packing", "/api/generate"], ["travel-tips", "/api/safety/travel-tips"]]);
  const none = { ...parsed, pets: [], childrenAges: [] };
  assert.deepEqual(webSteps(none, webPayload(none)).map(([step]) => step), ["packing", "travel-tips"]);
});
