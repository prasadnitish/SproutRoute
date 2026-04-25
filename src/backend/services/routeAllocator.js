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
      estimatedHours: mode === "train" ? 3.5 : 2,
      ...(mode === "flight" ? { warning: "Flight time excludes airport transfer and security." } : {}),
    };
  });

  return {
    tripShape,
    title: tripShape === "country_tour"
      ? `${intent?.countryTour?.country || intent?.destination || "Country"} route`
      : `${routeStops[0].name} to ${routeStops[routeStops.length - 1].name}`,
    totalDays,
    optimizationMode: "user_order",
    stops: routeStops,
    transitLegs,
    warnings: [...new Set(warnings)],
    confidence: tripShape === "country_tour" ? "medium" : "high",
  };
}
