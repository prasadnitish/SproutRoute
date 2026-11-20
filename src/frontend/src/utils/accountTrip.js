import { buildSharedTripSnapshot } from "../../../shared/shareSnapshot.js";

const pendingKey = "sprout:pendingAccountTrip";
const permittedFields = new Set([
  "id",
  "placeId",
  "place_id",
  "googlePlaceId",
  "name",
  "title",
  "category",
  "duration",
  "scheduledStart",
  "scheduledEnd",
  "kidFriendly",
  "petFriendly",
  "timeOfDay",
  "isMeal",
  "mealType",
  "locked",
]);

function savedActivity(stop) {
  if (typeof stop === "string") return stop;
  return Object.fromEntries(
    Object.entries(stop || {}).filter(
      ([key, value]) =>
        permittedFields.has(key) &&
        ["string", "number", "boolean"].includes(typeof value),
    ),
  );
}

export function accountTripDraft(data, id = crypto.randomUUID()) {
  const snapshot = buildSharedTripSnapshot(data, {
    projectActivity: savedActivity,
  });
  for (const day of [
    ...snapshot.tripData.scheduledItinerary,
    ...snapshot.tripData.tripPlan.dailyItinerary,
  ]) {
    for (const meal of Object.values(day.meals || {}))
      if (meal && typeof meal === "object") delete meal.address;
  }
  return { id, destination: snapshot.tripData.trip.destination, snapshot };
}

export function stageTripDraft(
  draft,
  storage = sessionStorage,
  now = Date.now(),
) {
  storage.setItem(
    pendingKey,
    JSON.stringify({ draft, expires: now + 3600000 }),
  );
}

export function clearTripDraft(storage = sessionStorage) {
  storage.removeItem(pendingKey);
}

export function readTripDraft(storage = sessionStorage, now = Date.now()) {
  try {
    const pending = JSON.parse(storage.getItem(pendingKey));
    if (pending?.expires > now && pending.draft?.snapshot?.schemaVersion === 1)
      return pending.draft;
    clearTripDraft(storage);
  } catch {
    /* Unavailable storage or expired draft. */
  }
  return null;
}

export function shareHandoff(fragment) {
  const match = /^#(mcp=)?([A-Za-z0-9_-]{43})$/.exec(fragment);
  return match ? { token: match[2], mcp: Boolean(match[1]) } : null;
}
