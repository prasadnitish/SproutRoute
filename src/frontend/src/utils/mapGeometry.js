const KNOWN_CITY_COORDS = {
  amsterdam: { lat: 52.3676, lon: 4.9041 },
  berlin: { lat: 52.52, lon: 13.405 },
  budapest: { lat: 47.4979, lon: 19.0402 },
  prague: { lat: 50.0755, lon: 14.4378 },
  vienna: { lat: 48.2082, lon: 16.3738 },
  krakow: { lat: 50.0647, lon: 19.945 },
  bratislava: { lat: 48.1486, lon: 17.1077 },
  ljubljana: { lat: 46.0569, lon: 14.5058 },
  zagreb: { lat: 45.815, lon: 15.9819 },
  split: { lat: 43.5081, lon: 16.4402 },
  athens: { lat: 37.9838, lon: 23.7275 },
  santorini: { lat: 36.3932, lon: 25.4615 },
  crete: { lat: 35.2401, lon: 24.8093 },
  barcelona: { lat: 41.3874, lon: 2.1686 },
  paris: { lat: 48.8566, lon: 2.3522 },
  tokyo: { lat: 35.6762, lon: 139.6503 },
  kyoto: { lat: 35.0116, lon: 135.7681 },
  osaka: { lat: 34.6937, lon: 135.5023 },
  hakone: { lat: 35.2324, lon: 139.1069 },
  hiroshima: { lat: 34.3853, lon: 132.4553 },
  rome: { lat: 41.9028, lon: 12.4964 },
  florence: { lat: 43.7696, lon: 11.2558 },
  venice: { lat: 45.4408, lon: 12.3155 },
  milan: { lat: 45.4642, lon: 9.19 },
  lyon: { lat: 45.764, lon: 4.8357 },
  provence: { lat: 43.9352, lon: 6.0679 },
  nice: { lat: 43.7102, lon: 7.262 },
  madrid: { lat: 40.4168, lon: -3.7038 },
  seville: { lat: 37.3891, lon: -5.9845 },
  granada: { lat: 37.1773, lon: -3.5986 },
  "san francisco": { lat: 37.7749, lon: -122.4194 },
  monterey: { lat: 36.6002, lon: -121.8947 },
  "los angeles": { lat: 34.0522, lon: -118.2437 },
  "san diego": { lat: 32.7157, lon: -117.1611 },
  lisbon: { lat: 38.7223, lon: -9.1393 },
  porto: { lat: 41.1579, lon: -8.6291 },
  algarve: { lat: 37.0179, lon: -7.9308 },
  bangkok: { lat: 13.7563, lon: 100.5018 },
  "chiang mai": { lat: 18.7883, lon: 98.9853 },
  phuket: { lat: 7.8804, lon: 98.3923 },
};

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function finiteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function coordinatesFor(value) {
  if (!value || typeof value !== "object") return null;
  const directLat = finiteNumber(value.lat ?? value.latitude);
  const directLon = finiteNumber(value.lon ?? value.lng ?? value.longitude);
  if (directLat != null && directLon != null) return { lat: directLat, lon: directLon };

  const enriched = value.enriched || {};
  const enrichedLat = finiteNumber(enriched.lat ?? enriched.latitude);
  const enrichedLon = finiteNumber(enriched.lon ?? enriched.lng ?? enriched.longitude);
  if (enrichedLat != null && enrichedLon != null) return { lat: enrichedLat, lon: enrichedLon };

  const known = KNOWN_CITY_COORDS[normalizeKey(value.name || value.displayName || value.title)];
  return known || null;
}

export function toMapPoint(value, index = 0) {
  const coords = coordinatesFor(value);
  const name = value?.displayName || value?.name || value?.title || `Stop ${index + 1}`;
  return {
    id: value?.id || `${normalizeKey(name).replace(/\s+/g, "-") || "point"}-${index}`,
    name,
    label: String(index + 1),
    subtitle: value?.nights ? `${value.nights} night${value.nights === 1 ? "" : "s"}` : value?.scheduledStart || "",
    category: value?.category || "",
    isMeal: Boolean(value?.isMeal),
    lat: coords?.lat ?? null,
    lon: coords?.lon ?? null,
  };
}

export function pointsFromStops(stops = []) {
  return stops.map(toMapPoint);
}

export function pointsFromActivities(activities = []) {
  return activities
    .filter((activity) => activity?.status !== "closed")
    .map(toMapPoint);
}

export function distanceMiles(a, b) {
  if (!a || !b || a.lat == null || a.lon == null || b.lat == null || b.lon == null) return null;
  const toRad = (degrees) => degrees * Math.PI / 180;
  const radiusMiles = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function routeMetrics(points = [], totalDays = null) {
  const mapped = points.filter((point) => point.lat != null && point.lon != null);
  let totalMiles = 0;
  let longestMiles = 0;
  for (let i = 1; i < mapped.length; i += 1) {
    const miles = distanceMiles(mapped[i - 1], mapped[i]);
    if (Number.isFinite(miles)) {
      totalMiles += miles;
      longestMiles = Math.max(longestMiles, miles);
    }
  }

  const directMiles = mapped.length >= 2 ? distanceMiles(mapped[0], mapped[mapped.length - 1]) || totalMiles : totalMiles;
  const backtrackingRatio = directMiles > 0 ? totalMiles / directMiles : 1;
  const stopCount = points.length;
  const daysPerStop = totalDays && stopCount ? totalDays / stopCount : null;
  const paceLabel = daysPerStop == null
    ? "Flexible pace"
    : daysPerStop >= 3
      ? "Relaxed pace"
      : daysPerStop >= 2
        ? "Balanced pace"
        : "Ambitious pace";
  const backtrackingLabel = backtrackingRatio > 1.8
    ? "High backtracking"
    : backtrackingRatio > 1.35
      ? "Some backtracking"
      : "Efficient route";

  return {
    stopCount,
    mappedCount: mapped.length,
    totalMiles: Math.round(totalMiles),
    longestMiles: Math.round(longestMiles),
    paceLabel,
    backtrackingLabel,
  };
}

function coord(point) {
  return `${point.lat},${point.lon}`;
}

export function googleMapsEmbedUrl(points = [], fallbackCenter = null) {
  const mapped = points.filter((point) => point.lat != null && point.lon != null).slice(0, 10);
  if (mapped.length >= 2) {
    const [origin, ...rest] = mapped;
    const daddr = rest.map(coord).join("+to:");
    return `https://maps.google.com/maps?saddr=${coord(origin)}&daddr=${daddr}&output=embed`;
  }
  const center = mapped[0] || fallbackCenter;
  if (center?.lat != null && center?.lon != null) {
    return `https://maps.google.com/maps?q=${center.lat},${center.lon}&z=11&output=embed`;
  }
  return null;
}

export function googleMapsOpenUrl(points = [], fallbackCenter = null) {
  const mapped = points.filter((point) => point.lat != null && point.lon != null).slice(0, 10);
  if (mapped.length >= 2) {
    return `https://www.google.com/maps/dir/${mapped.map(coord).join("/")}`;
  }
  const center = mapped[0] || fallbackCenter;
  if (center?.lat != null && center?.lon != null) {
    return `https://www.google.com/maps/search/?api=1&query=${center.lat},${center.lon}`;
  }
  return "https://www.google.com/maps";
}
