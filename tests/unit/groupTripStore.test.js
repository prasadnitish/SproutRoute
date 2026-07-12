import assert from "node:assert/strict";
import test from "node:test";

import {
  createGroupTripStore,
  createInMemoryGroupTripStore,
  createSupabaseGroupTripStore,
} from "../../src/backend/services/groupTripStore.js";

function createFakeSupabaseAdmin() {
  return createTrackingSupabaseAdmin();
}

function createTrackingSupabaseAdmin(seedRows = []) {
  const documents = new Map(seedRows.map((row) => [row.id, structuredClone(row)]));
  const queries = [];

  function builder(action, payload) {
    const query = { action, payload, filters: [], limit: null, columns: null };
    queries.push(query);

    const api = {
      select(columns) {
        query.columns = columns;
        return api;
      },
      eq(column, value) {
        query.filters.push([column, value]);
        return api;
      },
      gt(column, value) {
        query.filters.push([column, value, "gt"]);
        return api;
      },
      lt(column, value) {
        query.filters.push([column, value, "lt"]);
        return api;
      },
      limit(value) {
        query.limit = value;
        return api;
      },
      maybeSingle: async () => execute(true),
      single: async () => execute(true),
      then(resolve, reject) {
        return execute(false).then(resolve, reject);
      },
    };

    async function execute(single) {
      let rows = Array.from(documents.values()).filter((row) =>
        query.filters.every(([column, value, operator]) =>
          operator === "gt" ? row[column] > value :
            operator === "lt" ? row[column] < value :
              row[column] === value,
        ),
      );
      if (query.limit !== null) rows = rows.slice(0, query.limit);

      if (action === "insert") {
        const row = structuredClone(payload);
        if (documents.has(row.id)) return { data: null, error: { code: "23505", message: "duplicate key" } };
        documents.set(row.id, row);
        rows = [row];
      } else if (action === "update") {
        rows = rows.map((existing) => {
          const next = { ...existing, ...structuredClone(payload) };
          documents.set(next.id, next);
          return next;
        });
      } else if (action === "delete") {
        for (const row of rows) documents.delete(row.id);
      }

      return { data: single ? (rows[0] || null) : rows, error: null };
    }

    return api;
  }

  return {
    documents,
    queries,
    from(tableName) {
      assert.equal(tableName, "group_trip_documents");
      return {
        select(columns) {
          return builder("select").select(columns);
        },
        insert(row) {
          return builder("insert", row);
        },
        update(row) {
          return builder("update", row);
        },
        delete() {
          return builder("delete");
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
    ownerKey: "user:test-owner",
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
    ownerKey: "user:test-owner",
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
    ownerKey: "user:test-owner",
  });

  assert.equal(created.ok, true);
  assert.match(created.trip.id, /^trip_/);
});

function createMemoryTrip() {
  const store = createInMemoryGroupTripStore();
  const created = store.createTrip({
    title: "Vegas 2026",
    destination: "Las Vegas, NV",
    startDate: "2026-09-18",
    endDate: "2026-09-21",
    ownerName: "Nitish",
    ownerKey: "user:test-owner",
  });
  assert.equal(created.ok, true);
  return { store, created };
}

test("Trip Hub rejects expired and revoked invites without minting a participant", () => {
  const { store, created } = createMemoryTrip();
  const state = store.dumpState();
  state.trips[0].inviteExpiresAt = "2000-01-01T00:00:00.000Z";

  const expiredStore = createInMemoryGroupTripStore(state);
  const expired = expiredStore.joinTrip({
    inviteCode: created.trip.inviteCode,
    displayName: "Priya",
  });

  assert.equal(expired.ok, false);
  assert.equal(expired.notFound, true);
  assert.equal(expiredStore.dumpState().participantsByTrip[created.trip.id].length, 1);

  state.trips[0].inviteExpiresAt = "2999-01-01T00:00:00.000Z";
  state.trips[0].inviteRevokedAt = new Date().toISOString();
  const revokedStore = createInMemoryGroupTripStore(state);
  const revoked = revokedStore.joinTrip({
    inviteCode: created.trip.inviteCode,
    displayName: "Priya",
  });

  assert.equal(revoked.ok, false);
  assert.equal(revoked.notFound, true);
});

test("Trip Hub bounds invite-based participant growth", () => {
  const { store, created } = createMemoryTrip();

  for (let index = 1; index < 25; index += 1) {
    const joined = store.joinTrip({
      inviteCode: created.trip.inviteCode,
      displayName: `Guest ${index}`,
    });
    assert.equal(joined.ok, true);
  }

  const rejected = store.joinTrip({
    inviteCode: created.trip.inviteCode,
    displayName: "One too many",
  });

  assert.equal(rejected.ok, false);
  assert.match(rejected.errors[0], /participant limit/i);
  assert.equal(store.dumpState().participantsByTrip[created.trip.id].length, 25);
});

test("Trip Hub accepts only bounded canonical expense cents", () => {
  const { store, created } = createMemoryTrip();
  const base = {
    tripId: created.trip.id,
    actorParticipantId: created.currentParticipant.id,
    actorParticipantAccessToken: created.currentParticipant.accessToken,
    paidByParticipantId: created.currentParticipant.id,
    title: "Hotel",
    currency: "USD",
    splitParticipantIds: [created.currentParticipant.id],
  };

  for (const amountCents of ["123abc", "1e6", Number.MAX_SAFE_INTEGER + 1, 100_000_001]) {
    const result = store.createExpense({ ...base, amountCents });
    assert.equal(result.ok, false, `expected ${amountCents} to be rejected`);
  }

  const accepted = store.createExpense({ ...base, amountCents: 100_000_000 });
  assert.equal(accepted.ok, true);
});

test("Trip Hub rejects expense payer attribution by a different participant", () => {
  const { store, created } = createMemoryTrip();
  const joined = store.joinTrip({
    inviteCode: created.trip.inviteCode,
    displayName: "Priya",
  });
  assert.equal(joined.ok, true);

  const result = store.createExpense({
    tripId: created.trip.id,
    actorParticipantId: joined.currentParticipant.id,
    actorParticipantAccessToken: joined.currentParticipant.accessToken,
    paidByParticipantId: created.currentParticipant.id,
    title: "Forged payer",
    amountCents: 48000,
    currency: "USD",
    splitParticipantIds: [created.currentParticipant.id, joined.currentParticipant.id],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors[0], /authenticated participant/i);
});

test("leaving Trip Hub revokes the token and clears precise location", () => {
  const { store, created } = createMemoryTrip();
  const joined = store.joinTrip({
    inviteCode: created.trip.inviteCode,
    displayName: "Priya",
  });
  const session = {
    tripId: created.trip.id,
    participantId: joined.currentParticipant.id,
    participantAccessToken: joined.currentParticipant.accessToken,
  };

  assert.equal(store.setLocationSharing({
    ...session,
    isEnabled: true,
    latitude: 36.1699,
    longitude: -115.1398,
    accuracyMeters: 25,
  }).ok, true);

  const left = store.leaveTrip(session);
  assert.equal(left.ok, true);

  const staleSnapshot = store.snapshot(session);
  assert.equal(staleSnapshot.ok, false);
  assert.equal(staleSnapshot.unauthorized, true);

  const ownerSnapshot = store.snapshot({
    tripId: created.trip.id,
    participantId: created.currentParticipant.id,
    participantAccessToken: created.currentParticipant.accessToken,
  });
  const departed = ownerSnapshot.participants.find((participant) => participant.id === session.participantId);
  assert.equal(departed.locationSharingEnabled, false);
  assert.equal(departed.lastLocation, null);
});

test("Supabase adapter validates create input before any service-role query", async () => {
  const admin = createTrackingSupabaseAdmin();
  const store = createSupabaseGroupTripStore({ admin });

  const result = await store.createTrip({ ownerName: "Nitish" });

  assert.equal(result.ok, false);
  assert.equal(admin.queries.length, 0);
});

test("Supabase adapter uses only bounded keyed reads and compare-and-swap writes", async () => {
  const admin = createTrackingSupabaseAdmin();
  const store = createSupabaseGroupTripStore({ admin });
  const created = await store.createTrip({
    title: "Vegas 2026",
    destination: "Las Vegas, NV",
    startDate: "2026-09-18",
    endDate: "2026-09-21",
    ownerName: "Nitish",
    ownerKey: "user:test-owner",
  });
  assert.equal(created.ok, true);

  const item = await store.addItem({
    tripId: created.trip.id,
    actorParticipantId: created.currentParticipant.id,
    actorParticipantAccessToken: created.currentParticipant.accessToken,
    kind: "flight",
    title: "Arrive at LAS",
    assignedParticipantIds: [created.currentParticipant.id],
  });
  assert.equal(item.ok, true);

  const unsafeRead = admin.queries.find((query) =>
    query.action === "select" && query.filters.length === 0 && query.limit === null,
  );
  assert.equal(unsafeRead, undefined);

  const versionedWrite = admin.queries.find((query) =>
    query.action === "update" &&
    query.filters.some(([column]) => column === "id") &&
    query.filters.some(([column]) => column === "version"),
  );
  assert.ok(versionedWrite, "expected a version-predicated document update");
});

test("Supabase adapter purges expired trip documents before creating a trip", async () => {
  const admin = createTrackingSupabaseAdmin([{
    id: "trip_expired",
    owner_key: "user:test-owner",
    status: "active",
    expires_at: "2000-01-01T00:00:00.000Z",
  }]);
  const store = createSupabaseGroupTripStore({ admin });

  const created = await store.createTrip({
    title: "Vegas 2026",
    destination: "Las Vegas, NV",
    startDate: "2026-09-18",
    endDate: "2026-09-21",
    ownerName: "Nitish",
    ownerKey: "user:test-owner",
  });

  assert.equal(created.ok, true);
  assert.equal(admin.documents.has("trip_expired"), false);
  assert.ok(admin.queries.some((query) =>
    query.action === "delete" &&
    query.filters.some(([column, , operator]) => column === "expires_at" && operator === "lt"),
  ));
});

test("Supabase adapter excludes unsafe legacy expenses from snapshots", async () => {
  const memoryStore = createInMemoryGroupTripStore();
  const created = memoryStore.createTrip({
    title: "Vegas 2026",
    destination: "Las Vegas, NV",
    startDate: "2026-09-18",
    endDate: "2026-09-21",
    ownerName: "Nitish",
    ownerKey: "user:test-owner",
  });
  const state = memoryStore.dumpState();
  const trip = state.trips[0];
  const admin = createTrackingSupabaseAdmin([{
    id: trip.id,
    invite_code: trip.inviteCode,
    invite_expires_at: trip.inviteExpiresAt,
    invite_generation: trip.inviteGeneration,
    trip_json: trip,
    participants_json: state.participantsByTrip[trip.id],
    items_json: [],
    decisions_json: [],
    expenses_json: [{
      id: "expense_legacy_unsafe",
      tripId: trip.id,
      title: "Corrupted import",
      amountCents: "123abc",
      currency: "USD",
      paidByParticipantId: created.currentParticipant.id,
      splitParticipantIds: [created.currentParticipant.id],
    }],
    activity_json: [],
    version: 1,
    owner_key: "user:test-owner",
    status: "active",
    expires_at: "2999-01-01T00:00:00.000Z",
  }]);
  const store = createSupabaseGroupTripStore({ admin });

  const snapshot = await store.snapshot({
    tripId: trip.id,
    participantId: created.currentParticipant.id,
    participantAccessToken: created.currentParticipant.accessToken,
  });

  assert.equal(snapshot.ok, true);
  assert.deepEqual(snapshot.expenses, []);
  assert.deepEqual(snapshot.balances, []);
});

test("Supabase compare-and-swap preserves concurrent successful joins", async () => {
  const admin = createTrackingSupabaseAdmin();
  const store = createSupabaseGroupTripStore({ admin });
  const created = await store.createTrip({
    title: "Vegas 2026",
    destination: "Las Vegas, NV",
    startDate: "2026-09-18",
    endDate: "2026-09-21",
    ownerName: "Nitish",
    ownerKey: "user:test-owner",
  });

  const [first, second] = await Promise.all([
    store.joinTrip({ inviteCode: created.trip.inviteCode, displayName: "Priya" }),
    store.joinTrip({ inviteCode: created.trip.inviteCode, displayName: "Maya" }),
  ]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  const snapshot = await store.snapshot({
    tripId: created.trip.id,
    participantId: created.currentParticipant.id,
    participantAccessToken: created.currentParticipant.accessToken,
  });
  assert.deepEqual(snapshot.participants.map((participant) => participant.displayName).sort(), [
    "Maya",
    "Nitish",
    "Priya",
  ]);

  for (const joined of [first, second]) {
    const authenticated = await store.snapshot({
      tripId: created.trip.id,
      participantId: joined.currentParticipant.id,
      participantAccessToken: joined.currentParticipant.accessToken,
    });
    assert.equal(authenticated.ok, true);
  }
});
