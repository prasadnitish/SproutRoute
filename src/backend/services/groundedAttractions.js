/**
 * Helpers for planning from grounded attractions: rows whose existence, location and open status were
 * confirmed against Google Places by the refresh job (or the on-demand fill), not written by a model.
 */
import { nameScore } from "./placesGrounding.js";

const TREND_FRESH_DAYS = 14;
const PLAN_MATCH_SCORE = 0.75;
const FINE_DINING_ASKED = /fine[- ]?dining|tasting menu|michelin/i;
const DAY_ABBREVIATIONS = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };

/** A row may be planned from only if Google confirmed it, it is still open, and nobody rejected it. */
export function isGroundedRow(row) {
  if (!row) return false;
  if (row.status !== "active") return false;
  if (!row.google_place_id || !Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return false;
  if (String(row.verification_status || "").toLowerCase() === "rejected") return false;
  if (row.business_status === "CLOSED_PERMANENTLY") return false;
  if (row.family_fit_json?.adultsOnly) return false;
  return true;
}

/** Drop venues that do not suit the travelers: formal fine dining when a child is under 8, unless asked for. */
export function excludeForTravelers(rows, { childrenAges = [], mustHaves = [], requestedActivities = [] } = {}) {
  const ages = childrenAges.filter(Number.isFinite);
  const hasYoungChild = ages.length > 0 && Math.min(...ages) < 8;
  const askedForFineDining = [...mustHaves, ...requestedActivities].some((text) => FINE_DINING_ASKED.test(String(text)));
  if (!hasYoungChild || askedForFineDining) return rows;
  return rows.filter((row) => !row.family_fit_json?.fineDining);
}

/**
 * Opening hours as one line. When every open day has the same hours: "9:00 AM – 5:00 PM; closed Mon". When they
 * differ, each run of days is spelled out so an exception such as short Sunday hours is never hidden:
 * "Mon–Sat 9:00 AM – 5:00 PM; Sun 12:00 PM – 3:00 PM".
 */
export function summarizeHours(openingHours) {
  const lines = openingHours?.weekdayDescriptions;
  if (!Array.isArray(lines) || !lines.length) return "";
  const days = [];
  for (const line of lines) {
    const [day, ...rest] = String(line).split(":");
    const text = rest.join(":").trim();
    if (!text) continue;
    days.push({ day: DAY_ABBREVIATIONS[day.trim().toLowerCase()] || day.trim(), text, closed: /^closed$/i.test(text) });
  }
  if (!days.length) return "";

  const openHours = new Set(days.filter((d) => !d.closed).map((d) => d.text));
  if (openHours.size <= 1) {
    const closedDays = days.filter((d) => d.closed).map((d) => d.day);
    return [[...openHours][0] || "", closedDays.length ? `closed ${closedDays.join(", ")}` : ""].filter(Boolean).join("; ");
  }

  const runs = [];
  for (const entry of days) {
    const last = runs[runs.length - 1];
    if (last && last.text === entry.text) last.end = entry.day;
    else runs.push({ start: entry.day, end: entry.day, text: entry.text, closed: entry.closed });
  }
  return runs
    .map((run) => `${run.start === run.end ? run.start : `${run.start}–${run.end}`} ${run.closed ? "closed" : run.text}`)
    .join("; ");
}

/** Trending means a positive score that the weekly job refreshed recently, so a stale score is not shown as news. */
export function isTrending(row, now = Date.now()) {
  if (!(Number(row?.trend_score) > 0) || !row.trend_updated_at) return false;
  const updated = Date.parse(row.trend_updated_at);
  return Number.isFinite(updated) && now - updated <= TREND_FRESH_DAYS * 86400000;
}

/**
 * Make sure up to `slots` trending venues are on the shortlist. Trending venues from the wider pool replace the
 * lowest ranked non-trending ones, so a new place can surface without crowding out the proven ones.
 */
export function ensureTrendingSlots(shortlist, pool, { maxResults = shortlist.length, slots = 2, now = Date.now() } = {}) {
  const have = new Set(shortlist.map((row) => row.id));
  const alreadyTrending = shortlist.filter((row) => isTrending(row, now)).length;
  const candidates = pool
    .filter((row) => !have.has(row.id) && isTrending(row, now))
    .sort((a, b) => Number(b.trend_score) - Number(a.trend_score));
  const need = Math.min(Math.max(slots - alreadyTrending, 0), candidates.length);
  if (need === 0) return shortlist.slice(0, maxResults);

  const kept = [...shortlist];
  let toRemove = kept.length + need - maxResults;
  for (let i = kept.length - 1; i >= 0 && toRemove > 0; i -= 1) {
    if (!isTrending(kept[i], now)) {
      kept.splice(i, 1);
      toRemove -= 1;
    }
  }
  return [...kept, ...candidates.slice(0, need)].slice(0, maxResults);
}

function matchCandidate(name, candidates) {
  return candidates
    .map((row) => ({ row, score: nameScore(name, row.canonical_name) }))
    .filter((entry) => entry.score >= PLAN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score)[0]?.row;
}

function photoUrl(photoRef) {
  return photoRef ? `/api/v1/places/photo?ref=${encodeURIComponent(photoRef)}` : null;
}

/**
 * Attach rating, photo, price and a trending flag to the activities that match a candidate, and report how
 * many activities came from the database. An activity that matches nothing is marked grounded: false.
 * @returns {{tripPlan: object, stats: {total: number, matched: number, ratio: number, unmatched: string[]} | null}}
 */
export function attachGroundingToPlan(tripPlan, candidates, { now = Date.now() } = {}) {
  const activities = tripPlan?.suggestedActivities;
  if (!Array.isArray(activities) || !activities.length || !candidates?.length) return { tripPlan, stats: null };

  const unmatched = [];
  const grounded = activities.map((activity) => {
    const name = activity?.name || "";
    const match = matchCandidate(name, candidates);
    if (!match) {
      unmatched.push(name);
      return { ...activity, grounded: false, trending: false };
    }
    return {
      ...activity,
      grounded: true,
      placeId: match.google_place_id,
      rating: match.rating == null ? null : Number(match.rating),
      ratingCount: match.rating_count ?? null,
      priceLevel: match.price_level ?? null,
      photoUrl: photoUrl(match.photo_ref),
      trending: isTrending(match, now),
    };
  });

  const matched = activities.length - unmatched.length;
  return {
    tripPlan: { ...tripPlan, suggestedActivities: grounded },
    stats: { total: activities.length, matched, ratio: matched / activities.length, unmatched },
  };
}

// ── Opening hours ────────────────────────────────────────────────────────────

const TIME_IN_TEXT = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/i;

function clockToMinutes(hour, minute, meridiem) {
  let h = Number(hour) % 12;
  if (/p/i.test(meridiem)) h += 12;
  return h * 60 + Number(minute || 0);
}

function formatClock(totalMinutes) {
  const minutes = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(minutes / 60);
  return `${h24 % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
}

/**
 * Minute intervals one weekday line of Google's weekdayDescriptions is open, e.g. "Monday: 10:00 AM – 5:00 PM".
 * [] means closed all day; null means the text could not be read (treated as unknown, never as closed).
 * An interval that ends after midnight keeps going past 1440.
 */
export function parseDayHours(line) {
  const text = String(line || "").split(":").slice(1).join(":").replace(/[\u202f\u2009\u00a0]/g, " ").trim();
  if (!text) return null;
  if (/^closed$/i.test(text)) return [];
  if (/open 24 hours/i.test(text)) return [[0, 1440]];
  const intervals = [];
  for (const part of text.split(",")) {
    const [from, to] = part.split(/\s*[–—-]\s*/);
    const closeMatch = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/i.exec(to || "");
    const openMatch = /(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?m\.?)?/i.exec(from || "");
    if (!closeMatch || !openMatch) return null;
    const close = clockToMinutes(closeMatch[1], closeMatch[2], closeMatch[3]);
    const open = clockToMinutes(openMatch[1], openMatch[2], openMatch[3] || closeMatch[3]);
    intervals.push([open, close <= open ? close + 1440 : close]);
  }
  return intervals;
}

function durationMinutes(text) {
  const value = String(text || "");
  const hours = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i.exec(value);
  const minutes = /(\d+)\s*(?:minutes?|mins?|m)\b/i.exec(value);
  const total = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  return total > 0 ? total : null;
}

function intervalsFor(candidate, weekdayIndex) {
  const lines = candidate?.opening_hours?.weekdayDescriptions;
  return Array.isArray(lines) && lines[weekdayIndex] ? parseDayHours(lines[weekdayIndex]) : null;
}

const fitsInside = (intervals, start, duration) => intervals.some(([open, close]) => start >= open && start + duration <= close);

/** The start time that fits the stop inside the open intervals with the smallest move, or the opening time if none is long enough. */
function nearestFit(intervals, start, duration) {
  let best = null;
  for (const [open, close] of intervals) {
    const latest = close - duration;
    const candidate = latest < open ? open : Math.min(Math.max(start, open), latest);
    const shift = Math.abs(candidate - start) + (latest < open ? 10000 : 0);
    if (!best || shift < best.shift) best = { start: candidate, shift };
  }
  return best.start;
}

function weekdayIndexOf(day, index, startDate) {
  const label = /\d{4}-\d{2}-\d{2}/.exec(String(day?.day || ""))?.[0] || day?.date;
  const date = label || (startDate ? new Date(Date.parse(`${startDate}T12:00:00Z`) + index * 86400000).toISOString().slice(0, 10) : null);
  const parsed = date ? new Date(`${date}T12:00:00Z`) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? (parsed.getUTCDay() + 6) % 7 : null; // Monday = 0, like Google's list
}

const slug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Make each stop agree with the place's opening hours on the day it is planned. The model is told the hours but
 * nothing else checks them, so this does:
 *  - a time in the timing tip that runs past closing or starts before opening is moved to the nearest time that fits;
 *  - a stop at a place closed all day is swapped for an unused shortlisted place that is open at that time;
 *  - with no open replacement the stop is kept and reported.
 * Places whose hours are missing or unreadable are left alone.
 * @returns {{tripPlan: object, changes: Array<{kind: string, name: string, day: string, from?: string, to?: string, with?: string}>}}
 */
export function enforceOpeningHours(tripPlan, candidates, { startDate } = {}) {
  if (!candidates?.length || !Array.isArray(tripPlan?.suggestedActivities) || !Array.isArray(tripPlan?.dailyItinerary)) {
    return { tripPlan, changes: [] };
  }
  const activities = tripPlan.suggestedActivities.map((activity) => ({ ...activity }));
  const days = tripPlan.dailyItinerary.map((day) => ({ ...day, activities: [...(day.activities || [])] }));
  const byId = new Map(activities.map((activity, i) => [activity.id, i]));
  const used = new Set(activities.map((activity) => activity.name));
  const changes = [];

  days.forEach((day, dayIndex) => {
    const weekday = weekdayIndexOf(day, dayIndex, startDate);
    if (weekday === null) return;
    day.activities.forEach((id, slot) => {
      const position = byId.get(id);
      const activity = activities[position];
      const candidate = activity && matchCandidate(activity.name, candidates);
      const intervals = candidate ? intervalsFor(candidate, weekday) : null;
      if (!intervals) return;

      const tip = String(activity.timingTip || "");
      const tipTime = TIME_IN_TEXT.exec(tip);
      const start = tipTime ? clockToMinutes(tipTime[1], tipTime[2], tipTime[3]) : null;
      const duration = durationMinutes(activity.duration);

      if (!intervals.length) {
        const replacement = candidates.find((other) => {
          if (used.has(other.canonical_name)) return false;
          const open = intervalsFor(other, weekday);
          return open && open.length && (start === null || duration === null || fitsInside(open, start, duration));
        });
        if (!replacement) {
          changes.push({ kind: "closed_no_replacement", name: activity.name, day: day.day });
          return;
        }
        used.add(replacement.canonical_name);
        const id2 = `${slug(replacement.canonical_name)}`;
        activities[position] = {
          id: id2,
          name: replacement.canonical_name,
          category: replacement.category || "general",
          description: replacement.short_summary || "",
          whatItIs: replacement.short_summary || "",
          whyRecommended: "",
          timingTip: start === null ? "" : `Arrive around ${formatClock(start)}.`,
          duration: activity.duration,
          kidFriendly: true,
          weatherDependent: replacement.indoor_outdoor === "outdoor",
        };
        day.activities[slot] = id2;
        byId.delete(id);
        byId.set(id2, position);
        changes.push({ kind: "replaced", name: activity.name, day: day.day, with: replacement.canonical_name });
        return;
      }

      if (start === null || duration === null || fitsInside(intervals, start, duration)) return;
      const moved = nearestFit(intervals, start, duration);
      activities[position] = { ...activity, timingTip: tip.replace(TIME_IN_TEXT, formatClock(moved)) };
      changes.push({ kind: "moved", name: activity.name, day: day.day, from: formatClock(start), to: formatClock(moved) });
    });
  });

  return changes.length ? { tripPlan: { ...tripPlan, suggestedActivities: activities, dailyItinerary: days }, changes } : { tripPlan, changes };
}
