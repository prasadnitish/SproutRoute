import { scheduleItinerary } from "./itineraryScheduler.js";

function parseIsoDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(dateStr, days) {
  const date = parseIsoDate(dateStr);
  if (!date) return dateStr;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function stopDayCount(stop) {
  return Math.max(1, (Number(stop?.dayEnd) || Number(stop?.dayStart) || 1) - (Number(stop?.dayStart) || 1) + 1);
}

function planningEndDateForStop(stop) {
  return addDays(stop.arrivalDate, stopDayCount(stop) - 1);
}

function normalizeStopDays(stop, days = [], localDayOffset = 0) {
  const maxDays = Math.max(0, stopDayCount(stop) - localDayOffset);
  return days.slice(0, maxDays).map((day, index) => {
    const routeDay = (Number(stop.dayStart) || 1) + localDayOffset + index;
    return {
      ...day,
      day: `Day ${routeDay}: ${stop.name}`,
      routeDay,
      routeDate: addDays(stop.arrivalDate, localDayOffset + index),
      stopId: stop.id,
      stopName: stop.name,
    };
  });
}

function normalizeStopTripPlan(stop, tripPlan, localDayOffset = 0) {
  return {
    ...(tripPlan || {}),
    suggestedActivities: (tripPlan?.suggestedActivities || []).map((activity) => ({
      ...activity,
      stopId: stop.id,
      stopName: stop.name,
    })),
    dailyItinerary: normalizeStopDays(stop, tripPlan?.dailyItinerary || [], localDayOffset),
  };
}

function normalizeScheduledStopDays(stop, scheduledItinerary, localDayOffset = 0) {
  if (!Array.isArray(scheduledItinerary)) return scheduledItinerary;
  return normalizeStopDays(stop, scheduledItinerary, localDayOffset);
}

function mergeStopPlans(stopPlans) {
  const suggestedActivities = [];
  const dailyItinerary = [];
  const tips = [];
  let activityCounter = 1;

  for (const { stop, tripPlan } of stopPlans) {
    const normalizedPlan = normalizeStopTripPlan(stop, tripPlan);
    const idMap = new Map();
    for (const activity of normalizedPlan?.suggestedActivities || []) {
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

    for (const day of normalizedPlan?.dailyItinerary || []) {
      dailyItinerary.push({
        ...day,
        stopId: stop.id,
        stopName: stop.name,
        activities: (day.activities || []).map((id) => idMap.get(String(id)) || String(id)),
      });
    }

    for (const tip of normalizedPlan?.tips || []) {
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

    const planningEndDate = planningEndDateForStop(enrichedStop);

    const weather = await getWeatherForecastFn(
      coords.lat,
      coords.lon,
      coords.countryCode || stop.countryCode || "US",
      stop.arrivalDate,
      planningEndDate,
    );
    stopWeather[stop.id] = weather;
    onEvent("stop-weather", { stop: enrichedStop, weather });

    const tripInput = {
      ...baseTrip,
      destination: stop.name,
      startDate: stop.arrivalDate,
      endDate: planningEndDate,
      countryCode: coords.countryCode || stop.countryCode || "US",
      cachedAttractions: baseTrip?.cachedAttractionsByStopId?.[stop.id] || [],
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
        const localDayOffset = meta?.dayOffset || 0;
        const normalizedChunk = normalizeStopTripPlan(enrichedStop, chunkResult, localDayOffset);
        onEvent("stop-itinerary", {
          stop: enrichedStop,
          tripPlan: normalizedChunk,
          scheduledItinerary: normalizeScheduledStopDays(enrichedStop, scheduledItinerary, localDayOffset),
          chunk: meta?.chunk || 1,
          totalChunks: meta?.totalChunks || 1,
          dayOffset: (stop.dayStart || 1) - 1 + localDayOffset,
        });
      },
      { shouldAbort },
    );

    stopItineraries[stop.id] = tripPlan;
    try {
      scheduledByStop[stop.id] = normalizeScheduledStopDays(
        enrichedStop,
        scheduleItineraryFn(tripPlan, {}, stop.arrivalDate),
      );
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
