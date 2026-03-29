#!/usr/bin/env node
/**
 * benchmarkPrecompute.mjs — Compare attraction precompute quality across models
 *
 * Runs the same 5 cities through both Claude Sonnet 4.6 and Gemini 2.5 Pro,
 * then outputs a comparison table: attraction count, quality scores, latency, cost.
 *
 * Usage:
 *   node src/backend/scripts/benchmarkPrecompute.mjs
 *
 * Requires: ANTHROPIC_API_KEY, GOOGLE_GEMINI_API_KEY
 */

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

const BENCHMARK_CITIES = [
  { name: "San Diego", country: "US" },
  { name: "Orlando", country: "US" },
  { name: "London", country: "GB" },
  { name: "Tokyo", country: "JP" },
  { name: "Goa", country: "IN" },
];

const PROMPT = (cityName, countryCode) => ({
  system: `You are a family travel expert. Generate a comprehensive list of family-friendly attractions for ${cityName}${countryCode !== "US" ? ` (${countryCode})` : ""}. Return ONLY valid JSON.

For each attraction, provide detailed structured data. Return JSON:
{
  "attractions": [
    {
      "name": "Exact real name of the attraction",
      "category": "beach|hiking|museums|parks|water|wildlife|theme_park|cultural|nature|entertainment|shopping|dining",
      "shortSummary": "1-2 sentence description",
      "ageBands": [
        {"label": "toddler", "suitability": "great|good|okay|poor"},
        {"label": "school_age", "suitability": "great|good|okay|poor"},
        {"label": "teen", "suitability": "great|good|okay|poor"}
      ],
      "indoorOutdoor": "indoor|outdoor|both",
      "durationBucket": "under_1h|1_2h|2_4h|half_day|full_day",
      "crowdLevel": "low|moderate|high",
      "budgetTier": "free|budget|moderate|premium",
      "strollerFriendly": true|false,
      "rainyDayFit": true|false,
      "parentAppealScore": 1-10,
      "kidAppealScore": 1-10,
      "petFriendly": true|false,
      "bookingNeeded": true|false,
      "whyFamilyFriendly": "Brief reason",
      "timingTip": "Best time or booking advice"
    }
  ]
}

Requirements:
- Include 20-25 REAL, currently operating attractions
- Mix of free and paid, indoor and outdoor
- At least 3 great for toddlers, 3 great for teens
- Only REAL places — no made-up attractions`,

  user: `Generate family attractions for ${cityName}.`,
});

function scoreAttractions(attractions) {
  if (!Array.isArray(attractions)) return { count: 0, avgKid: 0, avgParent: 0, categories: 0, hasAgeBands: 0, hasTiming: 0 };

  const categories = new Set(attractions.map(a => a.category).filter(Boolean));
  const withAgeBands = attractions.filter(a => Array.isArray(a.ageBands) && a.ageBands.length > 0);
  const withTiming = attractions.filter(a => a.timingTip && a.timingTip.length > 5);
  const kidScores = attractions.map(a => a.kidAppealScore || 0).filter(s => s > 0);
  const parentScores = attractions.map(a => a.parentAppealScore || 0).filter(s => s > 0);

  return {
    count: attractions.length,
    categories: categories.size,
    avgKid: kidScores.length > 0 ? (kidScores.reduce((a, b) => a + b, 0) / kidScores.length).toFixed(1) : 0,
    avgParent: parentScores.length > 0 ? (parentScores.reduce((a, b) => a + b, 0) / parentScores.length).toFixed(1) : 0,
    hasAgeBands: withAgeBands.length,
    hasTiming: withTiming.length,
    toddlerGreat: attractions.filter(a => a.ageBands?.some(b => b.label === "toddler" && b.suitability === "great")).length,
    teenGreat: attractions.filter(a => a.ageBands?.some(b => b.label === "teen" && b.suitability === "great")).length,
    free: attractions.filter(a => a.budgetTier === "free").length,
    strollerOk: attractions.filter(a => a.strollerFriendly).length,
    rainyDay: attractions.filter(a => a.rainyDayFit).length,
  };
}

function parseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) try { return JSON.parse(match[1]); } catch {}
  return null;
}

async function runSonnet(city) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = PROMPT(city.name, city.country);
  const t0 = Date.now();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    temperature: 0,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  });

  const ms = Date.now() - t0;
  const text = message.content.map(b => b.text).join("");
  const inTokens = message.usage?.input_tokens || 0;
  const outTokens = message.usage?.output_tokens || 0;
  const cost = (inTokens / 1e6 * 3) + (outTokens / 1e6 * 15);

  const parsed = parseJSON(text);
  return { ms, chars: text.length, inTokens, outTokens, cost, attractions: parsed?.attractions || [], raw: text };
}

async function runGemini(city) {
  const genai = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
  const model = genai.getGenerativeModel({ model: "gemini-2.5-pro" });
  const prompt = PROMPT(city.name, city.country);
  const t0 = Date.now();

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt.user }] }],
    systemInstruction: { parts: [{ text: prompt.system }] },
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const ms = Date.now() - t0;
  const text = result.response.text();
  const usage = result.response.usageMetadata || {};
  const inTokens = usage.promptTokenCount || 0;
  const outTokens = usage.candidatesTokenCount || 0;
  const cost = (inTokens / 1e6 * 1.25) + (outTokens / 1e6 * 10);

  const parsed = parseJSON(text);
  return { ms, chars: text.length, inTokens, outTokens, cost, attractions: parsed?.attractions || [], raw: text };
}

