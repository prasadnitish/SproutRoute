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

test("getCarSeatGuidance returns unavailable when jurisdiction is not found", async () => {
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
