// Deterministic scoring for the golden-set cases, used by the model comparison. Each function checks one rubric
// line that a program can check (O1, O2, T1 and the structure behind O3 and X2). Subjective lines are judged
// separately and are not decided here. See docs/benchmarks/sproutroute-ai-eval-report-2026-09-25.md for the rubric.

const DAY_MS = 86_400_000;

/** Server-sent events as [{event, data}], with data parsed when it is JSON. */
export function parseSse(text) {
  const events = [];
  for (const block of String(text || "").split("\n\n")) {
    const eventLine = /^event: (.+)$/m.exec(block);
    const dataLine = /^data: (.+)$/m.exec(block);
    if (!eventLine) continue;
    let data = dataLine?.[1];
    try { data = JSON.parse(data); } catch { /* keep the raw text */ }
    events.push({ event: eventLine[1], data });
  }
  return events;
}

/** The days, activities and grounding of a streamed plan, merged across its itinerary chunks. */
export function mergePlan(events) {
  const days = [];
  const activities = [];
  let total = 0;
  let matched = 0;
  let destination = null;
  for (const { event, data } of events) {
    if (event === "destination") destination = data;
    if (event !== "itinerary-chunk") continue;
    const plan = data?.tripPlan || {};
    days.push(...(plan.dailyItinerary || []));
    activities.push(...(plan.suggestedActivities || []));
    if (plan.grounding) { total += plan.grounding.total || 0; matched += plan.grounding.matched || 0; }
  }
  return {
    days, activities, destination,
    grounding: total ? { total, matched, ratio: matched / total } : null,
    hasDone: events.some((e) => e.event === "done"),
    errors: events.filter((e) => e.event === "error").map((e) => e.data?.message || "error"),
  };
}

