import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CHILDREN, needsAgeConfirmation, initialAgeRows, agesComplete, ageLabel,
  withConfirmedAges, withSkippedAges, shouldFetchCarSeat, showsChildAges,
} from "../../src/frontend/src/utils/childAges.js";

test("the question is asked only when the server says it guessed the ages", () => {
  assert.equal(needsAgeConfirmation({ childrenAges: [5], childrenAgesAssumed: true }), true);
  assert.equal(needsAgeConfirmation({ childrenAges: [], childrenAgesAssumed: true }), true);
  assert.equal(needsAgeConfirmation({ childrenAges: [3, 7], childrenAgesAssumed: false }), false);
  assert.equal(needsAgeConfirmation({ childrenAges: [3, 7] }), false);
  assert.equal(needsAgeConfirmation(null), false);
});

test("one unset row per guessed child, so a guessed age is never pre-selected", () => {
  assert.deepEqual(initialAgeRows({ childrenAges: [5, 5] }), [null, null]);
  assert.deepEqual(initialAgeRows({ childrenAges: [] }), [null]);
  assert.equal(initialAgeRows({ childrenAges: Array(20).fill(5) }).length, MAX_CHILDREN);
});

test("continue needs every row answered; age 0 counts as an answer", () => {
  assert.equal(agesComplete([null]), false);
  assert.equal(agesComplete([3, null]), false);
  assert.equal(agesComplete([0, 7]), true);
  assert.equal(agesComplete([]), false);
});

test("age labels", () => {
  assert.equal(ageLabel(0), "Under 1");
  assert.equal(ageLabel(1), "1 year");
  assert.equal(ageLabel(9), "9 years");
});

test("confirmed ages replace the guess and clear the flag", () => {
  const parsed = withConfirmedAges({ destination: "Nashville", childrenAges: [5], childrenAgesAssumed: true }, [2, 9]);
  assert.deepEqual(parsed.childrenAges, [2, 9]);
  assert.equal(parsed.childrenAgesAssumed, false);
  assert.equal(parsed.destination, "Nashville");
  assert.equal(shouldFetchCarSeat(parsed), true);
  assert.equal(showsChildAges(parsed), true);
});

test("skipping keeps planning but never builds car seat guidance from a guess", () => {
  const parsed = withSkippedAges({ childrenAges: [5], childrenAgesAssumed: true });
  assert.deepEqual(parsed.childrenAges, [5]);
  assert.equal(shouldFetchCarSeat(parsed), false);
  assert.equal(showsChildAges(parsed), false);
});

test("no children means no car seat request", () => {
  assert.equal(shouldFetchCarSeat({ childrenAges: [] }), false);
  assert.equal(shouldFetchCarSeat({ childrenAges: [4] }), true);
});
