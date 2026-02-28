// Visual Crossing adapter for international weather forecasts.
// Returns the same { summary, forecast[] } shape as weather.js for seamless integration.
// Provides 15-day forecasts with real precipitation probability and hourly data.

import { log } from "../utils/logger.js";

const vcCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 100;
const VC_TIMEOUT_MS = 10000;

/**
 * Reset the Visual Crossing cache — test helper only.
 */
export function __resetVcCacheForTests() {
  vcCache.clear();
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VC_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Visual Crossing service timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of vcCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      vcCache.delete(key);
    }
  }
}

function addToCache(key, data) {
  cleanExpiredCache();
  if (vcCache.size >= MAX_CACHE_SIZE) {
    const firstKey = vcCache.keys().next().value;
    vcCache.delete(firstKey);
  }
  vcCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Format a date string (YYYY-MM-DD) into a weekday name (e.g. "Monday").
 */
function dateToWeekday(dateStr) {
  const date = new Date(dateStr + "T12:00:00Z");
  return date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/**
 * Map Visual Crossing icon strings to our standard condition labels.
 */
function mapVcCondition(icon) {
  if (!icon) return "Unknown";
  if (icon.includes("thunder") || icon.includes("storm")) return "Stormy";
  if (icon.includes("rain") || icon.includes("showers")) return "Rainy";
  if (icon.includes("snow")) return "Snowy";
  if (icon.includes("fog")) return "Foggy";
  if (icon === "clear-day" || icon === "clear-night") return "Sunny";
  if (icon.includes("partly-cloudy")) return "Partly Cloudy";
  if (icon.includes("cloudy") || icon.includes("overcast") || icon === "wind") return "Cloudy";
  return "Partly Cloudy";
}

/**
 * Fetch weather forecast from Visual Crossing for any location worldwide.
 * Supports date ranges for future trip forecasts (statistical data when >15 days out).
 *
 * @param {number} lat
 * @param {number} lon
 * @param {object} [options]
 * @param {string} [options.startDate] - YYYY-MM-DD start of trip
 * @param {string} [options.endDate]   - YYYY-MM-DD end of trip
 * @param {number} [options.days=15]   - Fallback: number of days if no dates provided
 * @returns {Promise<{summary: string, forecast: Array}>}
 */
export async function getVisualCrossingForecast(lat, lon, options = {}) {
  const apiKey = process.env.VISUAL_CROSSING_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Visual Crossing API key not configured. Set VISUAL_CROSSING_API_KEY environment variable.",
    );
  }

  const { startDate, endDate, days = 15 } = options;

  // Build date range for the URL
  let dateRange;
  if (startDate && endDate) {
    dateRange = `${startDate}/${endDate}`;
  } else if (startDate) {
    dateRange = `${startDate}`;
  } else {
    dateRange = `next${days}days`;
  }

  const cacheKey = `vc:${lat.toFixed(2)},${lon.toFixed(2)}:${dateRange}`;
  const cached = vcCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const location = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const url =
      `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline` +
      `/${location}/${dateRange}` +
      `?unitGroup=us` +
      `&include=days` +
      `&elements=datetime,tempmax,tempmin,precipprob,conditions,icon,description` +
      `&key=${apiKey}`;

    const response = await fetchWithTimeout(url, {
      headers: { "User-Agent": "SproutRoute/1.0" },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Visual Crossing API error (${response.status}): ${text.slice(0, 200)}`,
      );
    }

    const data = await response.json();

    if (!data.days || !Array.isArray(data.days) || data.days.length === 0) {
      throw new Error("No forecast data returned from Visual Crossing");
    }

    const forecast = data.days.map((day) => ({
      date: day.datetime,
      name: dateToWeekday(day.datetime),
      high: Math.round(day.tempmax),
      low: Math.round(day.tempmin),
      condition: mapVcCondition(day.icon),
      detailedForecast: day.description || day.conditions,
      precipitation: Math.round(day.precipprob || 0),
    }));

    const summary = generateVcSummary(forecast);
    const result = { summary, forecast };

    addToCache(cacheKey, result);
    return result;
  } catch (error) {
    log.error("Visual Crossing fetch failed", { error: error.message });
    throw new Error("Failed to fetch weather: " + error.message);
  }
}

/**
 * Build a compact summary sentence from the daily forecast array.
 */
function generateVcSummary(forecast) {
  if (!forecast || forecast.length === 0) {
    return "Weather data unavailable";
  }

  const temps = forecast.map((f) => f.high).filter(Boolean);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);

  const avgPrecip =
    forecast.reduce((sum, f) => sum + f.precipitation, 0) / forecast.length;

  const conditions = [];
  if (avgPrecip > 50) {
    conditions.push("high chance of rain");
  } else if (avgPrecip > 30) {
    conditions.push("possible rain");
  }

  if (maxTemp > 80) {
    conditions.push("warm weather");
  } else if (minTemp < 50) {
    conditions.push("cool temperatures");
  }

  return `Expect temperatures between ${minTemp}°F and ${maxTemp}°F${
    conditions.length > 0 ? " with " + conditions.join(" and ") : ""
  }.`;
}

// Periodic cleanup without keeping Node alive in tests.
const cacheCleanupInterval = setInterval(cleanExpiredCache, 5 * 60 * 1000);
if (typeof cacheCleanupInterval.unref === "function") {
  cacheCleanupInterval.unref();
}
