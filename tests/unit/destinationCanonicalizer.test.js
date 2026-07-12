import test from "node:test";
import assert from "node:assert/strict";

import { canonicalStopKey, dedupeCanonicalStops } from "../../src/backend/services/destinationCanonicalizer.js";

test("dedupeCanonicalStops removes repeated city suggestions", () => {
  const result = dedupeCanonicalStops([
    { name: "Osaka", countryCode: "JP" },
    { name: " osaka ", countryCode: "JP" },
    { name: "Kyoto", countryCode: "JP" },
  ]);

  assert.deepEqual(result.stops.map((stop) => stop.name), ["Osaka", "Kyoto"]);
  assert.ok(result.warnings.some((warning) => warning.includes("Osaka")));
});

test("canonicalStopKey keeps same city names in different regions distinct", () => {
  assert.notEqual(
    canonicalStopKey({ name: "Paris", countryCode: "FR" }),
    canonicalStopKey({ name: "Paris", countryCode: "US", regionCode: "TX" }),
  );
});
