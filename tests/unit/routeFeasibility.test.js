import test from "node:test";
import assert from "node:assert/strict";

import { scoreRouteFeasibility } from "../../src/backend/services/routeFeasibility.js";

test("scoreRouteFeasibility flags packed Europe routes with multiple long transfers", () => {
  const result = scoreRouteFeasibility({
    totalDays: 10,
    stopCount: 4,
    longTransferCount: 2,
    flightLegCount: 1,
    hasChildren: false,
  });

  assert.equal(result.label, "packed");
  assert.ok(result.reasons.some((reason) => /transfers/i.test(reason)));
});

test("scoreRouteFeasibility penalizes child trips with too many base changes", () => {
  const result = scoreRouteFeasibility({
    totalDays: 7,
    stopCount: 4,
    longTransferCount: 1,
    flightLegCount: 0,
    hasChildren: true,
    anchorCount: 1,
  });

  assert.equal(result.label, "unrealistic");
  assert.ok(result.reasons.some((reason) => /children|family/i.test(reason)));
});
