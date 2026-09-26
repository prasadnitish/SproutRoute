#!/usr/bin/env node
// Read-only, synthetic model comparison. Run with Railway's existing variables:
// railway run --service SproutRoute --environment production -- node scripts/benchmark-luna.mjs
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { parseInput } from "../src/backend/services/parseInput.js";
import { buildTripPlanPrompt } from "../src/backend/services/tripPlanAI.js";
import { getTravelSafety } from "../src/backend/services/travelSafety.js";
import { researchCarSeatRulesFromOfficialSource } from "../src/backend/services/safetyLawResearch.js";

const require = createRequire(import.meta.url);
const Anthropic = require("../src/backend/node_modules/@anthropic-ai/sdk").default;
const { GoogleGenerativeAI } = require("../src/backend/node_modules/@google/generative-ai");
const TIMEOUT_MS = 90_000;
const LUNA = "gpt-6-luna";
const MODEL_BY_TASK = {
  parse: ["gpt-5.4-nano", LUNA],
  trip: ["gemini-3.8-flash", "gpt-5.4-nano", LUNA],
  safety: ["claude-haiku-4-5-20251001", LUNA],
  repair: ["claude-haiku-4-5-20251001", LUNA],
  law: ["claude-haiku-4-5-20251001", LUNA],
  precompute: ["claude-sonnet-4-6", LUNA],
};

export const CASES = {
  parse: [
    { id: "vegas-explicit", text: "Plan a 3-day trip to Las Vegas with two adults and my 6-year-old. We want shows and pools.", expected: { destination: "las vegas", childAge: 6, resolved: true, days: 3 } },
    { id: "bellevue-vague-pet", text: "I want a beach trip near Bellevue with my 3-year-old and dog named Max next weekend.", expected: { resolved: false, childAge: 3, pet: "dog" } },
    { id: "tokyo-diet", text: "Five days in Tokyo with my 8-year-old. We are vegetarian and want to avoid crowds.", expected: { destination: "tokyo", childAge: 8, resolved: true, days: 5, dietary: "vegetarian" } },
  ],
  trip: [
    { id: "vegas-family", destination: "Las Vegas, Nevada", startDate: "2026-10-10", endDate: "2026-10-11", activities: ["family museums", "outdoor gardens"], children: [{ age: 6 }], countryCode: "US", days: 2 },
    { id: "san-diego-dog", destination: "San Diego, California", startDate: "2026-10-12", endDate: "2026-10-13", activities: ["beaches", "parks"], children: [{ age: 4 }], pets: [{ type: "dog", name: "Max", weightLb: 20 }], countryCode: "US", days: 2 },
    { id: "tokyo-five-day", destination: "Tokyo, Japan", startDate: "2026-10-20", endDate: "2026-10-24", activities: ["museums", "parks", "vegetarian food"], children: [{ age: 8 }], countryCode: "JP", days: 5 },
  ],
  safety: [
    { id: "vegas-us", destination: "Las Vegas, Nevada", childrenAges: [6], countryCode: "US", expected: { emergencyNumber: "911" } },
    { id: "london-gb", destination: "London, United Kingdom", childrenAges: [4], countryCode: "GB", expected: { emergencyNumber: "999|112" } },
  ],
  repair: [{ id: "broken-plan", expected: { preservedName: "Springs Preserve" } }],
  law: [{ id: "synthetic-statute", expected: { requiredRestraint: "rear_facing", maxAgeMonths: 23, sourcePhrase: "under age 2" } }],
  precompute: [{ id: "san-diego-attractions", expected: { minCount: 20 } }],
};

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

