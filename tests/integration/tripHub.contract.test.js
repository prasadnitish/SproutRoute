import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/backend/server.js";

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    sendFile() {},
  };
}

async function invokeRoute(app, method, path, body = {}, headers = {}) {
  const routeLayer = (app._router?.stack || []).find(
    (layer) =>
      layer.route &&
      layer.route.path === path &&
      layer.route.methods[method.toLowerCase()],
  );

  if (!routeLayer) {
    throw new Error(`Route not found: ${method} ${path}`);
  }

  const handler = routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;
  const req = {
    method,
    path,
    body: method === "GET" ? {} : body,
    query: method === "GET" ? body : {},
    headers,
    ip: "127.0.0.1",
  };
  const res = createMockRes();

  await handler(req, res);
  return res;
}

async function createVegasTrip(app) {
  return invokeRoute(app, "POST", "/api/v1/group-trips", {
    title: "Vegas 2026",
    destination: "Las Vegas, NV",
    startDate: "2026-09-18",
    endDate: "2026-09-21",
    ownerName: "Nitish",
  });
}

function invokeSnapshot(app, tripId, participant) {
  return invokeRoute(
    app,
    "GET",
    "/api/v1/group-trips/snapshot",
    { tripId, participantId: participant.id },
    { "x-group-trip-participant-token": participant.accessToken },
  );
}

function actorAuth(participant) {
  return {
    actorParticipantId: participant.id,
    actorParticipantAccessToken: participant.accessToken,
  };
}

test("POST /api/v1/group-trips creates an owner trip workspace with invite code", async () => {
  const app = createApp({ enableRequestLogging: false });

  const res = await createVegasTrip(app);

  assert.equal(res.statusCode, 201);
  assert.match(res.body.trip.id, /^trip_/);
  assert.equal(res.body.trip.title, "Vegas 2026");
  assert.equal(res.body.trip.destination, "Las Vegas, NV");
  assert.equal(res.body.trip.startDate, "2026-09-18");
  assert.equal(res.body.trip.endDate, "2026-09-21");
  assert.match(res.body.trip.inviteCode, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(res.body.currentParticipant.role, "owner");
  assert.equal(res.body.currentParticipant.displayName, "Nitish");
  assert.match(res.body.currentParticipant.accessToken, /^gtp_[A-Za-z0-9_-]{32,}$/);
  assert.equal(res.body.currentParticipant.accessTokenHash, undefined);
  assert.equal(res.body.participants.length, 1);
  assert.equal(res.body.participants[0].accessToken, undefined);
  assert.equal(res.body.participants[0].accessTokenHash, undefined);
});

test("POST /api/v1/group-trips returns storage error when production Trip Hub storage is unavailable", async () => {
  const app = createApp({
    enableRequestLogging: false,
    groupTripStore: {
      createTrip: async () => ({
        ok: false,
        storageError: true,
        errors: ["SUPABASE_SERVICE_KEY must be set"],
      }),
    },
  });

  const res = await createVegasTrip(app);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "GROUP_TRIP_STORAGE_ERROR");
  assert.equal(res.body.category, "dependency");
  assert.equal(res.body.retryable, true);
  assert.match(res.body.message, /SUPABASE_SERVICE_KEY/);
  assert.deepEqual(res.body.details, { errors: ["SUPABASE_SERVICE_KEY must be set"] });
});

test("POST /api/v1/group-trips/join adds an editor participant by invite code", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);

  const joined = await invokeRoute(app, "POST", "/api/v1/group-trips/join", {
    inviteCode: created.body.trip.inviteCode,
    displayName: "Priya",
  });

  assert.equal(joined.statusCode, 200);
  assert.equal(joined.body.trip.id, created.body.trip.id);
  assert.equal(joined.body.currentParticipant.role, "editor");
  assert.equal(joined.body.currentParticipant.displayName, "Priya");
  assert.match(joined.body.currentParticipant.accessToken, /^gtp_[A-Za-z0-9_-]{32,}$/);
  assert.equal(joined.body.currentParticipant.accessTokenHash, undefined);
  assert.notEqual(joined.body.currentParticipant.accessToken, created.body.currentParticipant.accessToken);
  assert.equal(joined.body.participants.length, 2);
  assert.deepEqual(
    joined.body.participants.map((participant) => participant.displayName),
    ["Nitish", "Priya"],
  );
  assert.equal(joined.body.participants.some((participant) => participant.accessToken), false);
  assert.equal(joined.body.participants.some((participant) => participant.accessTokenHash), false);
});

