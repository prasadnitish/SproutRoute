import test from "node:test";
import assert from "node:assert/strict";
import { buildTripPlanPrompt, generateTripPlan } from "../../src/backend/services/tripPlanAI.js";

const NOW = Date.now();
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

const SEATTLE_NAMES = [
  "Seattle Aquarium", "Pike Place Market", "Woodland Park Zoo", "Space Needle", "Chihuly Garden and Glass",
  "Museum of Pop Culture", "Kerry Park", "Seattle Center", "Pacific Science Center", "Discovery Park",
];

const candidates = SEATTLE_NAMES.map((name, i) => ({
  id: `c${i}`, canonical_name: name, category: i % 2 ? "landmark" : "wildlife", city_display_name: "Seattle, Washington",
  google_place_id: `place-${i}`, lat: 47.6, lon: -122.3, status: "active", rating: 4.6, rating_count: 10000 - i,
  price_level: i === 1 ? 2 : null, photo_ref: `places/place-${i}/photos/p`, duration_bucket: "1_2h", verification_status: "verified",
  opening_hours: i === 0 ? { weekdayDescriptions: ["Monday: Closed", "Tuesday: 9:00 AM – 5:00 PM", "Wednesday: 9:00 AM – 5:00 PM", "Thursday: 9:00 AM – 5:00 PM", "Friday: 9:00 AM – 5:00 PM", "Saturday: 9:00 AM – 5:00 PM", "Sunday: 9:00 AM – 5:00 PM"] } : null,
  family_fit_json: i === 2 ? { typicalDurationMinutes: 180 } : null,
  trend_score: i === 3 ? 40 : 0, trend_updated_at: i === 3 ? daysAgo(2) : null,
}));

const prompt = () => buildTripPlanPrompt("Seattle, WA", "2026-06-01", "2026-06-02", ["parks"], [{ age: 5 }], { summary: "", forecast: [] }, { cachedAttractions: candidates });
const promptText = () => { const p = prompt(); return `${p.system}\n${p.user}`; };

test("the shortlist shows rating, price, hours, duration and trending so the model can plan around them", () => {
  const text = promptText();
  assert.match(text, /Seattle Aquarium[^\n]*rating: 4\.6/);
  assert.match(text, /Pike Place Market[^\n]*price: \$\$/);
  assert.match(text, /Seattle Aquarium[^\n]*hours: [^\n]*closed Mon/);
  assert.match(text, /Woodland Park Zoo[^\n]*~180 min/);
  assert.match(text, /Space Needle[^\n]*trending/);
  assert.doesNotMatch(text, /Pike Place Market[^\n]*trending/);
});

test("the prompt forbids invented venues and sets the duration, dining and timing rules", () => {
  const text = promptText();
  assert.match(text, /Never invent a venue/i);
  assert.doesNotMatch(text, /at most 1 new discovery per day/i);
  assert.match(text, /45 minutes to 3 hours/i);
  assert.match(text, /fine dining[^\n]*under 8/i);
  assert.match(text, /timing tip[^\n]*must agree with the time you scheduled/i);
  assert.match(text, /not schedule a place on a day it is closed/i);
});

test("without a shortlist the prompt keeps its old behaviour", () => {
  const p = buildTripPlanPrompt("Nowhere, ZZ", "2026-06-01", "2026-06-02", [], [{ age: 5 }], { summary: "", forecast: [] }, {});
  assert.doesNotMatch(`${p.system}\n${p.user}`, /Never invent a venue/i);
});

function planWith(names) {
  const activity = (name, i) => ({ id: `act-${i}`, name, category: "city", description: "A stop", duration: "2 hours", kidFriendly: true, weatherDependent: false, bestDays: ["Monday"], reason: "Good for kids" });
  const perDay = Math.ceil(names.length / 2);
  return JSON.stringify({
    overview: "Seattle with kids",
    suggestedActivities: names.map(activity),
    dailyItinerary: [0, 1].map((d) => ({ day: `Day ${d + 1}`, activities: names.map((_, i) => `act-${i}`).slice(d * perDay, (d + 1) * perDay), meals: "Dinner", notes: "" })),
    tips: ["Bring layers"],
  });
}

function mocks(text) {
  return {
    geminiModel: { generateContent: async () => ({ response: { text: () => text, candidates: [{ finishReason: "STOP" }] } }) },
    anthropicClient: { messages: { create: async () => ({ content: [{ type: "text", text }], stop_reason: "end_turn" }) } },
    openaiClient: { chat: { completions: { create: async () => ({ choices: [{ message: { content: text }, finish_reason: "stop" }] }) } } },
  };
}

