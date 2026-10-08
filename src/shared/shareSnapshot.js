// Public snapshots use an allowlist at both the browser and server boundaries.
// Never add raw prompts, parsed profiles, traveler identities or auth state here.
const META = ['destination', 'startDate', 'endDate', 'duration', 'lat', 'lon', 'countryCode'];
const ACTIVITY = ['id', 'name', 'title', 'description', 'category', 'duration', 'kidFriendly', 'petFriendly', 'weatherDependent', 'indoors', 'timeOfDay', 'openingHours', 'address', 'lat', 'lon', 'latitude', 'longitude', 'scheduledStart', 'scheduledEnd', 'status', 'warning', 'isMeal', 'mealType', 'cuisine', 'note', 'whyThisFits', 'whyRecommended'];
const DAY = ['day', 'date', 'routeDate', 'routeDay', 'stopId', 'stopName', 'notes'];
const STOP = ['id', 'name', 'displayName', 'countryCode', 'regionCode', 'lat', 'lon', 'arrivalDate', 'departureDate', 'nights', 'dayStart', 'dayEnd', 'role'];
const WEATHER = ['date', 'name', 'high', 'low', 'temp', 'condition', 'precipitation', 'precipitationChance', 'icon', 'unit'];
const ROUTE_META = ['orderedBy', 'mappedStopCount', 'totalDistanceMiles', 'totalTravelMinutes', 'inputDistanceMiles', 'optimizedDistanceMiles'];
const MAX_BYTES = 128 * 1024;

function pick(value, keys) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const key of keys) {
    const item = value[key];
    if (typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) out[key] = item;
  }
  return out;
}

function strings(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

function list(value, project) {
  return Array.isArray(value) ? value.map(project) : [];
}

function activity(value) {
  if (typeof value === 'string') return value;
  const out = pick(value, ACTIVITY);
  if (value?.enriched) out.enriched = pick(value.enriched, ['rating', 'priceLevel', 'address', 'latitude', 'longitude', 'openingHours']);
  return out;
}

function day(value) {
  const out = pick(value, DAY);
  if (Array.isArray(value?.activities)) out.activities = list(value.activities, activity);
  if (Array.isArray(value?.scheduled)) out.scheduled = list(value.scheduled, activity);
  if (value?.meals && typeof value.meals === 'object') {
    out.meals = {};
    for (const type of ['breakfast', 'lunch', 'dinner', 'snack']) {
      const meal = value.meals[type];
      if (meal) out.meals[type] = typeof meal === 'string' ? meal : pick(meal, ['name', 'cuisine', 'note', 'address']);
    }
  }
  if (value?.routeMeta) out.routeMeta = pick(value.routeMeta, ROUTE_META);
  if (Array.isArray(value?.warnings)) out.warnings = value.warnings.map(item => typeof item === 'string' ? item : pick(item, ['type', 'message', 'activity']));
  return out;
}

function weather(value) {
  return { ...pick(value, ['summary', 'source', 'unitSystem']), forecast: list(Array.isArray(value) ? value : value?.forecast, item => pick(item, WEATHER)) };
}

export function buildSharedTripSnapshot(data) {
  const plan = data?.tripPlan || {};
  const scheduled = list(data?.scheduledItinerary, day);
  const daily = list(plan.dailyItinerary, day);
  if (!scheduled.length && !daily.length) throw Object.assign(new Error('Wait for a completed itinerary before creating a link.'), { code: 'SHARE_INVALID' });
  const trip = { ...pick(data?.parsed, META), ...pick(data?.trip, META) };
  if (!trip.destination) throw Object.assign(new Error('The trip destination is missing.'), { code: 'SHARE_INVALID' });
  const tripData = {
    trip,
    parsed: pick(trip, ['destination', 'startDate', 'endDate']),
    tripPlan: { ...pick(plan, ['overview']), suggestedActivities: list(plan.suggestedActivities, activity), dailyItinerary: daily, tips: strings(plan.tips) },
    scheduledItinerary: scheduled,
    weather: weather(data?.weather),
  };
  if (data?.routePlan) {
    tripData.routePlan = {
      ...pick(data.routePlan, ['tripShape', 'title', 'totalDays', 'optimizationMode', 'confidence']),
      stops: list(data.routePlan.stops, stop => pick(stop, STOP)),
      transitLegs: list(data.routePlan.transitLegs, leg => pick(leg, ['fromStopId', 'toStopId', 'mode', 'estimatedHours', 'warning'])),
      warnings: strings(data.routePlan.warnings),
    };
    tripData.stopWeather = Object.fromEntries(tripData.routePlan.stops.map(stop => [stop.id, weather(data?.stopWeather?.[stop.id])]));
  }
  const snapshot = { schemaVersion: 1, tripData };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > MAX_BYTES) throw Object.assign(new Error('This itinerary is too large to share.'), { code: 'SHARE_INVALID' });
  return snapshot;
}
