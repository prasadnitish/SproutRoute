/**
 * dateCalc.test.js — Tests for inclusive day counting utility
 */

import test from "node:test";
import assert from "node:assert/strict";
import { inclusiveDayCount } from "../../src/backend/utils/dateCalc.js";

test("inclusiveDayCount: weekend trip Apr 18-19 = 2 days", () => {
  assert.strictEqual(inclusiveDayCount("2026-04-18", "2026-04-19"), 2);
});

test("inclusiveDayCount: same-day trip = 1 day", () => {
  assert.strictEqual(inclusiveDayCount("2026-04-18", "2026-04-18"), 1);
});

test("inclusiveDayCount: full week Mon-Sun = 7 days", () => {
  assert.strictEqual(inclusiveDayCount("2026-04-13", "2026-04-19"), 7);
});

test("inclusiveDayCount: two-week trip = 14 days", () => {
  assert.strictEqual(inclusiveDayCount("2026-05-01", "2026-05-14"), 14);
});

test("inclusiveDayCount: 3-day long weekend = 3 days", () => {
  assert.strictEqual(inclusiveDayCount("2026-04-17", "2026-04-19"), 3);
});

test("inclusiveDayCount: never returns less than 1", () => {
  // Same day
  assert.strictEqual(inclusiveDayCount("2026-01-01", "2026-01-01"), 1);
});
