#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://sproutroute-production.up.railway.app";

function usage() {
  return [
    "Usage: node scripts/verify-trip-hub-production.mjs [--mutate]",
    "",
    "Environment:",
    "  API_BASE_URL                     Defaults to production Railway URL.",
    "  RUN_TRIP_HUB_MUTATING_SMOKE=1    Alternative to --mutate.",
    "  SUPABASE_URL                     Optional cleanup when mutating.",
    "  SUPABASE_SERVICE_KEY             Optional cleanup when mutating.",
    "  SUPABASE_SERVICE_ROLE_KEY        Alias for SUPABASE_SERVICE_KEY.",
  ].join("\n");
}

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  console.log(usage());
  process.exit(0);
}

const mutate = args.has("--mutate") || process.env.RUN_TRIP_HUB_MUTATING_SMOKE === "1";
const baseUrl = normalizeBaseUrl(process.env.API_BASE_URL || DEFAULT_BASE_URL);

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function endpoint(path) {
  return `${baseUrl}${path}`;
}

async function requestJson(method, path, body, headers = {}) {
  const response = await fetch(endpoint(path), {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") && text
    ? JSON.parse(text)
    : { raw: text };

  return { response, payload };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertOk(result, label) {
  assert(
    result.response.ok,
    `${label} failed: HTTP ${result.response.status} ${JSON.stringify(result.payload)}`,
  );
}

function assertStatus(result, expectedStatus, label) {
  assert(
    result.response.status === expectedStatus,
    `${label} expected HTTP ${expectedStatus}, got ${result.response.status}: ${JSON.stringify(result.payload)}`,
  );
}

async function verifyRouteIsDeployed() {
  const result = await requestJson("POST", "/api/v1/group-trips", {});
  assert(
    result.response.status !== 404,
    `Trip Hub route is not deployed at ${baseUrl}: HTTP 404`,
  );
  assertStatus(result, 400, "Trip Hub validation route check");
  assert(
    result.payload?.code === "GROUP_TRIP_VALIDATION_ERROR",
    `Trip Hub validation envelope was not returned: ${JSON.stringify(result.payload)}`,
  );
}

async function verifyMutatingFlow() {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const title = `Codex Smoke Vegas ${suffix}`;
  const created = await requestJson("POST", "/api/v1/group-trips", {
    title,
    destination: "Las Vegas, NV",
    startDate: "2026-07-28",
    endDate: "2026-07-31",
    ownerName: "Codex Smoke",
  });
  assertStatus(created, 201, "Create Trip Hub");
  assert(created.payload?.trip?.id, "Create Trip Hub did not return trip.id");
  assert(created.payload?.trip?.inviteCode, "Create Trip Hub did not return inviteCode");
  assert(created.payload?.currentParticipant?.accessToken, "Create Trip Hub did not return owner access token");

  const tripId = created.payload.trip.id;
  const owner = created.payload.currentParticipant;

  try {
    const joined = await requestJson("POST", "/api/v1/group-trips/join", {
      inviteCode: created.payload.trip.inviteCode,
      displayName: "Codex Guest",
    });
    assertOk(joined, "Join Trip Hub");
    const guest = joined.payload.currentParticipant;
    assert(guest?.accessToken, "Join Trip Hub did not return guest access token");

    const item = await requestJson("POST", "/api/v1/group-trips/items", {
      tripId,
      actorParticipantId: owner.id,
      actorParticipantAccessToken: owner.accessToken,
      kind: "flight",
      title: "Arrive at LAS",
      startAt: "2026-07-28T17:30:00Z",
      locationName: "Harry Reid International Airport",
    });
    assertStatus(item, 201, "Add Trip Hub item");

    const decision = await requestJson("POST", "/api/v1/group-trips/decisions", {
      tripId,
      actorParticipantId: owner.id,
      actorParticipantAccessToken: owner.accessToken,
      title: "Friday dinner",
      options: ["Best Friend", "Din Tai Fung"],
    });
    assertStatus(decision, 201, "Create Trip Hub decision");

    const vote = await requestJson("POST", "/api/v1/group-trips/decisions/vote", {
      tripId,
      decisionId: decision.payload.decision.id,
      participantId: guest.id,
      participantAccessToken: guest.accessToken,
      optionId: decision.payload.decision.options[1].id,
    });
    assertOk(vote, "Vote Trip Hub decision");

    const expense = await requestJson("POST", "/api/v1/group-trips/expenses", {
      tripId,
      actorParticipantId: owner.id,
      actorParticipantAccessToken: owner.accessToken,
      paidByParticipantId: owner.id,
      title: "Hotel deposit",
      amountCents: 48000,
      currency: "USD",
      splitParticipantIds: [owner.id, guest.id],
    });
    assertStatus(expense, 201, "Record Trip Hub expense");

    const location = await requestJson("POST", "/api/v1/group-trips/location-sharing", {
      tripId,
      participantId: guest.id,
      participantAccessToken: guest.accessToken,
      isEnabled: true,
      latitude: 36.1699,
      longitude: -115.1398,
      accuracyMeters: 25,
    });
    assertOk(location, "Enable Trip Hub location sharing");

    const snapshot = await requestJson(
      "GET",
      `/api/v1/group-trips/snapshot?tripId=${encodeURIComponent(tripId)}&participantId=${encodeURIComponent(guest.id)}`,
      undefined,
      { "X-Group-Trip-Participant-Token": guest.accessToken },
    );
    assertOk(snapshot, "Load Trip Hub snapshot");
    assert(snapshot.payload.trip.title === title, "Snapshot trip title did not round-trip");
    assert(snapshot.payload.participants.length === 2, "Snapshot did not include both participants");
    assert(snapshot.payload.items.length === 1, "Snapshot did not include the itinerary item");
    assert(snapshot.payload.decisions[0]?.votes.length === 1, "Snapshot did not include the decision vote");
    assert(snapshot.payload.expenses.length === 1, "Snapshot did not include the expense");
    assert(snapshot.payload.balances.length === 1, "Snapshot did not include settlement balances");
    assert(
      snapshot.payload.participants.every((participant) => !participant.accessToken && !participant.accessTokenHash),
      "Snapshot leaked participant token material",
    );

    return { tripId, title, cleanedUp: await cleanupTripDocument(tripId) };
  } catch (error) {
    await cleanupTripDocument(tripId);
    throw error;
  }
}

async function cleanupTripDocument(tripId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return false;

  const restUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/group_trip_documents?id=eq.${encodeURIComponent(tripId)}`;
  const response = await fetch(restUrl, {
    method: "DELETE",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "return=minimal",
    },
  });
  assert(response.ok, `Cleanup failed for ${tripId}: HTTP ${response.status}`);
  return true;
}

try {
  await verifyRouteIsDeployed();

  if (!mutate) {
    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      mode: "route-check",
      message: "Trip Hub route is deployed and returns the expected validation envelope.",
    }, null, 2));
    process.exit(0);
  }

  const result = await verifyMutatingFlow();
  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    mode: "mutating",
    tripId: result.tripId,
    title: result.title,
    cleanedUp: result.cleanedUp,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    baseUrl,
    mode: mutate ? "mutating" : "route-check",
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
}
