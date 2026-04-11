/**
 * dateCalc.js — Date arithmetic helpers
 *
 * Centralises inclusive day-count logic so every call site
 * agrees that "Apr 18 → Apr 19" = 2 days (both dates included).
 */

/**
 * Return the number of calendar days in the range [startDate, endDate],
 * inclusive of both endpoints.
 *
 * Examples:
 *   inclusiveDayCount("2026-04-18", "2026-04-19") → 2  (Sat + Sun)
 *   inclusiveDayCount("2026-04-18", "2026-04-18") → 1  (same-day trip)
 *   inclusiveDayCount("2026-04-18", "2026-04-24") → 7  (full week)
 *
 * @param {string} startDate  ISO date string (YYYY-MM-DD)
 * @param {string} endDate    ISO date string (YYYY-MM-DD)
 * @returns {number} Positive integer ≥ 1
 */
export function inclusiveDayCount(startDate, endDate) {
  const ms = new Date(endDate) - new Date(startDate);
  return Math.max(1, Math.ceil(ms / 86400000) + 1);
}
