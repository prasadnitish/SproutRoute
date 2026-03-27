// tests/unit/placesEnrich.test.js
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { enrichActivity, __resetCacheForTests } from "../../src/backend/services/placesEnrich.js";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

describe("enrichActivity", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    __resetCacheForTests();
  });

  it("returns enriched data from Google Places", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    global.fetch = async (url, opts) => {
      if (url.includes("places:searchText")) {
        return {
          ok: true,
          json: async () => ({
            places: [{
              id: "ChIJ123",
              displayName: { text: "Mama's Fish House" },
              rating: 4.9,
              userRatingCount: 2847,
              formattedAddress: "799 Poho Pl, Paia, HI 96779",
              nationalPhoneNumber: "(808) 579-8488",
              websiteUri: "https://mamasfishhouse.com",
              regularOpeningHours: { weekdayDescriptions: ["Mon–Sun: 11am–9pm"] },
              priceLevel: "PRICE_LEVEL_EXPENSIVE",
              googleMapsUri: "https://maps.google.com/?cid=123",
              photos: [{ name: "places/ChIJ123/photos/abc" }],
            }],
          }),
        };
      }
      return { ok: false, status: 404 };
    };

    const result = await enrichActivity("Mama's Fish House", "Maui, Hawaii", "restaurant");
    assert.equal(result.name, "Mama's Fish House");
    assert.equal(result.rating, 4.9);
    assert.equal(result.address, "799 Poho Pl, Paia, HI 96779");
    assert.equal(result.phone, "(808) 579-8488");
    assert.ok(result.photos[0].includes("/api/v1/places/photo"));
  });

  it("returns null when no places found", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ places: [] }),
    });
    const result = await enrichActivity("Nonexistent Place", "Nowhere");
    assert.equal(result, null);
  });

  it("returns null when API key is missing", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const result = await enrichActivity("Test", "City");
    assert.equal(result, null);
  });

  it("returns cached result on second call", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          places: [{
            id: "ChIJ123", displayName: { text: "Test" }, rating: 4.0,
            userRatingCount: 100, formattedAddress: "123 St",
            photos: [], googleMapsUri: "https://maps.google.com",
          }],
        }),
      };
    };
    await enrichActivity("Test Place", "City");
    await enrichActivity("Test Place", "City");
    assert.equal(callCount, 1);
  });
});
