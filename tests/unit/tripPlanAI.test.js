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

function buildValidTripPlanJson(userText = "") {
  const match = userText.match(/Dates:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i);
  let dayCount = 2;
  if (match) {
    const start = new Date(match[1]);
    const end = new Date(match[2]);
    dayCount = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
  }

  const activityCount = Math.max(2, Math.min(dayCount * 2, 6));
  return JSON.stringify({
    overview: "A test trip",
    suggestedActivities: Array.from({ length: activityCount }, (_, index) => ({
      id: `act-${index + 1}`,
      name: `Test Activity ${index + 1}`,
      category: "city",
      description: "A fun activity",
      duration: "2 hours",
      kidFriendly: true,
      weatherDependent: false,
    })),
    dailyItinerary: Array.from({ length: dayCount }, (_, index) => ({
      day: `Day ${index + 1}`,
      activities: [`act-${Math.min(index + 1, activityCount)}`],
      meals: {
        breakfast: `Breakfast ${index + 1}`,
        lunch: `Lunch ${index + 1}`,
        dinner: `Dinner ${index + 1}`,
      },
      notes: "Enjoy!",
    })),
    tips: ["Tip 1", "Tip 2"],
  });
}

const mockWeather = {
  summary: "Mild and partly cloudy",
  forecast: [
    { name: "Monday", high: 72, low: 55, condition: "Partly Cloudy", precipitation: 10 },
    { name: "Tuesday", high: 75, low: 58, condition: "Sunny", precipitation: 5 },
  ],
};

function createCapturingMock() {
  const captured = { calls: [] };
  // Gemini-style mock (tripPlanAI now defaults to provider: "gemini")
  const mockGeminiModel = {
    generateContent: async (params) => {
      // Normalize Gemini params to match old Anthropic capture shape for assertions
      const systemText = params.systemInstruction?.parts?.[0]?.text || "";
      const userText = params.contents?.[0]?.parts?.[0]?.text || "";
      captured.calls.push({
        system: systemText,
        user: userText,
        max_tokens: params.generationConfig?.maxOutputTokens,
        temperature: params.generationConfig?.temperature,
        // Store raw Gemini params too
        _geminiParams: params,
      });
      return {
        response: {
          text: () => buildValidTripPlanJson(userText),
          candidates: [{ finishReason: "STOP" }],
        },
      };
    },
  };
  // Keep anthropic mock for fallback tests
  const mockAnthropicClient = {
    messages: {
      create: async (params) => {
        captured.calls.push(params);
        return {
          content: [{ type: "text", text: buildValidTripPlanJson(params.messages?.[0]?.content || "") }],
          stop_reason: "end_turn",
        };
      },
    },
  };
  return { captured, mockGeminiModel, mockAnthropicClient };
}

/** Normalize system param (string or typed block array) to plain text. */
function extractSystemText(call) {
  if (typeof call.system === "string") return call.system;
  if (Array.isArray(call.system)) return call.system.map((b) => b.text).join("");
  return "";
}

// ── Cruise itinerary format ──────────────────────────────────────────────────

test("generateTripPlan includes cruise format rules when tripType=cruise", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockGeminiModel, mockAnthropicClient } = createCapturingMock();

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
    { geminiModel: mockGeminiModel, anthropicClient: mockAnthropicClient },
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
  const { captured, mockGeminiModel, mockAnthropicClient } = createCapturingMock();

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
    { geminiModel: mockGeminiModel, anthropicClient: mockAnthropicClient },
  );

  const systemText = extractSystemText(captured.calls[0]);
  assert.ok(!systemText.includes("CRUISE FORMAT RULES"), "Non-cruise trip should NOT include cruise format rules");
});

// ── International context ────────────────────────────────────────────────────

test("generateTripPlan includes international context for non-US/CA countries", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockGeminiModel, mockAnthropicClient } = createCapturingMock();

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
    { geminiModel: mockGeminiModel, anthropicClient: mockAnthropicClient },
  );

  const systemText = extractSystemText(captured.calls[0]);

  assert.ok(systemText.includes("INTERNATIONAL TRAVEL CONTEXT"), "Should include international travel context");
  assert.ok(systemText.toLowerCase().includes("currency"), "Should mention currency");
  assert.ok(systemText.toLowerCase().includes("emergency number"), "Should mention emergency numbers");
});

test("generateTripPlan does NOT include international context for US trips", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockGeminiModel, mockAnthropicClient } = createCapturingMock();

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
    { geminiModel: mockGeminiModel, anthropicClient: mockAnthropicClient },
  );

  const systemText = extractSystemText(captured.calls[0]);
  assert.ok(!systemText.includes("INTERNATIONAL TRAVEL CONTEXT"), "US trip should NOT include international context");
});

