import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/backend/server.js";

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function invokeRoute(app, method, path, body) {
  const routeStack = app._router?.stack || [];
  const routeLayer = routeStack.find(
    (layer) =>
      layer.route &&
      layer.route.path === path &&
      layer.route.methods[method.toLowerCase()],
  );

  if (!routeLayer) {
    throw new Error(`Route not found: ${method} ${path}`);
  }

  // Route stack last entry is the handler; skip rate limiter middleware
  const handler =
    routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;
  const req = { method, path, body, headers: {}, ip: "127.0.0.1" };
  const res = createMockRes();

  await handler(req, res);
  return res;
}

function makeApp() {
  return createApp({
    enableRequestLogging: false,
    geocodeLocationFn: async () => ({
      lat: 0,
      lon: 0,
      displayName: "Test",
      countryCode: "US",
    }),
    getWeatherForecastFn: async () => ({ periods: [] }),
    generateTripPlanFn: async () => ({}),
    generatePackingListFn: async () => ({ categories: [] }),
  });
}

test.afterEach(() => {
  process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
});

// ── POST /api/v1/profile/import/validate ──────────────────────────────────────

test("POST /api/v1/profile/import/validate with valid profile JSON returns valid: true", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const app = makeApp();

  const validProfile = {
    food_preferences: { cuisines_liked: ["Italian", "Thai"] },
    travel_style: { pace: "relaxed" },
    activity_preferences: { preferred_activities: ["hiking"] },
  };

  const res = await invokeRoute(
    app,
    "POST",
    "/api/v1/profile/import/validate",
    { rawText: JSON.stringify(validProfile) },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.valid, true);
  assert.deepEqual(res.body.errors, []);
  assert.equal(res.body.detectedFormat, "external_profile_v1");
});

test("POST /api/v1/profile/import/validate with invalid JSON string returns valid: false", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const app = makeApp();

  const res = await invokeRoute(
    app,
    "POST",
    "/api/v1/profile/import/validate",
    { rawText: "this is not { valid json }" },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.valid, false);
  assert.ok(res.body.errors.length > 0, "should have at least one error");
  assert.equal(res.body.detectedFormat, "unknown");
});

test("POST /api/v1/profile/import/validate with JSON but no profile fields returns valid: false", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const app = makeApp();

  const res = await invokeRoute(
    app,
    "POST",
    "/api/v1/profile/import/validate",
    { rawText: JSON.stringify({ foo: "bar", count: 42 }) },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.valid, false);
  assert.ok(res.body.errors.length > 0, "should list missing profile fields");
  assert.equal(res.body.detectedFormat, "unknown");
});

test("POST /api/v1/profile/import/validate with missing rawText returns 422", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const app = makeApp();

  const res = await invokeRoute(
    app,
    "POST",
    "/api/v1/profile/import/validate",
    {},
  );

  assert.equal(res.statusCode, 422);
  assert.ok(res.body.error, "should return an error message");
});

// ── POST /api/v1/profile/import/normalize ─────────────────────────────────────

test("POST /api/v1/profile/import/normalize with snake_case external format normalizes to camelCase", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const app = makeApp();

  const snakeCaseProfile = {
    food_preferences: {
      cuisines_liked: ["Mexican", "Japanese"],
      cuisines_disliked: ["Fast food"],
      dietary_restrictions: ["vegetarian"],
      kid_foods: ["pizza"],
      food_adventurousness: "moderate",
    },
    travel_style: {
      pace: "relaxed",
      planning_style: "spontaneous",
      accommodation_preference: "hotel",
      transport_preference: "rental car",
    },
    activity_preferences: {
      preferred_activities: ["hiking", "museums"],
      disliked_activities: ["nightlife"],
      activity_intensity: "moderate",
    },
    personality_profile: {
      traveler_type: "explorer",
      novelty_vs_comfort: 0.7,
      crowd_tolerance: "low",
    },
    family_context: {
      traveling_with: "partner + 2 kids",
      kids_details: "ages 3 and 6",
      kid_preferences: "playgrounds",
      pet_context: "none",
    },
    constraints: {
      budget_range: "moderate",
      time_constraints: "1 week max",
      accessibility_needs: "none",
    },
    trip_priorities: {
      must_haves: ["beach", "good food"],
      avoidances: ["crowds"],
    },
  };

  const res = await invokeRoute(
    app,
    "POST",
    "/api/v1/profile/import/normalize",
    { rawText: JSON.stringify(snakeCaseProfile) },
  );

  assert.equal(res.statusCode, 200);
  const profile = res.body.normalizedProfile;
  assert.ok(profile, "normalizedProfile should be present");

  // Verify snake_case was normalized to camelCase structure
  assert.deepEqual(profile.food.cuisinesLiked, ["Mexican", "Japanese"]);
  assert.deepEqual(profile.food.cuisinesDisliked, ["Fast food"]);
  assert.deepEqual(profile.food.dietaryRestrictions, ["vegetarian"]);
  assert.deepEqual(profile.food.kidFoods, ["pizza"]);
  assert.equal(profile.food.foodAdventurousness, "moderate");

  assert.equal(profile.travelStyle.pace, "relaxed");
  assert.equal(profile.travelStyle.planningStyle, "spontaneous");
  assert.equal(profile.travelStyle.accommodationPreference, "hotel");
  assert.equal(profile.travelStyle.transportPreference, "rental car");

  assert.deepEqual(profile.activities.preferredActivities, ["hiking", "museums"]);
  assert.deepEqual(profile.activities.dislikedActivities, ["nightlife"]);
  assert.equal(profile.activities.activityIntensity, "moderate");

  assert.equal(profile.personality.travelerType, "explorer");
  assert.equal(profile.personality.noveltyVsComfort, 0.7);
  assert.equal(profile.personality.crowdTolerance, "low");

  assert.equal(profile.family.travelingWith, "partner + 2 kids");
  assert.equal(profile.family.kidsDetails, "ages 3 and 6");

  assert.equal(profile.constraints.budgetRange, "moderate");

  assert.deepEqual(profile.priorities.mustHaves, ["beach", "good food"]);
  assert.deepEqual(profile.priorities.avoidances, ["crowds"]);
});

