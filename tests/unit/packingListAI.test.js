/**
 * packingListAI.js tests — Phase 6C/D: cruise items, age guards, RAG injection, prompt caching
 *
 * Tests verify that generatePackingList produces correct prompt content for:
 *   - Cruise-specific packing category and items
 *   - Age-appropriate guardrails (no diapers for older kids)
 *   - RAG template injection into user prompt
 *   - Prompt caching enabled on first attempt
 *
 * Pattern: inject mock Anthropic client via deps to capture prompts and return valid JSON.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { generatePackingList } from "../../src/backend/services/packingListAI.js";

const ORIGINAL_AI_PROVIDER = process.env.AI_PROVIDER;

test.afterEach(() => {
  if (ORIGINAL_AI_PROVIDER !== undefined) {
    process.env.AI_PROVIDER = ORIGINAL_AI_PROVIDER;
  } else {
    delete process.env.AI_PROVIDER;
  }
});

// Valid packing list JSON that parseResponse accepts
const VALID_PACKING_JSON = JSON.stringify({
  categories: [
    {
      name: "Clothing",
      items: [
        { name: "T-shirts", quantity: "3-4", reason: "Warm weather" },
        { name: "Shorts", quantity: "2", reason: "Beach activities" },
      ],
    },
    {
      name: "Toiletries",
      items: [
        { name: "Sunscreen", quantity: "1", reason: "UV protection" },
      ],
    },
  ],
});

const mockWeather = {
  summary: "Warm and sunny with occasional afternoon showers",
  forecast: [
    { name: "Monday", high: 85, low: 72, condition: "Partly Cloudy", precipitation: 40 },
    { name: "Tuesday", high: 88, low: 75, condition: "Sunny", precipitation: 20 },
    { name: "Wednesday", high: 90, low: 76, condition: "Thunderstorms", precipitation: 70 },
  ],
};

function createCapturingMock() {
  const captured = { calls: [] };
  const mockAnthropicClient = {
    messages: {
      create: async (params) => {
        captured.calls.push(params);
        return {
          content: [{ type: "text", text: VALID_PACKING_JSON }],
          stop_reason: "end_turn",
        };
      },
    },
  };
  return { captured, mockAnthropicClient };
}

function extractSystemText(call) {
  return typeof call.system === "string"
    ? call.system
    : call.system.map((b) => b.text).join("");
}

// ── Cruise-specific items ────────────────────────────────────────────────────

test("generatePackingList includes cruise essentials category for tripType=cruise", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  await generatePackingList(
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

  const systemText = extractSystemText(captured.calls[0]);

  assert.ok(
    systemText.includes("Cruise Essentials"),
    "System prompt should include 'Cruise Essentials' category",
  );
  assert.ok(
    systemText.toLowerCase().includes("lanyard"),
    "Should mention lanyard/card holder",
  );
  assert.ok(
    systemText.toLowerCase().includes("motion sickness"),
    "Should mention motion sickness bands/medication",
  );
  assert.ok(
    systemText.toLowerCase().includes("power strip"),
    "Should mention power strip",
  );
  assert.ok(
    systemText.toLowerCase().includes("formal") || systemText.toLowerCase().includes("dinner attire"),
    "Should mention formal/dinner attire",
  );
});

test("generatePackingList does NOT include cruise category for non-cruise trip", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  await generatePackingList(
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

  assert.ok(
    !systemText.includes("CRUISE-SPECIFIC ITEMS"),
    "Non-cruise trip should NOT include cruise-specific items section",
  );
});

// ── Age-appropriate guardrails ───────────────────────────────────────────────

test("generatePackingList includes 'DO NOT include diapers' for older children", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  await generatePackingList(
    {
      destination: "Seattle, WA",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["parks"],
      children: [{ age: 5 }],
    },
    mockWeather,
    { anthropicClient: mockAnthropicClient },
  );

  const systemText = extractSystemText(captured.calls[0]);

  assert.ok(
    systemText.includes("DO NOT include diapers"),
    "Should explicitly exclude diapers for 5-year-old",
  );
  assert.ok(
    systemText.includes("DO NOT include") && systemText.toLowerCase().includes("bottle"),
    "Should explicitly exclude bottles for 5-year-old",
  );
  assert.ok(
    systemText.includes("DO NOT include") && systemText.toLowerCase().includes("pacifier"),
    "Should explicitly exclude pacifiers for 5-year-old",
  );
});

test("generatePackingList allows diapers for toddler-age children", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  await generatePackingList(
    {
      destination: "Seattle, WA",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["parks"],
      children: [{ age: 2 }],
    },
    mockWeather,
    { anthropicClient: mockAnthropicClient },
  );

  const systemText = extractSystemText(captured.calls[0]);

  // For a 2-year-old, diapers should NOT be excluded
  assert.ok(
    !systemText.includes("DO NOT include diapers"),
    "Should NOT exclude diapers for a 2-year-old",
  );
});

test("generatePackingList includes Baby/Toddler Items category for young children", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  await generatePackingList(
    {
      destination: "Orlando, FL",
      startDate: "2026-06-01",
      endDate: "2026-06-05",
      activities: ["theme parks"],
      children: [{ age: 1 }],
    },
    mockWeather,
    { anthropicClient: mockAnthropicClient },
  );

  const systemText = extractSystemText(captured.calls[0]);

  assert.ok(
    systemText.includes("Baby/Toddler Items"),
    "Should include Baby/Toddler Items category for young children",
  );
});

// ── RAG template injection ───────────────────────────────────────────────────

test("generatePackingList injects RAG base template into user prompt", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  await generatePackingList(
    {
      destination: "Miami Beach, FL",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["swimming", "snorkeling"],
      children: [{ age: 5 }],
      tripType: "beach",
    },
    mockWeather,
    { anthropicClient: mockAnthropicClient },
  );

  const userText = captured.calls[0].messages[0].content;

  assert.ok(
    userText.includes("Base Packing Reference"),
    "User prompt should include RAG base template section",
  );
  assert.ok(
    userText.includes("climate"),
    "RAG section should mention climate zone",
  );
});

test("generatePackingList RAG template matches detected climate zone", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  // Tropical weather: avgHigh >= 82 && avgRain >= 40
  const tropicalWeather = {
    summary: "Hot and rainy",
    forecast: [
      { name: "Mon", high: 90, low: 78, condition: "Rain", precipitation: 60 },
      { name: "Tue", high: 88, low: 76, condition: "Showers", precipitation: 50 },
    ],
  };

  await generatePackingList(
    {
      destination: "Cancun, Mexico",
      startDate: "2026-06-01",
      endDate: "2026-06-05",
      activities: ["beach"],
      children: [{ age: 6 }],
      tripType: "beach",
    },
    tropicalWeather,
    { anthropicClient: mockAnthropicClient },
  );

  const userText = captured.calls[0].messages[0].content;

  assert.ok(
    userText.includes("tropical"),
    "RAG section should detect tropical climate from hot+rainy forecast",
  );
});

test("generatePackingList user prompt includes tripType", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  await generatePackingList(
    {
      destination: "Denver, CO",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["hiking"],
      children: [{ age: 8 }],
      tripType: "adventure",
    },
    mockWeather,
    { anthropicClient: mockAnthropicClient },
  );

  const userText = captured.calls[0].messages[0].content;

  assert.ok(
    userText.includes("Trip Type: adventure"),
    `User prompt should include trip type — got: "${userText.substring(0, 400)}"`,
  );
});

// ── Prompt caching ───────────────────────────────────────────────────────────

test("generatePackingList enables prompt caching on first attempt", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockAnthropicClient } = createCapturingMock();

  await generatePackingList(
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