/** Minutes in a duration such as "2 hours", "90 min", "1.5 hours" or "2-3 hours" (the longer end), or null. */
export function durationMinutes(text) {
  const value = String(text || "");
  const range = /(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i.exec(value);
  if (range) return Number(range[2]) * (/^h/i.test(range[3]) ? 60 : 1);
  const hours = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i.exec(value);
  const minutes = /(\d+)\s*(?:minutes?|mins?|m)\b/i.exec(value);
  const total = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  return total > 0 ? total : null;
}

export function inclusiveDays(startDate, endDate) {
  return Math.round((Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / DAY_MS) + 1;
}

const norm = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Checks on one streamed itinerary against its request.
 *  complete (O2): finished without an error, one day object per requested day, and every day's activity ids resolve.
 *  thinDays and repeatedStops are counted separately, because they are quality problems a plan can have while
 *  still being complete: a day with fewer stops than the product aims for (4 with children, 3 without), and a
 *  stop that appears on more than one day.
 */
export function scorePlan(request, merged) {
  const expectedDays = inclusiveDays(request.startDate, request.endDate);
  const hasKids = (request.children || []).length > 0;
  const minPerDay = hasKids ? 4 : 3;
  const ids = new Set(merged.activities.map((a) => a.id));
  const stopCounts = new Map();
  const problems = [];
  let thinDays = 0;

  if (merged.errors.length) problems.push(`stream error: ${merged.errors[0]}`);
  if (!merged.hasDone) problems.push("no done event");
  if (merged.days.length !== expectedDays) problems.push(`${merged.days.length} days for ${expectedDays} requested`);
  const byId = new Map(merged.activities.map((a) => [a.id, a]));
  for (const [i, day] of merged.days.entries()) {
    const list = day.activities || [];
    if (list.length < minPerDay) thinDays += 1;
    for (const id of list) {
      if (!ids.has(id)) problems.push(`day ${i + 1} references unknown ${id}`);
      const key = norm(byId.get(id)?.name) || id;
      stopCounts.set(key, (stopCounts.get(key) || 0) + 1);
    }
  }
  const repeatedStops = [...stopCounts.values()].filter((n) => n > 1).length;

  const shares = (predicate, list) => (list.length ? list.filter(predicate).length / list.length : null);
  const planned = merged.activities;
  const minutes = planned.map((a) => durationMinutes(a.duration));
  return {
    expectedDays,
    complete: problems.length === 0,
    problems,
    thinDays,
    repeatedStops,
    stops: planned.length,
    durationInRange: minutes.length ? minutes.filter((m) => m !== null && m >= 45 && m <= 180).length / minutes.length : null,
    kidFriendlyShare: hasKids ? shares((a) => a.kidFriendly !== false, planned) : null,
    petFriendlyShare: (request.pets || []).length ? shares((a) => a.petFriendly === true, planned) : null,
    groundedRatio: merged.grounding?.ratio ?? null,
    destinationKept: merged.destination ? norm(JSON.stringify(merged.destination)).includes(norm(String(request.destination).split(",")[0])) : false,
  };
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/**
 * Checks one parse result against what the request said. Only the fields a case expects are checked.
 *  O1: explicit destination kept; traveler, pet and dietary constraints kept.
 *  T1: an explicit destination is not turned into a destination choice (destination set), and a vague one is
 *      (destination null with three suggestions).
 */
export function scoreParse(expect, result) {
  const r = result?.parsed || result || {};
  const checks = {};
  const stopNames = (r.stops || []).map((s) => norm(s.name));
  if ("destinationIncludes" in expect) checks.destination = expect.destinationIncludes.every((part) => norm(r.destination).includes(norm(part)));
  if (expect.destinationNull) checks.destinationChoice = r.destination == null && (r.suggestedDestinations || []).length === 3;
  if (expect.destinationIncludes) checks.noInterruption = r.destination != null;
  if ("childrenAges" in expect) checks.children = sameSet(r.childrenAges || [], expect.childrenAges);
  if ("adults" in expect) checks.adults = r.adults === expect.adults;
  if ("petTypes" in expect) checks.pets = sameSet((r.pets || []).map((p) => p.type), expect.petTypes);
  if (expect.dietary) checks.dietary = expect.dietary.every((d) => (r.foodPreferences?.dietary || []).map((x) => String(x).toLowerCase()).includes(d));
  if (expect.budget) checks.budget = r.foodPreferences?.budget === expect.budget;
  if (expect.dayCount) {
    const accepted = [].concat(expect.dayCount);
    checks.days = r.startDate && r.endDate ? accepted.includes(inclusiveDays(r.startDate, r.endDate)) : false;
  }
  if (expect.tripShape) checks.shape = r.tripShape === expect.tripShape;
  if (expect.stops) checks.stops = stopNames.length >= expect.stops.length && expect.stops.every((name, i) => stopNames[i].includes(norm(name)));
  if (expect.country) checks.country = norm(r.countryTour?.country) === norm(expect.country);
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  return { checks, failed, pass: failed.length === 0 };
}

const EMERGENCY = { US: ["911"], GB: ["999", "112"], JP: ["110", "119", "112"] };

/** Structure of a travel-safety answer: parseable, expected fields present, and the country's emergency number. */
export function scoreTips(countryCode, tips, { hasChildren = true } = {}) {
  const problems = [];
  if (!tips || typeof tips !== "object") return { valid: false, problems: ["not an object"] };
  if (!["low", "medium", "high"].includes(tips.advisoryLevel)) problems.push("advisoryLevel");
  const emergency = String(tips.emergencyNumber || "");
  const accepted = EMERGENCY[countryCode];
  if (accepted && !accepted.some((n) => emergency.includes(n))) problems.push(`emergencyNumber ${emergency}`);
  for (const key of ["healthTips", "familyTips", "localCustoms"]) if (!Array.isArray(tips[key]) || !tips[key].length) problems.push(key);
  if (!tips.waterSafety) problems.push("waterSafety");
  if (hasChildren && !String(tips.carSeatLaw || "").trim()) problems.push("carSeatLaw");
  return { valid: problems.length === 0, problems };
}

export function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}
