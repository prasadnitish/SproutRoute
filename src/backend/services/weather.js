// Weather service adapter:
// - Routes weather requests by country: US → Weather.gov, other → OpenWeatherMap.
// - Normalizes Weather.gov's day/night periods into simple daily data for UI + AI.
// - Uses an in-memory cache to reduce latency and external API load.
import { getOpenWeatherForecast } from "./openWeatherMap.js";

const weatherCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 100;
const WEATHER_TIMEOUT_MS = 10000;

async function fetchWithTimeout(url, options) {
  // Prevents Weather.gov slow responses from hanging request handlers indefinitely.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Weather service timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Removes expired cache entries so memory stays bounded during long-running sessions.
function cleanExpiredCache() {
  const now = Date.now();
  let deletedCount = 0;

  for (const [key, value] of weatherCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      weatherCache.delete(key);
      deletedCount++;
    }
  }

  if (deletedCount > 0 && process.env.NODE_ENV !== "production") {
    console.log(`Cleaned ${deletedCount} expired weather cache entries`);
  }
}

// Writes forecast data into cache and evicts oldest entries when capacity is reached.
function addToCache(key, data) {
  // Clean expired entries first
  cleanExpiredCache();

  // If still too large, remove oldest entries
  if (weatherCache.size >= MAX_CACHE_SIZE) {
    const firstKey = weatherCache.keys().next().value;
    weatherCache.delete(firstKey);
  }

  weatherCache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

// Run cleanup periodically (every 5 minutes) without keeping Node alive in tests.
const cacheCleanupInterval = setInterval(cleanExpiredCache, 5 * 60 * 1000);
if (typeof cacheCleanupInterval.unref === "function") {
  cacheCleanupInterval.unref();
}

/**
 * Reset the weather cache — test helper only, no-op outside NODE_ENV=test.
 */
export function __resetWeatherCacheForTests() {
  weatherCache.clear();
}

export async function getWeatherForecast(lat, lon, countryCode) {
  // Route international requests to OpenWeatherMap; US stays on Weather.gov.
  if (countryCode && countryCode.toUpperCase() !== "US") {
    return getOpenWeatherForecast(lat, lon);
  }

  // Coarse cache key (2dp) intentionally groups nearby points to improve hit-rate.
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;

  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // Weather.gov requires a two-step flow:
    // 1) /points maps coordinates to the correct local forecast endpoint.
    // 2) The returned forecast URL provides period-by-period weather details.
    const pointsResponse = await fetchWithTimeout(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      {
        headers: {
          "User-Agent": "SproutRoute/1.0 (contact@sproutroute.app)",
        },
      },
    );

    if (!pointsResponse.ok) {
      throw new Error(
        "Weather service unavailable for this location. Please try a US location.",
      );
    }

    const pointsData = await pointsResponse.json();
    const forecastUrl = pointsData.properties.forecast;

    const forecastResponse = await fetchWithTimeout(forecastUrl, {
      headers: {
        "User-Agent": "SproutRoute/1.0 (contact@sproutroute.app)",
      },
    });

    if (!forecastResponse.ok) {
      throw new Error("Failed to fetch weather forecast");
    }

    const forecastData = await forecastResponse.json();
    const periods = forecastData.properties.periods.slice(0, 14);

    // Weather.gov returns alternating day/night periods; fold each pair into one day.
    const forecast = [];
    for (let i = 0; i < periods.length; i += 2) {
      const day = periods[i];
      const night = periods[i + 1];

      forecast.push({
        date: day.startTime.split("T")[0],
        name: day.name,
        high: day.temperature,
        low: night ? night.temperature : null,
        condition: day.shortForecast,
        detailedForecast: day.detailedForecast,
        precipitation: extractPrecipitationChance(day.detailedForecast),
        icon: day.icon,
      });
    }

    const summary = generateWeatherSummary(forecast);

    const result = {
      forecast,
      summary,
    };

    addToCache(cacheKey, result);

    return result;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Weather fetch error:", error);
    }
    throw new Error("Failed to fetch weather: " + error.message);
  }
}

function extractPrecipitationChance(forecast) {
  // Pulls a coarse rain probability from free-form forecast text for lightweight scoring.
  const match = forecast.match(/(\d+)%\s+chance/i);
  return match ? parseInt(match[1]) : 0;
}

// Creates a compact summary sentence for fast UI reading and AI prompt context.
function generateWeatherSummary(forecast) {
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