async function main() {
  console.log("\n========================================");
  console.log("  ATTRACTION PRECOMPUTE BENCHMARK");
  console.log("  Sonnet 4.6 vs Gemini 2.5 Pro");
  console.log("========================================\n");

  const results = [];

  for (const city of BENCHMARK_CITIES) {
    console.log(`\n--- ${city.name} (${city.country}) ---`);

    console.log("  Running Sonnet 4.6...");
    let sonnet;
    try {
      sonnet = await runSonnet(city);
      console.log(`  Sonnet: ${sonnet.attractions.length} attractions, ${(sonnet.ms/1000).toFixed(1)}s, $${sonnet.cost.toFixed(4)}`);
    } catch (err) {
      console.error(`  Sonnet FAILED: ${err.message}`);
      sonnet = { ms: 0, chars: 0, inTokens: 0, outTokens: 0, cost: 0, attractions: [] };
    }

    // Rate limit pause
    await new Promise(r => setTimeout(r, 1000));

    console.log("  Running Gemini 2.5 Pro...");
    let gemini;
    try {
      gemini = await runGemini(city);
      console.log(`  Gemini: ${gemini.attractions.length} attractions, ${(gemini.ms/1000).toFixed(1)}s, $${gemini.cost.toFixed(4)}`);
    } catch (err) {
      console.error(`  Gemini FAILED: ${err.message}`);
      gemini = { ms: 0, chars: 0, inTokens: 0, outTokens: 0, cost: 0, attractions: [] };
    }

    const sonnetScore = scoreAttractions(sonnet.attractions);
    const geminiScore = scoreAttractions(gemini.attractions);

    results.push({ city: city.name, sonnet, gemini, sonnetScore, geminiScore });

    // Rate limit pause
    await new Promise(r => setTimeout(r, 2000));
  }

  // ── Summary Table ──
  console.log("\n\n========================================");
  console.log("  RESULTS COMPARISON");
  console.log("========================================\n");

  const header = "City            | Model       | Count | Cats | Kid  | Parent | Toddler | Teen | Free | Stroller | Rainy | Time(s) | Cost";
  const sep = "-".repeat(header.length);
  console.log(header);
  console.log(sep);

  let totalSonnetCost = 0, totalGeminiCost = 0;
  let totalSonnetMs = 0, totalGeminiMs = 0;

  for (const r of results) {
    const s = r.sonnetScore;
    const g = r.geminiScore;
    const pad = (v, n) => String(v).padStart(n);
    const city = r.city.padEnd(15);

    console.log(`${city} | Sonnet 4.6  | ${pad(s.count,5)} | ${pad(s.categories,4)} | ${pad(s.avgKid,4)} | ${pad(s.avgParent,6)} | ${pad(s.toddlerGreat,7)} | ${pad(s.teenGreat,4)} | ${pad(s.free,4)} | ${pad(s.strollerOk,8)} | ${pad(s.rainyDay,5)} | ${pad((r.sonnet.ms/1000).toFixed(1),7)} | $${r.sonnet.cost.toFixed(4)}`);
    console.log(`${city} | Gemini Pro  | ${pad(g.count,5)} | ${pad(g.categories,4)} | ${pad(g.avgKid,4)} | ${pad(g.avgParent,6)} | ${pad(g.toddlerGreat,7)} | ${pad(g.teenGreat,4)} | ${pad(g.free,4)} | ${pad(g.strollerOk,8)} | ${pad(g.rainyDay,5)} | ${pad((r.gemini.ms/1000).toFixed(1),7)} | $${r.gemini.cost.toFixed(4)}`);
    console.log(sep);

    totalSonnetCost += r.sonnet.cost;
    totalGeminiCost += r.gemini.cost;
    totalSonnetMs += r.sonnet.ms;
    totalGeminiMs += r.gemini.ms;
  }

  console.log(`\nTOTALS (${results.length} cities):`);
  console.log(`  Sonnet 4.6:  $${totalSonnetCost.toFixed(4)} total, ${(totalSonnetMs/1000).toFixed(1)}s total, ${(totalSonnetMs/results.length/1000).toFixed(1)}s avg`);
  console.log(`  Gemini Pro:  $${totalGeminiCost.toFixed(4)} total, ${(totalGeminiMs/1000).toFixed(1)}s total, ${(totalGeminiMs/results.length/1000).toFixed(1)}s avg`);
  console.log(`  Cost ratio:  Gemini is ${(totalSonnetCost / Math.max(totalGeminiCost, 0.0001)).toFixed(1)}x cheaper`);
  console.log(`  Speed ratio: Gemini is ${(totalSonnetMs / Math.max(totalGeminiMs, 1)).toFixed(1)}x ${totalGeminiMs < totalSonnetMs ? "faster" : "slower"}`);

  // Sample attractions comparison for first city
  if (results.length > 0) {
    const r = results[0];
    console.log(`\n\n--- Sample Attractions: ${r.city} ---`);
    console.log("\nSonnet 4.6 (first 5):");
    for (const a of r.sonnet.attractions.slice(0, 5)) {
      console.log(`  ${a.name} (${a.category}) — kid:${a.kidAppealScore} parent:${a.parentAppealScore} — ${a.shortSummary?.slice(0, 80)}`);
    }
    console.log("\nGemini 2.5 Pro (first 5):");
    for (const a of r.gemini.attractions.slice(0, 5)) {
      console.log(`  ${a.name} (${a.category}) — kid:${a.kidAppealScore} parent:${a.parentAppealScore} — ${a.shortSummary?.slice(0, 80)}`);
    }
  }

  console.log("\n========================================\n");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
