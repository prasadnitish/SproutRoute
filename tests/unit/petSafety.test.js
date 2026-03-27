/**
 * petSafety.js tests — Pet travel orchestrator service
 *
 * Tests the orchestrator that combines airline eligibility checks,
 * international entry rules, breed ban detection, and timeline warnings.
 * Uses DI pattern matching safetyRules.test.js.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { getPetTravelGuidance } from "../../src/backend/services/petSafety.js";

// --- Test fixtures ---

const DOG_20LB = {
  type: "dog",
  name: "Max",
  breed: "golden retriever",
  weightLbs: 20,
};

const CAT_10LB = {
  type: "cat",
  name: "Whiskers",
  breed: "siamese",
  weightLbs: 10,
};

const PIT_BULL_50LB = {
  type: "dog",
  name: "Rocky",
  breed: "Pit Bull Terrier",
  weightLbs: 50,
};

const FLY_OPTS = {
  destination: "London, UK",
  travelMode: "fly",
  countryCode: "GB",
  startDate: "2026-06-15",
};

const DRIVE_OPTS = {
  destination: "San Diego, CA",
  travelMode: "drive",
  countryCode: "US",
  startDate: "2026-06-15",
};

// --- Tests ---

test("fly mode returns airline guidance for all 6 carriers", async () => {
  const result = await getPetTravelGuidance([DOG_20LB], FLY_OPTS);

  assert.ok(result.airlineGuidance, "airlineGuidance should be present");
  assert.equal(result.airlineGuidance.length, 1, "one pet = one guidance entry");

  const petGuidance = result.airlineGuidance[0];
  assert.equal(petGuidance.pet, "Max");
  assert.equal(petGuidance.airlines.length, 6, "should check all 6 carriers");

  // Each airline result should have required fields
  for (const airline of petGuidance.airlines) {
    assert.ok(airline.carrier, "carrier name required");
    assert.ok(airline.carrierCode, "carrier code required");
    assert.equal(typeof airline.cabinEligible, "boolean");
    assert.equal(typeof airline.cargoEligible, "boolean");
    assert.ok(Array.isArray(airline.requiredDocuments));
  }
});

test("drive mode returns null airlineGuidance", async () => {
  const result = await getPetTravelGuidance([DOG_20LB], DRIVE_OPTS);

  assert.equal(result.airlineGuidance, null, "no airline guidance for drive mode");
});

test("returns entry requirements for known country (GB)", async () => {
  const result = await getPetTravelGuidance([DOG_20LB], FLY_OPTS);

  assert.ok(result.entryRequirements, "entry requirements should be present for GB");
  assert.equal(result.entryRequirements.country, "United Kingdom");
  assert.equal(result.entryRequirements.microchipRequired, true);
  assert.equal(result.entryRequirements.quarantine, false);
  assert.ok(result.entryRequirements.healthCertificate, "health cert info required");
  assert.ok(result.entryRequirements.source, "source URL required");
});

test("returns null entryRequirements for US (domestic)", async () => {
  const result = await getPetTravelGuidance([DOG_20LB], DRIVE_OPTS);

  assert.equal(result.entryRequirements, null, "no entry requirements for domestic US");
});

test("returns null entryRequirements for unknown country", async () => {
  const result = await getPetTravelGuidance([DOG_20LB], {
    ...FLY_OPTS,
    countryCode: "JP",
  });

  assert.equal(result.entryRequirements, null, "unknown country returns null entry requirements");
});

test("detects banned breed warning per country", async () => {
  const result = await getPetTravelGuidance([PIT_BULL_50LB], FLY_OPTS);

  assert.ok(result.entryRequirements, "entry requirements should exist");
  assert.ok(
    result.entryRequirements.breedWarnings?.length > 0,
    "should have breed warnings for pit bull in UK"
  );

  const warning = result.entryRequirements.breedWarnings[0];
  assert.ok(warning.includes("Rocky") || warning.includes("Pit Bull"),
    "warning should reference the pet or breed");
});

test("generates timeline warning for strict countries", async () => {
  // Trip in 5 days to GB which requires 30 days advance notice
  const soon = new Date();
  soon.setDate(soon.getDate() + 5);
  const soonStr = soon.toISOString().split("T")[0];

  const result = await getPetTravelGuidance([DOG_20LB], {
    ...FLY_OPTS,
    startDate: soonStr,
  });

  assert.ok(result.entryRequirements, "entry requirements should exist");
  assert.ok(
    result.entryRequirements.timelineWarning,
    "should have timeline warning when trip is only 5 days away but 30 days needed"
  );
  assert.ok(
    result.entryRequirements.timelineWarning.includes("30"),
    "warning should mention the 30-day requirement"
  );
});

test("handles multi-pet (dog + cat) with different eligibility results", async () => {
  const result = await getPetTravelGuidance([DOG_20LB, CAT_10LB], FLY_OPTS);

  assert.ok(result.airlineGuidance, "airline guidance present");
  assert.equal(result.airlineGuidance.length, 2, "two pets = two guidance entries");

  const dogGuidance = result.airlineGuidance[0];
  const catGuidance = result.airlineGuidance[1];
  assert.equal(dogGuidance.pet, "Max");
  assert.equal(catGuidance.pet, "Whiskers");

  // Both should have 6 airline results
  assert.equal(dogGuidance.airlines.length, 6);
  assert.equal(catGuidance.airlines.length, 6);
});

test("returns empty result when pets array is empty", async () => {
  const result = await getPetTravelGuidance([], FLY_OPTS);

  assert.equal(result.airlineGuidance, null, "no airline guidance for empty pets");
  assert.equal(result.entryRequirements, null, "no entry requirements for empty pets");
});
