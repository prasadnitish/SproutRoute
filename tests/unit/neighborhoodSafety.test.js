// Neighborhood safety service tests (Amadeus Safe Place / GeoSure).
// Uses global.fetch mocking + env-var override to test the full OAuth + API flow
// without hitting real endpoints.
import test from "node:test";
import assert from "node:assert/strict";
import {
  getNeighborhoodSafety,
  __resetNeighborhoodCacheForTests,
} from "../../src/backend/services/neighborhoodSafety.js";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

test.afterEach(() => {
  global.fetch = originalFetch;
  process.env.AMADEUS_API_KEY = originalEnv.AMADEUS_API_KEY;
  process.env.AMADEUS_API_SECRET = originalEnv.AMADEUS_API_SECRET;
  __resetNeighborhoodCacheForTests();
});

// --- Helper: build mock fetch that handles OAuth + Safe Place in one handler ---

function buildMockFetch({ safetyScores, oauthCalls, safetyCalls } = {}) {
  const scores = safetyScores || {
    lgbtq: 42,
    medical: 0,
    overall: 35,
    physicalHarm: 36,
    politicalFreedom: 50,
    theft: 44,
    women: 34,
  };

  const counters = {
    oauth: oauthCalls || { count: 0 },
    safety: safetyCalls || { count: 0 },
  };

  global.fetch = async (url) => {
    const urlStr = String(url);

    // OAuth token endpoint
    if (urlStr.includes("/v1/security/oauth2/token")) {
      counters.oauth.count += 1;
      return new Response(
        JSON.stringify({
          access_token: "test-token-abc",
          token_type: "Bearer",
          expires_in: 1799,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Safe Place endpoint
    if (urlStr.includes("/v1/safety/safety-rated-locations")) {
      counters.safety.count += 1;
      return new Response(
        JSON.stringify({
          data: [
            {
              type: "safety-rated-location",
              id: "Q930402753",
              safetyScores: scores,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    throw new Error("Unexpected fetch URL: " + urlStr);
  };

  return counters;
}

// --------------------------------------------------
// Test 1: returns safety scores for valid coordinates
// --------------------------------------------------
test("getNeighborhoodSafety returns safety scores for valid coordinates", async () => {
  process.env.AMADEUS_API_KEY = "test-key";
  process.env.AMADEUS_API_SECRET = "test-secret";
  buildMockFetch();

  const result = await getNeighborhoodSafety(48.8566, 2.3522);

  assert.ok(result, "result should not be null");
  assert.equal(result.overallScore, 35);
  assert.equal(result.source, "geosure");

  // Verify all category mappings
  assert.equal(result.categories.physicalHarm, 36);
  assert.equal(result.categories.theft, 44);
  assert.equal(result.categories.healthMedical, 0);
  assert.equal(result.categories.womensSafety, 34);
  assert.equal(result.categories.lgbtqSafety, 42);
  assert.equal(result.categories.politicalFreedoms, 50);
});

// --------------------------------------------------
// Test 2: caches results by rounded coordinates
// --------------------------------------------------
test("getNeighborhoodSafety caches results by rounded coordinates", async () => {
  process.env.AMADEUS_API_KEY = "test-key";
  process.env.AMADEUS_API_SECRET = "test-secret";

  const safetyCalls = { count: 0 };
  buildMockFetch({ safetyCalls });

  // These two lat/lon pairs round to the same 2-decimal key (48.86, 2.35)
  await getNeighborhoodSafety(48.8566, 2.3522);
  await getNeighborhoodSafety(48.859, 2.351);

  assert.equal(
    safetyCalls.count,
    1,
    "Should only call the Safe Place API once for nearby coords",
  );
});

// --------------------------------------------------
// Test 3: returns null when API keys missing
// --------------------------------------------------
test("getNeighborhoodSafety returns null when API keys missing", async () => {
  delete process.env.AMADEUS_API_KEY;
  delete process.env.AMADEUS_API_SECRET;

  const result = await getNeighborhoodSafety(48.8566, 2.3522);

  assert.equal(
    result,
    null,
    "Should return null when API keys are not configured",
  );
});

// --------------------------------------------------
// Test 4: returns null when API is down (fetch throws)
// --------------------------------------------------
test("getNeighborhoodSafety returns null when API is down", async () => {
  process.env.AMADEUS_API_KEY = "test-key";
  process.env.AMADEUS_API_SECRET = "test-secret";

  global.fetch = async () => {
    throw new Error("Network failure");
  };

  const result = await getNeighborhoodSafety(40.7128, -74.006);

  assert.equal(
    result,
    null,
    "Should return null gracefully when fetch throws",
  );
});

// --------------------------------------------------
// Test 5: returns null for empty API response
// --------------------------------------------------
test("getNeighborhoodSafety returns null for empty API response", async () => {
  process.env.AMADEUS_API_KEY = "test-key";
  process.env.AMADEUS_API_SECRET = "test-secret";

  global.fetch = async (url) => {
    const urlStr = String(url);

    if (urlStr.includes("/v1/security/oauth2/token")) {
      return new Response(
        JSON.stringify({
          access_token: "test-token-abc",
          token_type: "Bearer",
          expires_in: 1799,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (urlStr.includes("/v1/safety/safety-rated-locations")) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error("Unexpected fetch URL: " + urlStr);
  };

  const result = await getNeighborhoodSafety(0.0, 0.0);

  assert.equal(
    result,
    null,
    "Should return null when Amadeus returns empty data array",
  );
});

// --------------------------------------------------
// Test 6: getAmadeusToken caches OAuth token
// --------------------------------------------------
test("getAmadeusToken caches OAuth token (only 1 OAuth call for 2 safety calls)", async () => {
  process.env.AMADEUS_API_KEY = "test-key";
  process.env.AMADEUS_API_SECRET = "test-secret";

  const oauthCalls = { count: 0 };
  buildMockFetch({ oauthCalls });

  // Two calls to different coordinates (so they won't hit the safety cache)
  await getNeighborhoodSafety(48.8566, 2.3522);
  await getNeighborhoodSafety(40.7128, -74.006);

  assert.equal(
    oauthCalls.count,
    1,
    "Should only make 1 OAuth call for multiple safety requests",
  );
});
