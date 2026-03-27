/**
 * petEntryRules.test.js — International pet entry requirements database tests
 *
 * Tests the static pet entry rules database for Tier 1 countries:
 * US (domestic), Canada, Mexico, UK, EU countries.
 *
 * Also tests helper functions: getTimelineWarning() and isBannedBreed().
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  getEntryRules,
  getTimelineWarning,
  isBannedBreed,
} from "../../src/backend/data/petEntryRules.js";

// --- Lookup tests ---

test("getEntryRules returns rules for known country (GB/UK)", () => {
  const rules = getEntryRules("GB");
  assert.ok(rules, "Expected rules for GB");
  assert.equal(rules.countryCode, "GB");
  assert.equal(rules.countryName, "United Kingdom");
});

test("getEntryRules returns null for unknown country code", () => {
  const rules = getEntryRules("JP");
  assert.equal(rules, null);
});

test("getEntryRules returns null for invalid/nonsense country code", () => {
  const rules = getEntryRules("INVALID");
  assert.equal(rules, null);
});

test("getEntryRules returns null for US (domestic, no entry rules needed)", () => {
  const rules = getEntryRules("US");
  assert.equal(rules, null);
});

// --- Canada requirements ---

test("Canada requires rabies vaccine", () => {
  const rules = getEntryRules("CA");
  assert.ok(rules, "Expected rules for CA");
  assert.equal(rules.rabiesVaccineRequired, true);
  assert.equal(rules.countryName, "Canada");
});

// --- UK requirements ---

test("UK requires microchip + rabies + health cert", () => {
  const rules = getEntryRules("GB");
  assert.ok(rules);
  assert.equal(rules.microchipRequired, true);
  assert.equal(rules.rabiesVaccineRequired, true);
  assert.ok(
    rules.healthCertificate.length > 0,
    "Expected non-empty health certificate description"
  );
});

// --- EU requirements ---

test("EU country (DE) requires microchip + rabies + EU pet passport note", () => {
  const rules = getEntryRules("DE");
  assert.ok(rules, "Expected rules for DE (Germany)");
  assert.equal(rules.microchipRequired, true);
  assert.equal(rules.rabiesVaccineRequired, true);
  assert.ok(
    rules.notes.toLowerCase().includes("eu pet passport") ||
      rules.healthCertificate.toLowerCase().includes("eu pet passport"),
    "Expected EU pet passport mentioned in notes or healthCertificate"
  );
});

test("EU country (FR) uses same baseline as DE", () => {
  const rulesFR = getEntryRules("FR");
  const rulesDE = getEntryRules("DE");
  assert.ok(rulesFR, "Expected rules for FR");
  assert.equal(rulesFR.microchipRequired, rulesDE.microchipRequired);
  assert.equal(rulesFR.rabiesVaccineRequired, rulesDE.rabiesVaccineRequired);
  assert.equal(rulesFR.rabiesWaitDays, rulesDE.rabiesWaitDays);
});

// --- Mexico requirements ---

test("Mexico has minimal requirements (rabies + health cert, no quarantine)", () => {
  const rules = getEntryRules("MX");
  assert.ok(rules, "Expected rules for MX");
  assert.equal(rules.rabiesVaccineRequired, true);
  assert.equal(rules.quarantine, false);
  assert.ok(rules.healthCertificate.length > 0);
});

// --- Every entry has source URL ---

test("every entry has a source URL", () => {
  for (const code of ["CA", "MX", "GB", "DE", "FR", "IT", "ES", "NL"]) {
    const rules = getEntryRules(code);
    assert.ok(rules, `Expected rules for ${code}`);
    assert.ok(
      rules.source && rules.source.startsWith("http"),
      `Expected valid source URL for ${code}, got: ${rules.source}`
    );
  }
});

// --- UK bannedBreeds ---

test("UK bannedBreeds includes expected breeds", () => {
  const rules = getEntryRules("GB");
  assert.ok(rules);
  assert.ok(Array.isArray(rules.bannedBreeds));
  assert.ok(rules.bannedBreeds.length >= 4, "UK should ban at least 4 breeds");
  const lower = rules.bannedBreeds.map((b) => b.toLowerCase());
  assert.ok(
    lower.some((b) => b.includes("pit bull")),
    "UK should ban Pit Bull"
  );
  assert.ok(
    lower.some((b) => b.includes("japanese tosa")),
    "UK should ban Japanese Tosa"
  );
});

// --- getTimelineWarning tests ---

test("getTimelineWarning returns warning when advanceNoticeDays > days until trip", () => {
  const rules = {
    countryName: "United Kingdom",
    advanceNoticeDays: 30,
  };
  // Trip is 10 days away — not enough time
  const tripDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const warning = getTimelineWarning(rules, tripDate);
  assert.ok(warning, "Expected a warning string");
  assert.ok(
    warning.length > 0,
    "Expected non-empty warning"
  );
});

test("getTimelineWarning returns null when enough time before trip", () => {
  const rules = {
    countryName: "Canada",
    advanceNoticeDays: 10,
  };
  // Trip is 60 days away — plenty of time
  const tripDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const warning = getTimelineWarning(rules, tripDate);
  assert.equal(warning, null);
});

test("getTimelineWarning returns null when rules have no advanceNoticeDays", () => {
  const rules = { countryName: "Test" };
  const tripDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const warning = getTimelineWarning(rules, tripDate);
  assert.equal(warning, null);
});

// --- isBannedBreed tests ---

test("isBannedBreed detects Pit Bull banned in UK", () => {
  const rules = getEntryRules("GB");
  assert.ok(rules);
  assert.equal(isBannedBreed("Pit Bull Terrier", rules), true);
  assert.equal(isBannedBreed("pit bull", rules), true);
});

test("isBannedBreed allows Golden Retriever in UK", () => {
  const rules = getEntryRules("GB");
  assert.ok(rules);
  assert.equal(isBannedBreed("Golden Retriever", rules), false);
});

test("isBannedBreed returns false when rules have no bannedBreeds", () => {
  const rules = { bannedBreeds: [] };
  assert.equal(isBannedBreed("Pit Bull", rules), false);
});