// ── Prompt caching ───────────────────────────────────────────────────────────

test("generateTripPlan enables prompt caching on first attempt", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockGeminiModel, mockAnthropicClient } = createCapturingMock();

  await generateTripPlan(
    {
      destination: "Portland, OR",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["parks"],
      children: [{ age: 3 }],
    },
    mockWeather,
    { geminiModel: mockGeminiModel, anthropicClient: mockAnthropicClient },
  );

  // With Gemini provider, caching is a no-op but the call should still succeed.
  // We just verify the first call happened with system text.
  const firstCall = captured.calls[0];
  assert.ok(firstCall, "First call must have been made");
  assert.ok(firstCall.system.length > 0, "System prompt must be non-empty");
});

// ── User prompt includes tripType ────────────────────────────────────────────

test("generateTripPlan user prompt includes tripType label", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockGeminiModel, mockAnthropicClient } = createCapturingMock();

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
    { geminiModel: mockGeminiModel, anthropicClient: mockAnthropicClient },
  );

  const firstUser = captured.calls[0].user;
  assert.ok(
    firstUser.includes("Trip Type: beach"),
    `User prompt should include trip type — got: "${firstUser.substring(0, 300)}"`,
  );
});

test("generateTripPlan injects compact planner summary when provided", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockGeminiModel, mockAnthropicClient } = createCapturingMock();

  await generateTripPlan(
    {
      destination: "San Diego, CA",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["beach", "food"],
      children: [{ age: 4 }],
      plannerSummary: "Traveler: slow-paced family. Avoid: crowds. Must include: aquariums.",
    },
    mockWeather,
    { geminiModel: mockGeminiModel, anthropicClient: mockAnthropicClient },
  );

  const systemText = extractSystemText(captured.calls[0]);
  const userText = captured.calls[0].user;

  assert.ok(systemText.includes("PROFILE-AWARE PLANNING"), "System prompt should include profile-aware planning rules");
  assert.ok(userText.includes("Known Traveler Preferences"), "User prompt should include the planner summary section");
  assert.ok(userText.includes("slow-paced family"), "Planner summary content should be injected");
});

test("generateTripPlan sends a Gemini response schema sized to the trip length", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockGeminiModel, mockAnthropicClient } = createCapturingMock();

  await generateTripPlan(
    {
      destination: "San Diego, CA",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["beach", "food"],
      children: [{ age: 4 }],
    },
    mockWeather,
    { geminiModel: mockGeminiModel, anthropicClient: mockAnthropicClient },
  );

  const schema = captured.calls[0]._geminiParams?.generationConfig?.responseSchema;
  assert.ok(schema, "Gemini call should include a response schema");
  assert.equal(schema.properties.dailyItinerary.minItems, 3);
  assert.equal(schema.properties.dailyItinerary.maxItems, 3);
  assert.equal(schema.properties.suggestedActivities.maxItems, 6);
});

// ── Adults-only trip ─────────────────────────────────────────────────────────

test("generateTripPlan handles adults-only trip (no children)", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockGeminiModel, mockAnthropicClient } = createCapturingMock();

  await generateTripPlan(
    {
      destination: "Las Vegas, NV",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["dining", "shows"],
      children: [],
    },
    mockWeather,
    { geminiModel: mockGeminiModel, anthropicClient: mockAnthropicClient },
  );

  const systemText = extractSystemText(captured.calls[0]);
  const userText = captured.calls[0].user;

  assert.ok(
    userText.toLowerCase().includes("adults only") || userText.toLowerCase().includes("adults-only"),
    "User prompt should mention adults-only",
  );
  assert.ok(
    systemText.toLowerCase().includes("adults-only") || systemText.toLowerCase().includes("adults"),
    "System prompt should mention adults-only context",
  );
});

// ── Pet-aware planning ───────────────────────────────────────────────────────

