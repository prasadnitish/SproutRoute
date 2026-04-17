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
  refreshStaleCandidates,
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

test("buildCachedAttractionsSummary supports compact shortlist formatting for larger candidate pools", () => {
  const summary = buildCachedAttractionsSummary([
    {
      canonical_name: "Waikiki Aquarium",
      category: "wildlife",
      city_display_name: "Honolulu",
      indoor_outdoor: "indoor",
      duration_bucket: "1_2h",
      verification_status: "verified",
    },
    {
      canonical_name: "Bishop Museum",
      category: "museums",
      city_display_name: "Honolulu",
      indoor_outdoor: "indoor",
      duration_bucket: "2_4h",
      verification_status: "verified",
    },
  ], { compact: true, maxItems: 2 });

  assert.match(summary, /Waikiki Aquarium \| wildlife/i);
  assert.match(summary, /area: Honolulu/i);
  assert.doesNotMatch(summary, /what it is:/i);
  assert.doesNotMatch(summary, /why it fits:/i);
});

test("rankCandidateAttractions diversifies shortlist across categories and cities", () => {
  const ranked = rankCandidateAttractions(
    [
      {
        id: "beach-1",
        city_id: "honolulu",
        canonical_name: "Waikiki Beach",
        category: "beach",
        short_summary: "Famous beach.",
        kid_appeal_score: 9,
        parent_appeal_score: 9,
        confidence_score: 0.95,
        verification_status: "verified",
        times_seen: 10,
        last_seen_at: new Date().toISOString(),
      },
      {
        id: "beach-2",
        city_id: "honolulu",
        canonical_name: "Kuhio Beach",
        category: "beach",
        short_summary: "Calm family beach.",
        kid_appeal_score: 9,
        parent_appeal_score: 8,
        confidence_score: 0.94,
        verification_status: "verified",
        times_seen: 9,
        last_seen_at: new Date().toISOString(),
      },
      {
        id: "beach-3",
        city_id: "honolulu",
        canonical_name: "Ala Moana Regional Park",
        category: "beach",
        short_summary: "Protected beach park.",
        kid_appeal_score: 8,
        parent_appeal_score: 8,
        confidence_score: 0.93,
        verification_status: "verified",
        times_seen: 8,
        last_seen_at: new Date().toISOString(),
      },
      {
        id: "wildlife-1",
        city_id: "honolulu",
        canonical_name: "Waikiki Aquarium",
        category: "wildlife",
        short_summary: "Compact aquarium.",
        kid_appeal_score: 8,
        parent_appeal_score: 8,
        confidence_score: 0.9,
        verification_status: "verified",
        times_seen: 5,
        last_seen_at: new Date().toISOString(),
      },
      {
        id: "museum-1",
        city_id: "honolulu",
        canonical_name: "Bishop Museum",
        category: "museums",
        short_summary: "Culture and science museum.",
        kid_appeal_score: 7,
        parent_appeal_score: 8,
        confidence_score: 0.88,
        verification_status: "verified",
        times_seen: 4,
        last_seen_at: new Date().toISOString(),
      },
      {
        id: "wildlife-2",
        city_id: "maui",
        canonical_name: "Maui Ocean Center",
        category: "wildlife",
        short_summary: "Large marine center.",
        kid_appeal_score: 8,
        parent_appeal_score: 8,
        confidence_score: 0.87,
        verification_status: "verified",
        times_seen: 4,
        last_seen_at: new Date().toISOString(),
      },
    ],
    {
      childrenAges: [4],
      requestedActivities: ["beach"],
      pace: "moderate",
      maxResults: 4,
    },
  );

  const categories = new Set(ranked.map((row) => row.category));
  const cityIds = new Set(ranked.map((row) => row.city_id));

  assert.ok(categories.size >= 3, "shortlist should preserve variety across categories");
  assert.ok(cityIds.size >= 2, "shortlist should preserve variety across city pools when available");
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

test("getPlanningCandidates uses region attraction pools for broad destinations like Hawaii", async () => {
  const state = {
    cities: [
      {
        id: "city-hi-broad",
        city_name: "Hawaii",
        display_name: "Hawaii, United States",
        country_code: "US",
        region_code: "HI",
        lat: 19.9,
        lon: -155.5,
      },
      {
        id: "city-honolulu",
        city_name: "Honolulu",
        display_name: "Honolulu, Hawaii",
        country_code: "US",
        region_code: "HI",
        lat: 21.3069,
        lon: -157.8583,
      },
      {
        id: "city-maui",
        city_name: "Maui",
        display_name: "Maui, Hawaii",
        country_code: "US",
        region_code: "HI",
        lat: 20.7984,
        lon: -156.3319,
      },
      {
        id: "city-kauai",
        city_name: "Kauai",
        display_name: "Kauai, Hawaii",
        country_code: "US",
        region_code: "HI",
        lat: 22.0964,
        lon: -159.5261,
      },
    ],
    attractions: [
      {
        id: "attr-broad",
        city_id: "city-hi-broad",
        canonical_name: "Generic Hawaii Beach",
        category: "beach",
        short_summary: "A generic placeholder attraction.",
        kid_appeal_score: 2,
        parent_appeal_score: 2,
        confidence_score: 0.2,
        verification_status: "unverified",
        times_seen: 1,
      },
      {
        id: "attr-honolulu",
        city_id: "city-honolulu",
        canonical_name: "Honolulu Zoo",
        category: "wildlife",
        short_summary: "A real Honolulu family stop.",
        kid_appeal_score: 9,
        parent_appeal_score: 7,
        confidence_score: 0.9,
        verification_status: "verified",
        stroller_friendly: true,
        times_seen: 5,
        last_seen_at: new Date().toISOString(),
      },
      {
        id: "attr-maui",
        city_id: "city-maui",
        canonical_name: "Maui Ocean Center",
        category: "wildlife",
        short_summary: "Aquarium and marine exhibits.",
        kid_appeal_score: 8,
        parent_appeal_score: 7,
        confidence_score: 0.88,
        verification_status: "verified",
        stroller_friendly: true,
        times_seen: 4,
        last_seen_at: new Date().toISOString(),
      },
      {
        id: "attr-kauai",
        city_id: "city-kauai",
        canonical_name: "Lydgate Beach Park",
        category: "beach",
        short_summary: "Protected family beach with calm water.",
        kid_appeal_score: 8,
        parent_appeal_score: 8,
        confidence_score: 0.85,
        verification_status: "verified",
        stroller_friendly: true,
        times_seen: 3,
        last_seen_at: new Date().toISOString(),
      },
    ],
    verification: [],
  };

  function makeQuery(table) {
    const ctx = { filters: [] };
    const api = {
      select() { return api; },
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
      limit() { return api; },
      order() { return api; },
      then(resolve, reject) {
        const source =
          table === "cities" ? state.cities :
          table === "city_attractions" ? state.attractions :
          state.verification;
        const rows = source.filter((row) => ctx.filters.every((filter) => filter(row)));
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return api;
  }

  const admin = {
    from(table) {
      return makeQuery(table);
    },
  };

  const service = createAttractionMemoryService({
    getAdmin: () => admin,
    resolvePlaceIdentity: async () => null,
  });

  const results = await service.getPlanningCandidates({
    destination: "Hawaii, USA",
    coords: {
      displayName: "Hawaii, United States",
      stateName: "Hawaii",
      regionCode: "HI",
      countryCode: "US",
      lat: 20.8,
      lon: -156.5,
    },
    countryCode: "US",
    childrenAges: [2],
    requestedActivities: ["beach", "wildlife"],
    pace: "slow",
    maxResults: 5,
  });

  const names = results.map((row) => row.canonical_name);
  assert.ok(names.includes("Honolulu Zoo"), "regional pool should include Honolulu attractions");
  assert.ok(names.includes("Maui Ocean Center"), "regional pool should include Maui attractions");
  assert.ok(
    names.includes("Lydgate Beach Park"),
    "regional pool should include other Hawaii island attractions",
  );
  assert.ok(names.length >= 3, "broad regional queries should not collapse to a single city match");
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

// ── Phase 2: refreshStaleCandidates ─────────────────────────────────────────

test("refreshStaleCandidates returns original candidates when none are stale", async () => {
  const candidates = [
    { id: "a1", canonical_name: "Zoo", freshness_bucket: "fresh", category: "wildlife" },
    { id: "a2", canonical_name: "Park", freshness_bucket: "aging", category: "parks" },
  ];

  const mockAdmin = { from() { throw new Error("should not touch DB"); } };
  let resolveCalled = false;
  const mockResolve = async () => { resolveCalled = true; return null; };

  const result = await refreshStaleCandidates(mockAdmin, candidates, "Santa Barbara", mockResolve);

  assert.equal(result.length, 2);
  assert.equal(resolveCalled, false, "resolvePlaceIdentity should not be called when nothing is stale");
  assert.equal(result[0].id, "a1");
});

test("refreshStaleCandidates refreshes stale candidates without blocking", async () => {
  const state = {
    attractions: [
      { id: "a1", city_id: "c1", canonical_name: "Stale Wharf", freshness_bucket: "stale", category: "waterfront", verification_status: "stale" },
    ],
    verification: [],
  };

  function makeQuery(table) {
    const ctx = { filters: [] };
    const api = {
      select() { return api; },
      eq(col, val) { ctx.filters.push((r) => r[col] === val); return api; },
      in(col, vals) { ctx.filters.push((r) => vals.includes(r[col])); return api; },
      order() { return api; },
      limit() { return api; },
      then(resolve, reject) {
        const source = table === "city_attractions" ? state.attractions : state.verification;
        const rows = source.filter((r) => ctx.filters.every((f) => f(r)));
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
      insert(payload) {
        const rows = Array.isArray(payload) ? payload : [payload];
        rows.forEach((r) => state.verification.push({ id: `v-${state.verification.length + 1}`, ...r }));
        return { then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); } };
      },
      update(payload) {
        return {
          eq: async (col, val) => {
            const source = table === "city_attractions" ? state.attractions : state.verification;
            source.filter((r) => r[col] === val).forEach((r) => Object.assign(r, payload));
            return { data: [], error: null };
          },
        };
      },
    };
    return api;
  }

  const mockAdmin = { from(t) { return makeQuery(t); } };
  const mockResolve = async () => ({
    placeId: "place-wharf",
    name: "Stale Wharf",
    address: "123 Pier St",
    mapsUrl: "https://maps.google.com/wharf",
    rating: 4.5,
    userRatingsTotal: 200,
  });

  const candidates = [
    { id: "a1", canonical_name: "Stale Wharf", freshness_bucket: "stale", category: "waterfront", verification_status: "stale" },
    { id: "a2", canonical_name: "Fresh Park", freshness_bucket: "fresh", category: "parks", verification_status: "verified" },
  ];

  const result = await refreshStaleCandidates(mockAdmin, candidates, "Santa Barbara", mockResolve);

  assert.equal(result.length, 2);
  // The stale candidate should be updated in the DB
  assert.equal(state.attractions[0].verification_status, "verified");
  assert.equal(state.verification.length, 1);
  // The returned list should have the refreshed candidate
  const refreshed = result.find((c) => c.id === "a1");
  assert.equal(refreshed.freshness_bucket, "fresh");
});

test("refreshStaleCandidates returns original candidates on timeout/error", async () => {
  const candidates = [
    { id: "a1", canonical_name: "Slow Place", freshness_bucket: "stale", category: "general" },
  ];

  const mockAdmin = { from() { throw new Error("DB exploded"); } };
  const mockResolve = async () => { throw new Error("Places API down"); };

  const result = await refreshStaleCandidates(mockAdmin, candidates, "Anywhere", mockResolve);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a1");
  assert.equal(result[0].freshness_bucket, "stale", "should return original unchanged candidates");
});

// ── Phase 3: collapseDuplicateAttractions merges by google_place_id ─────────

test("collapseDuplicateAttractions merges rows sharing the same google_place_id", () => {
  const deduped = collapseDuplicateAttractions([
    {
      canonical_name: "Santa Barbara Zoo",
      google_place_id: "ChIJ_zoo_123",
      times_seen: 5,
      _score: 20,
      confidence_score: 0.9,
    },
    {
      canonical_name: "SB Zoo",
      google_place_id: "ChIJ_zoo_123",
      times_seen: 2,
      _score: 10,
      confidence_score: 0.7,
    },
  ]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].canonical_name, "Santa Barbara Zoo");
  assert.equal(deduped[0].times_seen, 5);
});

test("areNamesNearDuplicate catches case-insensitive matches", () => {
  assert.equal(areNamesNearDuplicate("Stearns Wharf", "stearns wharf"), true);
  assert.equal(areNamesNearDuplicate("Stearns Wharf", "STEARNS WHARF"), true);
  assert.equal(areNamesNearDuplicate("Balboa Park", "Central Park"), false);
});
