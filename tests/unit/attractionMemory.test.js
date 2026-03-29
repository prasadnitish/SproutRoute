import test from "node:test";
import assert from "node:assert/strict";

import {
  areNamesNearDuplicate,
  attachVerificationFreshness,
  buildCachedAttractionsSummary,
  collapseDuplicateAttractions,
  classifyVerificationFreshness,
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

test("classifyVerificationFreshness distinguishes fresh, aging, stale, and unverified entries", () => {
  const now = new Date("2026-03-29T12:00:00.000Z").getTime();

  assert.equal(classifyVerificationFreshness(null, now), "unverified");
  assert.equal(classifyVerificationFreshness({
    verified_at: "2026-03-28T12:00:00.000Z",
    expires_at: "2026-04-10T12:00:00.000Z",
  }, now), "fresh");
  assert.equal(classifyVerificationFreshness({
    verified_at: "2026-03-20T12:00:00.000Z",
    expires_at: "2026-03-31T12:00:00.000Z",
  }, now), "aging");
  assert.equal(classifyVerificationFreshness({
    verified_at: "2026-03-01T12:00:00.000Z",
    expires_at: "2026-03-28T12:00:00.000Z",
  }, now), "stale");
});

test("attachVerificationFreshness and ranking prefer fresh cache entries over stale verified rows", () => {
  const attractions = attachVerificationFreshness(
    [
      {
        id: "fresh-1",
        canonical_name: "Balboa Park",
        category: "parks",
        short_summary: "Open-air park with museums and gardens.",
        kid_appeal_score: 8,
        parent_appeal_score: 8,
        stroller_friendly: true,
        verification_status: "verified",
        confidence_score: 0.9,
        times_seen: 2,
        last_seen_at: "2026-03-28T12:00:00.000Z",
      },
      {
        id: "stale-1",
        canonical_name: "Old Town Trolley",
        category: "city tours",
        short_summary: "Hop-on city sightseeing ride.",
        kid_appeal_score: 9,
        parent_appeal_score: 8,
        stroller_friendly: true,
        verification_status: "verified",
        confidence_score: 0.9,
        times_seen: 5,
        last_seen_at: "2026-03-28T12:00:00.000Z",
      },
    ],
    new Map([
      ["fresh-1", {
        verified_at: "2026-03-28T12:00:00.000Z",
        expires_at: "2026-04-10T12:00:00.000Z",
      }],
      ["stale-1", {
        verified_at: "2026-03-10T12:00:00.000Z",
        expires_at: "2026-03-20T12:00:00.000Z",
      }],
    ]),
    Date.parse("2026-03-29T12:00:00.000Z"),
  );

  const ranked = rankCandidateAttractions(attractions, {
    childrenAges: [4],
    requestedActivities: ["parks"],
    pace: "slow",
    maxResults: 5,
  });

  assert.equal(ranked[0].id, "fresh-1");
  assert.equal(ranked[0].freshness_bucket, "fresh");
  assert.equal(ranked[1].freshness_bucket, "stale");
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

test("backfillCityAttractions resolves missing place ids for legacy rows", async () => {
  const state = {
    cities: [
      {
        id: "city-1",
        city_name: "Santa Barbara",
        display_name: "Santa Barbara, California",
        country_code: "US",
        region_code: "CA",
      },
    ],
    attractions: [
      {
        id: "attr-1",
        city_id: "city-1",
        canonical_name: "Stearns Wharf",
        category: "waterfront",
        google_place_id: null,
        verification_status: "unverified",
        times_seen: 3,
      },
    ],
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
      in(column, values) {
        ctx.filters.push((row) => values.includes(row[column]));
        return api;
      },
      neq(column, value) {
        ctx.filters.push((row) => row[column] !== value);
        return api;
      },
      limit() {
        return api;
      },
      order() {
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
            const source =
              table === "cities" ? state.cities :
              table === "city_attractions" ? state.attractions :
              table === "attraction_verification_cache" ? state.verification : [];
            const rows = source.filter((row) => row[column] === value && ctx.filters.every((filter) => filter(row)));
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
      placeId: "place-stearns",
      name: "Stearns Wharf",
      address: "217 Stearns Wharf, Santa Barbara, CA",
      mapsUrl: "https://maps.google.com/example",
      rating: 4.7,
      userRatingsTotal: 5000,
    }),
  });

  const result = await service.backfillCityAttractions({
    destination: "Santa Barbara, CA",
    coords: { displayName: "Santa Barbara, California", countryCode: "US" },
    countryCode: "US",
    limit: 10,
  });

  assert.equal(result.updated, 1);
  assert.equal(result.scanned, 1);
  assert.equal(state.attractions[0].google_place_id, "place-stearns");
  assert.equal(state.attractions[0].verification_status, "verified");
  assert.equal(state.verification.length, 1);
});