test("POST /api/v1/profile/import/normalize with already camelCase format normalizes correctly", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const app = makeApp();

  const camelCaseProfile = {
    food: {
      cuisinesLiked: ["Italian"],
      dietaryRestrictions: [],
    },
    travelStyle: {
      pace: "fast",
      planningStyle: "structured",
    },
    activities: {
      preferredActivities: ["city tours"],
      dislikedActivities: [],
    },
    personality: {
      travelerType: "planner",
    },
    family: {
      travelingWith: "solo",
    },
    priorities: {
      mustHaves: ["museums"],
      avoidances: [],
    },
  };

  const res = await invokeRoute(
    app,
    "POST",
    "/api/v1/profile/import/normalize",
    { rawText: JSON.stringify(camelCaseProfile) },
  );

  assert.equal(res.statusCode, 200);
  const profile = res.body.normalizedProfile;
  assert.ok(profile, "normalizedProfile should be present");

  assert.deepEqual(profile.food.cuisinesLiked, ["Italian"]);
  assert.equal(profile.travelStyle.pace, "fast");
  assert.equal(profile.travelStyle.planningStyle, "structured");
  assert.deepEqual(profile.activities.preferredActivities, ["city tours"]);
  assert.equal(profile.personality.travelerType, "planner");
  assert.equal(profile.family.travelingWith, "solo");
  assert.deepEqual(profile.priorities.mustHaves, ["museums"]);
});

test("POST /api/v1/profile/import/normalize with missing sections fills defaults", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const app = makeApp();

  // Only provide food and travel_style — everything else should get defaults
  const partialProfile = {
    food_preferences: {
      cuisines_liked: ["Thai"],
    },
    travel_style: {
      pace: "moderate",
    },
  };

  const res = await invokeRoute(
    app,
    "POST",
    "/api/v1/profile/import/normalize",
    { rawText: JSON.stringify(partialProfile) },
  );

  assert.equal(res.statusCode, 200);
  const profile = res.body.normalizedProfile;
  assert.ok(profile, "normalizedProfile should be present");

  // Provided sections should have data
  assert.deepEqual(profile.food.cuisinesLiked, ["Thai"]);
  assert.equal(profile.travelStyle.pace, "moderate");

  // Missing sections should have defaults (empty arrays/strings)
  assert.deepEqual(profile.activities.preferredActivities, []);
  assert.deepEqual(profile.activities.dislikedActivities, []);
  assert.equal(profile.activities.activityIntensity, "unknown");

  assert.equal(profile.personality.travelerType, "");
  assert.equal(profile.personality.crowdTolerance, "unknown");

  assert.equal(profile.family.travelingWith, "");
  assert.equal(profile.family.kidsDetails, "");

  assert.equal(profile.constraints.budgetRange, "");
  assert.equal(profile.constraints.accessibilityNeeds, "");

  assert.deepEqual(profile.priorities.mustHaves, []);
  assert.deepEqual(profile.priorities.avoidances, []);

  // Each section should have meta with confidence and updatedAt
  assert.ok(profile.food.meta, "food.meta should be present");
  assert.ok(profile.food.meta.confidence, "food.meta.confidence should exist");
  assert.ok(profile.food.meta.updatedAt, "food.meta.updatedAt should exist");
});
