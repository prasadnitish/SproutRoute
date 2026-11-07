import test from "node:test";
import assert from "node:assert/strict";
import { generateWeatherSummary } from "../../src/backend/services/weather.js";
import { generateVcSummary } from "../../src/backend/services/visualCrossing.js";

// Daily highs alone gave "between 62°F and 62°F" for a mild week; the low end comes from the lows.
const week = [
  { high: 62, low: 53, precipitation: 6 },
  { high: 62, low: 52, precipitation: 8 },
];

for (const [name, summarize] of [["weather.gov", generateWeatherSummary], ["Visual Crossing", generateVcSummary]]) {
  test(`${name} summary spans the lowest low to the highest high`, () => {
    assert.equal(summarize(week), "Expect temperatures between 52°F and 62°F.");
  });

  test(`${name} summary falls back to highs when lows are missing`, () => {
    assert.equal(summarize([{ high: 70, precipitation: 0 }, { high: 74, precipitation: 0 }]), "Expect temperatures between 70°F and 74°F.");
  });
}
