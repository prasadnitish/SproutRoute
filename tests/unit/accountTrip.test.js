import test from "node:test";
import assert from "node:assert/strict";
import {
  accountTripDraft,
  readTripDraft,
  stageTripDraft,
  shareHandoff,
} from "../../src/frontend/src/utils/accountTrip.js";

const data = {
  parsed: { destination: "Seattle", rawText: "private" },
  scheduledItinerary: [
    {
      scheduled: [
        {
          name: "Park",
          placeId: "abc",
          rating: 4.7,
          latitude: 9,
          enriched: { address: "Precise" },
        },
      ],
    },
  ],
};
test("account save preserves place IDs and excludes enrichment, coordinates and original prompt", () => {
  const draft = accountTripDraft(data);
  assert.equal(
    draft.snapshot.tripData.scheduledItinerary[0].scheduled[0].placeId,
    "abc",
  );
  assert.doesNotMatch(JSON.stringify(draft), /Precise|rating|latitude|private/);
  assert.equal(accountTripDraft(data, draft.id).id, draft.id);
});
test("a pending save survives sign-in and expires after an hour", () => {
  const values = new Map();
  const store = {
    setItem: (k, v) => values.set(k, v),
    getItem: (k) => values.get(k),
    removeItem: (k) => values.delete(k),
  };
  const draft = accountTripDraft(data);
  stageTripDraft(draft, store, 0);
  assert.deepEqual(readTripDraft(store, 100), draft);
  assert.equal(readTripDraft(store, 3600001), null);
});
test("handoff tokens stay separate from share links and malformed fragments fail closed", () => {
  const token = "a".repeat(43);
  assert.deepEqual(shareHandoff("#mcp=" + token), { token, mcp: true });
  assert.deepEqual(shareHandoff("#" + token), { token, mcp: false });
  assert.equal(shareHandoff("#mcp=x"), null);
});
