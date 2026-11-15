import test from "node:test";
import assert from "node:assert/strict";
import { carSeatCard, carSeatRowCount } from "../../src/frontend/src/utils/carSeatPresentation.js";

// The shape POST /api/safety/car-seat-check returns for an age-only match.
const tennessee = {
  status: "Needs review",
  jurisdictionCode: "TN",
  jurisdictionName: "Tennessee",
  message: "State laws change. Verify legal requirements before travel using the official source.",
  sourceUrl: "https://www.tn.gov/tdosafety/traffic-safety-programs/child-passenger-safety.html",
  effectiveDate: "Not found in repo",
  lastUpdated: "2026-02-15",
  results: [
    { childId: "child-1", ageYears: 3, status: "Needs review", requiredRestraint: "forward_facing_harness", requiredRestraintLabel: "Forward-facing seat with harness", seatPosition: "rear_seat_required_if_available", rationale: "Age matched but weight/height details are incomplete. Verify official rules before travel." },
    { childId: "child-2", ageYears: 6, status: "Needs review", requiredRestraint: "forward_facing_harness", requiredRestraintLabel: "Forward-facing seat with harness or booster seat, depending on weight and height", seatPosition: "rear_seat_required_if_available", rationale: "Age matched but weight/height details are incomplete. Verify official rules before travel." },
  ],
};

test("each child gets a row from the server's results, with the seat position in plain words", () => {
  const card = carSeatCard(tennessee, "Nashville, Tennessee, USA");
  assert.equal(card.title, "Car seats: Tennessee");
  assert.equal(card.message, tennessee.message);
  assert.deepEqual(card.rows, [
    { heading: "Age 3", detail: "Forward-facing seat with harness. Back seat required when the vehicle has one" },
    { heading: "Age 6", detail: "Forward-facing seat with harness or booster seat, depending on weight and height. Back seat required when the vehicle has one" },
  ]);
  assert.equal(carSeatRowCount(tennessee), 2);
});

test("an age-only match says once that weight and height can change the answer", () => {
  const card = carSeatCard(tennessee, "Nashville");
  assert.equal(card.note, "A summary of Tennessee car seat rules, based on age. Weight and height can change which seat is required, so confirm with the official source before you travel.");
  for (const row of card.rows) assert.ok(!row.detail.includes("incomplete"));
});

test("a verified match keeps each child's rationale and a shorter note", () => {
  const verified = { ...tennessee, status: "Verified", results: [{ ...tennessee.results[0], status: "Verified", rationale: "Under 4 and under 40 lb" }] };
  const card = carSeatCard(verified, "Nashville");
  assert.equal(card.rows[0].detail, "Forward-facing seat with harness. Back seat required when the vehicle has one. Under 4 and under 40 lb");
  assert.equal(card.note, "A summary of Tennessee car seat rules. Confirm with the official source before you travel.");
});

test("the source line names the site and the review date, and only web links are offered", () => {
  const card = carSeatCard(tennessee, "Nashville");
  assert.equal(card.sourceLine, "Source: tn.gov, rules updated Feb 15, 2026");
  assert.equal(card.sourceUrl, tennessee.sourceUrl);
  assert.equal(carSeatCard({ ...tennessee, sourceUrl: "javascript:alert(1)" }, "Nashville").sourceUrl, null);
  assert.equal(carSeatCard({ ...tennessee, lastUpdated: "Not found in repo" }, "Nashville").sourceLine, "Source: tn.gov");
});

test("an unavailable result is said in plain words, never as repo placeholders", () => {
  const unavailable = {
    status: "Unavailable", jurisdictionName: "Not found in repo", message: "No rule set", sourceUrl: null,
    effectiveDate: "Not found in repo", lastUpdated: "Not found in repo",
    results: [{ childId: "child-1", status: "Unavailable", requiredRestraint: "not_found", requiredRestraintLabel: "Not found in repo" }],
  };
  const card = carSeatCard(unavailable, "Kyoto, Japan");
  assert.equal(card.title, "Car seats");
  assert.equal(card.message, "SproutRoute doesn't have car seat rules for Kyoto, Japan yet. Check the local rules and your rental or taxi company before you travel.");
  assert.deepEqual(card.rows, []);
  assert.equal(card.note, null);
  assert.ok(!JSON.stringify(card).includes("Not found in repo"));
  assert.equal(carSeatRowCount(unavailable), 0);
  assert.match(carSeatCard(unavailable, "  ").message, /for this destination yet/);
});

test("no response, or one without results, gives no card", () => {
  assert.equal(carSeatCard(null, "Maui"), null);
  assert.equal(carSeatCard({}, "Maui"), null);
  assert.equal(carSeatRowCount(null), 0);
  assert.equal(carSeatRowCount({}), 0);
});

test("unknown codes are made readable and a missing age falls back to the child's number", () => {
  const card = carSeatCard({ status: "Needs review", results: [{ requiredRestraint: "booster_seat", seatPosition: "rear_seat_required_under_8" }, { ageYears: 1.5, requiredRestraintLabel: "Rear-facing seat", seatPosition: "not_found" }] }, "X");
  assert.deepEqual(card.rows, [
    { heading: "Child 1", detail: "Booster seat. Back seat required under age 8" },
    { heading: "Age 1.5", detail: "Rear-facing seat" },
  ]);
  assert.equal(card.title, "Car seats");
  assert.match(card.note, /^A summary of local car seat rules, based on age\./);
});
