/**
 * petAirlineRules.test.js — Static airline pet policy database tests
 *
 * Tests the data layer for airline pet policies covering 6 US carriers.
 * Validates lookup functions, data completeness, and pet eligibility checks.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  getAirlineRules,
  getAllCarriers,
  checkPetEligibility,
  checkAllAirlines,
} from "../../src/backend/data/petAirlineRules.js";

// --- Lookup function tests ---

test("getAirlineRules returns rules for known airline (Delta)", () => {
  const rules = getAirlineRules("Delta");
  assert.ok(rules, "Delta rules should not be null");
  assert.equal(rules.carrier, "Delta");
  assert.equal(rules.carrierCode, "DL");
  assert.equal(typeof rules.cabinAllowed, "boolean");
  assert.equal(typeof rules.cabinMaxWeightLbs, "number");
  assert.equal(typeof rules.cabinFee, "string");
  assert.ok(rules.source.startsWith("http"), "source should be a URL");
});

test("getAirlineRules returns null for unknown airline", () => {
  const rules = getAirlineRules("FlyByNight Airlines");
  assert.equal(rules, null);
});

test("getAllCarriers returns array of 6 airlines", () => {
  const carriers = getAllCarriers();
  assert.ok(Array.isArray(carriers), "should return an array");
  assert.equal(carriers.length, 6, "should have exactly 6 carriers");

  // Verify all expected carriers are present
  const names = carriers.map((c) => c.carrier);
  assert.ok(names.includes("Delta"), "should include Delta");
  assert.ok(names.includes("United"), "should include United");
  assert.ok(names.includes("American Airlines"), "should include American Airlines");
  assert.ok(names.includes("Southwest"), "should include Southwest");
  assert.ok(names.includes("JetBlue"), "should include JetBlue");
  assert.ok(names.includes("Alaska Airlines"), "should include Alaska Airlines");
});

test("every carrier has all required fields", () => {
  const requiredFields = [
    "carrier", "carrierCode", "cabinAllowed", "cabinMaxWeightLbs",
    "cabinFee", "cabinCarrierDimensions", "cargoAllowed", "cargoFee",
    "bannedBreeds", "brachycephalicBan", "tempRestrictions",
    "healthCertDays", "minAgeWeeks", "catAllowed", "smallAnimalAllowed",
    "source",
  ];

  const carriers = getAllCarriers();
  for (const carrier of carriers) {
    for (const field of requiredFields) {
      assert.ok(
        field in carrier,
        `${carrier.carrier} missing required field: ${field}`
      );
    }
  }
});

test("bannedBreeds is an array for every carrier", () => {
  const carriers = getAllCarriers();
  for (const carrier of carriers) {
    assert.ok(
      Array.isArray(carrier.bannedBreeds),
      `${carrier.carrier} bannedBreeds should be an array`
    );
  }
});

test("source field is a valid URL string for every carrier", () => {
  const carriers = getAllCarriers();
  for (const carrier of carriers) {
    assert.equal(typeof carrier.source, "string");
    assert.ok(
      carrier.source.startsWith("http"),
      `${carrier.carrier} source should start with http`
    );
  }
});

// --- checkPetEligibility tests ---

test("checkPetEligibility — 15lb dog is cabin eligible on Delta (max 20lb)", () => {
  const pet = { type: "dog", breed: "Miniature Poodle", weightLbs: 15 };
  const rules = getAirlineRules("Delta");
  const result = checkPetEligibility(pet, rules);

  assert.equal(result.cabinEligible, true, "15lb dog should be cabin eligible on Delta");
});

test("checkPetEligibility — 25lb dog is NOT cabin eligible on Delta", () => {
  const pet = { type: "dog", breed: "Cocker Spaniel", weightLbs: 25 };
  const rules = getAirlineRules("Delta");
  const result = checkPetEligibility(pet, rules);

  assert.equal(result.cabinEligible, false, "25lb dog should NOT be cabin eligible on Delta");
});

test("checkPetEligibility — Pit Bull detected as banned breed", () => {
  const pet = { type: "dog", breed: "Pit Bull", weightLbs: 50 };
  const rules = getAirlineRules("Delta");
  const result = checkPetEligibility(pet, rules);

  assert.ok(result.breedWarning, "Pit Bull should trigger a breed warning");
  assert.ok(
    result.breedWarning.toLowerCase().includes("pit bull") ||
    result.breedWarning.toLowerCase().includes("banned") ||
    result.breedWarning.toLowerCase().includes("restrict"),
    "breed warning should mention restriction"
  );
});

test("checkPetEligibility — brachycephalic breed (Pug) banned from cargo", () => {
  const pet = { type: "dog", breed: "Pug", weightLbs: 14 };
  // Use Delta which has brachycephalicBan: true
  const rules = getAirlineRules("Delta");
  const result = checkPetEligibility(pet, rules);

  assert.equal(result.cargoEligible, false, "Pug should NOT be cargo eligible on airlines with brachycephalic ban");
});

test("checkPetEligibility — cat is allowed on Delta", () => {
  const pet = { type: "cat", breed: "Siamese", weightLbs: 8 };
  const rules = getAirlineRules("Delta");
  const result = checkPetEligibility(pet, rules);

  assert.equal(result.cabinEligible, true, "cat under weight limit should be cabin eligible");
});

test("checkPetEligibility — small_animal checks smallAnimalAllowed flag", () => {
  const pet = { type: "small_animal", breed: "Holland Lop Rabbit", weightLbs: 4 };

  // Southwest does not allow small animals
  const swRules = getAirlineRules("Southwest");
  const swResult = checkPetEligibility(pet, swRules);
  assert.equal(swResult.cabinEligible, false, "small animal should NOT be allowed on Southwest");

  // Alaska Airlines allows small animals
  const asRules = getAirlineRules("Alaska Airlines");
  const asResult = checkPetEligibility(pet, asRules);
  assert.equal(asResult.cabinEligible, true, "small animal should be allowed on Alaska Airlines");
});

// --- checkAllAirlines tests ---

test("checkAllAirlines returns results for all 6 carriers", () => {
  const pet = { type: "dog", breed: "Golden Retriever", weightLbs: 20 };
  const results = checkAllAirlines(pet);

  assert.ok(Array.isArray(results), "should return an array");
  assert.equal(results.length, 6, "should have results for all 6 carriers");

  // Each result should have required fields
  for (const result of results) {
    assert.ok("carrier" in result, "result should have carrier name");
    assert.ok("carrierCode" in result, "result should have carrier code");
    assert.ok("cabinEligible" in result, "result should have cabinEligible");
    assert.ok("cargoEligible" in result, "result should have cargoEligible");
    assert.ok("requiredDocuments" in result, "result should have requiredDocuments");
  }
});

test("checkPetEligibility returns requiredDocuments including health certificate", () => {
  const pet = { type: "dog", breed: "Beagle", weightLbs: 20 };
  const rules = getAirlineRules("Delta");
  const result = checkPetEligibility(pet, rules);

  assert.ok(Array.isArray(result.requiredDocuments), "requiredDocuments should be an array");
  const hasHealthCert = result.requiredDocuments.some(
    (doc) => doc.toLowerCase().includes("health certificate") || doc.toLowerCase().includes("vet certificate")
  );
  assert.ok(hasHealthCert, "requiredDocuments should include health certificate");
});
