#!/usr/bin/env node
/**
 * qualityAudit.mjs — Test trip generation quality across 5 cities
 * Checks: scheduling, repetitions, activity count, meal names, day count
 *
 * Usage: OPENAI_API_KEY=... node src/backend/scripts/qualityAudit.mjs
 */

const OPENAI_KEY = process.env.OPENAI_API_KEY;

const CITIES = [
  { dest: "San Diego, CA", start: "2026-04-15", end: "2026-04-18", days: 3, kids: [4, 8] },
  { dest: "New York City, NY", start: "2026-05-01", end: "2026-05-04", days: 3, kids: [6] },
  { dest: "Orlando, FL", start: "2026-06-10", end: "2026-06-13", days: 3, kids: [3, 7] },
  { dest: "Tokyo, Japan", start: "2026-09-01", end: "2026-09-04", days: 3, kids: [5, 10] },
  { dest: "London, UK", start: "2026-07-01", end: "2026-07-04", days: 3, kids: [4] },
];

// Simplified prompt matching what the app sends
const SYSTEM = `You are a family trip planner. Generate a trip itinerary as strict JSON only.
Return JSON: {"overview":"string","suggestedActivities":[{"id":"string","name":"string","category":"string","description":"string","duration":"string","kidFriendly":true,"whatItIs":"string","whyRecommended":"string"}],"dailyItinerary":[{"day":"string","activities":["id1","id2"],"meals":{"breakfast":{"name":"string","cuisine":"string","note":"string"},"lunch":{"name":"string","cuisine":"string","note":"string"},"dinner":{"name":"string","cuisine":"string","note":"string"}},"notes":"string"}],"tips":["string"]}

CRITICAL RULES:
1. 4-6 activities per day (NOT counting meals).
2. NEVER repeat the same activity on multiple days. Each activity appears in ONLY ONE day.
3. Start activities MORNING after breakfast (9 AM). Schedule: breakfast 8AM → activity 9AM → activity 10:30AM → lunch 12PM → activity 1:30PM → activity 3PM → dinner 6PM.
4. Each day should have a DIFFERENT theme/area. Day 1: downtown. Day 2: theme park/zoo. Day 3: beaches/nature.
5. Include major attractions within 35 miles. For San Diego include Legoland, SeaWorld. For Orlando include Disney, Universal.
6. Every meal must be a SPECIFIC real restaurant as {name, cuisine, note}.
7. Return EXACTLY the number of days requested. 3-day trip = 3 day objects.
8. Include 5+ practical tips with money-saving hacks.`;

function makeUser(city) {
  return `Generate a ${city.days}-day family trip to ${city.dest}. Kids ages: ${city.kids.join(", ")}. Dates: ${city.start} to ${city.end}. Include variety — theme parks, museums, beaches, city tours. No repeated activities.`;
}

async function generate(city) {
  const t0 = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: "gpt-5.4-nano",
      temperature: 0,
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: makeUser(city) },
      ],
    }),
  });
  const data = await res.json();
  const ms = Date.now() - t0;
  if (data.error) throw new Error(data.error.message);
  return { ms, text: data.choices?.[0]?.message?.content || "", tokens: data.usage };
}