test("POST /api/v1/group-trips/join returns not-found envelope for unknown invite code", async () => {
  const app = createApp({ enableRequestLogging: false });

  const res = await invokeRoute(app, "POST", "/api/v1/group-trips/join", {
    inviteCode: "NOPE99",
    displayName: "Priya",
  });

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, "GROUP_TRIP_NOT_FOUND");
  assert.equal(res.body.category, "not_found");
  assert.equal(res.body.retryable, false);
  assert.deepEqual(res.body.details, { errors: ["Invite code was not found."] });
});

test("GET /api/v1/group-trips/snapshot returns the shared trip state", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);
  await invokeRoute(app, "POST", "/api/v1/group-trips/join", {
    inviteCode: created.body.trip.inviteCode,
    displayName: "Priya",
  });

  const snapshot = await invokeSnapshot(app, created.body.trip.id, created.body.currentParticipant);

  assert.equal(snapshot.statusCode, 200);
  assert.equal(snapshot.body.trip.id, created.body.trip.id);
  assert.equal(snapshot.body.participants.length, 2);
  assert.equal(snapshot.body.participants.some((participant) => participant.accessToken), false);
  assert.equal(snapshot.body.participants.some((participant) => participant.accessTokenHash), false);
  assert.deepEqual(snapshot.body.items, []);
  assert.deepEqual(snapshot.body.decisions, []);
  assert.deepEqual(snapshot.body.expenses, []);
  assert.equal(snapshot.body.activity.length, 1);
  assert.equal(snapshot.body.activity[0].type, "participant_joined");
  assert.equal(snapshot.body.aiSuggestions.length, 1);
  assert.equal(snapshot.body.aiSuggestions[0].type, "setup");
});

test("GET /api/v1/group-trips/snapshot rejects missing or invalid participant access tokens", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);

  const missingToken = await invokeRoute(app, "GET", "/api/v1/group-trips/snapshot", {
    tripId: created.body.trip.id,
    participantId: created.body.currentParticipant.id,
  });

  assert.equal(missingToken.statusCode, 403);
  assert.equal(missingToken.body.code, "GROUP_TRIP_AUTH_ERROR");
  assert.equal(missingToken.body.category, "authentication");
  assert.deepEqual(missingToken.body.details, {
    errors: ["A valid participant access token is required."],
  });
  assert.match(missingToken.body.message, /valid participant access token/i);

  const wrongToken = await invokeRoute(
    app,
    "GET",
    "/api/v1/group-trips/snapshot",
    { tripId: created.body.trip.id, participantId: created.body.currentParticipant.id },
    { "x-group-trip-participant-token": "gtp_wrong" },
  );

  assert.equal(wrongToken.statusCode, 403);
  assert.equal(wrongToken.body.code, "GROUP_TRIP_AUTH_ERROR");
});

test("GET /api/v1/group-trips/snapshot accepts participant access token header", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);

  const snapshot = await invokeRoute(
    app,
    "GET",
    "/api/v1/group-trips/snapshot",
    {
      tripId: created.body.trip.id,
      participantId: created.body.currentParticipant.id,
    },
    {
      "x-group-trip-participant-token": created.body.currentParticipant.accessToken,
    },
  );

  assert.equal(snapshot.statusCode, 200);
  assert.equal(snapshot.body.trip.id, created.body.trip.id);
  assert.equal(snapshot.body.participants[0].accessToken, undefined);
});

test("GET /api/v1/group-trips/snapshot rejects participant tokens in the URL", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);

  const leaked = await invokeRoute(
    app,
    "GET",
    "/api/v1/group-trips/snapshot",
    {
      tripId: created.body.trip.id,
      participantId: created.body.currentParticipant.id,
      participantAccessToken: created.body.currentParticipant.accessToken,
    },
    { "x-group-trip-participant-token": created.body.currentParticipant.accessToken },
  );

  assert.equal(leaked.statusCode, 400);
  assert.match(leaked.body.message, /must be sent in/i);
});

