import crypto from "crypto";
import { sanitizeString } from "../utils/sanitize.js";
import { getSupabaseAdmin } from "../utils/supabaseClient.js";

const GROUP_TRIP_DOCUMENTS_TABLE = "group_trip_documents";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PARTICIPANTS_PER_TRIP = 25;
const MAX_ITEMS_PER_TRIP = 500;
const MAX_ACTIVITY_EVENTS_PER_TRIP = 1_000;
const MAX_EXPENSE_AMOUNT_CENTS = 100_000_000;
const MAX_ACTIVE_TRIPS_PER_OWNER = 5;
const TRIP_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function makeParticipantAccessToken() {
  return `gtp_${crypto.randomBytes(32).toString("base64url")}`;
}

function hashParticipantAccessToken(token) {
  return `sha256_${crypto.createHash("sha256").update(String(token)).digest("base64url")}`;
}

function makeInviteCode(existingCodes) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = crypto.randomBytes(16).toString("base64url");
    if (!existingCodes.has(code)) return code;
  }
  throw new Error("Could not allocate invite code");
}

function inviteExpiresAt(now = Date.now()) {
  return new Date(now + INVITE_TTL_MS).toISOString();
}

function isInviteUsable(trip, now = Date.now()) {
  if (!trip || trip.status !== "active" || trip.inviteRevokedAt) return false;
  const expiresAt = Date.parse(String(trip.inviteExpiresAt || ""));
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function parseExpenseAmountCents(value) {
  const raw = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const amountCents = Number(raw);
  if (!Number.isSafeInteger(amountCents) || amountCents > MAX_EXPENSE_AMOUNT_CENTS) return null;
  return amountCents;
}

function isStoredExpenseSafe(expense) {
  return parseExpenseAmountCents(expense?.amountCents) !== null;
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return Number.isFinite(new Date(`${value}T00:00:00Z`).getTime());
}

function validateTripDates(startDate, endDate) {
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    return "Start and end dates must use YYYY-MM-DD.";
  }

  if (new Date(`${endDate}T00:00:00Z`) < new Date(`${startDate}T00:00:00Z`)) {
    return "End date must be on or after start date.";
  }

  return null;
}

function sanitizeDisplayName(value) {
  return sanitizeString(value, 80);
}

function sanitizeAccessToken(value) {
  return sanitizeString(String(value ?? ""), 120);
}

function publicParticipant(participant) {
  if (!participant) return participant;
  const {
    accessToken: _accessToken,
    accessTokenHash: _accessTokenHash,
    ...safeParticipant
  } = participant;
  return safeParticipant;
}

function currentParticipant(participant, accessToken) {
  return participant ? { ...publicParticipant(participant), accessToken } : participant;
}

function hasValidParticipantAccessToken(participant, token) {
  if (!participant || !token || participant.status === "left" || participant.revokedAt) return false;
  const storedHash = participant.accessTokenHash || (participant.accessToken && hashParticipantAccessToken(participant.accessToken));
  if (!storedHash) return false;

  const expected = Buffer.from(String(storedHash));
  const received = Buffer.from(hashParticipantAccessToken(token));
  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(expected, received);
}

function normalizeStoredParticipant(participant = {}) {
  const {
    accessToken,
    accessTokenHash = accessToken ? hashParticipantAccessToken(accessToken) : undefined,
    ...rest
  } = participant;
  return {
    ...rest,
    ...(accessTokenHash ? { accessTokenHash } : {}),
  };
}

function authFailure() {
  return {
    ok: false,
    unauthorized: true,
    errors: ["A valid participant access token is required."],
  };
}

function sanitizeOptionalString(value, maxLength = 200) {
  if (value === undefined || value === null) return null;
  return sanitizeString(String(value), maxLength) || null;
}

function uniqueSanitizedStrings(values, maxLength = 80) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const sanitized = sanitizeString(String(value ?? ""), maxLength);
    if (!sanitized || seen.has(sanitized)) continue;
    seen.add(sanitized);
    result.push(sanitized);
  }
  return result;
}

function normalizeStoredItem(item = {}) {
  return {
    ...item,
    assignedParticipantIds: uniqueSanitizedStrings(item.assignedParticipantIds),
  };
}

function stripImportPrefix(line) {
  return sanitizeString(String(line ?? "").replace(/^[\s>*•-]+/, "").replace(/^\d+[\).]\s*/, ""), 500)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedImportTitle(value) {
  return sanitizeString(String(value ?? "").replace(/^[\s:|,-]+/, "").replace(/[\s:|,-]+$/, ""), 160);
}

function inferItemKind(text) {
  const lower = text.toLowerCase();
  if (/\b(flight|airport|depart|departure|arrive|arrival|las|terminal|gate)\b/.test(lower)) return "flight";
  if (/\b(hotel|resort|check[- ]?in|checkout|airbnb|lodging|stay)\b/.test(lower)) return "lodging";
  if (/\b(uber|lyft|taxi|cab|drive|rental|shuttle|transfer|pickup|drop[- ]?off)\b/.test(lower)) return "transport";
  if (/\b(dinner|lunch|breakfast|brunch|meal|reservation|restaurant)\b/.test(lower)) return "meal";
  if (/\b(show|concert|ticket|game|event)\b/.test(lower)) return "event";
  return "activity";
}

