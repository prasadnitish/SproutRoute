import { getCarSeatGuidance } from "../services/safetyRules.js";
import { getPetTravelGuidance } from "../services/petSafety.js";
import { getTravelAdvisory } from "../services/travelAdvisory.js";
import { getNeighborhoodSafety } from "../services/neighborhoodSafety.js";
import { deriveTravelMode } from "../services/travelMode.js";

// Wraps safetyRules.js + petSafety.js + travelAdvisory.js + neighborhoodSafety.js.
// Car-seat and pet checks are conditional on request content; edgeSummary
// records which sub-checks ran or were skipped (and why) for agent_runs tracing.
export async function runSafetyAgent(input, retrieval, deps = {}) {
  const {
    getCarSeatGuidanceFn = getCarSeatGuidance,
    getPetTravelGuidanceFn = getPetTravelGuidance,
    getTravelAdvisoryFn = getTravelAdvisory,
    getNeighborhoodSafetyFn = getNeighborhoodSafety,
  } = deps;
  const { destination, startDate, children, pets } = input;
  const { coords, countryCode } = retrieval;

  const edgeSummary = {};

  let carSeatGuidance = null;
  if (Array.isArray(children) && children.length > 0) {
    // NOTE: countryCode is intentionally omitted here — the real
    // /api/v1/safety/car-seat-check route (server.js:1755-1757) does the same,
    // so this wrapper stays a zero-deviation match to production behavior.
    carSeatGuidance = await getCarSeatGuidanceFn({
      destination,
      jurisdictionCode: coords.stateCode,
      tripDate: startDate,
      children,
    });
    edgeSummary.carSeatCheck = "ran";
  } else {
    edgeSummary.carSeatCheck = "skipped";
    edgeSummary.carSeatCheckReason = "no children in request";
  }

  let petGuidance = null;
  if (Array.isArray(pets) && pets.length > 0) {
    const travelMode = deriveTravelMode({ countryCode });
    petGuidance = await getPetTravelGuidanceFn(pets, { destination, travelMode, countryCode, startDate });
    edgeSummary.petCheck = "ran";
  } else {
    edgeSummary.petCheck = "skipped";
    edgeSummary.petCheckReason = "no pets in request";
  }

  const [travelAdvisory, neighborhoodSafety] = await Promise.all([
    getTravelAdvisoryFn(countryCode),
    getNeighborhoodSafetyFn(coords.lat, coords.lon),
  ]);

  return { carSeatGuidance, petGuidance, travelAdvisory, neighborhoodSafety, edgeSummary };
}