test("POST /api/v1/group-trips/items adds editable logistics to the shared snapshot", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);
  const joined = await invokeRoute(app, "POST", "/api/v1/group-trips/join", {
    inviteCode: created.body.trip.inviteCode,
    displayName: "Priya",
  });

  const itemRes = await invokeRoute(app, "POST", "/api/v1/group-trips/items", {
    tripId: created.body.trip.id,
    ...actorAuth(created.body.currentParticipant),
    kind: "flight",
    title: "Arrive at LAS",
    startAt: "2026-09-18T17:30:00Z",
    endAt: "2026-09-18T18:45:00Z",
    locationName: "Harry Reid International Airport",
    notes: "Share confirmation numbers in the group chat.",
    assignedParticipantIds: [
      created.body.currentParticipant.id,
      joined.body.currentParticipant.id,
      joined.body.currentParticipant.id,
    ],
  });

  assert.equal(itemRes.statusCode, 201);
  assert.match(itemRes.body.item.id, /^item_/);
  assert.equal(itemRes.body.item.tripId, created.body.trip.id);
  assert.equal(itemRes.body.item.kind, "flight");
  assert.equal(itemRes.body.item.title, "Arrive at LAS");
  assert.equal(itemRes.body.item.status, "planned");
  assert.equal(itemRes.body.item.createdByParticipantId, created.body.currentParticipant.id);
  assert.deepEqual(itemRes.body.item.assignedParticipantIds, [
    created.body.currentParticipant.id,
    joined.body.currentParticipant.id,
  ]);
  assert.equal(itemRes.body.activity.summary, "Nitish added Arrive at LAS");

  const snapshot = await invokeSnapshot(app, created.body.trip.id, created.body.currentParticipant);

  assert.equal(snapshot.body.items.length, 1);
  assert.equal(snapshot.body.items[0].title, "Arrive at LAS");
  assert.deepEqual(snapshot.body.items[0].assignedParticipantIds, [
    created.body.currentParticipant.id,
    joined.body.currentParticipant.id,
  ]);
  assert.equal(snapshot.body.activity.at(-1).type, "item_created");
});

test("POST /api/v1/group-trips/items/update edits itinerary items and participant tags", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);
  const joined = await invokeRoute(app, "POST", "/api/v1/group-trips/join", {
    inviteCode: created.body.trip.inviteCode,
    displayName: "Priya",
  });

  const createdItem = await invokeRoute(app, "POST", "/api/v1/group-trips/items", {
    tripId: created.body.trip.id,
    ...actorAuth(created.body.currentParticipant),
    kind: "activity",
    title: "Pool cabana",
    startAt: "2026-09-19T18:00:00Z",
    locationName: "Resort pool",
    assignedParticipantIds: [created.body.currentParticipant.id],
  });

  const updated = await invokeRoute(app, "POST", "/api/v1/group-trips/items/update", {
    tripId: created.body.trip.id,
    ...actorAuth(joined.body.currentParticipant),
    itemId: createdItem.body.item.id,
    kind: "meal",
    title: "Dinner reservation",
    startAt: "2026-09-19T20:00:00Z",
    endAt: "2026-09-19T22:00:00Z",
    locationName: "Best Friend",
    notes: "Moved after the cabana.",
    assignedParticipantIds: [
      joined.body.currentParticipant.id,
      created.body.currentParticipant.id,
    ],
  });

  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.item.id, createdItem.body.item.id);
  assert.equal(updated.body.item.kind, "meal");
  assert.equal(updated.body.item.title, "Dinner reservation");
  assert.equal(updated.body.item.locationName, "Best Friend");
  assert.equal(updated.body.item.createdByParticipantId, created.body.currentParticipant.id);
  assert.deepEqual(updated.body.item.assignedParticipantIds, [
    joined.body.currentParticipant.id,
    created.body.currentParticipant.id,
  ]);
  assert.equal(updated.body.activity.type, "item_updated");
  assert.equal(updated.body.activity.actorParticipantId, joined.body.currentParticipant.id);

  const snapshot = await invokeSnapshot(app, created.body.trip.id, created.body.currentParticipant);

  assert.equal(snapshot.body.items.length, 1);
  assert.equal(snapshot.body.items[0].title, "Dinner reservation");
  assert.equal(snapshot.body.items[0].createdByParticipantId, created.body.currentParticipant.id);
  assert.deepEqual(
    snapshot.body.activity.map((event) => event.type),
    ["participant_joined", "item_created", "item_updated"],
  );
});

