#!/usr/bin/env node
/**
 * benchmarkModels.mjs — Compare Haiku 4.5 vs GPT-5.4 nano vs GPT-5.4 mini
 * for trip plan generation speed and quality.
 *
 * Usage: ANTHROPIC_API_KEY=... OPENAI_API_KEY=... node src/backend/scripts/benchmarkModels.mjs
 */

import Anthropic from "@anthropic-ai/sdk";

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM = `You are a family trip planner. Generate a 3-day trip itinerary for the given city as strict JSON only.
Return JSON: {"overview":"string","suggestedActivities":[{"id":"string","name":"string","category":"string","description":"string","duration":"string","kidFriendly":true}],"dailyItinerary":[{"day":"string","activities":["id"],"meals":{"breakfast":{"name":"string","cuisine":"string","note":"string"},"lunch":{"name":"string","cuisine":"string","note":"string"},"dinner":{"name":"string","cuisine":"string","note":"string"}},"notes":"string"}],"tips":["string"]}
Rules: 4-5 activities per day, specific real restaurants, 5+ tips. Return ONLY JSON.`;

const USER = (city) => `Generate a 3-day family trip to ${city} with kids ages 4 and 8. Include city tours and money-saving tips.`;

async function runHaiku(city) {
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const t0 = Date.now();
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8192,
    temperature: 0,
    system: SYSTEM,
    messages: [{ role: "user", content: USER(city) }],
  });
  const ms = Date.now() - t0;
  const text = msg.content.map(b => b.text).join("");
  return { ms, chars: text.length, inTok: msg.usage?.input_tokens, outTok: msg.usage?.output_tokens, text };
}

async function runOpenAI(city, model) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: USER(city) },
      ],
    }),
  });
  const ms_ttfb = Date.now();
  const data = await res.json();
  const ms = Date.now() - ms_ttfb;
  if (data.error) throw new Error(data.error.message);
  const text = data.choices?.[0]?.message?.content || "";
  return { ms, chars: text.length, inTok: data.usage?.prompt_tokens, outTok: data.usage?.completion_tokens, text };
}

function scoreOutput(text) {
  try {
    const d = JSON.parse(text.replace(/```json\n?/g, "").replace(/```/g, "").trim());
    const acts = d.suggestedActivities?.length || 0;
    const days = d.dailyItinerary?.length || 0;
    const tips = d.tips?.length || 0;
    const hasMealNames = d.dailyItinerary?.every(day =>
      day.meals?.breakfast?.name && day.meals?.lunch?.name && day.meals?.dinner?.name
    ) || false;
    return { valid: true, acts, days, tips, hasMealNames };
  } catch {
    return { valid: false, acts: 0, days: 0, tips: 0, hasMealNames: false };
  }
}

async function main() {
  const cities = ["New York City", "San Diego", "Tokyo"];
  const models = [
    { name: "Haiku 4.5", fn: (c) => runHaiku(c) },
    { name: "GPT-5.4 nano", fn: (c) => runOpenAI(c, "gpt-5.4-nano") },
    { name: "GPT-5.4 mini", fn: (c) => runOpenAI(c, "gpt-5.4-mini") },
  ];

  console.log("\n" + "=".repeat(100));
  console.log("  MODEL BENCHMARK: Trip Plan Generation");
  console.log("=".repeat(100) + "\n");

  const results = [];

  for (const city of cities) {
    console.log(`--- ${city} ---`);
    for (const model of models) {
      process.stdout.write(`  ${model.name.padEnd(15)}`);
      const t0 = Date.now();
      try {
        const r = await model.fn(city);
        const totalMs = Date.now() - t0;
        const score = scoreOutput(r.text);
        const costIn = model.name.includes("Haiku") ? r.inTok / 1e6 * 1 : model.name.includes("nano") ? r.inTok / 1e6 * 0.20 : r.inTok / 1e6 * 0.75;
        const costOut = model.name.includes("Haiku") ? r.outTok / 1e6 * 5 : model.name.includes("nano") ? r.outTok / 1e6 * 1.25 : r.outTok / 1e6 * 4.50;
        const cost = costIn + costOut;
        console.log(`${String(totalMs / 1000).padStart(6)}s | ${String(r.chars).padStart(6)} chars | ${r.inTok}+${r.outTok} tok | $${cost.toFixed(4)} | ${score.valid ? "✓" : "✗"} JSON | ${score.acts} acts | ${score.days} days | ${score.tips} tips | meals:${score.hasMealNames ? "✓" : "✗"}`);
        results.push({ city, model: model.name, ms: totalMs, chars: r.chars, inTok: r.inTok, outTok: r.outTok, cost, ...score });
      } catch (err) {
        console.log(`FAILED: ${err.message.slice(0, 80)}`);
        results.push({ city, model: model.name, ms: 0, chars: 0, valid: false });
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log();
  }

  // Summary
  console.log("=".repeat(100));
  console.log("  SUMMARY");
  console.log("=".repeat(100));
  for (const m of models) {
    const mr = results.filter(r => r.model === m.name && r.valid);
    if (mr.length === 0) { console.log(`  ${m.name}: all failed`); continue; }
    const avgMs = Math.round(mr.reduce((s, r) => s + r.ms, 0) / mr.length);
    const avgActs = (mr.reduce((s, r) => s + r.acts, 0) / mr.length).toFixed(1);
    const avgDays = (mr.reduce((s, r) => s + r.days, 0) / mr.length).toFixed(1);
    const avgTips = (mr.reduce((s, r) => s + r.tips, 0) / mr.length).toFixed(1);
    const avgCost = (mr.reduce((s, r) => s + (r.cost || 0), 0) / mr.length).toFixed(4);
    const mealRate = (mr.filter(r => r.hasMealNames).length / mr.length * 100).toFixed(0);
    console.log(`  ${m.name.padEnd(15)} avg ${(avgMs/1000).toFixed(1)}s | ${avgActs} acts | ${avgDays} days | ${avgTips} tips | meals:${mealRate}% | $${avgCost}/trip`);
  }
  console.log();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