test("a generated Seattle plan is at least 80% database-sourced, and each stop carries rating, photo and trending", async () => {
  delete process.env.AI_PROVIDER;
  const names = [...SEATTLE_NAMES.slice(0, 9), "Secret Rooftop Cocktail Lounge"];
  const plan = await generateTripPlan(
    { destination: "Seattle, WA", startDate: "2026-06-01", endDate: "2026-06-02", activities: ["parks"], children: [{ age: 5 }], cachedAttractions: candidates },
    { summary: "", forecast: [] },
    mocks(planWith(names)),
  );
  assert.ok(plan.grounding.ratio >= 0.8, `ratio was ${plan.grounding.ratio}`);
  assert.equal(plan.grounding.total, 10);
  const needle = plan.suggestedActivities.find((a) => a.name === "Space Needle");
  assert.equal(needle.grounded, true);
  assert.equal(needle.trending, true);
  assert.equal(needle.rating, 4.6);
  assert.match(needle.photoUrl, /^\/api\/v1\/places\/photo\?ref=/);
  assert.equal(plan.suggestedActivities.find((a) => a.name === "Secret Rooftop Cocktail Lounge").grounded, false);
});

test("a plan for a city with no shortlist is returned as before, without grounding fields", async () => {
  delete process.env.AI_PROVIDER;
  const plan = await generateTripPlan(
    { destination: "Nowhere, ZZ", startDate: "2026-06-01", endDate: "2026-06-02", activities: [], children: [{ age: 5 }] },
    { summary: "", forecast: [] },
    mocks(planWith(["A", "B", "C", "D", "E", "F", "G", "H"].map((n) => `${n} Park`))),
  );
  assert.equal(plan.grounding, undefined);
  assert.equal(plan.suggestedActivities[0].grounded, undefined);
});

test("a generated plan is corrected against opening hours: a stop planned past closing is moved earlier and a closed-day stop is swapped", async () => {
  delete process.env.AI_PROVIDER;
  const week = (monday, rest) => ({ weekdayDescriptions: [`Monday: ${monday}`, ...["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => `${d}: ${rest}`)] });
  const shortlist = candidates.map((c) => ({ ...c }));
  shortlist[0].opening_hours = week("10:00 AM – 5:00 PM", "10:00 AM – 5:00 PM");   // Seattle Aquarium
  shortlist[8].opening_hours = week("Closed", "10:00 AM – 5:00 PM");              // Pacific Science Center, closed Mondays
  shortlist[9].opening_hours = week("9:00 AM – 6:00 PM", "9:00 AM – 6:00 PM");    // Discovery Park, unused spare
  const names = ["Seattle Aquarium", "Pike Place Market", "Woodland Park Zoo", "Space Needle", "Chihuly Garden and Glass", "Museum of Pop Culture", "Kerry Park", "Seattle Center", "Pacific Science Center", "Kerry Park 2"];
  const activity = (name, i) => ({ id: `act-${i}`, name, category: "city", description: "A stop", duration: "2 hours", timingTip: name === "Seattle Aquarium" ? "Arrive around 4:45 PM." : "Arrive around 11:00 AM.", kidFriendly: true, weatherDependent: false, bestDays: ["Monday"], reason: "Good for kids" });
  const text = JSON.stringify({
    overview: "x", suggestedActivities: names.slice(0, 9).map(activity),
    // Day 1 is Monday 2026-06-01, when Pacific Science Center is closed; day 2 is Tuesday.
    dailyItinerary: [["act-8", "act-0", "act-1", "act-2", "act-3"], ["act-4", "act-5", "act-6", "act-7"]].map((ids, d) => ({ day: `Day ${d + 1}`, activities: ids, meals: "Dinner", notes: "" })),
    tips: ["t"],
  });
  const plan = await generateTripPlan(
    { destination: "Seattle, WA", startDate: "2026-06-01", endDate: "2026-06-02", activities: [], children: [{ age: 5 }], cachedAttractions: shortlist },
    { summary: "", forecast: [] }, mocks(text),
  );
  const aquarium = plan.suggestedActivities.find((a) => a.name === "Seattle Aquarium");
  assert.match(aquarium.timingTip, /^Arrive around 3:00 PM\.?$/);
  assert.ok(!plan.suggestedActivities.some((a) => a.name === "Pacific Science Center"), "closed on Monday, so swapped out");
  assert.ok(plan.suggestedActivities.some((a) => a.name === "Discovery Park" && a.grounded === true), "replacement comes from the shortlist and is grounded");
});
