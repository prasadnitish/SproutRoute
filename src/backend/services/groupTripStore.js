import crypto from "crypto";
import { sanitizeString } from "../utils/sanitize.js";
import { getSupabaseAdmin } from "../utils/supabaseClient.js";

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GROUP_TRIP_DOCUMENTS_TABLE = "group_trip_documents";

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
    let code = "";
    for (let i = 0; i < 6; i += 1) {
      code += INVITE_ALPHABET[crypto.randomInt(0, INVITE_ALPHABET.length)];
    }
    if (!existingCodes.has(code)) return code;
  }
  throw new Error("Could not allocate invite code");
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
  if (!participant || !token) return false;
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
  const itemsByTrip = mapByTrip(initialState.itemsByTrip);
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

  function appendActivity(tripId, event) {
    const activity = [...activityFor(tripId), event];
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
      const inviteCode = sanitizeString(String(input.inviteCode ?? "").toUpperCase(), 12);
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

      const kind = sanitizeString(input.kind, 40);
      const title = sanitizeString(input.title, 160);
      const errors = [];

      if (!kind) errors.push("Item kind is required.");
      if (!title) errors.push("Item title is required.");
      if (errors.length) return { ok: false, errors };

      const now = new Date().toISOString();
      const item = {
        id: makeId("item"),
        tripId: base.tripId,
        kind,
        title,
        startAt: sanitizeOptionalString(input.startAt, 40),
        endAt: sanitizeOptionalString(input.endAt, 40),
        locationName: sanitizeOptionalString(input.locationName, 160),
        notes: sanitizeOptionalString(input.notes, 500),
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
      const amountCents = Number.parseInt(String(input.amountCents), 10);
      const currency = sanitizeString(String(input.currency ?? "USD").toUpperCase(), 3);
      const paidByParticipantId = sanitizeString(input.paidByParticipantId, 80);
      const splitParticipantIds = Array.isArray(input.splitParticipantIds)
        ? input.splitParticipantIds
          .map((participantId) => sanitizeString(String(participantId), 80))
          .filter(Boolean)
        : [];
      const errors = [];

      if (!title) errors.push("Expense title is required.");
      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        errors.push("Expense amount must be a positive number of cents.");
      }
      if (!currency) errors.push("Expense currency is required.");
      if (!paidByParticipantId) errors.push("Paid-by participant id is required.");
      if (splitParticipantIds.length === 0) errors.push("At least one split participant is required.");

      const paidByParticipant = participantFor(base.tripId, paidByParticipantId);
      if (paidByParticipantId && !paidByParticipant) {
        errors.push("Paid-by participant was not found for this trip.");
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
    const trip = row.trip_json || row.tripJson;
    if (!trip?.id) continue;

    state.trips.push(trip);
    state.participantsByTrip[trip.id] = row.participants_json || row.participantsJson || [];
    state.itemsByTrip[trip.id] = row.items_json || row.itemsJson || [];
    state.decisionsByTrip[trip.id] = row.decisions_json || row.decisionsJson || [];
    state.expensesByTrip[trip.id] = row.expenses_json || row.expensesJson || [];
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
    trip_json: trip,
    participants_json: state.participantsByTrip[trip.id] || [],
    items_json: state.itemsByTrip[trip.id] || [],
    decisions_json: state.decisionsByTrip[trip.id] || [],
    expenses_json: state.expensesByTrip[trip.id] || [],
    activity_json: state.activityByTrip[trip.id] || [],
    updated_at: trip.updatedAt || new Date().toISOString(),
  };
}

async function loadPersistedState(admin) {
  const { data, error } = await admin.from(GROUP_TRIP_DOCUMENTS_TABLE).select("*");
  if (error) throw error;
  return stateFromRows(data || []);
}

async function persistTripState(admin, store, tripId) {
  const row = rowFromState(store.dumpState(), tripId);
  const { error } = await admin
    .from(GROUP_TRIP_DOCUMENTS_TABLE)
    .upsert(row, { onConflict: "id" });
  if (error) throw error;
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
    createDecision: failure,
    voteDecision: failure,
    createExpense: failure,
    setLocationSharing: failure,
    snapshot: failure,
  };
}

export function createSupabaseGroupTripStore({ admin }) {
  if (!admin) throw new Error("Supabase admin client is required");

  async function executeMutation(methodName, input, tripIdFromResult) {
    try {
      const store = createInMemoryGroupTripStore(await loadPersistedState(admin));
      const result = store[methodName](input);
      if (!result.ok) return result;

      await persistTripState(admin, store, tripIdFromResult(result, input));
      return result;
    } catch (error) {
      return storageFailure(error);
    }
  }

  return {
    createTrip(input) {
      return executeMutation("createTrip", input, (result) => result.trip.id);
    },

    joinTrip(input) {
      return executeMutation("joinTrip", input, (result) => result.trip.id);
    },

    addItem(input) {
      return executeMutation("addItem", input, (result) => result.item.tripId);
    },

    createDecision(input) {
      return executeMutation("createDecision", input, (result) => result.decision.tripId);
    },

    voteDecision(input) {
      return executeMutation("voteDecision", input, (result) => result.decision.tripId);
    },

    createExpense(input) {
      return executeMutation("createExpense", input, (result) => result.expense.tripId);
    },

    setLocationSharing(input) {
      return executeMutation("setLocationSharing", input, (result) => result.participant.tripId);
    },

    async snapshot(input) {
      try {
        const store = createInMemoryGroupTripStore(await loadPersistedState(admin));
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