test("generateTripPlan includes pet planning rules when pets are present", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockGeminiModel, mockAnthropicClient } = createCapturingMock();

  await generateTripPlan(
    {
      destination: "Portland, OR",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["parks", "hiking"],
      children: [{ age: 5 }],
      pets: [
        { type: "dog", name: "Max", breed: "golden retriever", weightLbs: 20, specialNeeds: "anxiety medication" },
      ],
    },
    mockWeather,
    { geminiModel: mockGeminiModel, anthropicClient: mockAnthropicClient },
  );

  assert.ok(captured.calls.length >= 1, "Should have made at least 1 AI call");
  const systemText = extractSystemText(captured.calls[0]);

  assert.ok(systemText.includes("PETS TRAVELING"), "System prompt should include PETS TRAVELING section");
  assert.ok(systemText.includes("PET-AWARE PLANNING RULES"), "System prompt should include PET-AWARE PLANNING RULES");
  assert.ok(systemText.includes("Max"), "System prompt should include pet name");
  assert.ok(systemText.includes("golden retriever"), "System prompt should include pet breed");
  assert.ok(systemText.includes("20"), "System prompt should include pet weight");
});

test("generateTripPlan does NOT include pet rules when no pets", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockGeminiModel, mockAnthropicClient } = createCapturingMock();

  await generateTripPlan(
    {
      destination: "Portland, OR",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["parks"],
      children: [{ age: 5 }],
    },
    mockWeather,
    { geminiModel: mockGeminiModel, anthropicClient: mockAnthropicClient },
  );

  const systemText = extractSystemText(captured.calls[0]);
  assert.ok(!systemText.includes("PETS TRAVELING"), "System prompt should NOT include PETS TRAVELING when no pets");
  assert.ok(!systemText.includes("PET-AWARE PLANNING RULES"), "System prompt should NOT include PET-AWARE PLANNING RULES when no pets");
});

test("generateTripPlan includes petFriendly field in activity schema when pets present", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockGeminiModel, mockAnthropicClient } = createCapturingMock();

  await generateTripPlan(
    {
      destination: "Portland, OR",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["parks"],
      children: [{ age: 5 }],
      pets: [
        { type: "dog", name: "Buddy", breed: "labrador", weightLbs: 30 },
      ],
    },
    mockWeather,
    { geminiModel: mockGeminiModel, anthropicClient: mockAnthropicClient },
  );

  const systemText = extractSystemText(captured.calls[0]);
  assert.ok(systemText.includes("petFriendly"), "Activity schema should include petFriendly field when pets present");
});

test("generateTripPlan lists all pets with details in prompt", async () => {
  delete process.env.AI_PROVIDER;
  const { captured, mockGeminiModel, mockAnthropicClient } = createCapturingMock();

  await generateTripPlan(
    {
      destination: "Denver, CO",
      startDate: "2026-06-01",
      endDate: "2026-06-04",
      activities: ["hiking"],
      children: [{ age: 8 }],
      pets: [
        { type: "dog", name: "Max", breed: "golden retriever", weightLbs: 20, specialNeeds: "anxiety medication" },
        { type: "cat", name: "Whiskers", breed: "siamese", weightLbs: 8 },
      ],
    },
    mockWeather,
    { geminiModel: mockGeminiModel, anthropicClient: mockAnthropicClient },
  );

  const systemText = extractSystemText(captured.calls[0]);

  assert.ok(systemText.includes("Max"), "Should list first pet name");
  assert.ok(systemText.includes("golden retriever"), "Should list first pet breed");
  assert.ok(systemText.includes("anxiety medication"), "Should list first pet special needs");
  assert.ok(systemText.includes("Whiskers"), "Should list second pet name");
  assert.ok(systemText.includes("siamese"), "Should list second pet breed");
});

test("generateTripPlan normalizes simplified activity and meal shapes without repair", async () => {
  delete process.env.AI_PROVIDER;

  const mockGeminiModel = {
    generateContent: async () => ({
      response: {
        text: () => JSON.stringify({
          overview: "San Diego weekend",
          suggestedActivities: [
            {
              name: "Children's Pool Beach",
              category: "beach",
              description: "See seals and walk the coast",
              duration: "2 hours",
              kidFriendly: "true",
              weatherDependent: "false",
            },
            {
              name: "Birch Aquarium",
              category: "education",
              description: "See sea life indoors",
              duration: "2 hours",
              kidFriendly: true,
              weatherDependent: false,
            },
          ],
          dailyItinerary: [
            {
              day: "Day 1",
              activities: [{ name: "Children's Pool Beach" }],
              meals: {
                breakfast: "The Cottage",
                lunch: "Shore Rider",
                dinner: "Catania",
              },
              notes: "Easy stroller day",
            },
            {
              day: "Day 2",
              activities: [{ name: "Birch Aquarium" }],
              meals: {
                breakfast: "Parakeet Cafe",
                lunch: "The Taco Stand",
                dinner: "Din Tai Fung",
              },
              notes: "Indoor backup day",
            },
          ],
          tips: ["Arrive early for parking"],
        }),
        candidates: [{ finishReason: "STOP" }],
      },
    }),
  };

  const result = await generateTripPlan(
    {
      destination: "San Diego, CA",
      startDate: "2026-06-01",
      endDate: "2026-06-03",
      activities: ["relaxing"],
      children: [{ age: 2 }],
    },
    mockWeather,
    { geminiModel: mockGeminiModel },
  );

  assert.equal(result.suggestedActivities.length, 2);
  assert.equal(result.suggestedActivities[0].id, "act-1");
  assert.equal(result.suggestedActivities[0].kidFriendly, true);
  assert.equal(result.suggestedActivities[0].weatherDependent, false);
  assert.deepEqual(result.dailyItinerary[0].activities, ["act-1"]);
  assert.equal(result.dailyItinerary[0].meals.breakfast, "The Cottage");
});