function parseImportDateTime(line, trip) {
  const tripYear = Number.parseInt(String(trip?.startDate ?? "").slice(0, 4), 10) || new Date().getUTCFullYear();
  let remaining = line;
  let year = tripYear;
  let month = null;
  let day = null;
  let hour = 9;
  let minute = 0;

  const isoDateMatch = remaining.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  const slashDateMatch = remaining.match(/\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)?\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i);
  const timeMatch = remaining.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i) ||
    remaining.match(/\b(\d{1,2}):(\d{2})\b/);

  if (isoDateMatch) {
    year = Number.parseInt(isoDateMatch[1], 10);
    month = Number.parseInt(isoDateMatch[2], 10);
    day = Number.parseInt(isoDateMatch[3], 10);
    remaining = remaining.replace(isoDateMatch[0], " ");
  } else if (slashDateMatch) {
    month = Number.parseInt(slashDateMatch[1], 10);
    day = Number.parseInt(slashDateMatch[2], 10);
    if (slashDateMatch[3]) {
      const parsedYear = Number.parseInt(slashDateMatch[3], 10);
      year = parsedYear < 100 ? 2000 + parsedYear : parsedYear;
    }
    remaining = remaining.replace(slashDateMatch[0], " ");
  }

  if (timeMatch) {
    hour = Number.parseInt(timeMatch[1], 10);
    minute = Number.parseInt(timeMatch[2] ?? "0", 10);
    const meridiem = timeMatch[3]?.toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    remaining = remaining.replace(timeMatch[0], " ");
  }

  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    return { startAt: null, remaining: normalizedImportTitle(remaining) };
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  if (!Number.isFinite(date.getTime())) {
    return { startAt: null, remaining: normalizedImportTitle(remaining) };
  }

  return {
    startAt: date.toISOString(),
    remaining: normalizedImportTitle(remaining),
  };
}

function locationFromImportTitle(title) {
  const atMatch = title.match(/\s@\s*([^|]+)$/);
  if (!atMatch) return null;
  return sanitizeOptionalString(atMatch[1], 160);
}

function hasCoordinateValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function roundedNumber(value, decimals) {
  return Number(Number(value).toFixed(decimals));
}

function normalizeLocationInput(input = {}, isEnabled) {
  if (!isEnabled) return { value: null, errors: [] };

  const hasLatitude = hasCoordinateValue(input.latitude);
  const hasLongitude = hasCoordinateValue(input.longitude);
  const hasAccuracy = hasCoordinateValue(input.accuracyMeters);
  const errors = [];

  if (!hasLatitude && !hasLongitude && !hasAccuracy) {
    return { value: null, errors };
  }

  if (!hasLatitude || !hasLongitude) {
    return {
      value: null,
      errors: ["Latitude and longitude are required together."],
    };
  }

  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const accuracyMeters = hasAccuracy ? Number(input.accuracyMeters) : null;

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    errors.push("Latitude must be between -90 and 90.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    errors.push("Longitude must be between -180 and 180.");
  }
  if (hasAccuracy && (!Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 100000)) {
    errors.push("Accuracy must be between 0 and 100000 meters.");
  }
  if (errors.length) return { value: null, errors };

  return {
    value: {
      latitude: roundedNumber(latitude, 6),
      longitude: roundedNumber(longitude, 6),
      accuracyMeters: accuracyMeters === null ? null : roundedNumber(accuracyMeters, 1),
    },
    errors,
  };
}

function sanitizeTripInput(input = {}) {
  const title = sanitizeString(input.title, 120);
  const destination = sanitizeString(input.destination, 120);
  const startDate = sanitizeString(String(input.startDate ?? ""), 20);
  const endDate = sanitizeString(String(input.endDate ?? ""), 20);
  const ownerName = sanitizeDisplayName(input.ownerName);
  const errors = [];

  if (!title) errors.push("Title is required.");
  if (!destination) errors.push("Destination is required.");
  if (!ownerName) errors.push("Owner name is required.");

  const dateError = validateTripDates(startDate, endDate);
  if (dateError) errors.push(dateError);

  return {
    value: { title, destination, startDate, endDate, ownerName },
    errors,
  };
}

function makeSetupSuggestion(tripId) {
  return {
    id: `suggestion_${tripId}_setup`,
    tripId,
    type: "setup",
    severity: "info",
    title: "Add the core logistics",
    summary: "Flights, hotel, airport transfers, and first meetup details should be added before inviting the full group.",
    status: "open",
  };
}

function makeDecisionFollowupSuggestion(tripId, openDecisionCount) {
  return {
    id: `suggestion_${tripId}_decisions`,
    tripId,
    type: "decision_followup",
    severity: "info",
    title: "Close open group decisions",
    summary: `${openDecisionCount} decision${openDecisionCount === 1 ? "" : "s"} still need group input before the itinerary is final.`,
    status: "open",
  };
}

function makeScheduleConflictSuggestion(tripId, firstItem, secondItem) {
  return {
    id: `suggestion_${tripId}_schedule_conflict_${firstItem.id}_${secondItem.id}`,
    tripId,
    type: "schedule_conflict",
    severity: "warning",
    title: "Resolve an itinerary overlap",
    summary: `${firstItem.title} overlaps with ${secondItem.title}. Adjust one time before the group relies on this plan.`,
    status: "open",
    relatedItemIds: [firstItem.id, secondItem.id],
  };
}

