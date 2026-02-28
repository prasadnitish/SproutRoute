/**
 * ragTemplates.js tests — Phase 6D, Feature: RAG packing/activity templates
 *
 * Guards the static lookup tables and climate detection logic used to seed
 * AI prompts with pre-built packing and activity suggestions.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  detectClimateZone,
  getPackingBaseTemplate,
  getActivityBaseTemplate,
} from "../../src/backend/services/ragTemplates.js";

// ── detectClimateZone ─────────────────────────────────────────────────────────

test("detectClimateZone returns 'temperate' for empty forecast", () => {
  assert.equal(detectClimateZone([]), "temperate");
});

test("detectClimateZone returns 'temperate' for null/undefined input", () => {
  assert.equal(detectClimateZone(null), "temperate");
  assert.equal(detectClimateZone(undefined), "temperate");
});

test("detectClimateZone returns 'temperate' for non-array input", () => {
  assert.equal(detectClimateZone("not an array"), "temperate");
  assert.equal(detectClimateZone(42), "temperate");
});

test("detectClimateZone returns 'tropical' for hot + rainy forecast", () => {
  const forecast = [
    { high: 88, low: 75, precipitation: 60 },
    { high: 90, low: 76, precipitation: 55 },
    { high: 85, low: 74, precipitation: 45 },
  ];
  assert.equal(detectClimateZone(forecast), "tropical");
});

test("detectClimateZone returns 'desert' for hot + dry forecast", () => {
  const forecast = [
    { high: 95, low: 65, precipitation: 5 },
    { high: 100, low: 70, precipitation: 0 },
    { high: 92, low: 62, precipitation: 10 },
  ];
  assert.equal(detectClimateZone(forecast), "desert");
});

test("detectClimateZone returns 'cold' when minLow <= 35", () => {
  const forecast = [
    { high: 45, low: 30, precipitation: 20 },
    { high: 40, low: 25, precipitation: 30 },
    { high: 50, low: 35, precipitation: 15 },
  ];
  assert.equal(detectClimateZone(forecast), "cold");
});

test("detectClimateZone returns 'temperate' for moderate forecast", () => {
  const forecast = [
    { high: 70, low: 55, precipitation: 25 },
    { high: 72, low: 58, precipitation: 10 },
    { high: 68, low: 50, precipitation: 30 },
  ];
  assert.equal(detectClimateZone(forecast), "temperate");
});

test("detectClimateZone uses default values when fields are missing", () => {
  // No high defaults to 70, no precipitation defaults to 0 → temperate
  const forecast = [{ low: 55 }, { low: 50 }, { low: 48 }];
  assert.equal(detectClimateZone(forecast), "temperate");
});

test("detectClimateZone uses default low (50) when low is missing", () => {
  // All highs >= 82 and rain >= 40 but missing low defaults to 50 → tropical
  const forecast = [
    { high: 90, precipitation: 50 },
    { high: 88, precipitation: 45 },
  ];
  assert.equal(detectClimateZone(forecast), "tropical");
});

// ── getPackingBaseTemplate ────────────────────────────────────────────────────

test("getPackingBaseTemplate returns general items for known climate and null tripType", () => {
  const result = getPackingBaseTemplate("tropical", null);
  assert.ok(result.includes("Lightweight breathable clothing"), "Should include tropical general items");
  assert.ok(!result.includes("Beach towels"), "Should not include beach-specific items");
});

test("getPackingBaseTemplate combines general + type-specific items", () => {
  const result = getPackingBaseTemplate("tropical", "beach");
  assert.ok(result.includes("Lightweight breathable clothing"), "Should include general items");
  assert.ok(result.includes("Beach towels"), "Should include beach-specific items");
  assert.ok(result.includes("Snorkel set"), "Should include beach-specific items");
});

test("getPackingBaseTemplate returns cold + adventure items", () => {
  const result = getPackingBaseTemplate("cold", "adventure");
  assert.ok(result.includes("Thermal base layers"), "Should include cold general items");
  assert.ok(result.includes("Crampons"), "Should include cold adventure items");
});

test("getPackingBaseTemplate returns desert + city items", () => {
  const result = getPackingBaseTemplate("desert", "city");
  assert.ok(result.includes("Wide-brim hat"), "Should include desert general items");
  assert.ok(result.includes("Breathable walking shoes"), "Should include desert city items");
});

test("getPackingBaseTemplate returns cruise items for all climates", () => {
  for (const zone of ["tropical", "temperate", "cold", "desert"]) {
    const result = getPackingBaseTemplate(zone, "cruise");
    assert.ok(result.length > 0, `${zone} cruise template should not be empty`);
    assert.ok(
      result.toLowerCase().includes("formal") || result.toLowerCase().includes("dinner"),
      `${zone} cruise template should mention formal/dinner attire`,
    );
  }
});

test("getPackingBaseTemplate returns international items", () => {
  const result = getPackingBaseTemplate("temperate", "international");
  assert.ok(result.includes("Passport"), "Should include passport");
  assert.ok(result.includes("power adapter") || result.includes("Power adapter"), "Should include power adapter");
});

test("getPackingBaseTemplate falls back to temperate for unknown climate zone", () => {
  const result = getPackingBaseTemplate("arctic", "city");
  const temperateResult = getPackingBaseTemplate("temperate", "city");
  assert.equal(result, temperateResult, "Unknown climate should fall back to temperate");
});

test("getPackingBaseTemplate returns only general for unknown tripType", () => {
  const result = getPackingBaseTemplate("cold", "volcano_diving");
  // Should only have general cold items, not type-specific
  assert.ok(result.includes("Thermal base layers"), "Should include cold general items");
  // The result should match cold general only (no extra type items)
  const generalOnly = getPackingBaseTemplate("cold", null);
  assert.equal(result, generalOnly, "Unknown tripType should return same as null tripType");
});

// ── getActivityBaseTemplate ──────────────────────────────────────────────────

test("getActivityBaseTemplate returns beach activities for 'beach'", () => {
  const result = getActivityBaseTemplate("beach");
  assert.ok(Array.isArray(result), "Should return an array");
  assert.ok(result.length > 0, "Should have activities");
  assert.ok(result.some((a) => a.toLowerCase().includes("swim")), "Beach activities should include swimming");
});

test("getActivityBaseTemplate returns city activities for 'city'", () => {
  const result = getActivityBaseTemplate("city");
  assert.ok(result.some((a) => a.toLowerCase().includes("museum")), "City activities should include museums");
});

test("getActivityBaseTemplate returns adventure activities for 'adventure'", () => {
  const result = getActivityBaseTemplate("adventure");
  assert.ok(result.some((a) => a.toLowerCase().includes("hik")), "Adventure should include hiking");
});

test("getActivityBaseTemplate returns cruise activities for 'cruise'", () => {
  const result = getActivityBaseTemplate("cruise");
  assert.ok(result.some((a) => a.toLowerCase().includes("shore")), "Cruise should include shore excursions");
  assert.ok(result.some((a) => a.toLowerCase().includes("sea day")), "Cruise should include sea day activities");
});

test("getActivityBaseTemplate returns international activities for 'international'", () => {
  const result = getActivityBaseTemplate("international");
  assert.ok(result.some((a) => a.toLowerCase().includes("cultural")), "International should include cultural activities");
});

test("getActivityBaseTemplate falls back to general for unknown tripType", () => {
  const result = getActivityBaseTemplate("underwater_basket_weaving");
  const generalResult = getActivityBaseTemplate("general");
  assert.deepEqual(result, generalResult, "Unknown trip type should return general activities");
});

test("getActivityBaseTemplate falls back to general for null", () => {
  const result = getActivityBaseTemplate(null);
  const generalResult = getActivityBaseTemplate("general");
  assert.deepEqual(result, generalResult, "null trip type should return general activities");
});