test("POST /api/v1/group-trips/items/import-text creates tagged items from pasted itinerary text", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);
  const joined = await invokeRoute(app, "POST", "/api/v1/group-trips/join", {
    inviteCode: created.body.trip.inviteCode,
    displayName: "Priya",
  });

  const imported = await invokeRoute(app, "POST", "/api/v1/group-trips/items/import-text", {
    tripId: created.body.trip.id,
    ...actorAuth(created.body.currentParticipant),
    text: `
      Fri 9/18 5:30 PM - Arrive at LAS - Nitish
      Sat 9/19 8:00 PM - Dinner at Best Friend with Priya
      Sunday 9/20 11 AM - Pool cabana @ Bellagio
    `,
  });

  assert.equal(imported.statusCode, 201);
  assert.equal(imported.body.importedCount, 3);
  assert.equal(imported.body.items.length, 3);
  assert.equal(imported.body.items[0].kind, "flight");
  assert.equal(imported.body.items[0].title, "Arrive at LAS - Nitish");
  assert.equal(imported.body.items[0].startAt, "2026-09-18T17:30:00.000Z");
  assert.deepEqual(imported.body.items[0].assignedParticipantIds, [created.body.currentParticipant.id]);
  assert.equal(imported.body.items[1].kind, "meal");
  assert.equal(imported.body.items[1].startAt, "2026-09-19T20:00:00.000Z");
  assert.deepEqual(imported.body.items[1].assignedParticipantIds, [joined.body.currentParticipant.id]);
  assert.equal(imported.body.activity.type, "items_imported");

  const snapshot = await invokeSnapshot(app, created.body.trip.id, created.body.currentParticipant);

  assert.equal(snapshot.body.items.length, 3);
  assert.equal(snapshot.body.activity.at(-1).summary, "Nitish imported 3 itinerary items");
});

test("POST /api/v1/group-trips/items rejects forged participant mutations", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);

  const forged = await invokeRoute(app, "POST", "/api/v1/group-trips/items", {
    tripId: created.body.trip.id,
    actorParticipantId: created.body.currentParticipant.id,
    actorParticipantAccessToken: "gtp_wrong",
    kind: "flight",
    title: "Forged flight",
  });

  assert.equal(forged.statusCode, 403);
  assert.equal(forged.body.code, "GROUP_TRIP_AUTH_ERROR");

  const snapshot = await invokeSnapshot(app, created.body.trip.id, created.body.currentParticipant);

  assert.deepEqual(snapshot.body.items, []);
});

test("POST /api/v1/group-trips/decisions creates a voteable decision and records participant votes", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);
  const joined = await invokeRoute(app, "POST", "/api/v1/group-trips/join", {
    inviteCode: created.body.trip.inviteCode,
    displayName: "Priya",
  });

  const decisionRes = await invokeRoute(app, "POST", "/api/v1/group-trips/decisions", {
    tripId: created.body.trip.id,
    ...actorAuth(created.body.currentParticipant),
    title: "Friday dinner",
    options: ["Best Friend", "Din Tai Fung", "Tacos El Gordo"],
  });

  assert.equal(decisionRes.statusCode, 201);
  assert.match(decisionRes.body.decision.id, /^decision_/);
  assert.equal(decisionRes.body.decision.title, "Friday dinner");
  assert.equal(decisionRes.body.decision.status, "open");
  assert.equal(decisionRes.body.decision.options.length, 3);
  assert.deepEqual(decisionRes.body.decision.votes, []);

  const voteRes = await invokeRoute(app, "POST", "/api/v1/group-trips/decisions/vote", {
    tripId: created.body.trip.id,
    decisionId: decisionRes.body.decision.id,
    participantId: joined.body.currentParticipant.id,
    participantAccessToken: joined.body.currentParticipant.accessToken,
    optionId: decisionRes.body.decision.options[1].id,
  });

  assert.equal(voteRes.statusCode, 200);
  assert.equal(voteRes.body.decision.votes.length, 1);
  assert.equal(voteRes.body.decision.votes[0].participantId, joined.body.currentParticipant.id);
  assert.equal(voteRes.body.decision.votes[0].optionId, decisionRes.body.decision.options[1].id);

  const snapshot = await invokeSnapshot(app, created.body.trip.id, created.body.currentParticipant);

  assert.equal(snapshot.body.decisions.length, 1);
  assert.equal(snapshot.body.decisions[0].votes.length, 1);
  assert.ok(snapshot.body.aiSuggestions.some((suggestion) => suggestion.type === "decision_followup"));
  assert.deepEqual(
    snapshot.body.activity.map((event) => event.type),
    ["participant_joined", "decision_created", "decision_voted"],
  );
});

