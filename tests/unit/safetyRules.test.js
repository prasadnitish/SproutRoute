/**
 * safetyRules.js tests — US state rules + international guidance (Phase 4/6C)
 *
 * Tests cover two distinct code paths:
 *   1. US state rules: resolveJurisdictionCode + getCarSeatGuidance with state data
 *   2. International guidance: countryCode routing → buildInternationalGuidance()
 *      (CA, GB, AU, EU baseline, generic/WHO)
 *
 * No overlap with intlSafetyRules.test.js — that file tests the data layer
 * (carSeatRules.js) while this file tests the service layer (safetyRules.js).
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  getCarSeatGuidance,
  resolveJurisdictionCode,
} from "../../src/backend/services/safetyRules.js";

test("resolveJurisdictionCode infers state from full destination name", () => {
  const code = resolveJurisdictionCode({
    destination: "Seattle, King County, Washington, United States",
  });

  assert.equal(code, "WA");
});

test("resolveJurisdictionCode prefers District of Columbia over Washington state", () => {
  const code = resolveJurisdictionCode({
    destination: "Washington, District of Columbia, United States",
  });

  assert.equal(code, "DC");
});

test("resolveJurisdictionCode prefers West Virginia over Virginia substring", () => {
  const code = resolveJurisdictionCode({
    destination: "Charleston, West Virginia, United States",
  });

  assert.equal(code, "WV");
});

test("getCarSeatGuidance returns unavailable when no countryCode and destination has no US state match", async () => {
  // Without countryCode, the resolver tries to match a US state code.
  // "ON" is not a US state → falls through to "not found" path.
  const result = await getCarSeatGuidance({
    destination: "Toronto, ON, Canada",
    children: [{ age: 4, weightLb: 40, heightIn: 42 }],
  });

  assert.equal(result.status, "Unavailable");
  assert.equal(result.results[0].requiredRestraint, "not_found");
});

test("getCarSeatGuidance returns needs review recommendation for supported state", async () => {
  const result = await getCarSeatGuidance({
    destination: "Seattle, WA",
    children: [{ id: "child-1", age: 5, weightLb: 45, heightIn: 44 }],
    tripDate: "2026-07-12",
  });

  assert.equal(result.jurisdictionCode, "WA");
  assert.equal(result.status, "Needs review");
  assert.equal(result.results[0].requiredRestraint, "booster");
  assert.equal(result.results[0].status, "Needs review");
});

test("getCarSeatGuidance falls back to age-based status when metrics are missing", async () => {
  const result = await getCarSeatGuidance({
    destination: "Los Angeles, California",
    children: [{ id: "child-1", age: 2 }],
  });

  assert.equal(result.jurisdictionCode, "CA");
  assert.equal(result.results[0].requiredRestraint, "forward_facing_harness");
  assert.equal(result.results[0].status, "Needs review");
  assert.equal(
    result.results[0].rationale.includes("weight/height details are incomplete"),
    true,
  );
});

test("getCarSeatGuidance can use AI fallback for unsupported jurisdictions", async () => {
  // Use a fictitious jurisdiction code "XX" which is not in CAR_SEAT_RULES,
  // so the AI research fallback path is exercised.
  const result = await getCarSeatGuidance(
    {
      // Supply explicit jurisdictionCode so the resolver doesn't need to infer from destination text
      destination: "Test City, XX",
      jurisdictionCode: "XX",
      children: [{ id: "child-1", age: 6, weightLb: 46, heightIn: 46 }],
    },
    {
      sourceRegistry: { XX: "https://example.gov/official" },
      researchFn: async () => ({
        jurisdictionCode: "XX",
        jurisdictionName: "Test State",
        sourceUrl: "https://example.gov",
        effectiveDate: "Not found in repo",
        lastUpdated: "2026-02-15",
        verificationStatus: "Needs review",
        notes: "AI-assisted extraction from official source.",
        rules: [
          {
            priority: 1,
            requiredRestraint: "booster",
            seatPosition: "rear_seat_recommended",
            minAgeMonths: 48,
            maxAgeMonths: 143,
            minWeightLb: 40,
            maxWeightLb: 100,
            minHeightIn: 40,
            maxHeightIn: 57,
          },
        ],
      }),
    },
  );

  assert.equal(result.jurisdictionCode, "XX");
  assert.equal(result.status, "Needs review");
  assert.equal(result.results[0].requiredRestraint, "booster");
});

// ── International guidance (countryCode routing) ─────────────────────────────

test("getCarSeatGuidance routes to international guidance for countryCode=CA", async () => {
  const result = await getCarSeatGuidance({
    destination: "Toronto, Ontario, Canada",
    countryCode: "CA",
    children: [{ id: "child-1", age: 3 }],
  });

  assert.equal(result.status, "Needs review");
  assert.equal(result.jurisdictionCode, "CA");
  assert.equal(result.guidanceMode, "country_general");
  assert.ok(result.jurisdictionName.includes("Canada"), "Should name Canada");
  assert.ok(result.sourceUrl, "Must include sourceUrl for Canada");
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].childId, "child-1");
  assert.equal(result.results[0].requiredRestraint, "country_general");
  assert.ok(result.results[0].requiredRestraintLabel.length > 0, "Must have a guidance label");
});

test("getCarSeatGuidance routes to international guidance for countryCode=GB", async () => {
  const result = await getCarSeatGuidance({
    destination: "London, United Kingdom",
    countryCode: "GB",
    children: [{ id: "child-1", age: 6 }],
  });

  assert.equal(result.jurisdictionCode, "GB");
  assert.equal(result.guidanceMode, "country_general");
  assert.ok(result.jurisdictionName.includes("United Kingdom"), "Should name UK");
  // Age 6: should get booster guidance (4-12 range in GB rules)
  assert.ok(
    result.results[0].rationale.toLowerCase().includes("booster"),
    `UK age 6 should mention booster — got: "${result.results[0].rationale}"`,
  );
});

test("getCarSeatGuidance routes to international guidance for countryCode=AU", async () => {
  const result = await getCarSeatGuidance({
    destination: "Sydney, Australia",
    countryCode: "AU",
    children: [{ id: "child-1", age: 2 }],
  });

  assert.equal(result.jurisdictionCode, "AU");
  assert.equal(result.guidanceMode, "country_general");
  assert.ok(result.jurisdictionName.includes("Australia"), "Should name Australia");
  // Age 2 in AU: rear-facing (under 4)
  assert.ok(
    result.results[0].rationale.toLowerCase().includes("rear"),
    `AU age 2 should mention rear-facing — got: "${result.results[0].rationale}"`,
  );
});

test("getCarSeatGuidance returns EU baseline for European country (FR)", async () => {
  const result = await getCarSeatGuidance({
    destination: "Paris, France",
    countryCode: "FR",
    children: [{ id: "child-1", age: 5, weightLb: 44, heightIn: 42 }],
  });

  assert.equal(result.jurisdictionCode, "FR");
  assert.equal(result.guidanceMode, "eu_baseline");
  assert.ok(
    result.jurisdictionName.includes("EU") || result.jurisdictionName.includes("EEA"),
    `Should reference EU/EEA — got: "${result.jurisdictionName}"`,
  );
  assert.ok(result.sourceUrl.includes("unece"), "EU source should reference UNECE");
});

test("getCarSeatGuidance returns generic international guidance for unknown country", async () => {
  const result = await getCarSeatGuidance({
    destination: "Tokyo, Japan",
    countryCode: "JP",
    children: [{ id: "child-1", age: 1 }],
  });

  assert.equal(result.jurisdictionCode, "JP");
  assert.equal(result.guidanceMode, "country_general");
  assert.ok(
    result.jurisdictionName.includes("International"),
    `Should be generic international — got: "${result.jurisdictionName}"`,
  );
  assert.ok(result.sourceUrl.includes("who.int"), "Generic source should reference WHO");
  // Age 1 (12 months): generic says rear-facing for under 24 months
  assert.ok(
    result.results[0].rationale.toLowerCase().includes("rear"),
    `Age 1 should get rear-facing guidance — got: "${result.results[0].rationale}"`,
  );
});

test("getCarSeatGuidance handles multiple children with international guidance", async () => {
  const result = await getCarSeatGuidance({
    destination: "London, United Kingdom",
    countryCode: "GB",
    children: [
      { id: "child-1", age: 1 },   // infant: rear-facing
      { id: "child-2", age: 6 },   // booster age
      { id: "child-3", age: 13 },  // adult seat belt
    ],
  });

  assert.equal(result.results.length, 3, "Should have results for all 3 children");
  assert.equal(result.results[0].childId, "child-1");
  assert.equal(result.results[1].childId, "child-2");
  assert.equal(result.results[2].childId, "child-3");

  // Infant should get rear-facing guidance
  assert.ok(
    result.results[0].rationale.toLowerCase().includes("rear"),
    "Infant should be rear-facing",
  );
  // Age 13 should get adult seat belt
  assert.ok(
    result.results[2].rationale.toLowerCase().includes("seat belt") ||
    result.results[2].rationale.toLowerCase().includes("adult"),
    "Age 13 should get adult seat belt guidance",
  );
});

test("getCarSeatGuidance with countryCode=US still uses US state rules", async () => {
  const result = await getCarSeatGuidance({
    destination: "Seattle, WA",
    countryCode: "US",
    children: [{ id: "child-1", age: 5, weightLb: 45, heightIn: 44 }],
  });

  // Should NOT go to international path — should use US state rules
  assert.equal(result.jurisdictionCode, "WA");
  assert.ok(
    result.guidanceMode !== "country_general" && result.guidanceMode !== "eu_baseline",
    "countryCode=US should use US state rules, not international guidance",
  );
});
