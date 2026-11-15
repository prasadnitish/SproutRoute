// Builds the requests the website sends, so eval runs can look like real web sessions.
// Mirrors src/frontend/src/hooks/useTrip.js (generateTrip and the background fetchers).
// The differences from the iOS flow that matter for evals: packing goes to /api/generate,
// and when the server guessed the children's ages the website asks before planning.

/** The stream and packing request body: the planner's formData. */
export function webPayload(p) {
  return {
    destination: p.destination,
    startDate: p.startDate,
    endDate: p.endDate,
    adults: p.adults,
    childrenAges: p.childrenAges,
    activities: typeof p.vibe === "string" && p.vibe.trim() ? [p.vibe.trim()] : [],
    foodPreferences: p.foodPreferences || null,
    pets: p.pets || [],
    tripGoals: p.tripGoals || [],
    mustHaves: p.mustHaves || [],
    avoidances: p.avoidances || [],
    pacePreference: p.pacePreference || "unknown",
    budgetSignals: p.budgetSignals || [],
    accommodationPreferences: p.accommodationPreferences || [],
    transportPreferences: p.transportPreferences || [],
    accessibilityNeeds: p.accessibilityNeeds || [],
    scheduleConstraints: p.scheduleConstraints || [],
    celebrationContext: p.celebrationContext || null,
    specialNotes: p.specialNotes || [],
    extraContext: p.extraContext || [],
    tripShape: p.tripShape || "single_destination",
    stops: p.stops || [],
    countryTour: p.countryTour || null,
    prefetchedAttractionsByStopId: {},
    savedProfile: null,
  };
}

/**
 * The background calls the website makes, as [step, path]. The runner cannot answer the ages
 * question, so for guessed ages it does what "Skip" does: plan the trip and make no car seat call.
 */
export function webSteps(parsed, payload) {
  const steps = [["packing", "/api/generate"], ["travel-tips", "/api/safety/travel-tips"]];
  if ((payload.childrenAges || []).length && !parsed.childrenAgesAssumed) steps.push(["car-seat", "/api/safety/car-seat-check"]);
  if (payload.pets.length) steps.push(["pet", "/api/v1/safety/pet-travel-check"]);
  return steps;
}

/** `trip` is the stream's destination event. */
export function webFollowUpBody(step, parsed, payload, trip) {
  const country = trip?.countryCode || "";
  if (step === "packing") return payload;
  if (step === "travel-tips") {
    return { destination: parsed.destination, childrenAges: parsed.childrenAges, countryCode: country || parsed.countryCode || "", startDate: parsed.startDate, endDate: parsed.endDate };
  }
  if (step === "car-seat") {
    return {
      destination: trip?.destination || "",
      jurisdictionCode: trip?.jurisdictionCode || "",
      tripDate: trip?.startDate || "",
      children: parsed.childrenAges.map((age) => ({ age })),
    };
  }
  if (step === "pet") {
    // The website also uses the visitor's distance from the destination; the runner has no location.
    const countryCode = country || "US";
    return { pets: payload.pets, destination: parsed.destination, countryCode, travelMode: countryCode !== "US" ? "fly" : "drive" };
  }
  throw new Error(`unknown follow-up step: ${step}`);
}
