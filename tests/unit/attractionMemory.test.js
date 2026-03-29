import test from "node:test";
import assert from "node:assert/strict";

import {
  areNamesNearDuplicate,
  buildCachedAttractionsSummary,
  collapseDuplicateAttractions,
  createAttractionMemoryService,
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

test("collapseDuplicateAttractions merges near-duplicate names", () => {
  const deduped = collapseDuplicateAttractions([
    {
      canonical_name: "Stearns Wharf",
      category: "parks",
      times_seen: 2,
      _score: 10,
    },
    {
      canonical_name: "Stearns Wharf & Sea Center",
      category: "parks",
      times_seen: 1,
      _score: 8,
    },
  ]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].canonical_name, "Stearns Wharf");
  assert.equal(deduped[0].times_seen, 2);
  assert.equal(areNamesNearDuplicate("Stearns Wharf", "Stearns Wharf & Sea Center"), true);
});

test("persistTripAttractions stores place identity and verification cache entries", async () => {
  const state = {
    cities: [],
    attractions: [],
    verification: [],
  };

  function makeQuery(table, selected = null) {
    const ctx = { table, filters: [], selected };

    const api = {
      select(columns) {
        ctx.selected = columns;
        return api;
      },
      eq(column, value) {
        ctx.filters.push((row) => row[column] === value);
        return api;
      },
      ilike(column, value) {
        const needle = String(value).replace(/%/g, "").toLowerCase();
        ctx.filters.push((row) => String(row[column] || "").toLowerCase().includes(needle));
        return api;
      },
      limit() {
        return api;
      },
      then(resolve, reject) {
        return Promise.resolve({ data: applyFilters(), error: null }).then(resolve, reject);
      },
      maybeSingle: async () => {
        const rows = applyFilters();
        return { data: rows[0] || null, error: null };
      },
      insert(payload) {
        const rows = Array.isArray(payload) ? payload : [payload];
        let insertedRows = [];
        if (table === "cities") {
          rows.forEach((row, index) => state.cities.push({ id: row.id || `city-${state.cities.length + index + 1}`, ...row }));
          insertedRows = state.cities.slice(-rows.length);
        } else if (table === "city_attractions") {
          rows.forEach((row, index) => state.attractions.push({ id: row.id || `attr-${state.attractions.length + index + 1}`, ...row }));
          insertedRows = state.attractions.slice(-rows.length);
        } else if (table === "attraction_verification_cache") {
          rows.forEach((row, index) => state.verification.push({ id: row.id || `ver-${state.verification.length + index + 1}`, ...row }));
          insertedRows = state.verification.slice(-rows.length);
        }

        return {
          select() {
            return {
              limit: async () => ({ data: insertedRows, error: null }),
            };
          },
          then(resolve, reject) {
            return Promise.resolve({ data: insertedRows, error: null }).then(resolve, reject);
          },
        };
      },
      update(payload) {
        return {
          eq: async (column, value) => {
            const rows = applyFilters().filter((row) => row[column] === value);
            rows.forEach((row) => Object.assign(row, payload));
            return { data: rows, error: null };
          },
        };
      },
    };

    function applyFilters() {
      const source =
        table === "cities" ? state.cities :
        table === "city_attractions" ? state.attractions :
        table === "attraction_verification_cache" ? state.verification : [];
      return source.filter((row) => ctx.filters.every((filter) => filter(row)));
    }

    return api;
  }

  const admin = {
    from(table) {
      return makeQuery(table);
    },
  };

  const service = createAttractionMemoryService({
    getAdmin: () => admin,
    resolvePlaceIdentity: async () => ({
      placeId: "place-123",
      name: "Santa Barbara Zoo",
      address: "500 Ninos Dr, Santa Barbara, CA",
      mapsUrl: "https://maps.google.com/example",
      rating: 4.8,
      userRatingsTotal: 1000,
    }),
  });

  await service.persistTripAttractions({
    destination: "Santa Barbara, CA",
    coords: { displayName: "Santa Barbara, California", countryCode: "US", lat: 34.42, lon: -119.7 },
    countryCode: "US",
    tripPlan: {
      suggestedActivities: [
        {
          name: "Santa Barbara Zoo",
          category: "wildlife",
          whatItIs: "A kid-friendly zoo by the coast.",
          whyRecommended: "Easy half-day stop for young kids.",
          timingTip: "Go early.",
          duration: "half day",
          kidFriendly: true,
        },
      ],
    },
  });

  assert.equal(state.cities.length, 1);
  assert.equal(state.attractions.length, 1);
  assert.equal(state.attractions[0].google_place_id, "place-123");
  assert.equal(state.attractions[0].verification_status, "verified");
  assert.equal(state.verification.length, 1);
  assert.equal(state.verification[0].provider, "google_places_identity");
});
