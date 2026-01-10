const weatherCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 100;

/**
 * Clean up expired cache entries
 */
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

/**
 * Add entry to cache with size limit enforcement
 */
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

// Run cleanup periodically (every 5 minutes)
setInterval(cleanExpiredCache, 5 * 60 * 1000);

export async function getWeatherForecast(lat, lon) {
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;

  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const pointsResponse = await fetch(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      {
        headers: {
          "User-Agent": "StrollerScout/1.0 (contact@strollerscout.app)",
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

    const forecastResponse = await fetch(forecastUrl, {
      headers: {
        "User-Agent": "StrollerScout/1.0 (contact@strollerscout.app)",
      },
    });

    if (!forecastResponse.ok) {
      throw new Error("Failed to fetch weather forecast");
    }

    const forecastData = await forecastResponse.json();
    const periods = forecastData.properties.periods.slice(0, 14);

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
    console.error("Weather fetch error:", error);
    throw new Error("Failed to fetch weather: " + error.message);
  }
}

function extractPrecipitationChance(forecast) {
  const match = forecast.match(/(\d+)%\s+chance/i);
  return match ? parseInt(match[1]) : 0;
}

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
