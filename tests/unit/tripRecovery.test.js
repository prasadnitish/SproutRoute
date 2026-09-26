import test from "node:test";
import assert from "node:assert/strict";
import { generateTripPlan, buildTripPlanPrompt } from "../../src/backend/services/tripPlanAI.js";

test('compact recovery preserves the requested seven-day coverage', () => {
  const prompt = buildTripPlanPrompt('Tokyo', '2026-10-10', '2026-10-16', [], [], { forecast: [] }, { compact: true });
  assert.match(prompt.system, /at least 28 activities total/);
  assert.match(prompt.system, /exactly 7 day objects/);
});

const trip = { destination: "Las Vegas, Nevada", startDate: "2026-10-10", endDate: "2026-10-11", activities: ["museums"], children: [{ age: 6 }] };
const valid = { overview: "Two days", suggestedActivities: Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, name: `Place ${i}`, duration: "1 hour" })),
  dailyItinerary: [0, 1].map(i => ({ day: `Day ${i + 1}`, activities: [0, 1, 2, 3].map(n => `a${i * 4 + n}`), meals: "Lunch and dinner" })), tips: [] };

for (const failure of ["invalid-json", "missing-day", "unknown-reference", "repeats"]) {
  test(`trip switches provider when the primary returns ${failure}`, async () => {
    const saved = { ...process.env };
    process.env.AI_PROVIDER_TRIP_PLAN = "gemini";
    process.env.OPENAI_API_KEY = "test-only";
    delete process.env.ANTHROPIC_API_KEY;
    let fallbackCalls = 0;
    let cap;
    const broken = structuredClone(valid);
    if (failure === "missing-day") broken.dailyItinerary.pop();
    if (failure === "unknown-reference") broken.dailyItinerary[0].activities = ["missing"];
    if (failure === "repeats") {
      broken.suggestedActivities = broken.suggestedActivities.slice(0, 4);
      broken.dailyItinerary[1].activities = [...broken.dailyItinerary[0].activities];
    }
    try {
      const result = await generateTripPlan(trip, { summary: "Mild", forecast: [] }, {
        geminiModel: { generateContent: async body => { cap = body.generationConfig.maxOutputTokens; return {
          response: { text: () => failure === "invalid-json" ? "broken" : JSON.stringify(broken), candidates: [{ finishReason: "STOP" }] },
        }; } },
        openaiClient: { chat: { completions: { create: async () => { fallbackCalls++; return {
          choices: [{ message: { content: JSON.stringify(valid) }, finish_reason: "stop" }],
        }; } } } },
      });
      assert.equal(result.dailyItinerary.length, 2);
      assert.equal(fallbackCalls, 1);
      assert.equal(cap, 12000);
    } finally {
      for (const key of ["AI_PROVIDER_TRIP_PLAN", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) {
        if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
      }
    }
  });
}
