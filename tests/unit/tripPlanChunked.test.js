/**
 * Inclusive date coverage, progressive batches, activity IDs, and cancellation.
 * Three-day batches bound the work before the first attractions become visible.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { computeChunks, generateTripPlanChunked, mergeTripPlanChunks, buildTripPlanPrompt } from "../../src/backend/services/tripPlanAI.js";

// Small inclusive batches keep the first itinerary inside a provider attempt.
for (const days of [1, 2, 3, 4, 7, 8, 12, 14, 15, 21]) {
  test(`computeChunks covers ${days} dates exactly once in batches of at most 3`, () => {
    const end = `2026-05-${String(days).padStart(2, "0")}`;
    const chunks = computeChunks("2026-05-01", end);
    assert.equal(chunks.length, Math.ceil(days / 3));
    const dates = [];
    for (const [index, chunk] of chunks.entries()) {
      assert.equal(chunk.chunkIndex, index);
      assert.equal(chunk.totalChunks, chunks.length);
      assert.equal(chunk.dayOffset, dates.length);
      const count = (Date.parse(chunk.endDate) - Date.parse(chunk.startDate)) / 86400000 + 1;
      assert.ok(count <= 3);
      for (let i = 0; i < count; i++) {
        dates.push(new Date(Date.parse(chunk.startDate) + i * 86400000).toISOString().slice(0, 10));
      }
    }
    assert.equal(dates.length, days);
    assert.equal(new Set(dates).size, days);
    assert.equal(dates[0], "2026-05-01");
    assert.equal(dates.at(-1), end);
  });
}

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

test("generateTripPlanChunked aborts before first chunk when shouldAbort is already true", async () => {
  let callCount = 0;

  await assert.rejects(
    () => generateTripPlanChunked(
      { startDate: "2026-05-01", endDate: "2026-05-12" },
      { forecast: [] },
      () => {
        throw new Error("onChunk must not be called after abort");
      },
      {
        shouldAbort: () => true,
        generateTripPlanFn: async () => {
          callCount++;
          return makeChunkResult(7, 0);
        },
      },
    ),
    (err) => {
      assert.strictEqual(err.name, "AbortError");
      assert.strictEqual(callCount, 0, "Aborted generation must not call generateTripPlan");
      return true;
    },
  );
});

test("generateTripPlanChunked stops before the next chunk after cancellation", async () => {
  let callCount = 0;
  let shouldAbort = false;
  const chunkOffsets = [];

  const merged = await generateTripPlanChunked(
    { startDate: "2026-05-01", endDate: "2026-05-12" },
    { forecast: [] },
    (_chunk, meta) => {
      chunkOffsets.push(meta.dayOffset);
      shouldAbort = true;
    },
    {
      shouldAbort: () => shouldAbort,
      generateTripPlanFn: async (tripData) => {
        callCount++;
        return tripData.startDate === "2026-05-01"
          ? makeChunkResult(7, 0)
          : makeChunkResult(5, 7);
      },
    },
  ).catch((err) => err);

  assert.strictEqual(merged.name, "AbortError");
  assert.strictEqual(callCount, 1, "Chunk generation must stop before the second chunk");
  assert.deepStrictEqual(chunkOffsets, [0], "Only the first chunk should be emitted");
});

test("Florida eight-day generation emits first three dates before requesting the next batch", async () => {
  const calls = []; const emitted = [];
  const result = await generateTripPlanChunked(
    {destination:"Florida, USA", startDate:"2026-12-20", endDate:"2026-12-27"},
    {forecast:[]},
    (plan, meta) => emitted.push({plan, meta}),
    {generateTripPlanFn: async (input) => {
      assert.equal(emitted.length, calls.length, "previous batch is visible before the next model call");
      calls.push(input);
      const days = (Date.parse(input.endDate)-Date.parse(input.startDate))/86400000+1;
      const plan = makeChunkResult(days, 0);
      plan.suggestedActivities.forEach(a => {a.name = input.startDate + a.name});
      // A continuation can keep global labels rather than restarting at Day 1.
      if (calls.length === 2) plan.dailyItinerary.forEach((day,i)=>{day.day=`Day ${i+4}`});
      return plan;
    }},
  );
  assert.deepEqual(calls.map(c=>[c.startDate,c.endDate]), [
    ["2026-12-20","2026-12-22"],["2026-12-23","2026-12-25"],["2026-12-26","2026-12-27"],
  ]);
  assert.equal(result.dailyItinerary.length,8);
  assert.equal(result.suggestedActivities.length,8,"local activity IDs must not discard later attractions");
  const ids=result.suggestedActivities.map(a=>a.id);
  assert.equal(new Set(ids).size,8);
  for (let i=0;i<8;i++) {
    assert.match(result.dailyItinerary[i].day,new RegExp(`^Day ${i+1}\\b`));
    assert.equal(result.dailyItinerary[i].activities[0],ids[i]);
  }
  assert.match(calls[1]._continuationContext,/2026-12-20Activity 1/);
});

test("later batches include previously planned attractions in the actual model prompt",()=>{
  const prompt=buildTripPlanPrompt("Florida","2026-12-23","2026-12-25",[],[],{summary:"Mild",forecast:[]},{continuationContext:"Activities already suggested: Magic Kingdom. Avoid repeats."});
  assert.match(prompt.user,/Activities already suggested: Magic Kingdom/);
});
