import { inclusiveDayCount } from "../utils/dateCalc.js";

const MAX_ROUTE_STOPS = 8;

const COUNTRY_TOUR_DEFAULTS = {
  JP: ["Tokyo", "Kyoto", "Osaka", "Hakone", "Hiroshima"],
  JAPAN: ["Tokyo", "Kyoto", "Osaka", "Hakone", "Hiroshima"],
  IT: ["Rome", "Florence", "Venice", "Milan"],
  ITALY: ["Rome", "Florence", "Venice", "Milan"],
  FR: ["Paris", "Lyon", "Provence", "Nice"],
  FRANCE: ["Paris", "Lyon", "Provence", "Nice"],
  ES: ["Madrid", "Seville", "Granada", "Barcelona"],
  SPAIN: ["Madrid", "Seville", "Granada", "Barcelona"],
};

const COUNTRY_TOUR_RATIONALES = {
  JP: "Classic first-time route; major international entry point first, then cultural core, food hub, and slower scenic finish.",
  JAPAN: "Classic first-time route; major international entry point first, then cultural core, food hub, and slower scenic finish.",
  IT: "Classic northbound route; starts with Rome and moves through Tuscany toward northern rail hubs.",
  ITALY: "Classic northbound route; starts with Rome and moves through Tuscany toward northern rail hubs.",
  FR: "North-to-south route; starts in Paris and ends on the Riviera.",
  FRANCE: "North-to-south route; starts in Paris and ends on the Riviera.",
  ES: "Connects major city, Andalusia, and Barcelona with manageable train/flight legs.",
  SPAIN: "Connects major city, Andalusia, and Barcelona with manageable train/flight legs.",
};

const CITY_COORDS = {
  amsterdam: { lat: 52.3676, lon: 4.9041 },
  berlin: { lat: 52.52, lon: 13.405 },
  budapest: { lat: 47.4979, lon: 19.0402 },
  greece: { lat: 37.9838, lon: 23.7275 },
  athens: { lat: 37.9838, lon: 23.7275 },
  tokyo: { lat: 35.6762, lon: 139.6503 },
  kyoto: { lat: 35.0116, lon: 135.7681 },
  osaka: { lat: 34.6937, lon: 135.5023 },
  hakone: { lat: 35.2324, lon: 139.1069 },
  hiroshima: { lat: 34.3853, lon: 132.4553 },
  rome: { lat: 41.9028, lon: 12.4964 },
  florence: { lat: 43.7696, lon: 11.2558 },
  venice: { lat: 45.4408, lon: 12.3155 },
  milan: { lat: 45.4642, lon: 9.19 },
  paris: { lat: 48.8566, lon: 2.3522 },
  lyon: { lat: 45.764, lon: 4.8357 },
  provence: { lat: 43.9352, lon: 6.0679 },
  nice: { lat: 43.7102, lon: 7.262 },
  madrid: { lat: 40.4168, lon: -3.7038 },
  seville: { lat: 37.3891, lon: -5.9845 },
  granada: { lat: 37.1773, lon: -3.5986 },
  barcelona: { lat: 41.3874, lon: 2.1686 },
};

const BROAD_REGION_NAMES = new Set([
  "greece",
  "japan",
  "italy",
  "france",
  "spain",
  "europe",
  "uk",
  "united kingdom",
]);

const EU_COUNTRIES = new Set([
  "amsterdam",
  "berlin",
  "budapest",
  "paris",
  "prague",
  "vienna",
  "rome",
  "florence",
  "venice",
  "milan",
  "barcelona",
  "madrid",
  "greece",
  "athens",
]);

export function buildRouteStopId(name, index) {
  const id = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || `stop-${index + 1}`;
}

