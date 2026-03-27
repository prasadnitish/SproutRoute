import { haversineDistanceMiles } from "./geocoding.js";

/**
 * Derives travel mode ("fly" or "drive") based on distance, country, and optional override.
 *
 * Rules:
 * 1. If an explicit override is provided ("fly" or "drive"), use it.
 * 2. If the destination country is not US, default to "fly".
 * 3. If coordinates are available, use haversine distance: < 500 miles = "drive", >= 500 = "fly".
 * 4. If no coordinates available, default to "fly".
 *
 * @param {Object} params
 * @param {number} [params.originLat]
 * @param {number} [params.originLon]
 * @param {number} [params.destLat]
 * @param {number} [params.destLon]
 * @param {string} [params.countryCode]
 * @param {string} [params.override] - "fly" or "drive" from frontend
 * @returns {"fly" | "drive"}
 */
export function deriveTravelMode({ originLat, originLon, destLat, destLon, countryCode, override } = {}) {
  if (override === "fly" || override === "drive") return override;
  if (countryCode && countryCode !== "US") return "fly";
  if (originLat != null && originLon != null && destLat != null && destLon != null) {
    const dist = haversineDistanceMiles(originLat, originLon, destLat, destLon);
    return dist < 500 ? "drive" : "fly";
  }
  return "fly";
}