function parseDateTime(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function mapByTrip(initialValue = {}, normalizeValue = (value) => value) {
  return new Map(
    Object.entries(initialValue).map(([tripId, values]) => [
      tripId,
      Array.isArray(values) ? values.map(normalizeValue) : [],
    ]),
  );
}

function objectFromTripMap(map) {
  return Object.fromEntries(
    Array.from(map.entries()).map(([tripId, values]) => [
      tripId,
      Array.isArray(values) ? values : [],
    ]),
  );
}

export function createInMemoryGroupTripStore(initialState = {}) {
  const initialTrips = Array.isArray(initialState.trips) ? initialState.trips : [];
  const trips = new Map(initialTrips.map((trip) => [trip.id, { ...trip }]));
  const inviteCodes = new Map(initialTrips.map((trip) => [trip.inviteCode, trip.id]));
  const participantsByTrip = mapByTrip(initialState.participantsByTrip, normalizeStoredParticipant);
  const itemsByTrip = mapByTrip(initialState.itemsByTrip, normalizeStoredItem);
  const decisionsByTrip = mapByTrip(initialState.decisionsByTrip);
  const expensesByTrip = mapByTrip(initialState.expensesByTrip);
  const activityByTrip = mapByTrip(initialState.activityByTrip);

  function participantsFor(tripId) {
    return participantsByTrip.get(tripId) || [];
  }

  function itemsFor(tripId) {
    return itemsByTrip.get(tripId) || [];
  }

  function decisionsFor(tripId) {
    return decisionsByTrip.get(tripId) || [];
  }

  function expensesFor(tripId) {
    return expensesByTrip.get(tripId) || [];
  }

  function activityFor(tripId) {
    return activityByTrip.get(tripId) || [];
  }

  function participantFor(tripId, participantId) {
    return participantsFor(tripId).find((participant) => participant.id === participantId) || null;
  }

  function publicParticipantsFor(tripId) {
    return participantsFor(tripId).map(publicParticipant);
  }

  function validateTripAndActor(input = {}) {
    const tripId = sanitizeString(input.tripId, 80);
    const actorParticipantId = sanitizeString(input.actorParticipantId, 80);
    const actorParticipantAccessToken = sanitizeAccessToken(input.actorParticipantAccessToken);
    const errors = [];

    if (!tripId) errors.push("Trip id is required.");
    if (!actorParticipantId) errors.push("Actor participant id is required.");

    const trip = trips.get(tripId);
    if (tripId && !trip) {
      return { ok: false, notFound: true, errors: ["Trip was not found."] };
    }

    const actor = trip ? participantFor(tripId, actorParticipantId) : null;
    if (trip && actorParticipantId && !actor) {
      return { ok: false, notFound: true, errors: ["Participant was not found for this trip."] };
    }

    if (errors.length) return { ok: false, errors };
    if (!hasValidParticipantAccessToken(actor, actorParticipantAccessToken)) return authFailure();
    return { ok: true, trip, actor, tripId, actorParticipantId };
  }

  function validateParticipantSession(input = {}) {
    const tripId = sanitizeString(input.tripId, 80);
    const participantId = sanitizeString(input.participantId, 80);
    const participantAccessToken = sanitizeAccessToken(input.participantAccessToken);
    const errors = [];

    if (!tripId) errors.push("Trip id is required.");
    if (!participantId) errors.push("Participant id is required.");
    if (errors.length) return { ok: false, errors };

    const trip = trips.get(tripId);
    if (!trip) return { ok: false, notFound: true, errors: ["Trip was not found."] };

    const participant = participantFor(tripId, participantId);
    if (!participant) {
      return { ok: false, notFound: true, errors: ["Participant was not found for this trip."] };
    }

    if (!hasValidParticipantAccessToken(participant, participantAccessToken)) return authFailure();
    return { ok: true, trip, participant, tripId, participantId };
  }

  function sanitizeAssignedParticipantIds(input, tripId) {
    const assignedParticipantIds = uniqueSanitizedStrings(input.assignedParticipantIds);
    const errors = [];

    for (const participantId of assignedParticipantIds) {
      if (!participantFor(tripId, participantId)) {
        errors.push("Assigned participants must belong to this trip.");
        break;
      }
    }

    return { assignedParticipantIds, errors };
  }

  function sanitizeItemFields(input = {}, tripId) {
    const kind = sanitizeString(input.kind, 40).toLowerCase();
    const title = sanitizeString(input.title, 160);
    const { assignedParticipantIds, errors } = sanitizeAssignedParticipantIds(input, tripId);

    if (!kind) errors.push("Item kind is required.");
    if (!title) errors.push("Item title is required.");

    return {
      value: {
        kind,
        title,
        startAt: sanitizeOptionalString(input.startAt, 40),
        endAt: sanitizeOptionalString(input.endAt, 40),
        locationName: sanitizeOptionalString(input.locationName, 160),
        notes: sanitizeOptionalString(input.notes, 500),
        assignedParticipantIds,
      },
      errors,
    };
  }

  function participantTagsForText(tripId, text) {
    const lower = String(text ?? "").toLowerCase();
    return participantsFor(tripId)
      .filter((participant) => {
        const displayName = String(participant.displayName ?? "").trim().toLowerCase();
        if (displayName.length < 2) return false;
        const firstName = displayName.split(/\s+/)[0];
        return lower.includes(displayName) || (firstName.length > 1 && lower.includes(firstName));
      })
      .map((participant) => participant.id);
  }

  function parseImportText(input = {}, base) {
    const text = sanitizeString(String(input.text ?? ""), 5000);
    if (!text) return { items: [], errors: ["Paste itinerary text before importing."] };

    const lines = text
      .split(/\r?\n|;/)
      .map(stripImportPrefix)
      .filter(Boolean)
      .slice(0, 50);

    const items = lines
      .map((line) => {
        const parsedDate = parseImportDateTime(line, base.trip);
        const title = parsedDate.remaining || normalizedImportTitle(line);
        if (!title) return null;

        return {
          kind: inferItemKind(line),
          title,
          startAt: parsedDate.startAt,
          endAt: null,
          locationName: locationFromImportTitle(title),
          notes: null,
          assignedParticipantIds: participantTagsForText(base.tripId, line),
        };
      })
      .filter(Boolean);

    if (items.length === 0) {
      return { items, errors: ["No itinerary items could be found in the pasted text."] };
    }

    return { items, errors: [] };
  }

  function appendActivity(tripId, event) {
    const activity = [...activityFor(tripId), event].slice(-MAX_ACTIVITY_EVENTS_PER_TRIP);
    activityByTrip.set(tripId, activity);
    return event;
  }

  function suggestionsFor(tripId) {
    const suggestions = [makeSetupSuggestion(tripId)];
    const openDecisionCount = decisionsFor(tripId).filter((decision) => decision.status === "open").length;
    const scheduledItems = itemsFor(tripId)
      .map((item) => ({
        item,
        start: parseDateTime(item.startAt),
        end: parseDateTime(item.endAt),
      }))
      .filter((entry) => entry.start !== null && entry.end !== null && entry.end > entry.start)
      .sort((first, second) => first.start - second.start);

    if (openDecisionCount > 0) {
      suggestions.push(makeDecisionFollowupSuggestion(tripId, openDecisionCount));
    }

    for (let index = 1; index < scheduledItems.length; index += 1) {
      const previous = scheduledItems[index - 1];
      const current = scheduledItems[index];
      if (current.start < previous.end) {
        suggestions.push(makeScheduleConflictSuggestion(tripId, previous.item, current.item));
        break;
      }
    }

    return suggestions;
  }

  function balancesFor(tripId) {
    const balancesByKey = new Map();

    for (const expense of expensesFor(tripId)) {
      if (!expense.splitParticipantIds.includes(expense.paidByParticipantId)) continue;

      const shareCents = Math.round(expense.amountCents / expense.splitParticipantIds.length);
      for (const participantId of expense.splitParticipantIds) {
        if (participantId === expense.paidByParticipantId) continue;

        const key = `${participantId}:${expense.paidByParticipantId}:${expense.currency}`;
        const previous = balancesByKey.get(key) || {
          fromParticipantId: participantId,
          toParticipantId: expense.paidByParticipantId,
          amountCents: 0,
          currency: expense.currency,
        };
        balancesByKey.set(key, {
          ...previous,
          amountCents: previous.amountCents + shareCents,
        });
      }
    }

    return Array.from(balancesByKey.values()).filter((balance) => balance.amountCents > 0);
  }

  return {
    dumpState() {
      return {
        trips: Array.from(trips.values()),
        participantsByTrip: objectFromTripMap(participantsByTrip),
        itemsByTrip: objectFromTripMap(itemsByTrip),
        decisionsByTrip: objectFromTripMap(decisionsByTrip),
        expensesByTrip: objectFromTripMap(expensesByTrip),
        activityByTrip: objectFromTripMap(activityByTrip),
      };
    },

    createTrip(input) {
      const { value, errors } = sanitizeTripInput(input);
      if (errors.length) {
        return { ok: false, errors };
      }

      const now = new Date().toISOString();
      const inviteCode = makeInviteCode(inviteCodes);
      const ownerAccessToken = makeParticipantAccessToken();
      const trip = {
        id: makeId("trip"),
        title: value.title,
        destination: value.destination,
        startDate: value.startDate,
        endDate: value.endDate,
        inviteCode,
        inviteGeneration: crypto.randomUUID(),
        inviteExpiresAt: inviteExpiresAt(),
        inviteRevokedAt: null,
        status: "active",
        createdAt: now,
        updatedAt: now,
      };
      const owner = {
        id: makeId("participant"),
        tripId: trip.id,
        displayName: value.ownerName,
        role: "owner",
        locationSharingEnabled: false,
        lastLocation: null,
        accessTokenHash: hashParticipantAccessToken(ownerAccessToken),
        joinedAt: now,
      };

      trips.set(trip.id, trip);
      inviteCodes.set(inviteCode, trip.id);
      participantsByTrip.set(trip.id, [owner]);
      itemsByTrip.set(trip.id, []);
      decisionsByTrip.set(trip.id, []);
      expensesByTrip.set(trip.id, []);
      activityByTrip.set(trip.id, []);

      return {
        ok: true,
        trip,
        currentParticipant: currentParticipant(owner, ownerAccessToken),
        participants: publicParticipantsFor(trip.id),
      };
    },

    joinTrip(input = {}) {
      const inviteCode = sanitizeString(String(input.inviteCode ?? ""), 64);
      const displayName = sanitizeDisplayName(input.displayName);
      const errors = [];

      if (!inviteCode) errors.push("Invite code is required.");
      if (!displayName) errors.push("Display name is required.");
      if (errors.length) return { ok: false, errors };

      const tripId = inviteCodes.get(inviteCode);
      if (!tripId) {
        return { ok: false, notFound: true, errors: ["Invite code was not found."] };
      }

      const trip = trips.get(tripId);
      if (!isInviteUsable(trip)) {
        return { ok: false, notFound: true, errors: ["Invite code was not found."] };
      }
      if (participantsFor(tripId).length >= MAX_PARTICIPANTS_PER_TRIP) {
        return { ok: false, errors: ["This trip has reached its participant limit."] };
      }
      const participantAccessToken = makeParticipantAccessToken();
      const participant = {
        id: makeId("participant"),
        tripId,
        displayName,
        role: "editor",
        locationSharingEnabled: false,
        lastLocation: null,
        accessTokenHash: hashParticipantAccessToken(participantAccessToken),
        joinedAt: new Date().toISOString(),
      };
      const participants = [...participantsFor(tripId), participant];
      participantsByTrip.set(tripId, participants);
      trip.updatedAt = participant.joinedAt;
      appendActivity(tripId, {
        id: makeId("activity"),
        tripId,
        type: "participant_joined",
        actorParticipantId: participant.id,
        summary: `${participant.displayName} joined the trip`,
        createdAt: participant.joinedAt,
      });

      return {
        ok: true,
        trip,
        currentParticipant: currentParticipant(participant, participantAccessToken),
        participants: participants.map(publicParticipant),
      };
    },

    addItem(input = {}) {
      const base = validateTripAndActor(input);
      if (!base.ok) return base;

      const { value, errors } = sanitizeItemFields(input, base.tripId);
      if (itemsFor(base.tripId).length >= MAX_ITEMS_PER_TRIP) {
        errors.push("This trip has reached its itinerary item limit.");
      }
      if (errors.length) return { ok: false, errors };

      const now = new Date().toISOString();
      const item = {
        id: makeId("item"),
        tripId: base.tripId,
        ...value,
        status: "planned",
        createdByParticipantId: base.actor.id,
        createdAt: now,
        updatedAt: now,
      };

      itemsByTrip.set(base.tripId, [...itemsFor(base.tripId), item]);
      base.trip.updatedAt = now;

      const activity = appendActivity(base.tripId, {
        id: makeId("activity"),
        tripId: base.tripId,
        type: "item_created",
        actorParticipantId: base.actor.id,
        summary: `${base.actor.displayName} added ${item.title}`,
        createdAt: now,
      });

      return { ok: true, item, activity };
    },

    updateItem(input = {}) {
      const base = validateTripAndActor(input);
      if (!base.ok) return base;

      const itemId = sanitizeString(input.itemId, 80);
      const { value, errors } = sanitizeItemFields(input, base.tripId);

      if (!itemId) errors.push("Item id is required.");
      if (errors.length) return { ok: false, errors };

      const items = itemsFor(base.tripId);
      const existingItem = items.find((candidate) => candidate.id === itemId);
      if (!existingItem) {
        return { ok: false, notFound: true, errors: ["Item was not found."] };
      }

      const now = new Date().toISOString();
      const item = {
        ...existingItem,
        ...value,
        updatedAt: now,
      };

      itemsByTrip.set(
        base.tripId,
        items.map((candidate) => (candidate.id === itemId ? item : candidate)),
      );
      base.trip.updatedAt = now;

      const activity = appendActivity(base.tripId, {
        id: makeId("activity"),
        tripId: base.tripId,
        type: "item_updated",
        actorParticipantId: base.actor.id,
        summary: `${base.actor.displayName} updated ${item.title}`,
        createdAt: now,
      });

      return { ok: true, item, activity };
    },

    importItemsFromText(input = {}) {
      const base = validateTripAndActor(input);
      if (!base.ok) return base;

      const parsed = parseImportText(input, base);
      if (parsed.errors.length) return { ok: false, errors: parsed.errors };
      if (itemsFor(base.tripId).length + parsed.items.length > MAX_ITEMS_PER_TRIP) {
        return { ok: false, errors: ["This trip has reached its itinerary item limit."] };
      }

      const now = new Date().toISOString();
      const importedItems = parsed.items.map((item) => ({
        id: makeId("item"),
        tripId: base.tripId,
        ...item,
        status: "planned",
        createdByParticipantId: base.actor.id,
        createdAt: now,
        updatedAt: now,
      }));

      itemsByTrip.set(base.tripId, [...itemsFor(base.tripId), ...importedItems]);
      base.trip.updatedAt = now;

      const activity = appendActivity(base.tripId, {
        id: makeId("activity"),
        tripId: base.tripId,
        type: "items_imported",
        actorParticipantId: base.actor.id,
        summary: `${base.actor.displayName} imported ${importedItems.length} itinerary item${importedItems.length === 1 ? "" : "s"}`,
        createdAt: now,
      });

      return { ok: true, items: importedItems, importedCount: importedItems.length, activity };
    },

    createDecision(input = {}) {
      const base = validateTripAndActor(input);
      if (!base.ok) return base;

      const title = sanitizeString(input.title, 160);
      const options = Array.isArray(input.options)
        ? input.options
          .slice(0, 8)
          .map((option) => sanitizeString(String(option), 120))
          .filter(Boolean)
        : [];
      const errors = [];

      if (!title) errors.push("Decision title is required.");
      if (options.length < 2) errors.push("At least two decision options are required.");
      if (errors.length) return { ok: false, errors };

      const now = new Date().toISOString();
      const decision = {
        id: makeId("decision"),
        tripId: base.tripId,
        title,
        status: "open",
        options: options.map((optionTitle) => ({
          id: makeId("option"),
          title: optionTitle,
        })),
        votes: [],
        createdByParticipantId: base.actor.id,
        createdAt: now,
        updatedAt: now,
      };

      decisionsByTrip.set(base.tripId, [...decisionsFor(base.tripId), decision]);
      base.trip.updatedAt = now;

      const activity = appendActivity(base.tripId, {
        id: makeId("activity"),
        tripId: base.tripId,
        type: "decision_created",
        actorParticipantId: base.actor.id,
        summary: `${base.actor.displayName} opened ${decision.title}`,
        createdAt: now,
      });

      return { ok: true, decision, activity };
    },

    voteDecision(input = {}) {
      const base = validateParticipantSession(input);
      if (!base.ok) return base;

      const decisionId = sanitizeString(input.decisionId, 80);
      const optionId = sanitizeString(input.optionId, 80);
      const errors = [];

      if (!decisionId) errors.push("Decision id is required.");
      if (!optionId) errors.push("Option id is required.");
      if (errors.length) return { ok: false, errors };

      const decisions = decisionsFor(base.tripId);
      const decision = decisions.find((candidate) => candidate.id === decisionId);
      if (!decision) return { ok: false, notFound: true, errors: ["Decision was not found."] };

      if (!decision.options.some((option) => option.id === optionId)) {
        return { ok: false, notFound: true, errors: ["Decision option was not found."] };
      }

      const now = new Date().toISOString();
      const nextDecision = {
        ...decision,
        votes: [
          ...decision.votes.filter((vote) => vote.participantId !== base.participant.id),
          { participantId: base.participant.id, optionId, updatedAt: now },
        ],
        updatedAt: now,
      };

      decisionsByTrip.set(
        base.tripId,
        decisions.map((candidate) => (candidate.id === decision.id ? nextDecision : candidate)),
      );
      base.trip.updatedAt = now;

      const activity = appendActivity(base.tripId, {
        id: makeId("activity"),
        tripId: base.tripId,
        type: "decision_voted",
        actorParticipantId: base.participant.id,
        summary: `${base.participant.displayName} voted on ${decision.title}`,
        createdAt: now,
      });

      return { ok: true, decision: nextDecision, activity };
    },

    createExpense(input = {}) {
      const base = validateTripAndActor(input);
      if (!base.ok) return base;

      const title = sanitizeString(input.title, 160);
      const amountCents = parseExpenseAmountCents(input.amountCents);
      const currency = sanitizeString(String(input.currency ?? "USD").toUpperCase(), 3);
      const paidByParticipantId = sanitizeString(input.paidByParticipantId, 80);
      const splitParticipantIds = Array.isArray(input.splitParticipantIds)
        ? input.splitParticipantIds
          .map((participantId) => sanitizeString(String(participantId), 80))
          .filter(Boolean)
        : [];
      const errors = [];

      if (!title) errors.push("Expense title is required.");
      if (amountCents === null) {
        errors.push("Expense amount must be a supported positive cents value.");
      }
      if (!currency) errors.push("Expense currency is required.");
      if (!paidByParticipantId) errors.push("Paid-by participant id is required.");
      if (splitParticipantIds.length === 0) errors.push("At least one split participant is required.");

      const paidByParticipant = participantFor(base.tripId, paidByParticipantId);
      if (paidByParticipantId && !paidByParticipant) {
        errors.push("Paid-by participant was not found for this trip.");
      }
      if (paidByParticipantId && paidByParticipantId !== base.actor.id) {
        errors.push("Only the authenticated participant can be recorded as payer.");
      }

      const uniqueSplitParticipantIds = Array.from(new Set(splitParticipantIds));
      for (const participantId of uniqueSplitParticipantIds) {
        if (!participantFor(base.tripId, participantId)) {
          errors.push("Every split participant must belong to this trip.");
          break;
        }
      }

      if (errors.length) return { ok: false, errors };

      const now = new Date().toISOString();
      const expense = {
        id: makeId("expense"),
        tripId: base.tripId,
        title,
        amountCents,
        currency,
        paidByParticipantId,
        splitParticipantIds: uniqueSplitParticipantIds,
        createdByParticipantId: base.actor.id,
        createdAt: now,
        updatedAt: now,
      };

      expensesByTrip.set(base.tripId, [...expensesFor(base.tripId), expense]);
      base.trip.updatedAt = now;

      const activity = appendActivity(base.tripId, {
        id: makeId("activity"),
        tripId: base.tripId,
        type: "expense_created",
        actorParticipantId: base.actor.id,
        summary: `${base.actor.displayName} added ${expense.title}`,
        createdAt: now,
      });

      return { ok: true, expense, balances: balancesFor(base.tripId), activity };
    },

    setLocationSharing(input = {}) {
      const base = validateParticipantSession(input);
      const errors = [];

      if (typeof input.isEnabled !== "boolean") errors.push("isEnabled must be a boolean.");
      const locationInput = normalizeLocationInput(input, input.isEnabled === true);
      errors.push(...locationInput.errors);
      if (errors.length) return { ok: false, errors };

      if (!base.ok) return base;

      const now = new Date().toISOString();
      const updatedParticipant = {
        ...base.participant,
        locationSharingEnabled: input.isEnabled,
        lastLocation: input.isEnabled
          ? locationInput.value && { ...locationInput.value, updatedAt: now }
          : null,
      };

      participantsByTrip.set(
        base.tripId,
        participantsFor(base.tripId).map((candidate) =>
          candidate.id === base.participant.id ? updatedParticipant : candidate,
        ),
      );
      base.trip.updatedAt = now;

      const activity = appendActivity(base.tripId, {
        id: makeId("activity"),
        tripId: base.tripId,
        type: input.isEnabled ? "location_sharing_enabled" : "location_sharing_disabled",
        actorParticipantId: base.participant.id,
        summary: `${base.participant.displayName} turned location sharing ${input.isEnabled ? "on" : "off"}`,
        createdAt: now,
      });

      return { ok: true, participant: publicParticipant(updatedParticipant), activity };
    },

    leaveTrip(input = {}) {
      const base = validateParticipantSession(input);
      if (!base.ok) return base;

      const now = new Date().toISOString();
      const departedParticipant = {
        ...base.participant,
        status: "left",
        revokedAt: now,
        accessTokenHash: undefined,
        locationSharingEnabled: false,
        lastLocation: null,
      };
      participantsByTrip.set(
        base.tripId,
        participantsFor(base.tripId).map((candidate) =>
          candidate.id === base.participant.id ? departedParticipant : candidate,
        ),
      );
      base.trip.updatedAt = now;
      const activity = appendActivity(base.tripId, {
        id: makeId("activity"),
        tripId: base.tripId,
        type: "participant_left",
        actorParticipantId: base.participant.id,
        summary: `${base.participant.displayName} left the trip`,
        createdAt: now,
      });
      return { ok: true, participant: publicParticipant(departedParticipant), activity };
    },

    rotateInvite(input = {}) {
      const base = validateTripAndActor(input);
      if (!base.ok) return base;
      if (base.actor.role !== "owner") {
        return { ok: false, unauthorized: true, errors: ["Only the trip owner can rotate invites."] };
      }

      const oldInviteCode = base.trip.inviteCode;
      const nextInviteCode = makeInviteCode(inviteCodes);
      inviteCodes.delete(oldInviteCode);
      inviteCodes.set(nextInviteCode, base.tripId);
      Object.assign(base.trip, {
        inviteCode: nextInviteCode,
        inviteGeneration: crypto.randomUUID(),
        inviteExpiresAt: inviteExpiresAt(),
        inviteRevokedAt: null,
        updatedAt: new Date().toISOString(),
      });
      return { ok: true, trip: base.trip };
    },

    snapshot(input = {}) {
      const base = validateParticipantSession(input);
      if (!base.ok) return base;

      return {
        ok: true,
        trip: base.trip,
        participants: publicParticipantsFor(base.tripId),
        items: itemsFor(base.tripId),
        decisions: decisionsFor(base.tripId),
        expenses: expensesFor(base.tripId),
        balances: balancesFor(base.tripId),
        activity: activityFor(base.tripId),
        aiSuggestions: suggestionsFor(base.tripId),
      };
    },
  };
}

function stateFromRows(rows = []) {
  const state = {
    trips: [],
    participantsByTrip: {},
    itemsByTrip: {},
    decisionsByTrip: {},
    expensesByTrip: {},
    activityByTrip: {},
  };

  for (const row of rows || []) {
    const storedTrip = row.trip_json || row.tripJson;
    const trip = storedTrip ? {
      ...storedTrip,
      inviteExpiresAt: storedTrip.inviteExpiresAt || row.invite_expires_at || row.inviteExpiresAt,
      inviteRevokedAt: storedTrip.inviteRevokedAt || row.invite_revoked_at || row.inviteRevokedAt || null,
      inviteGeneration: storedTrip.inviteGeneration || row.invite_generation || row.inviteGeneration,
    } : null;
    if (!trip?.id) continue;

    state.trips.push(trip);
    state.participantsByTrip[trip.id] = row.participants_json || row.participantsJson || [];
    state.itemsByTrip[trip.id] = row.items_json || row.itemsJson || [];
    state.decisionsByTrip[trip.id] = row.decisions_json || row.decisionsJson || [];
    state.expensesByTrip[trip.id] = (row.expenses_json || row.expensesJson || [])
      .filter(isStoredExpenseSafe);
    state.activityByTrip[trip.id] = row.activity_json || row.activityJson || [];
  }

  return state;
}

function rowFromState(state, tripId) {
  const trip = state.trips.find((candidate) => candidate.id === tripId);
  if (!trip) throw new Error(`Trip ${tripId} was not found in state`);

  return {
    id: trip.id,
    invite_code: trip.inviteCode,
    invite_expires_at: trip.inviteExpiresAt,
    invite_revoked_at: trip.inviteRevokedAt || null,
    invite_generation: trip.inviteGeneration,
    trip_json: trip,
    participants_json: state.participantsByTrip[trip.id] || [],
    items_json: state.itemsByTrip[trip.id] || [],
    decisions_json: state.decisionsByTrip[trip.id] || [],
    expenses_json: state.expensesByTrip[trip.id] || [],
    activity_json: state.activityByTrip[trip.id] || [],
    updated_at: trip.updatedAt || new Date().toISOString(),
  };
}

async function loadPersistedTrip(admin, column, value) {
  const { data, error } = await admin
    .from(GROUP_TRIP_DOCUMENTS_TABLE)
    .select("*")
    .eq(column, value)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertTripState(admin, store, tripId, ownerKey) {
  const row = {
    ...rowFromState(store.dumpState(), tripId),
    version: 1,
    owner_key: ownerKey,
    status: "active",
    expires_at: new Date(Date.now() + TRIP_RETENTION_MS).toISOString(),
  };
  const { error } = await admin
    .from(GROUP_TRIP_DOCUMENTS_TABLE)
    .insert(row);
  if (error) throw error;
}

async function hasCreateCapacity(admin, ownerKey) {
  const { data, error } = await admin
    .from(GROUP_TRIP_DOCUMENTS_TABLE)
    .select("id")
    .eq("owner_key", ownerKey)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .limit(MAX_ACTIVE_TRIPS_PER_OWNER);
  if (error) throw error;
  return (data || []).length < MAX_ACTIVE_TRIPS_PER_OWNER;
}

async function purgeExpiredTrips(admin) {
  const { error } = await admin
    .from(GROUP_TRIP_DOCUMENTS_TABLE)
    .delete()
    .lt("expires_at", new Date().toISOString());
  if (error) throw error;
}

async function persistTripState(admin, store, tripId, expectedVersion) {
  const row = {
    ...rowFromState(store.dumpState(), tripId),
    version: expectedVersion + 1,
  };
  const { data, error } = await admin
    .from(GROUP_TRIP_DOCUMENTS_TABLE)
    .update(row)
    .eq("id", tripId)
    .eq("version", expectedVersion)
    .select("id, version")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function storageFailure(error) {
  return {
    ok: false,
    storageError: true,
    errors: [error?.message || "Trip Hub storage is unavailable."],
  };
}

function createUnavailableGroupTripStore(error) {
  const failure = () => storageFailure(error);
  return {
    createTrip: failure,
    joinTrip: failure,
    addItem: failure,
    updateItem: failure,
    importItemsFromText: failure,
    createDecision: failure,
    voteDecision: failure,
    createExpense: failure,
    setLocationSharing: failure,
    leaveTrip: failure,
    rotateInvite: failure,
    snapshot: failure,
  };
}

export function createSupabaseGroupTripStore({ admin }) {
  if (!admin) throw new Error("Supabase admin client is required");

  async function executeMutation(methodName, input, tripIdFromResult, selector) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const row = await loadPersistedTrip(admin, selector.column, selector.value(input));
        const store = createInMemoryGroupTripStore(stateFromRows(row ? [row] : []));
        const result = store[methodName](input);
        if (!result.ok) return result;

        const tripId = tripIdFromResult(result, input);
        const committed = await persistTripState(admin, store, tripId, Number(row?.version || 0));
        if (committed) return result;
      } catch (error) {
        return storageFailure(error);
      }
    }

    return {
      ok: false,
      storageError: true,
      retryable: true,
      errors: ["Trip was updated concurrently. Please retry."],
    };
  }

  const byTripId = { column: "id", value: (input) => sanitizeString(input?.tripId, 80) };
  const byInviteCode = {
    column: "invite_code",
    value: (input) => sanitizeString(String(input?.inviteCode ?? ""), 64),
  };

  return {
    async createTrip(input) {
      const ownerKey = sanitizeString(String(input?.ownerKey ?? ""), 160);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const store = createInMemoryGroupTripStore();
        const result = store.createTrip(input);
        if (!result.ok) return result;
        if (!ownerKey) return { ok: false, errors: ["Trip owner identity is required."] };
        try {
          await purgeExpiredTrips(admin);
          if (!(await hasCreateCapacity(admin, ownerKey))) {
            return {
              ok: false,
              errors: ["Trip Hub limit reached. Archive an older trip before creating another."],
            };
          }
          await insertTripState(admin, store, result.trip.id, ownerKey);
          return result;
        } catch (error) {
          if (error?.code === "23505") continue;
          return storageFailure(error);
        }
      }
      return storageFailure(new Error("Could not allocate a unique Trip Hub invite."));
    },

    joinTrip(input) {
      return executeMutation("joinTrip", input, (result) => result.trip.id, byInviteCode);
    },

    addItem(input) {
      return executeMutation("addItem", input, (result) => result.item.tripId, byTripId);
    },

    updateItem(input) {
      return executeMutation("updateItem", input, (result) => result.item.tripId, byTripId);
    },

    importItemsFromText(input) {
      return executeMutation("importItemsFromText", input, (result) => result.items[0].tripId, byTripId);
    },

    createDecision(input) {
      return executeMutation("createDecision", input, (result) => result.decision.tripId, byTripId);
    },

    voteDecision(input) {
      return executeMutation("voteDecision", input, (result) => result.decision.tripId, byTripId);
    },

    createExpense(input) {
      return executeMutation("createExpense", input, (result) => result.expense.tripId, byTripId);
    },

    setLocationSharing(input) {
      return executeMutation("setLocationSharing", input, (result) => result.participant.tripId, byTripId);
    },

    leaveTrip(input) {
      return executeMutation("leaveTrip", input, (result) => result.participant.tripId, byTripId);
    },

    rotateInvite(input) {
      return executeMutation("rotateInvite", input, (result) => result.trip.id, byTripId);
    },

    async snapshot(input) {
      try {
        const tripId = sanitizeString(input?.tripId, 80);
        const row = tripId ? await loadPersistedTrip(admin, "id", tripId) : null;
        const store = createInMemoryGroupTripStore(stateFromRows(row ? [row] : []));
        return store.snapshot(input);
      } catch (error) {
        return storageFailure(error);
      }
    },
  };
}

export function createGroupTripStore({
  getAdmin = getSupabaseAdmin,
  environment = process.env.NODE_ENV,
} = {}) {
  try {
    return createSupabaseGroupTripStore({ admin: getAdmin() });
  } catch (error) {
    if (environment === "production") {
      return createUnavailableGroupTripStore(error);
    }
    return createInMemoryGroupTripStore();
  }
}
