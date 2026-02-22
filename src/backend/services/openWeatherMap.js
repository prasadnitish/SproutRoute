// OpenWeatherMap adapter for international weather forecasts.
// Returns the same { summary, forecast[] } shape as weather.js for seamless integration.
// Uses the free-tier 5-day/3-hour forecast API, aggregating intervals into daily forecasts.

const owmCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 100;
const OWM_TIMEOUT_MS = 8000;

/**
 * Reset the OWM cache — test helper only, no-op outside NODE_ENV=test.
 */
export function __resetOwmCacheForTests() {
  owmCache.clear();
}

/**
 * Fetch with an abort-controller timeout, matching weather.js pattern.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OWM_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("OpenWeatherMap service timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Removes expired cache entries so memory stays bounded.
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of owmCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      owmCache.delete(key);
    }
  }
}

/**
 * Write data into cache, evicting oldest when at capacity.
 * @param {string} key
 * @param {object} data
 */
function addToCache(key, data) {
  cleanExpiredCache();
  if (owmCache.size >= MAX_CACHE_SIZE) {
    const firstKey = owmCache.keys().next().value;
    owmCache.delete(firstKey);
  }
  owmCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Convert Kelvin to Fahrenheit, rounded to nearest integer.
 * @param {number} kelvin
 * @returns {number}
 */
function kelvinToFahrenheit(kelvin) {
  return Math.round((kelvin - 273.15) * (9 / 5) + 32);
}

/**
 * Map an OpenWeatherMap condition ID to a human-readable condition string.
 * See https://openweathermap.org/weather-conditions for the full list.
 * @param {number} conditionId - OWM weather condition code (e.g. 800, 500)
 * @returns {string}
 */
function mapConditionCode(conditionId) {
  if (conditionId >= 200 && conditionId <= 299) return "Stormy";
  if (conditionId >= 300 && conditionId <= 399) return "Rainy";
  if (conditionId >= 500 && conditionId <= 599) return "Rainy";
  if (conditionId >= 600 && conditionId <= 699) return "Snowy";
  if (conditionId >= 700 && conditionId <= 799) return "Foggy";
  if (conditionId === 800) return "Sunny";
  if (conditionId === 801) return "Partly Cloudy";
  if (conditionId >= 802 && conditionId <= 804) return "Cloudy";
  return "Unknown";
}

/**
 * Pick the dominant condition from an array of per-interval condition strings.
 * @param {string[]} intervals
 * @returns {string}
 */
function dominantCondition(intervals) {
  const counts = {};
  for (const condition of intervals) {
    counts[condition] = (counts[condition] || 0) + 1;
  }
  let best = intervals[0];
  let bestCount = 0;
  for (const [condition, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = condition;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Format a date string (YYYY-MM-DD) into a weekday name (e.g. "Monday").
 * @param {string} dateStr
 * @returns {string}
 */
function dateToWeekday(dateStr) {
  const date = new Date(dateStr + "T12:00:00Z");
  return date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/**
 * Fetch weather forecast from OpenWeatherMap for international destinations.
 * Uses the free 5-day/3-hour forecast endpoint and aggregates into daily forecasts.
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} [days=7] - Max days to return (capped at 5 due to free tier)
 * @returns {Promise<{summary: string, forecast: Array<{name: string, high: number, low: number, condition: string, precipitation: number}>}>}
 */
export async function getOpenWeatherForecast(lat, lon, days = 7) {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenWeatherMap API key not configured. Set OPENWEATHERMAP_API_KEY environment variable.",
    );
  }

  // Coarse cache key (2dp) groups nearby points for better hit-rate.
  const cacheKey = `owm:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = owmCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const url =
      `https://api.openweathermap.org/data/2.5/forecast` +
      `?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}` +
      `&appid=${apiKey}` +
      `&cnt=40`; // max 40 intervals = 5 days

    const response = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "SproutRoute/1.0",
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `OpenWeatherMap API error (${response.status}): ${text.slice(0, 200)}`,
      );
    }

    const data = await response.json();

    if (!data.list || !Array.isArray(data.list) || data.list.length === 0) {
      throw new Error("No forecast data returned from OpenWeatherMap");
    }

    // Group 3-hour intervals by date
    const dayMap = new Map();

    for (const interval of data.list) {
      const dateStr = interval.dt_txt.split(" ")[0];

      if (!dayMap.has(dateStr)) {
        dayMap.set(dateStr, {
          highs: [],
          lows: [],
          conditions: [],
        });
      }

      const dayData = dayMap.get(dateStr);
      dayData.highs.push(interval.main.temp_max);
      dayData.lows.push(interval.main.temp_min);

      const conditionId =
        interval.weather && interval.weather[0]
          ? interval.weather[0].id
          : 800;
      dayData.conditions.push(mapConditionCode(conditionId));
    }

    // Build daily forecast array
    const forecast = [];
    const maxDays = Math.min(days, 5); // free tier caps at 5 days

    for (const [dateStr, dayData] of dayMap.entries()) {
      if (forecast.length >= maxDays) break;

      const high = kelvinToFahrenheit(Math.max(...dayData.highs));
      const low = kelvinToFahrenheit(Math.min(...dayData.lows));
      const condition = dominantCondition(dayData.conditions);

      // Estimate precipitation chance based on condition
      let precipitation = 0;
      if (condition === "Rainy" || condition === "Stormy") {
        precipitation = 70;
      } else if (condition === "Snowy") {
        precipitation = 60;
      } else if (condition === "Cloudy") {
        precipitation = 20;
      } else if (condition === "Partly Cloudy") {
        precipitation = 10;
      } else if (condition === "Foggy") {
        precipitation = 15;
      }

      forecast.push({
        date: dateStr,
        name: dateToWeekday(dateStr),
        high,
        low,
        condition,
        precipitation,
      });
    }

    const summary = generateOwmSummary(forecast);

    const result = { summary, forecast };
    addToCache(cacheKey, result);
    return result;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("OpenWeatherMap fetch error:", error);
    }
    throw new Error("Failed to fetch weather: " + error.message);
  }
}

/**
 * Build a compact summary sentence from the daily forecast array.
 * @param {Array} forecast
 * @returns {string}
 */
function generateOwmSummary(forecast) {
  if (!forecast || forecast.length === 0) {
    return "Weather data unavailable";
  }

  const conditionCounts = {};
  for (const day of forecast) {
    conditionCounts[day.condition] =
      (conditionCounts[day.condition] || 0) + 1;
  }

  let dominantCond = forecast[0].condition;
  let bestCount = 0;
  for (const [cond, count] of Object.entries(conditionCounts)) {
    if (count > bestCount) {
      dominantCond = cond;
      bestCount = count;
    }
  }

  const highs = forecast.map((f) => f.high);
  const avgHigh = Math.round(
    highs.reduce((sum, h) => sum + h, 0) / highs.length,
  );

  const conditionDescriptors = {
    Sunny: "sunny skies",
    "Partly Cloudy": "partly cloudy skies",
    Cloudy: "cloudy skies",
    Rainy: "rain",
    Snowy: "snow",
    Stormy: "storms",
    Foggy: "fog",
    Unknown: "mixed conditions",
  };

  const descriptor = conditionDescriptors[dominantCond] || "mixed conditions";

  return `Expect ${descriptor} with highs around ${avgHigh}°F.`;
}

// Periodic cleanup without keeping Node alive in tests.
const cacheCleanupInterval = setInterval(cleanExpiredCache, 5 * 60 * 1000);
if (typeof cacheCleanupInterval.unref === "function") {
  cacheCleanupInterval.unref();
}
