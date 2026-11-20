// Public snapshots use an allowlist at both the browser and server boundaries.
// Never add raw prompts, parsed profiles, traveler identities or auth state here.
// Structured fields only: generated prose (overviews, tips, notes, descriptions,
// "why this fits") can mention children's ages and pets, so it is never shared.
const META = ['destination', 'startDate', 'endDate', 'duration', 'lat', 'lon', 'countryCode'];
const ACTIVITY = ['id', 'name', 'title', 'category', 'duration', 'kidFriendly', 'petFriendly', 'weatherDependent', 'indoors', 'timeOfDay', 'openingHours', 'address', 'lat', 'lon', 'latitude', 'longitude', 'scheduledStart', 'scheduledEnd', 'locked', 'status', 'isMeal', 'mealType', 'cuisine'];
const DAY = ['day', 'date', 'routeDate', 'routeDay', 'stopId', 'stopName'];
const STOP = ['id', 'name', 'displayName', 'countryCode', 'regionCode', 'lat', 'lon', 'arrivalDate', 'departureDate', 'nights', 'dayStart', 'dayEnd', 'role'];
const WEATHER = ['date', 'name', 'high', 'low', 'temp', 'condition', 'precipitation', 'precipitationChance', 'icon', 'unit'];
const ROUTE_META = ['orderedBy', 'mappedStopCount', 'totalDistanceMiles', 'totalTravelMinutes', 'inputDistanceMiles', 'optimizedDistanceMiles'];
const MAX_BYTES = 128 * 1024;
const PACKING_LIMITS = { categories: 30, items: 100, chars: 120 };

function pick(value, keys) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const key of keys) {
    const item = value[key];
    if (typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) out[key] = item;
  }
  return out;
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

function day(value, projectActivity = activity) {
  const out = pick(value, DAY);
  if (Array.isArray(value?.activities)) out.activities = list(value.activities, projectActivity);
  if (Array.isArray(value?.scheduled)) out.scheduled = list(value.scheduled, projectActivity);
  if (value?.meals && typeof value.meals === 'object') {
    out.meals = {};
    for (const type of ['breakfast', 'lunch', 'dinner', 'snack']) {
      const meal = value.meals[type];
      if (meal) out.meals[type] = typeof meal === 'string' ? meal : pick(meal, ['name', 'cuisine', 'address']);
    }
  }
  if (value?.routeMeta) out.routeMeta = pick(value.routeMeta, ROUTE_META);
  if (Array.isArray(value?.warnings)) out.warnings = value.warnings.filter(item => item && typeof item === 'object').map(item => pick(item, ['type', 'activity']));
  return out;
}

function weather(value) {
  return { ...pick(value, ['summary', 'source', 'unitSystem']), forecast: list(Array.isArray(value) ? value : value?.forecast, item => pick(item, WEATHER)) };
}

function packingText(value) {
  return typeof value === 'string' ? value.trim().slice(0, PACKING_LIMITS.chars) : '';
}

// "4-year-old", "18 month old", "2 yr old" and similar.
const AGE_PHRASE = /\b\d{1,2}[\s-]*(?:years?|yrs?|months?|mos?)[\s-]*old\b/i;

// Children's and pets' names the planner was given; packing names that use them stay private.
function privateNames(data) {
  const people = [data?.trip?.children, data?.parsed?.children, data?.trip?.pets, data?.parsed?.pets, data?.pets, data?.children];
  return people.flat().map(entry => (typeof entry?.name === 'string' ? entry.name.trim() : ''))
    .filter(name => name.length >= 2);
}

function mentionsPrivate(text, names) {
  if (AGE_PHRASE.test(text)) return true;
  return names.some(name => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
}

// Names and quantities only: reasons, sources, shop links and check marks stay private.
function packingList(value, names = []) {
  if (!Array.isArray(value?.categories)) return null;
  const categories = value.categories.slice(0, PACKING_LIMITS.categories).map(category => {
    const name = packingText(category?.name);
    return {
      name: name && mentionsPrivate(name, names) ? 'Other items' : name,
      items: (Array.isArray(category?.items) ? category.items : []).slice(0, PACKING_LIMITS.items)
        .map(item => ({ name: packingText(item?.name), quantity: packingText(item?.quantity) }))
        .filter(item => item.name && !mentionsPrivate(item.name, names)),
    };
  }).filter(category => category.name && category.items.length);
  return categories.length ? { categories } : null;
}

export function buildSharedTripSnapshot(data, { projectActivity = activity } = {}) {
  const plan = data?.tripPlan || {};
  const scheduled = list(data?.scheduledItinerary, value => day(value, projectActivity));
  const daily = list(plan.dailyItinerary, value => day(value, projectActivity));
  if (!scheduled.length && !daily.length) throw Object.assign(new Error('Wait for a completed itinerary before creating a link.'), { code: 'SHARE_INVALID' });
  const trip = { ...pick(data?.parsed, META), ...pick(data?.trip, META) };
  if (!trip.destination) throw Object.assign(new Error('The trip destination is missing.'), { code: 'SHARE_INVALID' });
  const tripData = {
    trip,
    parsed: pick(trip, ['destination', 'startDate', 'endDate']),
    tripPlan: { suggestedActivities: list(plan.suggestedActivities, projectActivity), dailyItinerary: daily, tips: [] },
    scheduledItinerary: scheduled,
    weather: weather(data?.weather),
  };
  if (data?.routePlan) {
    tripData.routePlan = {
      ...pick(data.routePlan, ['tripShape', 'title', 'totalDays', 'optimizationMode', 'confidence']),
      stops: list(data.routePlan.stops, stop => pick(stop, STOP)),
      transitLegs: list(data.routePlan.transitLegs, leg => pick(leg, ['fromStopId', 'toStopId', 'mode', 'estimatedHours'])),
      warnings: [],
    };
    tripData.stopWeather = Object.fromEntries(tripData.routePlan.stops.map(stop => [stop.id, weather(data?.stopWeather?.[stop.id])]));
  }
  const packing = packingList(data?.packingList, privateNames(data));
  if (packing) tripData.packingList = packing;
  const snapshot = { schemaVersion: 1, tripData };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > MAX_BYTES) throw Object.assign(new Error('This itinerary is too large to share.'), { code: 'SHARE_INVALID' });
  return snapshot;
}