test("POST /api/v1/group-trips/expenses records shared costs and lightweight settlement balances", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);
  const joined = await invokeRoute(app, "POST", "/api/v1/group-trips/join", {
    inviteCode: created.body.trip.inviteCode,
    displayName: "Priya",
  });

  const expenseRes = await invokeRoute(app, "POST", "/api/v1/group-trips/expenses", {
    tripId: created.body.trip.id,
    paidByParticipantId: created.body.currentParticipant.id,
    ...actorAuth(created.body.currentParticipant),
    title: "Hotel deposit",
    amountCents: 48000,
    currency: "USD",
    splitParticipantIds: [
      created.body.currentParticipant.id,
      joined.body.currentParticipant.id,
    ],
  });

  assert.equal(expenseRes.statusCode, 201);
  assert.match(expenseRes.body.expense.id, /^expense_/);
  assert.equal(expenseRes.body.expense.title, "Hotel deposit");
  assert.equal(expenseRes.body.expense.amountCents, 48000);
  assert.equal(expenseRes.body.expense.currency, "USD");
  assert.equal(expenseRes.body.expense.splitParticipantIds.length, 2);
  assert.deepEqual(expenseRes.body.balances, [
    {
      fromParticipantId: joined.body.currentParticipant.id,
      toParticipantId: created.body.currentParticipant.id,
      amountCents: 24000,
      currency: "USD",
    },
  ]);

  const snapshot = await invokeSnapshot(app, created.body.trip.id, created.body.currentParticipant);

  assert.equal(snapshot.body.expenses.length, 1);
  assert.deepEqual(snapshot.body.balances, expenseRes.body.balances);
  assert.equal(snapshot.body.activity.at(-1).type, "expense_created");
});

test("GET /api/v1/group-trips/snapshot surfaces AI schedule conflict suggestions", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);
  const actorParticipantId = created.body.currentParticipant.id;

  await invokeRoute(app, "POST", "/api/v1/group-trips/items", {
    tripId: created.body.trip.id,
    actorParticipantId,
    actorParticipantAccessToken: created.body.currentParticipant.accessToken,
    kind: "activity",
    title: "Pool cabana",
    startAt: "2026-09-19T18:00:00Z",
    endAt: "2026-09-19T21:00:00Z",
    locationName: "Resort pool",
  });
  await invokeRoute(app, "POST", "/api/v1/group-trips/items", {
    tripId: created.body.trip.id,
    actorParticipantId,
    actorParticipantAccessToken: created.body.currentParticipant.accessToken,
    kind: "meal",
    title: "Dinner reservation",
    startAt: "2026-09-19T20:00:00Z",
    endAt: "2026-09-19T22:00:00Z",
    locationName: "The Strip",
  });

  const snapshot = await invokeSnapshot(app, created.body.trip.id, created.body.currentParticipant);

  const conflict = snapshot.body.aiSuggestions.find(
    (suggestion) => suggestion.type === "schedule_conflict",
  );

  assert.ok(conflict);
  assert.equal(conflict.severity, "warning");
  assert.match(conflict.summary, /Pool cabana/);
  assert.match(conflict.summary, /Dinner reservation/);
});

test("POST /api/v1/group-trips/location-sharing toggles participant opt-in state", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);

  const toggleRes = await invokeRoute(app, "POST", "/api/v1/group-trips/location-sharing", {
    tripId: created.body.trip.id,
    participantId: created.body.currentParticipant.id,
    participantAccessToken: created.body.currentParticipant.accessToken,
    isEnabled: true,
    latitude: 36.1699,
    longitude: -115.1398,
    accuracyMeters: 42,
  });

  assert.equal(toggleRes.statusCode, 200);
  assert.equal(toggleRes.body.participant.id, created.body.currentParticipant.id);
  assert.equal(toggleRes.body.participant.locationSharingEnabled, true);
  assert.deepEqual(toggleRes.body.participant.lastLocation, {
    latitude: 36.1699,
    longitude: -115.1398,
    accuracyMeters: 42,
    updatedAt: toggleRes.body.participant.lastLocation.updatedAt,
  });
  assert.match(toggleRes.body.participant.lastLocation.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(toggleRes.body.activity.type, "location_sharing_enabled");

  const snapshot = await invokeSnapshot(app, created.body.trip.id, created.body.currentParticipant);

  assert.equal(snapshot.body.participants[0].locationSharingEnabled, true);
  assert.equal(snapshot.body.participants[0].lastLocation.latitude, 36.1699);
  assert.equal(snapshot.body.participants[0].lastLocation.longitude, -115.1398);
  assert.equal(snapshot.body.activity.at(-1).type, "location_sharing_enabled");

  const offRes = await invokeRoute(app, "POST", "/api/v1/group-trips/location-sharing", {
    tripId: created.body.trip.id,
    participantId: created.body.currentParticipant.id,
    participantAccessToken: created.body.currentParticipant.accessToken,
    isEnabled: false,
  });

  assert.equal(offRes.statusCode, 200);
  assert.equal(offRes.body.participant.locationSharingEnabled, false);
  assert.equal(offRes.body.participant.lastLocation, null);
  assert.equal(offRes.body.activity.type, "location_sharing_disabled");
});