export function scoreOutput(task, data, expected = {}) {
  const issues = [];
  if (!data || typeof data !== "object") return { pass: false, issues: ["invalid_json"] };

  if (task === "parse") {
    const destination = normalized(data.destination);
    if (expected.resolved && !destination.includes(expected.destination)) issues.push("destination_not_resolved");
    if (expected.resolved && (data.suggestedDestinations || []).length) issues.push("resolved_destination_has_suggestions");
    if (expected.resolved === false && data.destination) issues.push("vague_destination_resolved");
    if (expected.resolved === false && (data.suggestedDestinations || []).length < 3) issues.push("missing_destination_options");
    if (expected.childAge !== undefined && !(data.childrenAges || []).includes(expected.childAge)) issues.push("child_age_missing");
    if (expected.pet && !(data.pets || []).some((pet) => pet.type === expected.pet)) issues.push("pet_missing");
    if (expected.dietary && !(data.foodPreferences?.dietary || []).map(normalized).includes(expected.dietary)) issues.push("dietary_missing");
    if (expected.days && data.startDate && data.endDate) {
      const days = Math.round((Date.parse(data.endDate) - Date.parse(data.startDate)) / 86400000) + 1;
      if (days !== expected.days) issues.push("wrong_duration");
    }
  } else if (task === "trip" || task === "repair") {
    const activities = data.suggestedActivities;
    const days = data.dailyItinerary;
    if (!Array.isArray(activities) || !Array.isArray(days)) return { pass: false, issues: ["missing_trip_arrays"] };
    if (expected.days && days.length !== expected.days) issues.push("wrong_day_count");
    const ids = new Set(activities.map((activity) => String(activity.id)));
    const referenced = days.flatMap((day) => Array.isArray(day.activities) ? day.activities.map(String) : []);
    if (referenced.some((id) => !ids.has(id))) issues.push("missing_activity_reference");
    if (new Set(referenced).size !== referenced.length) issues.push("repeated_activity");
    if (task === "trip") {
      if (days.some((day) => !Array.isArray(day.activities) || day.activities.length < 4)) issues.push("thin_day");
      if (days.some((day) => !normalized(day.meals?.dinner?.name))) issues.push("missing_dinner_name");
    }
    if (expected.preservedName && !activities.some((activity) => normalized(activity.name).includes(normalized(expected.preservedName)))) issues.push("repair_lost_fact");
  } else if (task === "safety") {
    if (!new RegExp(expected.emergencyNumber).test(String(data.emergencyNumber || ""))) issues.push("wrong_emergency_number");
    if (!Array.isArray(data.healthTips) || !data.healthTips.length) issues.push("missing_health_tips");
    if (!Array.isArray(data.familyTips) || !data.familyTips.length) issues.push("missing_family_tips");
  } else if (task === "law") {
    if (!Array.isArray(data.rules) || !data.rules.some((rule) => rule.requiredRestraint === expected.requiredRestraint && rule.maxAgeMonths === expected.maxAgeMonths)) issues.push("wrong_legal_threshold");
    if (!normalized(data.citationSnippet).includes(expected.sourcePhrase)) issues.push("ungrounded_citation");
  } else if (task === "precompute") {
    const attractions = data.attractions;
    if (!Array.isArray(attractions) || attractions.length < expected.minCount) return { pass: false, issues: ["too_few_attractions"] };
    if (new Set(attractions.map((attraction) => normalized(attraction.name))).size !== attractions.length) issues.push("duplicate_attraction");
    if (attractions.some((attraction) => !Array.isArray(attraction.ageBands) || !attraction.ageBands.length)) issues.push("missing_age_bands");
    if (new Set(attractions.map((attraction) => attraction.category)).size < 2) issues.push("low_category_variety");
  }
  return { pass: issues.length === 0, issues };
}

function parseJson(text) {
  try { return JSON.parse(text); } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (match) try { return JSON.parse(match[0]); } catch { /* invalid model output */ }
    return null;
  }
}

function modelProvider(model) {
  if (model.startsWith("gpt-")) return "openai";
  if (model.startsWith("claude-")) return "anthropic";
  return "gemini";
}

