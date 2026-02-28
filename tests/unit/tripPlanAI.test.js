/**
 * tripPlanAI.js tests — Phase 6C/D: cruise format, intl context, prompt caching
 *
 * Tests verify that generateTripPlan produces correct prompt content for:
 *   - Cruise itinerary format (embarkation, sea days, port days)
 *   - International context (currency, language, emergency numbers)
 *   - Prompt caching enabled on first attempt
 *   - Adults-only trip handling
 *
 * Pattern: inject mock Anthropic client via deps to capture prompts and return valid JSON.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { generateTripPlan } from "../../src/backend/services/tripPlanAI.js";

const ORIGINAL_AI_PROVIDER = process.env.AI_PROVIDER;

test.afterEach(() => {
  if (ORIGINAL_AI_PROVIDER !== undefined) {
    process.env.AI_PROVIDER = ORIGINAL_AI_PROVIDER;
  } else {
    delete process.env.AI_PROVIDER;
  }
});

// Valid trip plan JSON that parseResponse accepts
const VALID_TRIP_PLAN_JSON = JSON.stringify({
  overview: "A test trip",
  suggestedActivities: [
    {
      id: "act-1",
      name: "Test Activity",
      category: "city",
      description: "A fun activity",
      duration: "2 hours",
      kidFriendly: true,
      weatherDependent: false,
      bestDays: ["Monday"],
      reason: "Great for families",
    },
  ],
  dailyItinerary: [
    {
      day: "Day 1",
      activities: ["act-1"],
      meals: "Local restaurant",
      notes: "Enjoy!",
    },
  ],
  tips: ["Tip 1"],
});

const mockWeather = {
  summary: "Mild and partly cloudy",
  forecast: [
    { name: "Monday", high: 72, low: 55, condition: "Partly Cloudy", precipitation: 10 },
    { name: "Tuesday", high: 75, low: 58, condition: "Sunny", precipitation: 5 },
  ],
};

function createCapturingMock() {
  const captured = { calls: [] };
  const mockAnthropicClient = {
    messages: {
      create: async (params) => {
        captured.calls.push(params);
        return {
          content: [{ type: "text", text: VALID_TRIP_PLAN_JSON }],
          stop_reason: "end_turn",
        };
      },
    },
  };
  return { captured, mockAnthropicClient };
}

/** Normalize system param (string or typed block array) to plain text. */
function extractSystemText(call) {
  return typeof call.system === "string"
    ? call.system
    : call.system.map((b) => b.text).join("");
}

// ── Cruise itinerary format ──────────────────────────────────────────────────

test("generateTripPlan includes cruise format rules when tripType=cruise", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  await generateTripPlan(
    {
      destination: "Miami, FL",
      startDate: "2026-06-01",
      endDate: "2026-06-08",
      activities: ["swimming", "dining"],
      children: [{ age: 5 }],
      tripType: "cruise",
    },
    mockWeather,
    { anthropicClient: mockAnthropicClient },
  );

  assert.ok(captured.calls.length >= 1, "Should have made at least 1 AI call");
  const systemText = extractSystemText(captured.calls[0]);

  assert.ok(systemText.includes("CRUISE FORMAT RULES"), "System prompt should include cruise format rules");
  assert.ok(systemText.toLowerCase().includes("embarkation"), "Should mention embarkation day");
  assert.ok(systemText.toLowerCase().includes("sea day"), "Should mention sea days");
  assert.ok(systemText.toLowerCase().includes("disembarkation"), "Should mention disembarkation");
  assert.ok(systemText.includes("shore_excursion"), "Should include shore_excursion category");
});

test("generateTripPlan does NOT include cruise rules for non-cruise tripType", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  await generateTripPlan(
    {
      destination: "Seattle, WA",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["hiking"],
      children: [{ age: 5 }],
      tripType: "adventure",
    },
    mockWeather,
    { anthropicClient: mockAnthropicClient },
  );

  const systemText = extractSystemText(captured.calls[0]);
  assert.ok(!systemText.includes("CRUISE FORMAT RULES"), "Non-cruise trip should NOT include cruise format rules");
});

// ── International context ────────────────────────────────────────────────────

test("generateTripPlan includes international context for non-US/CA countries", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  await generateTripPlan(
    {
      destination: "Tokyo, Japan",
      startDate: "2026-06-01",
      endDate: "2026-06-05",
      activities: ["cultural", "food"],
      children: [{ age: 7 }],
      tripType: "international",
      countryCode: "JP",
    },
    mockWeather,
    { anthropicClient: mockAnthropicClient },
  );

  const systemText = extractSystemText(captured.calls[0]);

  assert.ok(systemText.includes("INTERNATIONAL TRAVEL CONTEXT"), "Should include international travel context");
  assert.ok(systemText.toLowerCase().includes("currency"), "Should mention currency");
  assert.ok(systemText.toLowerCase().includes("emergency number"), "Should mention emergency numbers");
});

test("generateTripPlan does NOT include international context for US trips", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  await generateTripPlan(
    {
      destination: "Seattle, WA",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["parks"],
      children: [{ age: 5 }],
      countryCode: "US",
    },
    mockWeather,
    { anthropicClient: mockAnthropicClient },
  );

  const systemText = extractSystemText(captured.calls[0]);
  assert.ok(!systemText.includes("INTERNATIONAL TRAVEL CONTEXT"), "US trip should NOT include international context");
});

// ── Prompt caching ───────────────────────────────────────────────────────────

test("generateTripPlan enables prompt caching on first attempt", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  await generateTripPlan(
    {
      destination: "Portland, OR",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["parks"],
      children: [{ age: 3 }],
    },
    mockWeather,
    { anthropicClient: mockAnthropicClient },
  );

  // First call should have system as typed block array (caching enabled)
  const firstCall = captured.calls[0];
  assert.ok(
    Array.isArray(firstCall.system),
    "First attempt should use cached system prompt (typed block array)",
  );
  assert.deepEqual(
    firstCall.system[0].cache_control,
    { type: "ephemeral" },
    "First attempt should have cache_control: { type: 'ephemeral' }",
  );
});

// ── User prompt includes tripType ────────────────────────────────────────────

test("generateTripPlan user prompt includes tripType label", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  await generateTripPlan(
    {
      destination: "Cancun, Mexico",
      startDate: "2026-06-01",
      endDate: "2026-06-05",
      activities: ["beach", "snorkeling"],
      children: [{ age: 4 }],
      tripType: "beach",
    },
    mockWeather,
    { anthropicClient: mockAnthropicClient },
  );

  const firstUser = captured.calls[0].messages[0].content;
  assert.ok(
    firstUser.includes("Trip Type: beach"),
    `User prompt should include trip type — got: "${firstUser.substring(0, 300)}"`,
  );
});

// ── Adults-only trip ─────────────────────────────────────────────────────────

test("generateTripPlan handles adults-only trip (no children)", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  await generateTripPlan(
    {
      destination: "Las Vegas, NV",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["dining", "shows"],
      children: [],
    },
    mockWeather,
    { anthropicClient: mockAnthropicClient },
  );

  const systemText = extractSystemText(captured.calls[0]);
  const userText = captured.calls[0].messages[0].content;

  assert.ok(
    userText.toLowerCase().includes("adults only") || userText.toLowerCase().includes("adults-only"),
    "User prompt should mention adults-only",
  );
  assert.ok(
    systemText.toLowerCase().includes("adults-only") || systemText.toLowerCase().includes("adults"),
    "System prompt should mention adults-only context",
  );
});
