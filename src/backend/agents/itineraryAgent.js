import { generateTripPlanChunked } from "../services/tripPlanAI.js";
import { scheduleItinerary } from "../services/itineraryScheduler.js";
import { log } from "../utils/logger.js";

// Wraps tripPlanAI.js's chunked generator (handles 1-21 day trips uniformly,
// unlike the plain generateTripPlan) + itineraryScheduler.js's scheduler.
// Also fires the same background attraction-persistence call the real
// /api/v1/trip/bundle handler makes, since this agent is what produces tripPlan.
export async function runItineraryAgent(input, retrieval, deps = {}) {
  const {
    generateTripPlanChunkedFn = generateTripPlanChunked,
    scheduleItineraryFn = scheduleItinerary,
    attractionMemoryService,
  } = deps;
  const { destination, startDate, endDate, activities, children, pets } = input;
  const { coords, countryCode, weather, cachedAttractions, plannerSummary } = retrieval;

  const tripPayload = {
    destination,
    startDate,
    endDate,
    activities: activities?.length ? activities : ["family-friendly", "parks", "city"],
    children: children || [],
    pets: pets || [],
    plannerSummary,
    cachedAttractions,
  };

  const tripPlan = await generateTripPlanChunkedFn(tripPayload, weather, () => {});

  const scheduledItinerary = scheduleItineraryFn(tripPlan, {}, startDate, {
    hasChildren: (children || []).length > 0,
  });

  if (attractionMemoryService?.persistTripAttractions) {
    Promise.resolve(
      attractionMemoryService.persistTripAttractions({ destination, coords, countryCode, tripPlan }),
    ).catch((error) => {
      log.warn("attraction-memory:persist-failed", { error: error.message });
    });
  }

  return { tripPlan, scheduledItinerary };
}
