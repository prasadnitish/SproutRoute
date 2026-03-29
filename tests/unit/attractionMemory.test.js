import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCachedAttractionsSummary,
  rankCandidateAttractions,
} from "../../src/backend/services/attractionMemory.js";

test("rankCandidateAttractions prioritizes kid-friendly fresh verified matches", () => {
  const ranked = rankCandidateAttractions(
    [
      {
        canonical_name: "Balboa Park",
        category: "parks",
        short_summary: "Open-air park with museums and gardens.",
        kid_appeal_score: 9,
        parent_appeal_score: 8,
        stroller_friendly: true,
        rainy_day_fit: false,
        verification_status: "verified",
        confidence_score: 0.9,
        times_seen: 6,
        last_seen_at: new Date().toISOString(),
      },
      {
        canonical_name: "Nightclub District",
        category: "nightlife",
        short_summary: "Busy late-night area with bars.",
        kid_appeal_score: 1,
        parent_appeal_score: 6,
        stroller_friendly: false,
        rainy_day_fit: false,
        verification_status: "unverified",
        confidence_score: 0.4,
        times_seen: 1,
        last_seen_at: "2025-01-01T00:00:00.000Z",
      },
    ],
    {
      childrenAges: [4],
      requestedActivities: ["parks", "family-friendly"],
      pace: "slow",
      maxResults: 5,
    },
  );

  assert.equal(ranked[0].canonical_name, "Balboa Park");
});

test("buildCachedAttractionsSummary keeps the prompt compact and explanatory", () => {
  const summary = buildCachedAttractionsSummary([
    {
      canonical_name: "Balboa Park",
      category: "parks",
      short_summary: "Open-air park with museums and gardens.",
      why_recommended: "Works well for slow-paced families with a stroller.",
      timing_tip: "Visit in the morning.",
      verification_status: "verified",
    },
    {
      canonical_name: "Birch Aquarium",
      category: "wildlife",
      short_summary: "Compact aquarium with strong kid appeal.",
      why_recommended: "Great rainy-day backup for toddlers.",
      timing_tip: "Reserve timed entry.",
      verification_status: "stale",
    },
  ]);

  assert.match(summary, /Balboa Park/);
  assert.match(summary, /Birch Aquarium/);
  assert.match(summary, /verified/i);
  assert.match(summary, /rainy-day/i);
});
