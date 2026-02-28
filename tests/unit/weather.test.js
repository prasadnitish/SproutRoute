import test from "node:test";
import assert from "node:assert/strict";
import { getVisualCrossingForecast, __resetVcCacheForTests } from "../../src/backend/services/visualCrossing.js";
import { getWeatherForecast, __resetWeatherCacheForTests } from "../../src/backend/services/weather.js";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

test.afterEach(() => {
  global.fetch = originalFetch;
  __resetVcCacheForTests();
  if (__resetWeatherCacheForTests) __resetWeatherCacheForTests();
  // Restore env vars
  if (originalEnv.VISUAL_CROSSING_API_KEY !== undefined) {
    process.env.VISUAL_CROSSING_API_KEY = originalEnv.VISUAL_CROSSING_API_KEY;
  } else {
    delete process.env.VISUAL_CROSSING_API_KEY;
  }
});

// --- Visual Crossing provider tests ---

function mockVcResponse(days) {
  return {
    days: days.map((d) => ({
      datetime: d.date,
      tempmax: d.high,
      tempmin: d.low,
      precipprob: d.precipprob ?? 0,
      conditions: d.conditions ?? "Clear",
      icon: d.icon ?? "clear-day",
      description: d.description ?? "Clear conditions throughout the day.",
    })),
  };
}

