import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSharedTripSnapshot } from '../../src/shared/shareSnapshot.js';
import { createTripShareStore, SHARE_TTL_MS } from '../../src/backend/services/tripShareStore.js';

export const sampleTrip = {
  trip: { destination: 'Florida', startDate: '2026-12-20', endDate: '2026-12-27', duration: 8, lat: 28, lon: -81, children: [{ name: 'PRIVATE CHILD', age: 6 }], savedProfile: { secret: 'PRIVATE PROFILE' } },
  parsed: { destination: 'Florida', startDate: '2026-12-20', endDate: '2026-12-27', rawInput: 'PRIVATE PROMPT', plannerSummary: 'PRIVATE PROFILE', childrenAges: [6] },
  rawInput: 'PRIVATE PROMPT', importedProfile: { name: 'PRIVATE PROFILE' },
  tripPlan: { overview: 'Florida vacation', suggestedActivities: [{ id: 'chunk-1:a', name: 'LEGOLAND', description: 'Visit the park', savedProfile: 'PRIVATE PROFILE' }], dailyItinerary: [{ day: 'Day 1', activities: ['chunk-1:a'] }], tips: ['Book ahead'] },
  scheduledItinerary: [{ date: '2026-12-20', scheduled: [{ id: 'chunk-1:a', name: 'LEGOLAND', scheduledStart: '9:00 AM', status: 'scheduled', enriched: { latitude: 28, longitude: -81, address: 'Park entrance', mapsUrl: 'javascript:alert(1)', profile: 'PRIVATE PROFILE' } }], routeMeta: { totalTravelMinutes: 12 } }],
  weather: { forecast: [{ date: '2026-12-20', high: 75, low: 60, condition: 'Sunny', profile: 'PRIVATE PROFILE' }] },
  authToken: 'PRIVATE TOKEN', safetyData: { medicalHistory: 'PRIVATE HISTORY' },
};

function memoryRepository() {
  const rows = new Map();
  return {
    rows,
    insert: async row => rows.set(row.share_token_hash, structuredClone(row)),
    find: async hash => structuredClone(rows.get(hash) || null),
    revoke: async (hash, ownerHash, timestamp) => {
      const row = rows.get(hash);
      if (row?.owner_token_hash !== ownerHash) return false;
      row.revoked_at = timestamp;
      return true;
    },
  };
}

test('public snapshot preserves itinerary, schedule and map points but excludes private input/profile fields', () => {
  const snapshot = buildSharedTripSnapshot(sampleTrip);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.tripData.scheduledItinerary[0].scheduled[0].name, 'LEGOLAND');
  assert.equal(snapshot.tripData.scheduledItinerary[0].scheduled[0].scheduledStart, '9:00 AM');
  assert.equal(snapshot.tripData.scheduledItinerary[0].scheduled[0].enriched.latitude, 28);
  assert.equal(snapshot.tripData.weather.forecast[0].high, 75);
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(snapshot).includes('javascript:'), false);
  assert.equal(snapshot.tripData.parsed.childrenAges, undefined);
});

test('sharing preserves the attraction explanation shown in the itinerary', () => {
  const data = structuredClone(sampleTrip);
  data.scheduledItinerary[0].scheduled[0].whyRecommended = 'A good first stop';
  assert.equal(buildSharedTripSnapshot(data).tripData.scheduledItinerary[0].scheduled[0].whyRecommended, 'A good first stop');
});

test('nested objects injected into text fields cannot carry profile data', () => {
  const data = structuredClone(sampleTrip);
  data.tripPlan.overview = { savedProfile: 'PRIVATE PROFILE' };
  data.scheduledItinerary[0].scheduled[0].description = { rawInput: 'PRIVATE PROMPT' };
  assert.equal(JSON.stringify(buildSharedTripSnapshot(data)).includes('PRIVATE'), false);
});

test('multi-city snapshots retain route-day labels, stop weather and coordinates', () => {
  const data = structuredClone(sampleTrip);
  data.routePlan = { title: 'Tokyo to Kyoto', totalDays: 8, stops: [{ id: 'kyoto', name: 'Kyoto', arrivalDate: '2026-12-23', departureDate: '2026-12-27', lat: 35, lon: 135, profile: 'PRIVATE PROFILE' }] };
  data.stopWeather = { kyoto: data.weather };
  data.scheduledItinerary[0].routeDate = '2026-12-23';
  data.scheduledItinerary[0].routeDay = 4;
  data.scheduledItinerary[0].stopId = 'kyoto';
  const snapshot = buildSharedTripSnapshot(data);
  assert.equal(snapshot.tripData.routePlan.stops[0].lat, 35);
  assert.equal(snapshot.tripData.scheduledItinerary[0].routeDay, 4);
  assert.equal(snapshot.tripData.stopWeather.kyoto.forecast[0].high, 75);
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE'), false);
});

test('empty or oversized snapshots are rejected', () => {
  assert.throws(() => buildSharedTripSnapshot({}), /completed itinerary/i);
  const data = structuredClone(sampleTrip);
  data.tripPlan.tips = Array(60).fill('x'.repeat(4000));
  assert.throws(() => buildSharedTripSnapshot(data), /too large/i);
});

test('expiry is exactly seven days and is enforced at the boundary on reads', async () => {
  let now = Date.parse('2026-10-07T20:00:00Z');
  const repository = memoryRepository();
  const store = createTripShareStore({ repository, now: () => now });
  const share = await store.create(sampleTrip);
  assert.equal(Date.parse(share.expiresAt) - now, 7 * 24 * 60 * 60 * 1000);
  assert.equal(SHARE_TTL_MS, 604800000);
  const stored = [...repository.rows.values()][0];
  assert.equal(JSON.stringify(stored).includes(share.token), false);
  assert.equal(JSON.stringify(stored).includes(share.ownerToken), false);
  assert.equal(JSON.stringify(stored).includes('PRIVATE'), false);
  now += SHARE_TTL_MS - 1;
  assert.equal((await store.read(share.token)).snapshot.tripData.trip.destination, 'Florida');
  now++;
  await assert.rejects(store.read(share.token), error => error.code === 'SHARE_UNAVAILABLE');
});

test('revocation requires a separate creator token and cannot be done by viewers', async () => {
  const store = createTripShareStore({ repository: memoryRepository() });
  const share = await store.create(sampleTrip);
  assert.notEqual(share.token, share.ownerToken);
  await assert.rejects(store.revoke(share.token, share.token), error => error.code === 'SHARE_UNAVAILABLE');
  await store.read(share.token);
  await store.revoke(share.token, share.ownerToken);
  await assert.rejects(store.read(share.token), error => error.code === 'SHARE_UNAVAILABLE');
  await store.revoke(share.token, share.ownerToken);
});

test('invalid and unknown tokens return no itinerary data', async () => {
  const store = createTripShareStore({ repository: memoryRepository() });
  for (const token of ['', 'abc', '../private', 'a'.repeat(43)]) {
    await assert.rejects(store.read(token), error => error.code === 'SHARE_UNAVAILABLE');
  }
});
