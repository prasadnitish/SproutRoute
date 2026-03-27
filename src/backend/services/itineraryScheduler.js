// itineraryScheduler.js — Maps AI-generated activities to real business hours
// and produces a timed, optimized daily schedule.
//
// Input:  raw AI dailyItinerary + suggestedActivities + enriched Places data
// Output: scheduledItinerary with actual times, travel gaps, conflict warnings

import { log } from "../utils/logger.js";

// ── Time slot defaults (family-friendly) ───────────────────────────────────

const DEFAULT_SLOTS = {
  morning:   { start: "09:00", end: "12:00" },
  lunch:     { start: "12:00", end: "13:30" },
  afternoon: { start: "13:30", end: "17:00" },
  dinner:    { start: "18:00", end: "19:30" },
  evening:   { start: "19:30", end: "21:00" },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function parseTime(str) {
  if (!str) return null;
  const m = str.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

function parseDuration(durationStr) {
  if (!durationStr) return 120; // default 2 hours
  const lower = durationStr.toLowerCase();
  if (lower.includes("full day")) return 360;
  if (lower.includes("half day")) return 240;
  const hourMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*h/);
  if (hourMatch) {
    const lo = parseFloat(hourMatch[1]);
    const hi = hourMatch[2] ? parseFloat(hourMatch[2]) : lo;
    return Math.round(((lo + hi) / 2) * 60);
  }
  const minMatch = lower.match(/(\d+)\s*min/);
  if (minMatch) return parseInt(minMatch[1]);
  return 120;
}

/**
 * Parse Google Places weekday descriptions to check if open on a given day.
 * weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM", "Tuesday: Closed", ...]
 * dayOfWeek: 0 (Sunday) to 6 (Saturday)
 */
function getOpeningHoursForDay(weekdayDescriptions, dayOfWeek) {
  if (!weekdayDescriptions || weekdayDescriptions.length === 0) {
    return { isOpen: true, open: null, close: null }; // assume open if no data
  }

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const targetDay = dayNames[dayOfWeek];
  const entry = weekdayDescriptions.find(d => d.startsWith(targetDay));

  if (!entry) return { isOpen: true, open: null, close: null };

  const lower = entry.toLowerCase();
  if (lower.includes("closed")) return { isOpen: false, open: null, close: null };
  if (lower.includes("open 24 hours") || lower.includes("24 hours")) {
    return { isOpen: true, open: 0, close: 1440 };
  }

  // Parse "Monday: 9:00 AM – 5:00 PM"
  const timeMatch = entry.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[–-]\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (!timeMatch) return { isOpen: true, open: null, close: null };

  const openTime = parseAmPm(timeMatch[1]);
  const closeTime = parseAmPm(timeMatch[2]);

  return { isOpen: true, open: openTime, close: closeTime };
}

function parseAmPm(timeStr) {
  const match = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const isPm = match[3].toUpperCase() === "PM";
  if (isPm && h !== 12) h += 12;
  if (!isPm && h === 12) h = 0;
  return h * 60 + m;
}

function estimateTravelMinutes(/* from, to */) {
  // Rough estimate: 20 min between activities in the same city
  // Future: use Google Distance Matrix API for real estimates
  return 20;
}

// ── Main Scheduler ─────────────────────────────────────────────────────────

/**
 * Schedule a single day's activities into timed slots.
 *
 * @param {object} day - { day: "Day 1 (2026-05-21)", activities: [...] }
 * @param {object[]} suggestedActivities - full activity objects from AI
 * @param {object} enrichedMap - { activityName: placesData } from Google Places
 * @param {string} dateStr - "2026-05-21"
 * @returns {object} scheduled day with timed activities
 */
function scheduleDay(day, suggestedActivities, enrichedMap, dateStr) {
  const activityMap = {};
  (suggestedActivities || []).forEach(a => { if (a.id) activityMap[a.id] = a; });

  const rawActivities = day.activities || [];
  const dayOfWeek = dateStr ? new Date(dateStr + "T12:00:00Z").getDay() : null;

  let currentTime = parseTime(DEFAULT_SLOTS.morning.start); // 9:00 AM = 540
  const scheduled = [];
  const warnings = [];

  for (const actRef of rawActivities) {
    const activity = typeof actRef === "string" ? activityMap[actRef] : actRef;
    if (!activity) continue;

    const name = activity.name || activity.title || actRef;
    const enriched = enrichedMap[name] || enrichedMap[actRef] || null;
    const duration = parseDuration(activity.duration);

    // Check opening hours
    let hours = null;
    if (enriched?.openingHours && dayOfWeek !== null) {
      hours = getOpeningHoursForDay(enriched.openingHours, dayOfWeek);
    }

    // Determine start time
    let startTime = currentTime;

    if (hours && !hours.isOpen) {
      warnings.push({
        activity: name,
        type: "closed",
        message: `${name} is closed on this day`,
      });
      // Still include but mark as closed
      scheduled.push({
        ...activity,
        name,
        scheduledStart: null,
        scheduledEnd: null,
        duration,
        status: "closed",
        warning: `Closed on this day — consider swapping`,
        enriched: enriched ? {
          rating: enriched.rating,
          address: enriched.address,
          phone: enriched.phone,
          website: enriched.website,
          photos: enriched.photos,
          mapsUrl: enriched.mapsUrl,
          priceLevel: enriched.priceLevel,
        } : null,
      });
      continue;
    }

    // If place opens later than our current time, wait
    if (hours?.open && hours.open > startTime) {
      startTime = hours.open;
    }

    // Insert lunch break if crossing noon
    if (currentTime < 720 && startTime + duration > 720) {
      // Activity goes past noon — check if we should eat first
      if (startTime < 720 && duration > 60) {
        // It's a long activity that starts before noon, let it run
      } else if (startTime >= 660 && startTime < 780) {
        // We're near lunch time, insert break
        scheduled.push({
          name: day.meals || "Lunch break",
          category: "dining",
          scheduledStart: formatTime(720),
          scheduledEnd: formatTime(810),
          duration: 90,
          status: "meal",
          isMeal: true,
        });
        startTime = 810; // 1:30 PM
      }
    }

    // Insert dinner if we're past 5:30 PM and haven't had it
    const hasDinner = scheduled.some(s => s.isMeal && parseTime(s.scheduledStart?.replace(/\s*(AM|PM)/i, "")) >= 1020);
    if (startTime >= 1050 && !hasDinner) {
      scheduled.push({
        name: "Dinner",
        category: "dining",
        scheduledStart: formatTime(1080),
        scheduledEnd: formatTime(1170),
        duration: 90,
        status: "meal",
        isMeal: true,
      });
      startTime = 1170;
    }

    const endTime = startTime + duration;

    // Check if activity runs past closing time
    let closeWarning = null;
    if (hours?.close && endTime > hours.close) {
      closeWarning = `Closes at ${formatTime(hours.close)} — plan to arrive by ${formatTime(hours.close - duration)}`;
      warnings.push({ activity: name, type: "closes_early", message: closeWarning });
    }

    scheduled.push({
      ...activity,
      name,
      scheduledStart: formatTime(startTime),
      scheduledEnd: formatTime(endTime),
      duration,
      status: "scheduled",
      warning: closeWarning,
      openingHours: hours?.open ? `${formatTime(hours.open)} - ${formatTime(hours.close)}` : null,
      enriched: enriched ? {
        rating: enriched.rating,
        address: enriched.address,
        phone: enriched.phone,
        website: enriched.website,
        photos: enriched.photos,
        mapsUrl: enriched.mapsUrl,
        priceLevel: enriched.priceLevel,
      } : null,
    });

    currentTime = endTime + estimateTravelMinutes();
  }

  return {
    day: day.day,
    date: dateStr,
    scheduled,
    warnings,
    notes: day.notes,
  };
}

/**
 * Schedule an entire trip's itinerary.
 *
 * @param {object} tripPlan - AI-generated plan with dailyItinerary + suggestedActivities
 * @param {object} enrichedMap - { activityName: placesData }
 * @param {string} startDate - "2026-05-21"
 * @returns {object[]} Array of scheduled days
 */
export function scheduleItinerary(tripPlan, enrichedMap = {}, startDate = null) {
  const { dailyItinerary = [], suggestedActivities = [] } = tripPlan;

  return dailyItinerary.map((day, i) => {
    let dateStr = null;
    if (startDate) {
      const d = new Date(startDate + "T12:00:00Z");
      d.setDate(d.getDate() + i);
      dateStr = d.toISOString().split("T")[0];
    }
    return scheduleDay(day, suggestedActivities, enrichedMap, dateStr);
  });
}

/**
 * Batch enrich activities and build the enrichedMap.
 *
 * @param {object[]} suggestedActivities - from AI plan
 * @param {string} destination - trip destination
 * @param {function} enrichFn - enrichActivity function (injected for testing)
 * @returns {object} { activityName: placesData }
 */
export async function batchEnrich(suggestedActivities, destination, enrichFn) {
  const enrichedMap = {};

  // Enrich up to 10 activities in parallel (rate-limit friendly)
  const activities = (suggestedActivities || []).slice(0, 10);
  const results = await Promise.allSettled(
    activities.map(async (activity) => {
      const name = activity.name || activity.title || "";
      if (!name) return null;
      try {
        const data = await enrichFn(name, destination, activity.category);
        if (data) enrichedMap[name] = data;
        // Also map by ID for lookup
        if (data && activity.id) enrichedMap[activity.id] = data;
      } catch (err) {
        log.warn("Enrich failed for activity", { name, error: err.message });
      }
    })
  );

  const enriched = results.filter(r => r.status === "fulfilled").length;
  log.info("Batch enrich complete", { total: activities.length, enriched, destination });

  return enrichedMap;
}