export function tripTokenBudget(days) {
  return Math.min(16_384, Math.max(3000, 3000 + days * 600));
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function invoke(model, { system = "", user, maxTokens }, lunaEffort) {
  const started = performance.now();
  let text;
  let finishReason;
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;

  if (modelProvider(model) === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model,
        ...(model === LUNA ? { reasoning_effort: lunaEffort } : { temperature: 0 }),
        max_completion_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system || "Return only JSON." }, { role: "user", content: user }],
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${body.error?.code || body.error?.message || "unknown"}`);
    text = body.choices?.[0]?.message?.content || "";
    finishReason = body.choices?.[0]?.finish_reason || null;
    inputTokens = body.usage?.prompt_tokens || 0;
    outputTokens = body.usage?.completion_tokens || 0;
    reasoningTokens = body.usage?.completion_tokens_details?.reasoning_tokens || 0;
  } else if (modelProvider(model) === "anthropic") {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 });
    const message = await client.messages.create({
      model, max_tokens: maxTokens, temperature: 0,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: user }],
    });
    text = message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
    finishReason = message.stop_reason || null;
    inputTokens = message.usage?.input_tokens || 0;
    outputTokens = message.usage?.output_tokens || 0;
  } else {
    const client = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
    const gemini = client.getGenerativeModel({ model });
    const result = await gemini.generateContent({
      contents: [{ role: "user", parts: [{ text: user }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { temperature: 0, maxOutputTokens: maxTokens, responseMimeType: "application/json" },
    });
    text = result.response.text();
    finishReason = result.response.candidates?.[0]?.finishReason || null;
    inputTokens = result.response.usageMetadata?.promptTokenCount || 0;
    outputTokens = result.response.usageMetadata?.candidatesTokenCount || 0;
    reasoningTokens = result.response.usageMetadata?.thoughtsTokenCount || 0;
  }

  return { text, ms: Math.round(performance.now() - started), finishReason, inputTokens, outputTokens, reasoningTokens };
}

const REPAIR_SYSTEM = `You are a JSON repair tool. Fix the malformed JSON and return ONLY valid JSON with this exact shape:
{"overview":"string","suggestedActivities":[{"id":"string","name":"string","category":"string","description":"string","kidFriendly":true}],"dailyItinerary":[{"day":"string","activities":["string"],"meals":"string","notes":"string"}],"tips":["string"]}
Preserve existing meaning. Ensure booleans remain booleans. Return valid JSON only.`;
const BROKEN_PLAN = '{"overview":"Family visit","suggestedActivities":[{"id":"a1","name":"Springs Preserve","kidFriendly":true}],"dailyItinerary":[{"day":"Day 1","activities":["a1"],"meals":"Picnic"}],"tips":["Bring water",]';
const LAW_SOURCE = "Example Department of Transportation child passenger safety rule. Children under age 2 must ride rear-facing in a child restraint. Children ages 2 through 7 must ride in an appropriate child restraint or booster seat. Effective January 1, 2025.";

function precomputePrompt() {
  return {
    system: `You are a family travel expert. Generate a comprehensive list of family-friendly attractions for San Diego and within 35 miles. Return ONLY valid JSON.
Return {"attractions":[{"name":"Exact real name","category":"beach|hiking|city|museums|parks|dining|shopping|sports|water|wildlife|theme_park|camping|cultural|nature|entertainment","shortSummary":"1-2 sentence description","ageBands":[{"label":"infant|toddler|preschool|school_age|teen","minAge":0,"maxAge":1,"suitability":"great|good|okay|poor"}],"indoorOutdoor":"indoor|outdoor|both","durationBucket":"under_1h|1_2h|2_4h|half_day|full_day","paceFit":"slow|moderate|fast|any","crowdLevel":"low|moderate|high|varies","budgetTier":"free|budget|moderate|premium","strollerFriendly":true,"rainyDayFit":true,"parentAppealScore":1,"kidAppealScore":1,"petFriendly":false,"bookingNeeded":false,"whyFamilyFriendly":"reason","timingTip":"timing"}]}.
Include 20-25 real attractions, free and paid, indoor and outdoor, at least three great for toddlers and three for teens. Only include places currently operating. Include nearby towns, e.g. Legoland California in Carlsbad.`,
    user: "Generate a comprehensive family attraction list for San Diego (US), including attractions within 35 miles.",
    maxTokens: 15_000,
  };
}

export async function runCase(task, testCase, model, lunaEffort, callModel = invoke, options = {}) {
  let response;
  let data;
  if (task === "parse") {
    data = await parseInput(testCase.text, {
      detectedRegion: "Bellevue, WA", clientDate: "2026-09-25",
      callAI: async (prompt) => {
        response = await callModel(model, { system: "You are a trip planner assistant. Return ONLY valid JSON, no markdown or explanation.", user: prompt, maxTokens: 1200 }, lunaEffort);
        return response.text;
      },
    });
  } else if (task === "trip") {
    const prompt = buildTripPlanPrompt(testCase.destination, testCase.startDate, testCase.endDate,
      testCase.activities, testCase.children,
      { summary: "Mild, dry weather. High 72 F, low 55 F.", forecast: [] },
      { countryCode: testCase.countryCode, pets: testCase.pets || [] });
    response = await callModel(model, { ...prompt, maxTokens: options.tripMaxTokens || tripTokenBudget(testCase.days) }, lunaEffort);
    data = parseJson(response.text);
  } else if (task === "safety") {
    data = await getTravelSafety(testCase.destination, testCase.childrenAges, testCase.countryCode, {
      callAI: async (prompt) => {
        response = await callModel(model, { system: "You are a travel safety advisor. Return ONLY valid JSON.", user: prompt, maxTokens: 1024 }, lunaEffort);
        return response.text;
      },
    });
  } else if (task === "repair") {
    response = await callModel(model, { system: REPAIR_SYSTEM, user: `Malformed JSON:\n${BROKEN_PLAN}`, maxTokens: 2000 }, lunaEffort);
    data = parseJson(response.text);
  } else if (task === "law") {
    data = await researchCarSeatRulesFromOfficialSource({
      jurisdictionCode: "EX", jurisdictionName: "Example State", sourceUrl: "https://example.gov/child-passenger-safety",
    }, {
      fetchFn: async () => ({ ok: true, text: async () => LAW_SOURCE }),
      anthropicFactory: () => ({ messages: { create: async (request) => {
        response = await callModel(model, { user: request.messages[0].content, maxTokens: 1400 }, lunaEffort);
        return { content: [{ type: "text", text: response.text }], stop_reason: response.finishReason };
      } } }),
    });
  } else if (task === "precompute") {
    response = await callModel(model, precomputePrompt(), lunaEffort);
    data = parseJson(response.text);
  }

  return {
    task, case: testCase.id, model, ...scoreOutput(task, data, { ...testCase.expected, days: testCase.days || testCase.expected?.days }),
    ms: response?.ms || null,
    inputTokens: response?.inputTokens || 0,
    outputTokens: response?.outputTokens || 0,
    reasoningTokens: response?.reasoningTokens || 0,
    finishReason: response?.finishReason || null,
    billedCostUsd: response?.billedCostUsd ?? null,
    servedModel: response?.servedModel || null,
    provider: response?.provider || null,
    sample: task === "trip" ? (data?.suggestedActivities || []).slice(0, 3).map((activity) => activity.name)
      : task === "precompute" ? (data?.attractions || []).slice(0, 3).map((attraction) => attraction.name)
        : undefined,
  };
}

async function main() {
  const taskArg = process.argv.find((arg) => arg.startsWith("--tasks="));
  const selectedTasks = taskArg ? taskArg.slice(8).split(",") : Object.keys(MODEL_BY_TASK);
  const repeats = Number(process.argv.find((arg) => arg.startsWith("--repeats="))?.slice(10) || 1);
  const lunaEffort = process.argv.find((arg) => arg.startsWith("--luna-effort="))?.slice(14) || "medium";
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3 || selectedTasks.some((task) => !MODEL_BY_TASK[task])) throw new Error("Invalid benchmark arguments");
  if (!["none", "low", "medium", "high"].includes(lunaEffort)) throw new Error("Invalid Luna reasoning effort");
  const results = [];
  console.log(JSON.stringify({ benchmark: "SproutRoute synthetic task comparison", at: new Date().toISOString(), repeats, lunaEffort, tasks: selectedTasks }));
  for (const task of selectedTasks) {
    for (const testCase of CASES[task]) {
      for (let repeat = 1; repeat <= (task === "precompute" ? 1 : repeats); repeat++) {
        for (const model of MODEL_BY_TASK[task]) {
          try {
            const result = await runCase(task, testCase, model, lunaEffort);
            results.push({ ...result, repeat });
            console.log(JSON.stringify({ ...result, repeat }));
          } catch (error) {
            const failed = { task, case: testCase.id, model, repeat, pass: false, issues: ["request_failed"], error: String(error.message || error).slice(0, 180) };
            results.push(failed);
            console.log(JSON.stringify(failed));
          }
        }
      }
    }
  }
  const summary = Object.entries(MODEL_BY_TASK).filter(([task]) => selectedTasks.includes(task)).flatMap(([task, models]) => models.map((model) => {
    const rows = results.filter((row) => row.task === task && row.model === model);
    const latencies = rows.map((row) => row.ms).filter(Number.isFinite).sort((a, b) => a - b);
    return { task, model, pass: rows.filter((row) => row.pass).length, total: rows.length,
      medianMs: median(latencies),
      maxMs: latencies.at(-1) || null,
      failures: rows.filter((row) => row.issues?.includes("request_failed")).length,
    };
  }));
  console.log(JSON.stringify({ summary }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(String(error.message || error)); process.exitCode = 1; });
}
