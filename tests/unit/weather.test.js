import test from "node:test";
import assert from "node:assert/strict";
import { getOpenWeatherForecast, __resetOwmCacheForTests } from "../../src/backend/services/openWeatherMap.js";
import { getWeatherForecast, __resetWeatherCacheForTests } from "../../src/backend/services/weather.js";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

test.afterEach(() => {
  global.fetch = originalFetch;
  __resetOwmCacheForTests();
  if (__resetWeatherCacheForTests) __resetWeatherCacheForTests();
  // Restore env vars
  if (originalEnv.OPENWEATHERMAP_API_KEY !== undefined) {
    process.env.OPENWEATHERMAP_API_KEY = originalEnv.OPENWEATHERMAP_API_KEY;
  } else {
    delete process.env.OPENWEATHERMAP_API_KEY;
  }
});

// --- OpenWeatherMap provider tests ---

test("getOpenWeatherForecast returns forecast in standard shape", async () => {
  process.env.OPENWEATHERMAP_API_KEY = "test-key-123";

  // Mock OWM 5-day/3-hour forecast response with 2 days of data
  global.fetch = async (url) => {
    assert.ok(
      String(url).includes("api.openweathermap.org"),
      "Should call OpenWeatherMap API",
    );
    assert.ok(
      String(url).includes("appid=test-key-123"),
      "Should include API key",
    );

    return new Response(
      JSON.stringify({
        list: [
          // Day 1: two 3-hour intervals
          {
            dt: 1700000000,
            dt_txt: "2026-03-15 09:00:00",
            main: { temp: 290.15, temp_min: 288.15, temp_max: 292.15 },
            weather: [{ id: 800, main: "Clear", description: "clear sky" }],
          },
          {
            dt: 1700010800,
            dt_txt: "2026-03-15 12:00:00",
            main: { temp: 295.15, temp_min: 289.15, temp_max: 297.15 },
            weather: [{ id: 801, main: "Clouds", description: "few clouds" }],
          },
          // Day 2: one 3-hour interval
          {
            dt: 1700100000,
            dt_txt: "2026-03-16 09:00:00",
            main: { temp: 285.15, temp_min: 283.15, temp_max: 287.15 },
            weather: [{ id: 500, main: "Rain", description: "light rain" }],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await getOpenWeatherForecast(43.65, -79.38);

  // Verify standard shape
  assert.ok(result.summary, "Result should have a summary string");
  assert.ok(Array.isArray(result.forecast), "Result should have forecast array");
  assert.ok(result.forecast.length >= 1, "Should have at least 1 day of forecast");

  // Verify each forecast day has required fields
  const day = result.forecast[0];
  assert.ok(day.name, "Day should have a name");
  assert.ok(typeof day.high === "number", "Day should have numeric high temp");
  assert.ok(typeof day.low === "number", "Day should have numeric low temp");
  assert.ok(typeof day.condition === "string", "Day should have condition string");
  assert.ok(
    typeof day.precipitation === "number",
    "Day should have precipitation number",
  );
});

test("getOpenWeatherForecast converts Kelvin to Fahrenheit correctly", async () => {
  process.env.OPENWEATHERMAP_API_KEY = "test-key-123";

  // Use a single interval so the high and low are clear
  // Use unique coordinates to avoid cache collision with other tests
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        list: [
          {
            dt: 1700000000,
            dt_txt: "2026-03-15 12:00:00",
            main: { temp: 300, temp_min: 290, temp_max: 310 },
            weather: [{ id: 800, main: "Clear", description: "clear sky" }],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const result = await getOpenWeatherForecast(51.50, -0.12); // London
  const day = result.forecast[0];

  // 310 K -> (310 - 273.15) * 9/5 + 32 = 36.85 * 1.8 + 32 = 66.33 + 32 = 98.33 -> round to 98
  const expectedHigh = Math.round((310 - 273.15) * (9 / 5) + 32);
  // 290 K -> (290 - 273.15) * 9/5 + 32 = 16.85 * 1.8 + 32 = 30.33 + 32 = 62.33 -> round to 62
  const expectedLow = Math.round((290 - 273.15) * (9 / 5) + 32);

  assert.equal(day.high, expectedHigh, `High should be ${expectedHigh}°F`);
  assert.equal(day.low, expectedLow, `Low should be ${expectedLow}°F`);
});

test("getOpenWeatherForecast maps OWM condition codes to condition strings", async () => {
  process.env.OPENWEATHERMAP_API_KEY = "test-key-123";

  // Provide multiple days each with a single interval to test different condition codes
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        list: [
          {
            dt: 1700000000,
            dt_txt: "2026-03-15 12:00:00",
            main: { temp: 295, temp_min: 290, temp_max: 300 },
            weather: [{ id: 502, main: "Rain", description: "heavy rain" }],
          },
          {
            dt: 1700100000,
            dt_txt: "2026-03-16 12:00:00",
            main: { temp: 270, temp_min: 268, temp_max: 272 },
            weather: [{ id: 601, main: "Snow", description: "snow" }],
          },
          {
            dt: 1700200000,
            dt_txt: "2026-03-17 12:00:00",
            main: { temp: 295, temp_min: 290, temp_max: 300 },
            weather: [{ id: 803, main: "Clouds", description: "broken clouds" }],
          },
          {
            dt: 1700300000,
            dt_txt: "2026-03-18 12:00:00",
            main: { temp: 300, temp_min: 295, temp_max: 305 },
            weather: [{ id: 800, main: "Clear", description: "clear sky" }],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const result = await getOpenWeatherForecast(35.68, 139.69); // Tokyo — unique coords

  assert.equal(result.forecast[0].condition, "Rainy");
  assert.equal(result.forecast[1].condition, "Snowy");
  assert.equal(result.forecast[2].condition, "Cloudy");
  assert.equal(result.forecast[3].condition, "Sunny");
});

test("getOpenWeatherForecast throws when API key missing", async () => {
  delete process.env.OPENWEATHERMAP_API_KEY;

  await assert.rejects(
    () => getOpenWeatherForecast(43.65, -79.38),
    (err) => {
      assert.ok(
        err.message.includes("API key"),
        "Error should mention API key",
      );
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

test("getWeatherForecast routes non-US to OpenWeatherMap", async () => {
  process.env.OPENWEATHERMAP_API_KEY = "test-key-123";

  let calledOwm = false;
  let calledWeatherGov = false;

  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes("api.weather.gov")) {
      calledWeatherGov = true;
      throw new Error("Should not call Weather.gov for non-US");
    }
    if (urlStr.includes("api.openweathermap.org")) {
      calledOwm = true;
      return new Response(
        JSON.stringify({
          list: [
            {
              dt: 1700000000,
              dt_txt: "2026-03-15 12:00:00",
              main: { temp: 280, temp_min: 275, temp_max: 285 },
              weather: [{ id: 800, main: "Clear", description: "clear sky" }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`Unexpected fetch to: ${urlStr}`);
  };

  const result = await getWeatherForecast(43.65, -79.38, "CA");

  assert.ok(calledOwm, "Should have called OpenWeatherMap for CA");
  assert.ok(!calledWeatherGov, "Should NOT have called Weather.gov for CA");
  assert.ok(result.forecast, "Result should have forecast");
  assert.ok(result.summary, "Result should have summary");
});
