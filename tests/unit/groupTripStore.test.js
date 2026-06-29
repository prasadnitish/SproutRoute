import assert from "node:assert/strict";
import test from "node:test";

import {
  createGroupTripStore,
  createSupabaseGroupTripStore,
} from "../../src/backend/services/groupTripStore.js";

function createFakeSupabaseAdmin() {
  const documents = new Map();

  return {
    documents,
    from(tableName) {
      assert.equal(tableName, "group_trip_documents");
      return {
        select: async () => ({ data: Array.from(documents.values()), error: null }),
        upsert: async (row) => {
          documents.set(row.id, row);
          return { data: row, error: null };
        },
      };
    },
  };
}

test("Supabase-backed group trip store persists shared workspace state across store instances", async () => {
  const admin = createFakeSupabaseAdmin();
  const store = createSupabaseGroupTripStore({ admin });

  const created = await store.createTrip({
    title: "Vegas 2026",
    destination: "Las Vegas, NV",
    startDate: "2026-09-18",
    endDate: "2026-09-21",
    ownerName: "Nitish",
  });
  assert.equal(created.ok, true);

  const joined = await store.joinTrip({
    inviteCode: created.trip.inviteCode,
    displayName: "Priya",
  });
  assert.equal(joined.ok, true);

  const item = await store.addItem({
    tripId: created.trip.id,
    actorParticipantId: created.currentParticipant.id,
    actorParticipantAccessToken: created.currentParticipant.accessToken,
    kind: "flight",
    title: "Arrive at LAS",
    startAt: "2026-09-18T17:30:00Z",
    locationName: "Harry Reid International Airport",
    assignedParticipantIds: [created.currentParticipant.id],
  });
  assert.equal(item.ok, true);

  const updatedItem = await store.updateItem({
    tripId: created.trip.id,
    actorParticipantId: joined.currentParticipant.id,
    actorParticipantAccessToken: joined.currentParticipant.accessToken,
    itemId: item.item.id,
    kind: "meal",
    title: "Dinner at Best Friend",
    startAt: "2026-09-19T20:00:00Z",
    locationName: "Best Friend",
    assignedParticipantIds: [
      joined.currentParticipant.id,
      created.currentParticipant.id,
    ],
  });
  assert.equal(updatedItem.ok, true);

  const importedItems = await store.importItemsFromText({
    tripId: created.trip.id,
    actorParticipantId: created.currentParticipant.id,
    actorParticipantAccessToken: created.currentParticipant.accessToken,
    text: "Sun 9/20 11 AM - Pool cabana with Priya",
  });
  assert.equal(importedItems.ok, true);
  assert.equal(importedItems.items.length, 1);

  const decision = await store.createDecision({
    tripId: created.trip.id,
    actorParticipantId: created.currentParticipant.id,
    actorParticipantAccessToken: created.currentParticipant.accessToken,
    title: "Friday dinner",
    options: ["Best Friend", "Din Tai Fung"],
  });
  assert.equal(decision.ok, true);

  const vote = await store.voteDecision({
    tripId: created.trip.id,
    decisionId: decision.decision.id,
    participantId: joined.currentParticipant.id,
    participantAccessToken: joined.currentParticipant.accessToken,
    optionId: decision.decision.options[1].id,
  });
  assert.equal(vote.ok, true);

  const expense = await store.createExpense({
    tripId: created.trip.id,
    actorParticipantId: created.currentParticipant.id,
    actorParticipantAccessToken: created.currentParticipant.accessToken,
    paidByParticipantId: created.currentParticipant.id,
    title: "Hotel deposit",
    amountCents: 48000,
    currency: "USD",
    splitParticipantIds: [
      created.currentParticipant.id,
      joined.currentParticipant.id,
    ],
  });
  assert.equal(expense.ok, true);

  const location = await store.setLocationSharing({
    tripId: created.trip.id,
    participantId: joined.currentParticipant.id,
    participantAccessToken: joined.currentParticipant.accessToken,
    isEnabled: true,
    latitude: 36.1699,
    longitude: -115.1398,
    accuracyMeters: 25,
  });
  assert.equal(location.ok, true);

  const reloadedStore = createSupabaseGroupTripStore({ admin });
  const snapshot = await reloadedStore.snapshot({
    tripId: created.trip.id,
    participantId: joined.currentParticipant.id,
    participantAccessToken: joined.currentParticipant.accessToken,
  });

  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.trip.title, "Vegas 2026");
  assert.equal(snapshot.participants[0].displayName, "Nitish");
  assert.equal(snapshot.participants[1].displayName, "Priya");
  assert.equal(snapshot.participants[1].locationSharingEnabled, true);
  assert.equal(snapshot.participants[1].lastLocation.latitude, 36.1699);
  assert.equal(snapshot.participants[0].accessToken, undefined);
  assert.equal(snapshot.participants[0].accessTokenHash, undefined);
  assert.equal(snapshot.items[0].title, "Dinner at Best Friend");
  assert.deepEqual(snapshot.items[0].assignedParticipantIds, [
    joined.currentParticipant.id,
    created.currentParticipant.id,
  ]);
  assert.equal(snapshot.items[1].title, "Pool cabana with Priya");
  assert.deepEqual(snapshot.items[1].assignedParticipantIds, [joined.currentParticipant.id]);
  assert.equal(snapshot.decisions[0].title, "Friday dinner");
  assert.equal(snapshot.decisions[0].votes[0].participantId, joined.currentParticipant.id);
  assert.equal(snapshot.expenses[0].title, "Hotel deposit");
  assert.deepEqual(snapshot.balances, [
    {
      fromParticipantId: joined.currentParticipant.id,
      toParticipantId: created.currentParticipant.id,
      amountCents: 24000,
      currency: "USD",
    },
  ]);
  assert.ok(snapshot.aiSuggestions.some((suggestion) => suggestion.type === "decision_followup"));
  assert.equal(admin.documents.get(created.trip.id).participants_json[0].accessToken, undefined);
  assert.match(admin.documents.get(created.trip.id).participants_json[0].accessTokenHash, /^sha256_[A-Za-z0-9_-]{32,}$/);
  assert.equal(admin.documents.get(created.trip.id).participants_json[1].accessToken, undefined);
  assert.match(admin.documents.get(created.trip.id).participants_json[1].accessTokenHash, /^sha256_[A-Za-z0-9_-]{32,}$/);
  assert.equal(admin.documents.get(created.trip.id).items_json.length, 2);
  assert.equal(admin.documents.get(created.trip.id).items_json[0].title, "Dinner at Best Friend");
  assert.equal(admin.documents.get(created.trip.id).decisions_json.length, 1);
  assert.equal(admin.documents.get(created.trip.id).expenses_json.length, 1);
  assert.equal(admin.documents.get(created.trip.id).activity_json.at(-1).type, "location_sharing_enabled");
  assert.equal(admin.documents.size, 1);
});

test("createGroupTripStore does not silently use memory storage in production when Supabase is unavailable", async () => {
  const store = createGroupTripStore({
    environment: "production",
    getAdmin: () => {
      throw new Error("SUPABASE_SERVICE_KEY must be set");
    },
  });

  const created = await store.createTrip({
    title: "Vegas 2026",
    destination: "Las Vegas, NV",
    startDate: "2026-09-18",
    endDate: "2026-09-21",
    ownerName: "Nitish",
  });

  assert.equal(created.ok, false);
  assert.equal(created.storageError, true);
  assert.match(created.errors[0], /SUPABASE_SERVICE_KEY/);
});

test("createGroupTripStore keeps in-memory fallback outside production", async () => {
  const store = createGroupTripStore({
    environment: "test",
    getAdmin: () => {
      throw new Error("SUPABASE_SERVICE_KEY must be set");
    },
  });

  const created = await store.createTrip({
    title: "Vegas 2026",
    destination: "Las Vegas, NV",
    startDate: "2026-09-18",
    endDate: "2026-09-21",
    ownerName: "Nitish",
  });

  assert.equal(created.ok, true);
  assert.match(created.trip.id, /^trip_/);
});
