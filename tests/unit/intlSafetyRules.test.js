import test from "node:test";
import assert from "node:assert/strict";
import {
  lookupCarSeatRules,
  INTL_CAR_SEAT_RULES,
  CAR_SEAT_RULES,
} from "../../src/backend/data/carSeatRules.js";

// ---------------------------------------------------------------------------
// lookupCarSeatRules — fallback chain tests
// ---------------------------------------------------------------------------

test("lookupCarSeatRules returns US state rules for US countryCode", () => {
  const result = lookupCarSeatRules("US", "CA");
  assert.ok(result, "Expected non-null result for US:CA");
  assert.equal(result.jurisdictionCode, "CA");
  assert.equal(result.jurisdictionName, "California");
  assert.ok(result.rules.length > 0, "Expected rules array to be non-empty");
});

test("lookupCarSeatRules returns Canadian province rules", () => {
  const result = lookupCarSeatRules("CA", "ON");
  assert.ok(result, "Expected non-null result for CA:ON");
  assert.equal(result.jurisdictionCode, "CA:ON");
  assert.equal(result.jurisdictionName, "Ontario, Canada");
  assert.ok(result.rules.length > 0, "Expected rules array to be non-empty");
});

test("lookupCarSeatRules falls back to country default", () => {
  // Manitoba is not explicitly defined, should fall back to CA:DEFAULT
  const result = lookupCarSeatRules("CA", "MB");
  assert.ok(result, "Expected non-null result for CA:MB (fallback to CA:DEFAULT)");
  assert.equal(result.jurisdictionCode, "CA:DEFAULT");
  assert.equal(result.jurisdictionName, "Canada (Federal)");
});

test("lookupCarSeatRules falls back to EU baseline for European countries", () => {
  // France has no explicit entry, should fall back to EU:DEFAULT
  const result = lookupCarSeatRules("FR", "IDF");
  assert.ok(result, "Expected non-null result for FR:IDF (fallback to EU:DEFAULT)");
  assert.equal(result.jurisdictionCode, "EU:DEFAULT");
  assert.equal(result.jurisdictionName, "European Union (ECE R129)");
});

test("lookupCarSeatRules returns UK rules", () => {
  const result = lookupCarSeatRules("GB", "ENG");
  assert.ok(result, "Expected non-null result for GB:ENG (fallback to GB:DEFAULT)");
  assert.equal(result.jurisdictionCode, "GB:DEFAULT");
  assert.equal(result.jurisdictionName, "United Kingdom");
});

test("lookupCarSeatRules returns null for unknown country", () => {
  const result = lookupCarSeatRules("ZZ", null);
  assert.equal(result, null, "Expected null for unknown country ZZ");
});

// ---------------------------------------------------------------------------
// INTL_CAR_SEAT_RULES — structural validation
// ---------------------------------------------------------------------------

test("INTL_CAR_SEAT_RULES has all expected jurisdiction keys", () => {
  const expectedKeys = [
    "CA:ON", "CA:BC", "CA:AB", "CA:QC", "CA:DEFAULT",
    "GB:DEFAULT",
    "AU:NSW", "AU:VIC", "AU:QLD", "AU:DEFAULT",
    "EU:DEFAULT",
  ];
  for (const key of expectedKeys) {
    assert.ok(INTL_CAR_SEAT_RULES[key], `Expected INTL_CAR_SEAT_RULES to have key "${key}"`);
  }
});

test("every INTL_CAR_SEAT_RULES entry has required fields", () => {
  for (const [key, entry] of Object.entries(INTL_CAR_SEAT_RULES)) {
    assert.equal(typeof entry.jurisdictionCode, "string", `${key}: missing jurisdictionCode`);
    assert.equal(typeof entry.jurisdictionName, "string", `${key}: missing jurisdictionName`);
    assert.equal(typeof entry.sourceUrl, "string", `${key}: missing sourceUrl`);
    assert.equal(typeof entry.lastUpdated, "string", `${key}: missing lastUpdated`);
    assert.equal(entry.verificationStatus, "Needs review", `${key}: verificationStatus should be "Needs review"`);
    assert.ok(Array.isArray(entry.rules), `${key}: rules should be an array`);
    assert.ok(entry.rules.length > 0, `${key}: rules should be non-empty`);
  }
});

test("every INTL_CAR_SEAT_RULES rule has priority and requiredRestraint", () => {
  for (const [key, entry] of Object.entries(INTL_CAR_SEAT_RULES)) {
    for (const rule of entry.rules) {
      assert.equal(typeof rule.priority, "number", `${key}: rule missing priority`);
      assert.equal(typeof rule.requiredRestraint, "string", `${key}: rule missing requiredRestraint`);
    }
  }
});

test("Australian rules include rear-facing for infants under 6 months", () => {
  const auDefault = INTL_CAR_SEAT_RULES["AU:DEFAULT"];
  const rearFacing = auDefault.rules.find((r) => r.requiredRestraint === "rear_facing");
  assert.ok(rearFacing, "AU:DEFAULT should have a rear_facing rule");
  assert.equal(rearFacing.minAgeMonths, 0);
  assert.ok(rearFacing.maxAgeMonths <= 6, "AU rear-facing max should be <= 6 months");
});

test("UK rules reference ECE R129 / i-Size in notes", () => {
  const gbDefault = INTL_CAR_SEAT_RULES["GB:DEFAULT"];
  assert.ok(
    gbDefault.notes.toLowerCase().includes("r129") || gbDefault.notes.toLowerCase().includes("i-size"),
    "GB:DEFAULT notes should reference R129 or i-Size",
  );
});

test("lookupCarSeatRules returns Australian state rules for AU:NSW", () => {
  const result = lookupCarSeatRules("AU", "NSW");
  assert.ok(result, "Expected non-null result for AU:NSW");
  assert.equal(result.jurisdictionCode, "AU:NSW");
  assert.equal(result.jurisdictionName, "New South Wales, Australia");
});

test("lookupCarSeatRules returns Australian default for unlisted AU state", () => {
  // TAS (Tasmania) is not explicitly defined, should fall back to AU:DEFAULT
  const result = lookupCarSeatRules("AU", "TAS");
  assert.ok(result, "Expected non-null result for AU:TAS (fallback to AU:DEFAULT)");
  assert.equal(result.jurisdictionCode, "AU:DEFAULT");
});