function parseIsoDate(value) {
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(dateStr, days) {
  const d = parseIsoDate(dateStr);
  if (!d) return dateStr;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeRole(role) {
  return ["must_visit", "suggested", "transit"].includes(role) ? role : "must_visit";
}

function countryKeyFor(intent = {}) {
  return String(intent?.countryTour?.countryCode || intent?.countryTour?.country || intent?.destination || "")
    .trim()
    .toUpperCase();
}

function normalizeStops({ stops = [], tripShape, countryTour, destination }) {
  const parsedStops = Array.isArray(stops) ? stops : [];
  if (parsedStops.length > 0) {
    return parsedStops
      .map((stop, index) => {
        const name = String(stop?.name || "").trim();
        if (!name) return null;
        return {
          id: stop.id || buildRouteStopId(name, index),
          name,
          countryCode: stop.countryCode || null,
          role: normalizeRole(stop.role),
          requestedNights: Number.isFinite(Number(stop.requestedNights))
            ? Math.max(1, Math.floor(Number(stop.requestedNights)))
            : null,
          mustInclude: stop.mustInclude !== false,
          notes: Array.isArray(stop.notes) ? stop.notes.map(String).filter(Boolean).slice(0, 4) : [],
        };
      })
      .filter(Boolean)
      .slice(0, MAX_ROUTE_STOPS);
  }

  if (tripShape !== "country_tour") return [];

  const countryKey = String(countryTour?.countryCode || countryTour?.country || destination || "")
    .trim()
    .toUpperCase();
  const defaults = COUNTRY_TOUR_DEFAULTS[countryKey] || COUNTRY_TOUR_DEFAULTS[String(countryTour?.country || "").trim().toUpperCase()] || [];
  const count = Math.min(MAX_ROUTE_STOPS, Math.max(3, Number(countryTour?.suggestedStopCount) || 4));

  return defaults.slice(0, count).map((name, index) => ({
    id: buildRouteStopId(name, index),
    name,
    countryCode: countryTour?.countryCode || null,
    role: "suggested",
    requestedNights: null,
    mustInclude: false,
    notes: [],
  }));
}

function allocateNights(stops, startDate, endDate) {
  const totalDays = inclusiveDayCount(startDate, endDate);
  const totalNights = Math.max(1, totalDays - 1);
  const requestedTotal = stops.reduce((sum, stop) => sum + (stop.requestedNights || 0), 0);

  if (requestedTotal > 0 && requestedTotal <= totalNights) {
    const base = stops.map((stop) => stop.requestedNights || 1);
    let remaining = totalNights - base.reduce((sum, n) => sum + n, 0);
    let cursor = 0;
    while (remaining > 0) {
      base[cursor % base.length] += 1;
      remaining -= 1;
      cursor += 1;
    }
    return base;
  }

  const baseNight = Math.floor(totalNights / stops.length);
  let remainder = totalNights % stops.length;
  return stops.map(() => {
    const nights = Math.max(1, baseNight + (remainder > 0 ? 1 : 0));
    remainder -= 1;
    return nights;
  });
}

function chooseTransitMode(from, to) {
  const a = String(from?.name || "").toLowerCase();
  const b = String(to?.name || "").toLowerCase();
  if (EU_COUNTRIES.has(a) && EU_COUNTRIES.has(b)) return "train";
  if (from?.countryCode && to?.countryCode && from.countryCode === to.countryCode) return "train";
  return "flight";
}

function coordsForStop(stop) {
  return CITY_COORDS[String(stop?.name || "").trim().toLowerCase()] || null;
}

function distanceHours(from, to) {
  const a = coordsForStop(from);
  const b = coordsForStop(to);
  if (!a || !b) return chooseTransitMode(from, to) === "train" ? 3.5 : 2;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  const miles = earthMiles * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  const mode = chooseTransitMode(from, to);
  return mode === "train" ? Math.max(0.5, miles / 95) : Math.max(2, miles / 450 + 2);
}

function totalTransitHours(stops) {
  return stops.slice(0, -1).reduce((sum, stop, index) => sum + distanceHours(stop, stops[index + 1]), 0);
}

function optimizeFlexibleOrder(stops) {
  if (stops.length <= 2) return stops;
  const [first, ...remaining] = stops;
  const ordered = [first];
  const pool = [...remaining];
  while (pool.length > 0) {
    const current = ordered[ordered.length - 1];
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    pool.forEach((candidate, index) => {
      const score = distanceHours(current, candidate);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    ordered.push(pool.splice(bestIndex, 1)[0]);
  }
  return ordered;
}

function sameStopOrder(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((stop, index) => stop.name === b[index]?.name);
}

function buildAlternativeRoute(rawStops, warnings) {
  if (rawStops.length < 3) return null;
  const optimized = optimizeFlexibleOrder(rawStops);
  if (sameStopOrder(rawStops, optimized)) return null;
  const currentHours = totalTransitHours(rawStops);
  const optimizedHours = totalTransitHours(optimized);
  const hasBroadWarning = warnings.some((warning) => /broad/i.test(warning));
  if (!hasBroadWarning && optimizedHours >= currentHours - 0.75) return null;
  return {
    mode: "suggested_improvement",
    rationale: "Keeps train-friendly stops together before the longer transfer, reducing backtracking.",
    stops: optimized.map((stop) => ({ ...stop })),
    transitLegs: optimized.slice(0, -1).map((stop, index) => {
      const next = optimized[index + 1];
      const mode = chooseTransitMode(stop, next);
      return {
        fromStopId: stop.id,
        toStopId: next.id,
        mode,
        estimatedHours: Number(distanceHours(stop, next).toFixed(1)),
      };
    }),
    qualityDelta: {
      transitHoursSaved: Math.max(0, Number((currentHours - optimizedHours).toFixed(1))),
      fewerFlights: 0,
      lessBacktracking: optimizedHours < currentHours,
    },
  };
}

function routeRationaleFor({ tripShape, optimizationMode, intent }) {
  if (optimizationMode === "user_order") {
    return intent?.routeOptimizationMode === "user_order"
      ? "We kept your edited route exactly as submitted."
      : "We kept your city order because you listed the stops directly.";
  }
  const key = countryKeyFor(intent);
  if (tripShape === "country_tour") {
    return COUNTRY_TOUR_RATIONALES[key] || "We picked a recommended starter route that balances major stops and manageable transfers.";
  }
  return "We picked a recommended route that reduces backtracking and keeps transfers manageable.";
}

export function allocateRoute(intent) {
  const startDate = intent?.startDate;
  const endDate = intent?.endDate;
  const tripShape = intent?.tripShape === "country_tour" || intent?.tripShape === "multi_stop"
    ? intent.tripShape
    : "multi_stop";
  const totalDays = inclusiveDayCount(startDate, endDate);
  const rawStops = normalizeStops({
    stops: intent?.stops,
    tripShape,
    countryTour: intent?.countryTour,
    destination: intent?.destination,
  });

  if (rawStops.length < 2) {
    throw new Error("A multi-stop route needs at least two stops.");
  }

  const requestedMode = ["user_order", "recommended"].includes(intent?.routeOptimizationMode)
    ? intent.routeOptimizationMode
    : null;
  const optimizationMode = requestedMode || (tripShape === "country_tour" ? "recommended" : "user_order");
  const nights = allocateNights(rawStops, startDate, endDate);
  const warnings = [];
  let dayCursor = 1;
  let dateCursor = startDate;

  const routeStops = rawStops.map((stop, index) => {
    const stopNights = nights[index] || 1;
    const isLast = index === rawStops.length - 1;
    const departureDate = isLast ? endDate : addDays(dateCursor, stopNights);
    const dayEnd = isLast ? totalDays : Math.min(totalDays, dayCursor + stopNights - 1);

    if (BROAD_REGION_NAMES.has(stop.name.trim().toLowerCase()) && !["japan", "italy", "france", "spain"].includes(stop.name.trim().toLowerCase())) {
      warnings.push(`${stop.name} is broad; confirm the exact city before booking transit.`);
    }
    for (const note of stop.notes || []) warnings.push(`${stop.name}: ${note}`);

    const routeStop = {
      id: stop.id || buildRouteStopId(stop.name, index),
      name: stop.name,
      displayName: stop.name,
      countryCode: stop.countryCode || intent?.countryTour?.countryCode || null,
      regionCode: null,
      lat: null,
      lon: null,
      arrivalDate: dateCursor,
      departureDate,
      nights: stopNights,
      dayStart: dayCursor,
      dayEnd,
      role: stop.role,
    };

    dateCursor = departureDate;
    dayCursor = dayEnd + 1;
    return routeStop;
  });

  const transitLegs = routeStops.slice(0, -1).map((stop, index) => {
    const next = routeStops[index + 1];
    const mode = chooseTransitMode(stop, next);
    return {
      fromStopId: stop.id,
      toStopId: next.id,
      mode,
      estimatedHours: Number(distanceHours(stop, next).toFixed(1)),
      ...(mode === "flight" ? { warning: "Flight time excludes airport transfer and security." } : {}),
    };
  });
  const confidence = warnings.length > 0
    ? "needs_review"
    : tripShape === "country_tour" || optimizationMode === "recommended"
      ? "medium"
      : "high";
  const alternativeRoute = optimizationMode === "user_order" ? buildAlternativeRoute(rawStops, warnings) : null;

  return {
    tripShape,
    title: tripShape === "country_tour"
      ? `${intent?.countryTour?.country || intent?.destination || "Country"} route`
      : `${routeStops[0].name} to ${routeStops[routeStops.length - 1].name}`,
    totalDays,
    optimizationMode,
    routeRationale: routeRationaleFor({ tripShape, optimizationMode, intent }),
    routeQuality: {
      confidence,
      totalEstimatedTransitHours: Number(transitLegs.reduce((sum, leg) => sum + (Number(leg.estimatedHours) || 0), 0).toFixed(1)),
      flightLegCount: transitLegs.filter((leg) => leg.mode === "flight").length,
      backtrackingScore: alternativeRoute?.qualityDelta?.lessBacktracking ? 0.5 : 0,
      warnings: [...new Set(warnings)],
    },
    stops: routeStops,
    transitLegs,
    warnings: [...new Set(warnings)],
    confidence,
    ...(alternativeRoute ? { alternativeRoute } : {}),
  };
}
