#!/usr/bin/env node
/**
 * model-smoke-test.mjs — Compare trip plan quality across AI models.
 *
 * Sends the SAME prompt to multiple models and scores the output on:
 *   1. Day count (does a 10-day trip get 10 days?)
 *   2. Theme parks (are Disney/Universal/zoos included for a kids trip?)
 *   3. Early-morning activities (any activity before 8 AM?)
 *   4. Activity variety (how many unique categories?)
 *   5. Kid-friendliness (% of activities marked kidFriendly)
 *   6. Meal specificity (are real restaurant names given?)
 *   7. Response size (tokens / chars)
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/model-smoke-test.mjs
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/model-smoke-test.mjs --models haiku,sonnet
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Anthropic = require("../src/backend/node_modules/@anthropic-ai/sdk").default;
let OpenAI;
try { OpenAI = require("../src/backend/node_modules/openai").default; } catch { OpenAI = null; }

// ── Config ────────────────────────────────────────────────────────────────────

const ANTHROPIC_MODELS = {
  haiku:  "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-20250514",
  opus:   "claude-opus-4-20250514",
};

const DEEPSEEK_MODELS = {
  deepseek: "deepseek-reasoner",  // DeepSeek R1 reasoning model
};

const MAX_TOKENS = 8192; // needs headroom for 10-day itineraries with meals

// Parse --models flag
const modelsArg = process.argv.find(a => a.startsWith("--models="));
const selectedModels = modelsArg
  ? modelsArg.split("=")[1].split(",").map(m => m.trim())
  : ["haiku", "sonnet", "opus", "deepseek"];

// ── Test scenario: 10-day family trip to Tokyo, 2 kids (ages 5 and 9) ────────

const SCENARIO = {
  destination: "Tokyo, Japan",
  startDate: "2026-07-10",
  endDate: "2026-07-19",
  activities: ["theme parks", "cultural sites", "food tours", "nature", "shopping"],
  children: [{ age: 5 }, { age: 9 }],
  tripType: "general",
  countryCode: "JP",
};

const weatherForecast = {
  summary: "Hot and humid with occasional afternoon thunderstorms. Highs around 88°F, lows 75°F.",
  forecast: Array.from({ length: 10 }, (_, i) => ({
    name: `Day ${i + 1}`,
    high: 86 + Math.round(Math.random() * 4),
    condition: i % 3 === 2 ? "Thunderstorms" : "Partly Cloudy",
    precipitation: i % 3 === 2 ? 60 : 15,
  })),
};

// ── Build prompt (mirrors tripPlanAI.js buildTripPlanPrompt) ──────────────────

function buildPrompt() {
  const { destination, startDate, endDate, activities, children, countryCode } = SCENARIO;
  const numDays = Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1);
  const activityCount = Math.min(Math.ceil(numDays * 1.5), 18);
  const childrenInfo = children.map(c => `age ${c.age}`).join(", ");

  const system = `You are a helpful travel planning assistant specialising in family trips. Generate trip itineraries as strict JSON only.

Generate a trip plan with the following structure:

{
  "overview": "Brief 2-3 sentence overview of the trip",
  "suggestedActivities": [
    {
      "id": "unique-id",
      "name": "Activity Name",
      "category": "one of: beach, hiking, city, museums, parks, dining, shopping, sports, water, wildlife, theme_park, camping",
      "description": "Brief description of the activity (1-2 sentences)",
      "duration": "Estimated duration (e.g., '2-3 hours', 'half day', 'full day')",
      "kidFriendly": true,
      "weatherDependent": false,
      "bestDays": ["Day names from forecast when this activity is recommended"],
      "reason": "Why this activity is recommended (weather, season, family-friendly, etc.)"
    }
  ],
  "dailyItinerary": [
    {
      "day": "Day N (date)",
      "activities": ["activity-id-1", "activity-id-2"],
      "meals": {
        "breakfast": { "name": "Specific restaurant name", "cuisine": "type", "note": "Why recommended" },
        "lunch": { "name": "Specific restaurant name", "cuisine": "type", "note": "Why recommended" },
        "dinner": { "name": "Specific restaurant name", "cuisine": "type", "note": "Why recommended" }
      },
      "notes": "Any special notes (weather warnings, booking recommendations, etc.)"
    }
  ],
  "tips": [
    "Helpful tips for the trip (booking advice, timing, local insights)"
  ]
}

**INTERNATIONAL TRAVEL CONTEXT:**
- Mention local currency and rough USD equivalents where helpful
- Note any entry requirements or useful language phrases if destination is non-English-speaking
- Include a tip about local emergency number (e.g., EU 112, UK 999) in the tips array
- IMPORTANT: Do NOT include flight arrival times, layovers, or travel logistics in any itinerary day. Day 1 begins at the destination. Never schedule any activity before 8:00 AM local destination time.
- Day 1 itinerary must be light: max 2 activities. Travelers will be fatigued from long-haul travel. Do not include airports, transit, or check-in logistics.

**THEME PARKS (required for family trips):** If the destination has a Disney park, Universal Studios, Legoland, major zoo, or aquarium within 60 miles, you MUST include at least one theme_park activity in suggestedActivities. Do not omit this even if the trip is short.

**YOUNG CHILDREN:** Do not schedule any activity ending after 8:00 PM. All dinner suggestions should be family-friendly and conclude by 7:30 PM.

**Requirements:**
1. Include a mix of indoor and outdoor activities based on weather
2. Consider children's ages when recommending activities
3. Prioritise activities that match their stated interests
4. Include weather-appropriate suggestions (rainy day alternatives, sun protection needs)
5. Be specific to the destination (not generic advice)
6. Create a balanced daily itinerary that's not too packed
7. For EACH meal (breakfast, lunch, dinner), suggest a SPECIFIC, REAL restaurant name at the destination. Vary cuisines across days.
8. Each day must have a different mix of activity categories. Do not schedule the same category more than once on the same day.

**Output Size Limits:**
Generate exactly ${numDays} day objects in dailyItinerary — one per day of the trip.
Suggest ${activityCount} activities in suggestedActivities.
Keep all text concise.

Return ONLY the JSON, no additional text.`;

  const user = `Generate a detailed trip itinerary for a family trip.

**Trip Details:**
- Destination: ${destination}
- Trip Type: general
- Dates: ${startDate} to ${endDate}
- Interested Activities: ${activities.join(", ")}
- Children: ${children.length} child(ren) - ${childrenInfo}

**Weather Forecast:**
${weatherForecast.summary}

${weatherForecast.forecast.map(f =>
    `${f.name}: ${f.high}°F, ${f.condition}, ${f.precipitation}% rain chance`
  ).join("\n")}`;

  return { system, user, numDays, activityCount };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scorePlan(json, numDays) {
  const scores = {};
  const issues = [];

  // 1. Day count
  const dayCount = json.dailyItinerary?.length ?? 0;
  scores.dayCount = dayCount;
  if (dayCount < numDays) issues.push(`Only ${dayCount}/${numDays} days generated`);
  if (dayCount === numDays) scores.dayCountPass = "✅";
  else scores.dayCountPass = "❌";

  // 2. Theme parks
  const activities = json.suggestedActivities || [];
  const themeParkActivities = activities.filter(a =>
    a.category === "theme_park" ||
    /disney|universal|legoland|disneysea/i.test(a.name)
  );
  scores.themeParkCount = themeParkActivities.length;
  scores.themeParkNames = themeParkActivities.map(a => a.name).join(", ") || "NONE";
  if (themeParkActivities.length === 0) issues.push("No theme parks for a kids trip to Tokyo!");

  // 3. Early-morning activities (before 8 AM in notes/day text)
  const earlyMorning = json.dailyItinerary?.some(day => {
    const text = JSON.stringify(day).toLowerCase();
    return /\b[1-7]\s*(am|a\.m\.)\b/.test(text) || /\barriv(e|al)\b.*\b[0-9]+\s*(am|a\.m\.)\b/i.test(text);
  });
  scores.earlyMorning = earlyMorning ? "❌ Found pre-8AM" : "✅ None";

  // 4. Activity variety
  const categories = [...new Set(activities.map(a => a.category))];
  scores.uniqueCategories = categories.length;
  scores.categoryList = categories.join(", ");

  // 5. Kid-friendliness
  const kidFriendlyCount = activities.filter(a => a.kidFriendly).length;
  scores.kidFriendlyPct = activities.length
    ? Math.round((kidFriendlyCount / activities.length) * 100) + "%"
    : "N/A";

  // 6. Meal specificity (check day 1 has real restaurant names, not generic)
  const day1 = json.dailyItinerary?.[0];
  const meals = day1?.meals;
  const genericTerms = /restaurant|café|place|spot|eatery|food stall/i;
  let mealScore = 0;
  let mealDetails = [];
  for (const mealType of ["breakfast", "lunch", "dinner"]) {
    const meal = meals?.[mealType];
    if (meal?.name && !genericTerms.test(meal.name)) {
      mealScore++;
      mealDetails.push(`${mealType}: ${meal.name}`);
    } else {
      mealDetails.push(`${mealType}: ${meal?.name || "MISSING"} ⚠️`);
    }
  }
  scores.mealSpecificity = `${mealScore}/3`;
  scores.day1Meals = mealDetails.join(" | ");

  // 7. Day 1 activity count (should be ≤ 2 for international)
  const day1Activities = day1?.activities?.length ?? 0;
  scores.day1ActivityCount = day1Activities;
  scores.day1Light = day1Activities <= 2 ? "✅" : `❌ (${day1Activities} activities)`;

  // 8. Activity count
  scores.totalActivities = activities.length;

  // 9. Tips
  scores.tipsCount = json.tips?.length ?? 0;

  // 10. Response has overview
  scores.hasOverview = json.overview ? "✅" : "❌";

  return { scores, issues };
}

// ── Call model ─────────────────────────────────────────────────────────────────

async function callAnthropic(client, modelId, system, user) {
  const start = Date.now();
  try {
    const message = await client.messages.create({
      model: modelId,
      system,
      temperature: 0,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: user }],
    });

    const responseText = (message.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const usage = message.usage || {};

    return {
      responseText,
      elapsed,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      stopReason: message.stop_reason,
    };
  } catch (err) {
    return { error: err.message, elapsed: ((Date.now() - start) / 1000).toFixed(1) };
  }
}

async function callDeepSeek(client, modelId, system, user) {
  const start = Date.now();
  try {
    const completion = await client.chat.completions.create({
      model: modelId,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const choice = completion.choices?.[0];
    const responseText = choice?.message?.content ?? "";
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const usage = completion.usage || {};

    return {
      responseText,
      elapsed,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      stopReason: choice?.finish_reason ?? null,
    };
  } catch (err) {
    return { error: err.message, elapsed: ((Date.now() - start) / 1000).toFixed(1) };
  }
}

function parseJson(text) {
  // Try to extract JSON from markdown fences or raw text
  // Handle truncated fenced blocks (no closing ```)
  let candidate = text.trim();

  // Remove opening fence
  const fenceMatch = candidate.match(/^```(?:json)?\s*\n?([\s\S]*?)(?:```\s*$|$)/);
  if (fenceMatch) candidate = fenceMatch[1].trim();

  // If truncated (max_tokens), try to repair by closing open braces/brackets
  try {
    return JSON.parse(candidate);
  } catch {
    // Attempt repair: close any unclosed structures
    let repaired = candidate;
    const opens = (repaired.match(/\{/g) || []).length;
    const closes = (repaired.match(/\}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;

    // Remove trailing comma or incomplete value
    repaired = repaired.replace(/,\s*$/, "");
    repaired = repaired.replace(/:\s*"[^"]*$/, ': ""'); // incomplete string value
    repaired = repaired.replace(/,\s*"[^"]*$/, ""); // incomplete key

    for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += "]";
    for (let i = 0; i < opens - closes; i++) repaired += "}";

    return JSON.parse(repaired);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const anthropicClient = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

  let deepseekClient = null;
  if (process.env.DEEPSEEK_API_KEY && OpenAI) {
    deepseekClient = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
    });
  }

  const { system, user, numDays, activityCount } = buildPrompt();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  TRIP PLAN MODEL SMOKE TEST");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Scenario: 10-day family trip to Tokyo, kids ages 5 & 9`);
  console.log(`Expected: ${numDays} days, ${activityCount} activities, theme parks, no pre-8AM\n`);

  const results = {};

  for (const modelName of selectedModels) {
    const isDeepSeek = modelName === "deepseek";
    const modelId = isDeepSeek ? DEEPSEEK_MODELS[modelName] : ANTHROPIC_MODELS[modelName];
    if (!modelId) {
      console.log(`⚠️  Unknown model: ${modelName} (skipping)\n`);
      continue;
    }

    if (isDeepSeek && !deepseekClient) {
      console.log(`⚠️  Skipping ${modelName}: no DEEPSEEK_API_KEY or openai package\n`);
      continue;
    }
    if (!isDeepSeek && !anthropicClient) {
      console.log(`⚠️  Skipping ${modelName}: no ANTHROPIC_API_KEY\n`);
      continue;
    }

    console.log(`▶ Testing ${modelName.toUpperCase()} (${modelId})...`);

    const result = isDeepSeek
      ? await callDeepSeek(deepseekClient, modelId, system, user)
      : await callAnthropic(anthropicClient, modelId, system, user);

    if (result.error) {
      console.log(`  ❌ ERROR: ${result.error} (${result.elapsed}s)\n`);
      results[modelName] = { error: result.error };
      continue;
    }

    console.log(`  ⏱  ${result.elapsed}s | ${result.inputTokens} in → ${result.outputTokens} out | stop: ${result.stopReason}`);

    let json;
    try {
      json = parseJson(result.responseText);
    } catch (e) {
      console.log(`  ❌ JSON PARSE FAILED: ${e.message}`);
      console.log(`  First 200 chars: ${result.responseText.slice(0, 200)}\n`);
      results[modelName] = { error: "JSON parse failed", raw: result.responseText.slice(0, 500) };
      continue;
    }

    const { scores, issues } = scorePlan(json, numDays);

    results[modelName] = {
      ...scores,
      elapsed: result.elapsed + "s",
      tokens: `${result.inputTokens}→${result.outputTokens}`,
      stopReason: result.stopReason,
      issues,
    };

    // Print individual results
    console.log(`  Days: ${scores.dayCount}/${numDays} ${scores.dayCountPass}`);
    console.log(`  Theme parks: ${scores.themeParkCount} — ${scores.themeParkNames}`);
    console.log(`  Early AM: ${scores.earlyMorning}`);
    console.log(`  Day 1 light: ${scores.day1Light}`);
    console.log(`  Categories: ${scores.uniqueCategories} (${scores.categoryList})`);
    console.log(`  Kid-friendly: ${scores.kidFriendlyPct}`);
    console.log(`  Meals (Day 1): ${scores.day1Meals}`);
    console.log(`  Activities: ${scores.totalActivities} | Tips: ${scores.tipsCount} | Overview: ${scores.hasOverview}`);
    if (issues.length) console.log(`  ⚠️  Issues: ${issues.join("; ")}`);
    console.log();
  }

  // ── Summary table ─────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  COMPARISON TABLE");
  console.log("═══════════════════════════════════════════════════════════════");

  const metrics = [
    ["Days (want 10)", m => `${m.dayCount} ${m.dayCountPass}`],
    ["Theme parks", m => `${m.themeParkCount} — ${m.themeParkNames}`],
    ["No early AM", m => m.earlyMorning],
    ["Day 1 light (≤2)", m => m.day1Light],
    ["Categories", m => `${m.uniqueCategories}`],
    ["Kid-friendly %", m => m.kidFriendlyPct],
    ["Meal specificity", m => m.mealSpecificity],
    ["Total activities", m => `${m.totalActivities}`],
    ["Speed", m => m.elapsed],
    ["Tokens (in→out)", m => m.tokens],
  ];

  const models = selectedModels.filter(m => results[m] && !results[m].error);
  const colWidth = 28;

  // Header
  let header = "Metric".padEnd(22);
  for (const m of models) header += m.toUpperCase().padEnd(colWidth);
  console.log(header);
  console.log("─".repeat(22 + models.length * colWidth));

  // Rows
  for (const [label, fn] of metrics) {
    let row = label.padEnd(22);
    for (const m of models) {
      const val = results[m].error ? "ERROR" : fn(results[m]);
      row += String(val).slice(0, colWidth - 2).padEnd(colWidth);
    }
    console.log(row);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  RECOMMENDATION");
  console.log("═══════════════════════════════════════════════════════════════");

  // Simple scoring
  for (const m of models) {
    const r = results[m];
    let score = 0;
    if (r.dayCount >= 10) score += 3;
    else if (r.dayCount >= 8) score += 1;
    if (r.themeParkCount > 0) score += 3;
    if (r.earlyMorning === "✅ None") score += 1;
    if (r.day1ActivityCount <= 2) score += 1;
    if (r.uniqueCategories >= 5) score += 1;
    if (parseInt(r.kidFriendlyPct) >= 80) score += 1;
    r._score = score;
    console.log(`  ${m.toUpperCase()}: ${score}/10 points`);
  }

  const best = models.reduce((a, b) => (results[a]._score >= results[b]._score ? a : b));
  console.log(`\n  🏆 Best: ${best.toUpperCase()} (${results[best]._score}/10)\n`);
}

main().catch(console.error);
