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

/** "9:00 AM – 5:00 PM; closed Mon": the most common hours text, then the closed days. */
export function summarizeHours(openingHours) {
  const lines = openingHours?.weekdayDescriptions;
  if (!Array.isArray(lines) || !lines.length) return "";
  const counts = new Map();
  const closed = [];
  for (const line of lines) {
    const [day, ...rest] = String(line).split(":");
    const text = rest.join(":").trim();
    if (!text) continue;
    if (/^closed$/i.test(text)) closed.push(DAY_ABBREVIATIONS[day.trim().toLowerCase()] || day.trim());
    else counts.set(text, (counts.get(text) || 0) + 1);
  }
  const typical = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  return [typical, closed.length ? `closed ${closed.join(", ")}` : ""].filter(Boolean).join("; ");
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
    const match = candidates
      .map((row) => ({ row, score: nameScore(name, row.canonical_name) }))
      .filter((entry) => entry.score >= PLAN_MATCH_SCORE)
      .sort((a, b) => b.score - a.score)[0]?.row;
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
