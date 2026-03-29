/**
 * tripPlanChunked.test.js — TDD Red for chunked trip plan generation
 *
 * Tests that long trips (8-21 days) are split into 7-day chunks,
 * generated independently, and merged into a single tripPlan.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { computeChunks, mergeTripPlanChunks } from "../../src/backend/services/tripPlanAI.js";

// ── computeChunks — splits date range into 7-day chunks ────────────────────

test("computeChunks: 7-day trip → 1 chunk", () => {
  const chunks = computeChunks("2026-05-01", "2026-05-08");
  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].startDate, "2026-05-01");
  assert.strictEqual(chunks[0].endDate, "2026-05-08");
  assert.strictEqual(chunks[0].chunkIndex, 0);
  assert.strictEqual(chunks[0].totalChunks, 1);
});

test("computeChunks: 5-day trip → 1 chunk", () => {
  const chunks = computeChunks("2026-05-01", "2026-05-06");
  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].startDate, "2026-05-01");
  assert.strictEqual(chunks[0].endDate, "2026-05-06");
});

test("computeChunks: 12-day trip → 2 chunks (7 + 5)", () => {
  const chunks = computeChunks("2026-05-01", "2026-05-13");
  assert.strictEqual(chunks.length, 2);
  assert.strictEqual(chunks[0].startDate, "2026-05-01");
  assert.strictEqual(chunks[0].endDate, "2026-05-08");
  assert.strictEqual(chunks[0].dayOffset, 0);
  assert.strictEqual(chunks[1].startDate, "2026-05-08");
  assert.strictEqual(chunks[1].endDate, "2026-05-13");
  assert.strictEqual(chunks[1].dayOffset, 7);
});

test("computeChunks: 14-day trip → 2 chunks (7 + 7)", () => {
  const chunks = computeChunks("2026-05-01", "2026-05-15");
  assert.strictEqual(chunks.length, 2);
  assert.strictEqual(chunks[0].endDate, "2026-05-08");
  assert.strictEqual(chunks[1].startDate, "2026-05-08");
  assert.strictEqual(chunks[1].endDate, "2026-05-15");
  assert.strictEqual(chunks[1].totalChunks, 2);
});

test("computeChunks: 15-day trip → 3 chunks (7 + 7 + 1)", () => {
  const chunks = computeChunks("2026-05-01", "2026-05-16");
  assert.strictEqual(chunks.length, 3);
  assert.strictEqual(chunks[2].dayOffset, 14);
});

test("computeChunks: 21-day trip → 3 chunks (7 + 7 + 7)", () => {
  const chunks = computeChunks("2026-05-01", "2026-05-22");
  assert.strictEqual(chunks.length, 3);
  assert.strictEqual(chunks[2].dayOffset, 14);
  assert.strictEqual(chunks[2].endDate, "2026-05-22");
});

// ── mergeTripPlanChunks — combines chunk results into single tripPlan ───────

const makeChunkResult = (dayCount, offset) => ({
  overview: `Overview for chunk starting at day ${offset + 1}`,
  suggestedActivities: Array.from({ length: dayCount }, (_, i) => ({
    id: `act-${offset + i + 1}`,
    name: `Activity ${offset + i + 1}`,
    category: "city",
    description: "Test activity",
    duration: "2 hours",
    kidFriendly: true,
    weatherDependent: false,
    bestDays: [`Day ${offset + i + 1}`],
    reason: "Test",
  })),
  dailyItinerary: Array.from({ length: dayCount }, (_, i) => ({
    day: `Day ${offset + i + 1}`,
    activities: [`act-${offset + i + 1}`],
    meals: {
      breakfast: { name: `Breakfast ${offset + i + 1}`, cuisine: "American", note: "" },
      lunch: { name: `Lunch ${offset + i + 1}`, cuisine: "Local", note: "" },
      dinner: { name: `Dinner ${offset + i + 1}`, cuisine: "Seafood", note: "" },
    },
    notes: null,
  })),
  tips: [`Tip for chunk ${offset / 7 + 1}`],
});

test("mergeTripPlanChunks: merges 2 chunks into single plan", () => {
  const chunk1 = makeChunkResult(7, 0);
  const chunk2 = makeChunkResult(5, 7);
  const merged = mergeTripPlanChunks([chunk1, chunk2]);

  assert.strictEqual(merged.dailyItinerary.length, 12, "Should have 12 days");
  assert.strictEqual(merged.suggestedActivities.length, 12, "Should have 12 activities");
  assert.strictEqual(merged.dailyItinerary[0].day, "Day 1");
  assert.strictEqual(merged.dailyItinerary[11].day, "Day 12");
  assert.ok(merged.overview.length > 0, "Overview should be non-empty");
});

test("mergeTripPlanChunks: merges 3 chunks for 21-day trip", () => {
  const chunk1 = makeChunkResult(7, 0);
  const chunk2 = makeChunkResult(7, 7);
  const chunk3 = makeChunkResult(7, 14);
  const merged = mergeTripPlanChunks([chunk1, chunk2, chunk3]);

  assert.strictEqual(merged.dailyItinerary.length, 21);
  assert.strictEqual(merged.suggestedActivities.length, 21);
  assert.strictEqual(merged.dailyItinerary[20].day, "Day 21");
});

test("mergeTripPlanChunks: single chunk returns as-is", () => {
  const chunk = makeChunkResult(5, 0);
  const merged = mergeTripPlanChunks([chunk]);

  assert.strictEqual(merged.dailyItinerary.length, 5);
  assert.strictEqual(merged.overview, chunk.overview);
});

test("mergeTripPlanChunks: deduplicates activity IDs", () => {
  const chunk1 = makeChunkResult(7, 0);
  const chunk2 = makeChunkResult(5, 7);
  // Manually add a duplicate
  chunk2.suggestedActivities.push({ ...chunk1.suggestedActivities[0] });
  const merged = mergeTripPlanChunks([chunk1, chunk2]);

  const ids = merged.suggestedActivities.map(a => a.id);
  const uniqueIds = [...new Set(ids)];
  assert.strictEqual(ids.length, uniqueIds.length, "Activity IDs should be unique");
});

test("mergeTripPlanChunks: combines tips from all chunks", () => {
  const chunk1 = makeChunkResult(7, 0);
  const chunk2 = makeChunkResult(5, 7);
  const merged = mergeTripPlanChunks([chunk1, chunk2]);

  assert.ok(merged.tips.length >= 2, "Tips should combine from both chunks");
});