test("getVisualCrossingForecast returns forecast in standard shape", async () => {
  process.env.VISUAL_CROSSING_API_KEY = "test-key-123";

  global.fetch = async (url) => {
    assert.ok(
      String(url).includes("weather.visualcrossing.com"),
      "Should call Visual Crossing API",
    );
    assert.ok(
      String(url).includes("key=test-key-123"),
      "Should include API key",
    );

    return new Response(
      JSON.stringify(
        mockVcResponse([
          { date: "2026-03-15", high: 75, low: 58, precipprob: 10, icon: "clear-day" },
          { date: "2026-03-16", high: 68, low: 52, precipprob: 65, icon: "rain" },
        ]),
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await getVisualCrossingForecast(43.65, -79.38);

  assert.ok(result.summary, "Result should have a summary string");
  assert.ok(Array.isArray(result.forecast), "Result should have forecast array");
  assert.equal(result.forecast.length, 2, "Should have 2 days of forecast");

  const day = result.forecast[0];
  assert.ok(day.name, "Day should have a name");
  assert.ok(typeof day.high === "number", "Day should have numeric high temp");
  assert.ok(typeof day.low === "number", "Day should have numeric low temp");
  assert.ok(typeof day.condition === "string", "Day should have condition string");
  assert.ok(typeof day.precipitation === "number", "Day should have precipitation number");
});

test("getVisualCrossingForecast maps icon strings to condition labels", async () => {
  process.env.VISUAL_CROSSING_API_KEY = "test-key-123";

  global.fetch = async () =>
    new Response(
      JSON.stringify(
        mockVcResponse([
          { date: "2026-03-15", high: 72, low: 55, icon: "rain" },
          { date: "2026-03-16", high: 30, low: 20, icon: "snow" },
          { date: "2026-03-17", high: 68, low: 50, icon: "cloudy" },
          { date: "2026-03-18", high: 80, low: 65, icon: "clear-day" },
          { date: "2026-03-19", high: 75, low: 60, icon: "thunder-rain" },
          { date: "2026-03-20", high: 70, low: 55, icon: "partly-cloudy-day" },
        ]),
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const result = await getVisualCrossingForecast(35.68, 139.69);

  assert.equal(result.forecast[0].condition, "Rainy");
  assert.equal(result.forecast[1].condition, "Snowy");
  assert.equal(result.forecast[2].condition, "Cloudy");
  assert.equal(result.forecast[3].condition, "Sunny");
  assert.equal(result.forecast[4].condition, "Stormy");
  assert.equal(result.forecast[5].condition, "Partly Cloudy");
});

test("getVisualCrossingForecast uses real precipitation probability", async () => {
  process.env.VISUAL_CROSSING_API_KEY = "test-key-123";

  global.fetch = async () =>
    new Response(
      JSON.stringify(
        mockVcResponse([
          { date: "2026-03-15", high: 72, low: 55, precipprob: 85.3, icon: "rain" },
          { date: "2026-03-16", high: 80, low: 65, precipprob: 0, icon: "clear-day" },
        ]),
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const result = await getVisualCrossingForecast(51.50, -0.12);

  assert.equal(result.forecast[0].precipitation, 85, "Should round precipitation to nearest integer");
  assert.equal(result.forecast[1].precipitation, 0, "Zero precip should stay 0");
});

test("getVisualCrossingForecast passes date range in URL", async () => {
  process.env.VISUAL_CROSSING_API_KEY = "test-key-123";

  let calledUrl = "";
  global.fetch = async (url) => {
    calledUrl = String(url);
    return new Response(
      JSON.stringify(
        mockVcResponse([{ date: "2026-07-01", high: 90, low: 75, icon: "clear-day" }]),
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  await getVisualCrossingForecast(15.30, 74.08, {
    startDate: "2026-07-01",
    endDate: "2026-07-14",
  });

  assert.ok(calledUrl.includes("2026-07-01/2026-07-14"), "URL should contain date range");
});

test("getVisualCrossingForecast throws when API key missing", async () => {
  delete process.env.VISUAL_CROSSING_API_KEY;

  await assert.rejects(
    () => getVisualCrossingForecast(43.65, -79.38),
    (err) => {
      assert.ok(err.message.includes("API key"), "Error should mention API key");
      return true;
    },
  );
});

// --- Weather router tests ---

test("getWeatherForecast routes US to Weather.gov", async () => {
  let calledWeatherGov = false;

  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes("api.weather.gov")) {
      calledWeatherGov = true;
      if (urlStr.includes("/points/")) {
        return new Response(
          JSON.stringify({
            properties: {
              forecast:
                "https://api.weather.gov/gridpoints/SEW/124,67/forecast",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      // Forecast endpoint
      return new Response(
        JSON.stringify({
          properties: {
            periods: [
              {
                name: "Monday",
                startTime: "2026-03-15T06:00:00-07:00",
                temperature: 72,
                shortForecast: "Sunny",
                detailedForecast: "Sunny with a high near 72.",
                icon: "https://api.weather.gov/icons/land/day/few",
              },
              {
                name: "Monday Night",
                startTime: "2026-03-15T18:00:00-07:00",
                temperature: 55,
                shortForecast: "Clear",
                detailedForecast: "Clear with a low around 55.",
                icon: "https://api.weather.gov/icons/land/night/few",
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Unexpected fetch to: ${urlStr}`);
  };

  const result = await getWeatherForecast(47.6, -122.33, "US");

  assert.ok(calledWeatherGov, "Should have called Weather.gov for US");
  assert.ok(result.forecast, "Result should have forecast");
  assert.ok(result.summary, "Result should have summary");
});

test("getWeatherForecast routes non-US to Visual Crossing", async () => {
  process.env.VISUAL_CROSSING_API_KEY = "test-key-123";

  let calledVc = false;
  let calledWeatherGov = false;

  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes("api.weather.gov")) {
      calledWeatherGov = true;
      throw new Error("Should not call Weather.gov for non-US");
    }
    if (urlStr.includes("weather.visualcrossing.com")) {
      calledVc = true;
      return new Response(
        JSON.stringify(
          mockVcResponse([
            { date: "2026-03-15", high: 45, low: 35, icon: "cloudy" },
          ]),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`Unexpected fetch to: ${urlStr}`);
  };

  const result = await getWeatherForecast(43.65, -79.38, "CA");

  assert.ok(calledVc, "Should have called Visual Crossing for CA");
  assert.ok(!calledWeatherGov, "Should NOT have called Weather.gov for CA");
  assert.ok(result.forecast, "Result should have forecast");
  assert.ok(result.summary, "Result should have summary");
});
