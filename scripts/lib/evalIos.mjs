// Builds the requests the native iOS app sends, so eval runs look like real iOS sessions.
// Mirrors ios/SproutRoute Services/TripPlanner.swift (buildPayload, fetchCarSeat, fetchTravelSafety, fetchPetSafety).
// Swift omits nil optionals when it encodes a request, so null and undefined keys are dropped here too.

const PET_KEYS = ["id", "type", "name", "breed", "weightLb", "ageYears", "specialNeeds"];

const dropNulls = (value) => JSON.parse(JSON.stringify(value, (_key, v) => (v === null ? undefined : v)));

const petProfile = (pet) => Object.fromEntries(PET_KEYS.filter((k) => pet[k] !== undefined && pet[k] !== null).map((k) => [k, pet[k]]));

/** The stream and packing request body, from a parse result or from a golden-case body. */
export function iosPayload(p) {
  const ages = p.childrenAges ?? (p.children ?? []).map((c) => c.age);
  const payload = {
    client: "ios",
    schemaVersion: "1",
    unitSystem: "imperial",
    timezone: "America/Los_Angeles",
    locale: "en_US",
    rawInput: p.rawInput ?? "",
    destination: p.destination,
    startDate: p.startDate,
    endDate: p.endDate,
    adults: p.adults,
    childrenAges: ages,
    children: ages.map((age, i) => ({ id: `child-${i}`, age })),
    activities: p.activities ?? (p.vibe ? [p.vibe] : []),
    foodPreferences: p.foodPreferences,
    pets: (p.pets ?? []).map(petProfile),
    tripGoals: p.tripGoals ?? [],
    mustHaves: p.mustHaves ?? [],
    avoidances: p.avoidances ?? [],
    pacePreference: p.pacePreference ?? "unknown",
    budgetSignals: p.budgetSignals ?? [],
    accommodationPreferences: p.accommodationPreferences ?? [],
    transportPreferences: p.transportPreferences ?? [],
    accessibilityNeeds: p.accessibilityNeeds ?? [],
    scheduleConstraints: p.scheduleConstraints ?? [],
    celebrationContext: p.celebrationContext,
    specialNotes: p.specialNotes ?? [],
    extraContext: p.extraContext ?? [],
  };
  // The app sends the route only for multi-stop and country-tour trips that went through route review.
  if (["multi_stop", "country_tour"].includes(p.tripShape) && (p.stops ?? []).length) {
    payload.tripShape = p.tripShape;
    payload.stops = p.stops;
    payload.countryTour = p.countryTour;
  }
  return dropNulls(payload);
}

/** The background calls the app makes once the plan shows. `trip` is the stream's destination event. */
export function followUpBody(step, payload, trip) {
  const country = trip?.countryCode;
  if (step === "packing") return payload;
  if (step === "travel-tips") return dropNulls({ destination: payload.destination, childrenAges: payload.childrenAges, countryCode: country });
  if (step === "car-seat") {
    return dropNulls({
      destination: trip?.destination ?? payload.destination,
      jurisdictionCode: trip?.jurisdictionCode,
      countryCode: country,
      tripDate: trip?.startDate ?? payload.startDate,
      children: payload.children,
    });
  }
  if (step === "pet") {
    return dropNulls({ pets: payload.pets, destination: payload.destination, countryCode: country, travelMode: (country ?? "US") === "US" ? "drive" : "fly" });
  }
  throw new Error(`unknown follow-up step: ${step}`);
}

/** Server-sent events from a stream response, as [{event, data}] with data parsed when it is JSON. */
export function parseSse(text) {
  return text.split(/\n\n+/).map((block) => {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const raw = [...block.matchAll(/^data: ?(.*)$/gm)].map((m) => m[1]).join("\n");
    let data = raw;
    try { data = JSON.parse(raw); } catch { /* keep the raw text */ }
    return { event, data };
  }).filter((e) => e.event);
}

export const tripFromStream = (text) => parseSse(text).find((e) => e.event === "destination")?.data ?? null;