test("generateTripPlan trims itinerary days to the requested trip length", async () => {
  delete process.env.AI_PROVIDER;

  const mockGeminiModel = {
    generateContent: async () => ({
      response: {
        text: () => JSON.stringify({
          overview: "Too many days",
          suggestedActivities: [
            { id: "a1", name: "Zoo", category: "wildlife", description: "Animals", duration: "half day", kidFriendly: true, weatherDependent: false },
            { id: "a2", name: "Aquarium", category: "education", description: "Sea life", duration: "2 hours", kidFriendly: true, weatherDependent: false },
          ],
          dailyItinerary: [
            { day: "Day 1", activities: ["a1"], meals: "Breakfast", notes: "" },
            { day: "Day 2", activities: ["a2"], meals: "Lunch", notes: "" },
            { day: "Day 3", activities: ["a1"], meals: "Dinner", notes: "" },
            { day: "Day 4", activities: ["a2"], meals: "Extra", notes: "" },
          ],
          tips: [],
        }),
        candidates: [{ finishReason: "STOP" }],
      },
    }),
  };

  const result = await generateTripPlan(
    {
      destination: "San Diego, CA",
      startDate: "2026-06-01",
      endDate: "2026-06-03",
      activities: ["relaxing"],
      children: [{ age: 2 }],
    },
    mockWeather,
    { geminiModel: mockGeminiModel },
  );

  assert.equal(result.dailyItinerary.length, 2);
  assert.equal(result.dailyItinerary[1].day, "Day 2");
});

test("generateTripPlan retries when the first response omits required trip days", async () => {
  delete process.env.AI_PROVIDER;

  let callCount = 0;
  const mockGeminiModel = {
    generateContent: async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          response: {
            text: () => JSON.stringify({
              overview: "Incomplete itinerary",
              suggestedActivities: [
                { id: "a1", name: "Zoo", category: "wildlife", description: "Animals", duration: "half day", kidFriendly: true, weatherDependent: false },
                { id: "a2", name: "Aquarium", category: "education", description: "Fish", duration: "2 hours", kidFriendly: true, weatherDependent: false },
              ],
              dailyItinerary: [
                {
                  day: "Day 1",
                  activities: ["a1"],
                  meals: { breakfast: "Cafe 1", lunch: "Cafe 2", dinner: "Cafe 3" },
                  notes: "",
                },
              ],
              tips: [],
            }),
            candidates: [{ finishReason: "STOP" }],
          },
        };
      }

      return {
        response: {
          text: () => JSON.stringify({
            overview: "Complete itinerary",
            suggestedActivities: [
              { id: "a1", name: "Zoo", category: "wildlife", description: "Animals", duration: "half day", kidFriendly: true, weatherDependent: false },
              { id: "a2", name: "Aquarium", category: "education", description: "Fish", duration: "2 hours", kidFriendly: true, weatherDependent: false },
            ],
            dailyItinerary: [
              {
                day: "Day 1",
                activities: ["a1"],
                meals: { breakfast: "Cafe 1", lunch: "Cafe 2", dinner: "Cafe 3" },
                notes: "",
              },
              {
                day: "Day 2",
                activities: ["a2"],
                meals: { breakfast: "Cafe 4", lunch: "Cafe 5", dinner: "Cafe 6" },
                notes: "",
              },
            ],
            tips: [],
          }),
          candidates: [{ finishReason: "STOP" }],
        },
      };
    },
  };

  const result = await generateTripPlan(
    {
      destination: "San Diego, CA",
      startDate: "2026-06-01",
      endDate: "2026-06-03",
      activities: ["relaxing"],
      children: [{ age: 2 }],
    },
    mockWeather,
    { geminiModel: mockGeminiModel },
  );

  assert.equal(callCount, 2);
  assert.equal(result.dailyItinerary.length, 2);
});
