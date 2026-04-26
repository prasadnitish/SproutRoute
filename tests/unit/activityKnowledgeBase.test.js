import test from "node:test";
import assert from "node:assert/strict";

import { classifyActivityConstraint } from "../../src/backend/services/activityKnowledgeBase.js";

test("classifyActivityConstraint treats major theme parks as full-day anchors", () => {
  const result = classifyActivityConstraint(
    { name: "Tokyo Disneyland", category: "theme_parks" },
    { hasChildren: true },
  );

  assert.equal(result.durationMinutes, 480);
  assert.equal(result.durationClass, "full_day");
  assert.equal(result.anchor, true);
  assert.equal(result.timeWindow.latestEnd, "18:00");
  assert.ok(result.warnings.some((warning) => warning.code === "reservation_recommended"));
});

test("classifyActivityConstraint uses realistic museum windows", () => {
  const result = classifyActivityConstraint(
    { name: "Tokyo National Museum", category: "museums" },
    { hasChildren: false },
  );

  assert.equal(result.durationMinutes, 150);
  assert.equal(result.timeWindow.earliestStart, "10:00");
  assert.equal(result.timeWindow.latestEnd, "17:00");
});