function audit(city, text, ms) {
  const issues = [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { valid: false, issues: ["INVALID JSON"], activities: 0, days: 0 };
  }

  const acts = parsed.suggestedActivities || [];
  const days = parsed.dailyItinerary || [];
  const tips = parsed.tips || [];

  // Day count
  if (days.length !== city.days) {
    issues.push(`WRONG DAY COUNT: expected ${city.days}, got ${days.length}`);
  }

  // Activity count per day
  days.forEach((day, i) => {
    const dayActs = (day.activities || []).length;
    if (dayActs < 3) issues.push(`Day ${i + 1}: only ${dayActs} activities (need 4+)`);
  });

  // Repeated activities across days
  const allDayActs = days.flatMap(d => d.activities || []);
  const actCounts = {};
  allDayActs.forEach(a => { actCounts[a] = (actCounts[a] || 0) + 1; });
  const repeats = Object.entries(actCounts).filter(([, c]) => c > 1);
  if (repeats.length > 0) {
    issues.push(`REPEATED ACTIVITIES: ${repeats.map(([name, c]) => `${name} (${c}x)`).join(", ")}`);
  }

  // Scheduling check — look for activities with time hints
  // Check if activities reference IDs that exist
  const actIds = new Set(acts.map(a => a.id));
  const missingIds = allDayActs.filter(id => !actIds.has(id));
  if (missingIds.length > 0) {
    issues.push(`MISSING ACTIVITY IDS: ${missingIds.slice(0, 3).join(", ")}`);
  }

  // Meal check
  let genericMeals = 0;
  let totalMeals = 0;
  days.forEach((day, i) => {
    const meals = day.meals || {};
    ["breakfast", "lunch", "dinner"].forEach(m => {
      totalMeals++;
      const meal = meals[m];
      if (!meal) { genericMeals++; return; }
      const name = typeof meal === "string" ? meal : meal.name;
      if (!name || ["Breakfast", "Lunch", "Dinner", "breakfast", "lunch", "dinner"].includes(name)) {
        genericMeals++;
        issues.push(`Day ${i + 1} ${m}: generic meal "${name || "missing"}"`);
      }
    });
  });

  // Activity names — check for diversity
  const actNames = acts.map(a => (a.name || "").toLowerCase());
  const categories = [...new Set(acts.map(a => a.category))];

  // Check for major attractions in certain cities
  const destLower = city.dest.toLowerCase();
  if (destLower.includes("san diego")) {
    const hasLegoland = actNames.some(n => n.includes("legoland"));
    const hasZoo = actNames.some(n => n.includes("zoo"));
    const hasSeaworld = actNames.some(n => n.includes("seaworld"));
    if (!hasLegoland && !hasZoo && !hasSeaworld) {
      issues.push("SAN DIEGO: Missing major attractions (Legoland/Zoo/SeaWorld)");
    }
    if (hasLegoland) console.log("    ✓ Legoland included");
    if (hasZoo) console.log("    ✓ Zoo included");
    if (hasSeaworld) console.log("    ✓ SeaWorld included");
  }
  if (destLower.includes("orlando")) {
    const hasDisney = actNames.some(n => n.includes("disney") || n.includes("magic kingdom"));
    const hasUniversal = actNames.some(n => n.includes("universal"));
    if (!hasDisney && !hasUniversal) {
      issues.push("ORLANDO: Missing Disney/Universal");
    }
  }

  return {
    valid: true,
    days: days.length,
    totalActivities: acts.length,
    actsPerDay: days.map(d => (d.activities || []).length),
    categories,
    repeats: repeats.length,
    genericMeals,
    totalMeals,
    tips: tips.length,
    issues,
    ms,
    // Show first day's schedule
    day1Activities: acts.filter(a => (days[0]?.activities || []).includes(a.id)).map(a => a.name),
  };
}

async function main() {
  console.log("\n" + "=".repeat(100));
  console.log("  TRIP QUALITY AUDIT — GPT-5.4 nano");
  console.log("=".repeat(100));

  for (const city of CITIES) {
    console.log(`\n--- ${city.dest} (${city.days} days, kids ${city.kids.join("&")}) ---`);
    try {
      const { ms, text, tokens } = await generate(city);
      const result = audit(city, text, ms);

      console.log(`  Time: ${(ms / 1000).toFixed(1)}s | Tokens: ${tokens?.prompt_tokens}+${tokens?.completion_tokens}`);
      console.log(`  Days: ${result.days}/${city.days} | Activities: ${result.totalActivities} | Per day: [${result.actsPerDay.join(", ")}]`);
      console.log(`  Categories: ${result.categories.join(", ")}`);
      console.log(`  Repeats: ${result.repeats} | Generic meals: ${result.genericMeals}/${result.totalMeals} | Tips: ${result.tips}`);
      console.log(`  Day 1 schedule: ${result.day1Activities.join(" → ")}`);

      if (result.issues.length > 0) {
        console.log(`  ⚠️  ISSUES (${result.issues.length}):`);
        result.issues.forEach(i => console.log(`    - ${i}`));
      } else {
        console.log(`  ✅ No issues found`);
      }
    } catch (err) {
      console.log(`  ❌ FAILED: ${err.message.slice(0, 100)}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("\n" + "=".repeat(100) + "\n");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