test("POST /api/v1/group-trips/location-sharing rejects invalid coordinates", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);

  const res = await invokeRoute(app, "POST", "/api/v1/group-trips/location-sharing", {
    tripId: created.body.trip.id,
    participantId: created.body.currentParticipant.id,
    participantAccessToken: created.body.currentParticipant.accessToken,
    isEnabled: true,
    latitude: 120,
    longitude: -115.1398,
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "GROUP_TRIP_VALIDATION_ERROR");
  assert.match(res.body.message, /Latitude must be between -90 and 90/);
});

test("POST /api/v1/group-trips/leave clears location and revokes the participant token", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);
  const joined = await invokeRoute(app, "POST", "/api/v1/group-trips/join", {
    inviteCode: created.body.trip.inviteCode,
    displayName: "Priya",
  });
  const participant = joined.body.currentParticipant;

  await invokeRoute(app, "POST", "/api/v1/group-trips/location-sharing", {
    tripId: created.body.trip.id,
    participantId: participant.id,
    participantAccessToken: participant.accessToken,
    isEnabled: true,
    latitude: 36.1699,
    longitude: -115.1398,
  });

  const left = await invokeRoute(app, "POST", "/api/v1/group-trips/leave", {
    tripId: created.body.trip.id,
    participantId: participant.id,
    participantAccessToken: participant.accessToken,
  });
  assert.equal(left.statusCode, 200);

  const stale = await invokeSnapshot(app, created.body.trip.id, participant);
  assert.equal(stale.statusCode, 403);

  const ownerSnapshot = await invokeSnapshot(app, created.body.trip.id, created.body.currentParticipant);
  const departed = ownerSnapshot.body.participants.find((entry) => entry.id === participant.id);
  assert.equal(departed.locationSharingEnabled, false);
  assert.equal(departed.lastLocation, null);
});

test("POST /api/v1/group-trips/invite/rotate invalidates the previous invite", async () => {
  const app = createApp({ enableRequestLogging: false });
  const created = await createVegasTrip(app);
  const oldInviteCode = created.body.trip.inviteCode;

  const rotated = await invokeRoute(app, "POST", "/api/v1/group-trips/invite/rotate", {
    tripId: created.body.trip.id,
    ...actorAuth(created.body.currentParticipant),
  });
  assert.equal(rotated.statusCode, 200);
  assert.notEqual(rotated.body.trip.inviteCode, oldInviteCode);

  const oldInvite = await invokeRoute(app, "POST", "/api/v1/group-trips/join", {
    inviteCode: oldInviteCode,
    displayName: "Priya",
  });
  assert.equal(oldInvite.statusCode, 404);

  const newInvite = await invokeRoute(app, "POST", "/api/v1/group-trips/join", {
    inviteCode: rotated.body.trip.inviteCode,
    displayName: "Priya",
  });
  assert.equal(newInvite.statusCode, 200);
});

test("POST /api/v1/group-trips rejects invalid date ranges", async () => {
  const app = createApp({ enableRequestLogging: false });

  const res = await invokeRoute(app, "POST", "/api/v1/group-trips", {
    title: "Bad Trip",
    destination: "Las Vegas, NV",
    startDate: "2026-09-21",
    endDate: "2026-09-18",
    ownerName: "Nitish",
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "GROUP_TRIP_VALIDATION_ERROR");
  assert.match(res.body.message, /End date/);
});
