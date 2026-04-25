import { scheduleItinerary } from "./itineraryScheduler.js";

function mergeStopPlans(stopPlans) {
  const suggestedActivities = [];
  const dailyItinerary = [];
  const tips = [];
  let activityCounter = 1;

  for (const { stop, tripPlan } of stopPlans) {
    const idMap = new Map();
    for (const activity of tripPlan?.suggestedActivities || []) {
      const originalId = String(activity.id || activity.name || `activity-${activityCounter}`);
      const id = `${stop.id}-${activityCounter}`;
      activityCounter += 1;
      idMap.set(originalId, id);
      suggestedActivities.push({
        ...activity,
        id,
        stopId: stop.id,
        stopName: stop.name,
      });
    }

    for (const day of tripPlan?.dailyItinerary || []) {
      dailyItinerary.push({
        ...day,
        stopId: stop.id,
        stopName: stop.name,
        day: day.day || `Day ${dailyItinerary.length + 1}`,
        activities: (day.activities || []).map((id) => idMap.get(String(id)) || String(id)),
      });
    }

    for (const tip of tripPlan?.tips || []) {
      tips.push(`${stop.name}: ${tip}`);
    }
  }

  return {
    overview: `Route plan across ${stopPlans.length} stops.`,
    suggestedActivities,
    dailyItinerary,
    tips: [...new Set(tips)].slice(0, 8),
  };
}

export async function planRouteStops({
  routePlan,
  baseTrip,
  geocodeLocationFn,
  getWeatherForecastFn,
  generateTripPlanChunkedFn,
  scheduleItineraryFn = scheduleItinerary,
  onEvent = () => {},
  shouldAbort = () => false,
}) {
  const stopWeather = {};
  const stopItineraries = {};
  const scheduledByStop = {};
  const plannedStops = [];
  const enrichedStops = [];

  for (const stop of routePlan.stops || []) {
    if (shouldAbort()) break;

    const coords = await geocodeLocationFn(stop.name);
    const enrichedStop = {
      ...stop,
      displayName: coords.displayName || stop.displayName || stop.name,
      countryCode: coords.countryCode || stop.countryCode || null,
      regionCode: coords.regionCode || null,
      lat: coords.lat ?? null,
      lon: coords.lon ?? null,
    };
    enrichedStops.push(enrichedStop);

    const weather = await getWeatherForecastFn(
      coords.lat,
      coords.lon,
      coords.countryCode || stop.countryCode || "US",
      stop.arrivalDate,
      stop.departureDate,
    );
    stopWeather[stop.id] = weather;
    onEvent("stop-weather", { stop: enrichedStop, weather });

    const tripInput = {
      ...baseTrip,
      destination: stop.name,
      startDate: stop.arrivalDate,
      endDate: stop.departureDate,
      countryCode: coords.countryCode || stop.countryCode || "US",
      routePlan,
      routeStop: enrichedStop,
      dayOffset: Math.max(0, (stop.dayStart || 1) - 1),
    };

    const tripPlan = await generateTripPlanChunkedFn(
      tripInput,
      weather,
      (chunkResult, meta) => {
        if (shouldAbort()) return;
        let scheduledItinerary = null;
        try {
          scheduledItinerary = scheduleItineraryFn(chunkResult, {}, stop.arrivalDate);
        } catch { /* non-fatal */ }
        onEvent("stop-itinerary", {
          stop: enrichedStop,
          tripPlan: chunkResult,
          scheduledItinerary,
          chunk: meta?.chunk || 1,
          totalChunks: meta?.totalChunks || 1,
          dayOffset: (stop.dayStart || 1) - 1 + (meta?.dayOffset || 0),
        });
      },
      { shouldAbort },
    );

    stopItineraries[stop.id] = tripPlan;
    try {
      scheduledByStop[stop.id] = scheduleItineraryFn(tripPlan, {}, stop.arrivalDate);
    } catch {
      scheduledByStop[stop.id] = null;
    }
    plannedStops.push({ stop: enrichedStop, tripPlan });
  }

  const fullRoutePlan = {
    ...routePlan,
    stops: (routePlan.stops || []).map((stop) =>
      enrichedStops.find((enriched) => enriched.id === stop.id) || stop
    ),
  };

  return {
    routePlan: fullRoutePlan,
    stopWeather,
    stopItineraries,
    scheduledByStop,
    tripPlan: mergeStopPlans(plannedStops),
  };
}
