import test from "node:test";
import assert from "node:assert/strict";
import {
  __resetGeocodingCachesForTests,
  geocodeLocation,
  resolveDestinationQuery,
} from "../../src/backend/services/geocoding.js";

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
  __resetGeocodingCachesForTests();
});

test("geocodeLocation caches repeated lookups", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify([
        { lat: "47.6062", lon: "-122.3321", display_name: "Seattle, WA" },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  await geocodeLocation("Seattle, WA");
  await geocodeLocation("Seattle, WA");

  assert.equal(calls, 1);
});

test("resolveDestinationQuery falls back to direct mode when nearby lookup fails", async () => {
  global.fetch = async (url) => {
    if (String(url).includes("nominatim.openstreetmap.org")) {
      return new Response(
        JSON.stringify([
          { lat: "47.6062", lon: "-122.3321", display_name: "Seattle, WA" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    throw new Error("overpass unavailable");
  };

  const result = await resolveDestinationQuery("2 hour drive from Seattle");

  assert.equal(result.mode, "direct");
  assert.equal(result.destination, "Seattle, WA");
});

// --- Phase 4: International geocoding tests ---

test("geocodeLocation resolves Canadian city with countryCode CA", async () => {
  global.fetch = async () =>
    new Response(
      JSON.stringify([
        {
          lat: "43.6532",
          lon: "-79.3832",
          display_name: "Toronto, Ontario, Canada",
          address: {
            city: "Toronto",
            state: "Ontario",
            country: "Canada",
            country_code: "ca",
            "ISO3166-2-lvl4": "CA-ON",
          },
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const result = await geocodeLocation("Toronto, Canada");

  assert.equal(result.countryCode, "CA");
  assert.equal(result.regionCode, "ON");
  assert.equal(result.lat, 43.6532);
  assert.equal(result.lon, -79.3832);
});

test("geocodeLocation resolves UK city with countryCode GB", async () => {
  global.fetch = async () =>
    new Response(
      JSON.stringify([
        {
          lat: "51.5074",
          lon: "-0.1278",
          display_name: "London, England, United Kingdom",
          address: {
            city: "London",
            state: "England",
            country: "United Kingdom",
            country_code: "gb",
            "ISO3166-2-lvl4": "GB-ENG",
          },
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const result = await geocodeLocation("London, UK");

  assert.equal(result.countryCode, "GB");
  assert.equal(result.regionCode, "ENG");
});

test("geocodeLocation resolves Australian city with countryCode AU", async () => {
  global.fetch = async () =>
    new Response(
      JSON.stringify([
        {
          lat: "-33.8688",
          lon: "151.2093",
          display_name: "Sydney, New South Wales, Australia",
          address: {
            city: "Sydney",
            state: "New South Wales",
            country: "Australia",
            country_code: "au",
            "ISO3166-2-lvl4": "AU-NSW",
          },
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const result = await geocodeLocation("Sydney, Australia");

  assert.equal(result.countryCode, "AU");
  assert.equal(result.regionCode, "NSW");
});

test("geocodeLocation still returns US stateCode for backward compatibility", async () => {
  global.fetch = async () =>
    new Response(
      JSON.stringify([
        {
          lat: "37.7749",
          lon: "-122.4194",
          display_name: "San Francisco, California, USA",
          address: {
            city: "San Francisco",
            state: "California",
            country: "United States",
            country_code: "us",
            "ISO3166-2-lvl4": "US-CA",
          },
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const result = await geocodeLocation("San Francisco");

  assert.equal(result.countryCode, "US");
  assert.equal(result.regionCode, "CA");
  assert.equal(result.stateCode, "CA"); // backward compat
});

test("geocodeLocation returns country-only for non-ISO3166-2 locations", async () => {
  global.fetch = async () =>
    new Response(
      JSON.stringify([
        {
          lat: "19.0760",
          lon: "72.8777",
          display_name: "Mumbai, Maharashtra, India",
          address: {
            city: "Mumbai",
            state: "Maharashtra",
            country: "India",
            country_code: "in",
          },
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const result = await geocodeLocation("Mumbai, India");

  assert.equal(result.countryCode, "IN");
  assert.equal(result.regionCode, null);
});

test("geocodeLocation error message does not mention US", async () => {
  global.fetch = async () =>
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(() => geocodeLocation("xyznonexistent"), (err) => {
    assert.ok(!err.message.includes("US"), "Error should not mention US");
    assert.ok(
      err.message.includes("not found"),
      "Error should say location not found",
    );
    return true;
  });
});

test("resolveDestinationQuery returns max three nearby suggestions", async () => {
  global.fetch = async (url) => {
    if (String(url).includes("nominatim.openstreetmap.org")) {
      return new Response(
        JSON.stringify([
          { lat: "47.6062", lon: "-122.3321", display_name: "Seattle, WA" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        elements: [
          { lat: 47.62, lon: -122.33, tags: { name: "Tacoma", state: "WA" } },
          { lat: 47.59, lon: -122.28, tags: { name: "Bellevue", state: "WA" } },
          { lat: 47.67, lon: -122.12, tags: { name: "Redmond", state: "WA" } },
          { lat: 47.70, lon: -122.20, tags: { name: "Everett", state: "WA" } },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await resolveDestinationQuery("near Seattle");

  assert.equal(result.mode, "suggestions");
  assert.equal(result.suggestions.length, 3);
});
