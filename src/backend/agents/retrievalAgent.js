import { geocodeLocation } from "../services/geocoding.js";
import { getWeatherForecast } from "../services/weather.js";
import { createAttractionMemoryService } from "../services/attractionMemory.js";
import { sanitizeTripIntentFields } from "../services/profileContext.js";
import { mergeProfileAndIntent, buildPlannerSummary } from "../services/profileMerge.js";
import { inclusiveDayCount } from "../utils/dateCalc.js";

// Wraps geocoding.js + weather.js + attractionMemory.js. Replicates the
// planning-context logic from server.js's resolvePlanningContext/
// loadCachedAttractionsForTrip, minus the saved-user-profile lookup — MCP
// callers are anonymous in v1 (no per-user auth), so savedProfile is always
// null. mergeProfileAndIntent/buildPlannerSummary both explicitly support a
// null profile ("anonymous user or no trip context" per profileMerge.js JSDoc).
export async function runRetrievalAgent(input, deps = {}) {
  const {
    geocodeLocationFn = geocodeLocation,
    getWeatherForecastFn = getWeatherForecast,
    attractionMemoryService = createAttractionMemoryService(),
  } = deps;
  const { destination, startDate, endDate, activities, children, pets } = input;

  const coords = await geocodeLocationFn(destination);
  const countryCode = coords.countryCode || "US";
  const weather = await getWeatherForecastFn(coords.lat, coords.lon, countryCode, startDate, endDate);

  const tripIntent = sanitizeTripIntentFields({
    destination,
    childrenAges: (children || []).map((child) => child.age),
    pets: pets || [],
  });
  const merged = mergeProfileAndIntent(null, tripIntent);
  const plannerSummary = buildPlannerSummary(merged);

  const pacePreference = tripIntent.pacePreference;
  const pace = typeof pacePreference === "string" && pacePreference !== "unknown" ? pacePreference : "";
  const tripDays = inclusiveDayCount(startDate, endDate);
  const maxResults = Math.min(36, Math.max(16, tripDays * 4 + 4));

  const cachedAttractions = await attractionMemoryService.getPlanningCandidates({
    destination,
    coords,
    countryCode,
    childrenAges: (children || []).map((child) => child.age).filter(Number.isFinite),
    requestedActivities: activities?.length ? activities : ["family-friendly", "parks", "city"],
    tripGoals: tripIntent.tripGoals || [],
    mustHaves: tripIntent.mustHaves || [],
    avoidances: tripIntent.avoidances || [],
    transportPreferences: tripIntent.transportPreferences || [],
    accessibilityNeeds: tripIntent.accessibilityNeeds || [],
    scheduleConstraints: tripIntent.scheduleConstraints || [],
    pace,
    pets: pets || [],
    maxResults,
  });

  return { coords, countryCode, weather, cachedAttractions, plannerSummary };
}
