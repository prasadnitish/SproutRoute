import test from "node:test";
import assert from "node:assert/strict";
import { iosPayload, followUpBody, parseSse, tripFromStream } from "../../scripts/lib/evalIos.mjs";

test("iosPayload sends what the iOS app sends and drops null keys", () => {
  const p = iosPayload({ destination: "Seattle, Washington", startDate: "2026-12-01", endDate: "2026-12-03", children: [{ age: 2 }], activities: ["aquarium"], adults: null });
  assert.equal(p.client, "ios");
  assert.deepEqual(p.childrenAges, [2]);
  assert.deepEqual(p.children, [{ id: "child-0", age: 2 }]);
  assert.equal(p.pacePreference, "unknown");
  assert.ok(!("adults" in p) && !("foodPreferences" in p) && !("stops" in p));
});

test("iosPayload keeps pet fields the app knows and sends the route only for reviewed multi-stop trips", () => {
  const p = iosPayload({ destination: "Tokyo", startDate: "2027-05-03", endDate: "2027-05-12", childrenAges: [5], tripShape: "multi_stop",
    stops: [{ id: "s1", name: "Tokyo" }], pets: [{ type: "dog", name: "Max", ageMonths: 9, weightLb: 20 }] });
  assert.deepEqual(p.pets, [{ type: "dog", name: "Max", weightLb: 20 }]);
  assert.equal(p.tripShape, "multi_stop");
  assert.equal(iosPayload({ destination: "X", startDate: "a", endDate: "b", tripShape: "single_destination", stops: [{ id: "s" }] }).stops, undefined);
});

test("follow-up calls use the stream's destination event, as the app does", () => {
  const payload = iosPayload({ destination: "London, United Kingdom", startDate: "2026-12-12", endDate: "2026-12-15", children: [{ age: 4 }], pets: [{ type: "dog", name: "Max", weightLb: 20 }] });
  const trip = { destination: "Greater London, England, United Kingdom", jurisdictionCode: null, countryCode: "GB", startDate: "2026-12-12" };
  assert.deepEqual(followUpBody("car-seat", payload, trip), { destination: trip.destination, countryCode: "GB", tripDate: "2026-12-12", children: [{ id: "child-0", age: 4 }] });
  assert.equal(followUpBody("travel-tips", payload, trip).countryCode, "GB");
  assert.equal(followUpBody("pet", payload, trip).travelMode, "fly");
  assert.equal(followUpBody("pet", payload, { countryCode: "US" }).travelMode, "drive");
});

test("parseSse and tripFromStream read the destination event", () => {
  const text = 'event: destination\ndata: {"destination":"Seattle","countryCode":"US"}\n\nevent: weather\ndata: {"a":1}\n\nevent: done\ndata: {}\n\n';
  assert.deepEqual(parseSse(text).map((e) => e.event), ["destination", "weather", "done"]);
  assert.equal(tripFromStream(text).countryCode, "US");
  assert.equal(tripFromStream("event: error\ndata: x\n\n"), null);
});
