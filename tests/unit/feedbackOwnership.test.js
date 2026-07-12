import assert from "node:assert/strict";
import test from "node:test";

import { saveTripFeedback } from "../../src/backend/services/feedbackStore.js";

function fakeAdmin(trips) {
  const inserted = [];
  return {
    inserted,
    from(table) {
      if (table === "trip_requests") {
        const filters = [];
        const query = {
          select() { return query; },
          eq(column, value) { filters.push([column, value]); return query; },
          async maybeSingle() {
            return {
              data: trips.find((trip) => filters.every(([column, value]) => trip[column] === value)) || null,
              error: null,
            };
          },
        };
        return query;
      }
      if (table === "trip_feedback") {
        return {
          async insert(row) {
            inserted.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

test("feedback can be attached only to the authenticated user's trip", async () => {
  const admin = fakeAdmin([
    { id: "trip-own", user_id: "user-1" },
    { id: "trip-foreign", user_id: "user-2" },
  ]);

  const own = await saveTripFeedback(admin, {
    userId: "user-1",
    tripRequestId: "trip-own",
    signalType: "more_like_this",
    payload: { activityId: "activity-1" },
  });
  assert.equal(own.ok, true);
  assert.equal(admin.inserted.length, 1);

  for (const tripRequestId of ["trip-foreign", "trip-missing"]) {
    const denied = await saveTripFeedback(admin, {
      userId: "user-1",
      tripRequestId,
      signalType: "less_like_this",
      payload: {},
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.unauthorized, true);
  }
  assert.equal(admin.inserted.length, 1);
});
