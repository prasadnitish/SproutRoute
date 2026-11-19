/**
 * Public share links carry structured fields only (NEW-3 in the Nov 2026 review).
 *
 * The share sheet promises a link never includes the original request, the
 * children's ages or the pets. Generated prose (overview, tips, day notes,
 * descriptions, "why this fits") can mention all three, so it is not shared.
 * Links created before this change are filtered again when they are opened.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSharedTripSnapshot } from '../../src/shared/shareSnapshot.js';
import { createTripShareStore } from '../../src/backend/services/tripShareStore.js';
import { sampleTrip } from './tripShares.test.js';

const SEEDS = ['4-year-old', 'Max the dog', 'nap for the 2-year-old', 'Our daughter Mia', 'toddler-friendly'];

function seededTrip() {
  const data = structuredClone(sampleTrip);
  data.trip.children = [{ name: 'Mia', age: 4 }];
  data.parsed.pets = [{ name: 'Max', type: 'dog' }];
  data.tripPlan.overview = 'A relaxed week for parents travelling with a 4-year-old and Max the dog.';
  data.tripPlan.tips = ['Plan a nap for the 2-year-old after lunch.'];
  const act = data.tripPlan.suggestedActivities[0];
  act.description = 'Our daughter Mia will love the rides.';
  act.whyRecommended = 'Great for a 4-year-old.';
  act.whyThisFits = 'Max the dog can wait in the shaded area.';
  act.note = 'toddler-friendly paths';
  const stop = data.scheduledItinerary[0].scheduled[0];
  stop.description = 'Our daughter Mia will love the rides.';
  stop.whyRecommended = 'Great for a 4-year-old.';
  stop.note = 'nap for the 2-year-old nearby';
  stop.warning = 'Busy for a 4-year-old at noon';
  data.scheduledItinerary[0].notes = 'Start early so the 4-year-old can nap.';
  data.scheduledItinerary[0].meals = { dinner: { name: 'Pizza Place', cuisine: 'Italian', note: 'Kids menu for a 4-year-old' } };
  data.scheduledItinerary[0].warnings = [{ type: 'too_late', message: 'Too late for a 4-year-old', activity: 'LEGOLAND' }];
  data.tripPlan.dailyItinerary[0].notes = 'Max the dog stays at the hotel.';
  data.packingList = {
    categories: [
      { name: "Max's supplies", items: [{ name: 'Leash for Max', quantity: '1' }, { name: 'Water bowl', quantity: '1' }] },
      { name: 'Kids', items: [{ name: 'Snacks for the 4-year-old', quantity: '5' }, { name: 'Sun hat', quantity: '1' }] },
    ],
  };
  return data;
}

function assertNoSeeds(value, where) {
  const text = JSON.stringify(value);
  for (const seed of [...SEEDS, 'Mia', 'Max']) {
    assert.equal(text.includes(seed), false, `${where} must not contain "${seed}"`);
  }
}

function memoryRepository() {
  const rows = new Map();
  return {
    rows,
    insert: async row => rows.set(row.share_token_hash, structuredClone(row)),
    find: async hash => structuredClone(rows.get(hash) || null),
    revoke: async () => true,
  };
}

test('new snapshots drop generated prose about the family', () => {
  assertNoSeeds(buildSharedTripSnapshot(seededTrip()), 'snapshot');
});

test('structured itinerary fields are still shared', () => {
  const snapshot = buildSharedTripSnapshot(seededTrip());
  const stop = snapshot.tripData.scheduledItinerary[0].scheduled[0];
  assert.equal(stop.name, 'LEGOLAND');
  assert.equal(stop.scheduledStart, '9:00 AM');
  assert.equal(snapshot.tripData.scheduledItinerary[0].meals.dinner.name, 'Pizza Place');
  assert.equal(snapshot.tripData.scheduledItinerary[0].warnings[0].type, 'too_late');
  assert.equal(snapshot.tripData.weather.forecast[0].high, 75);
});

test('packing items that name a pet or a child, or state an age, are left out; the rest stay', () => {
  const packing = buildSharedTripSnapshot(seededTrip()).tripData.packingList;
  const names = packing.categories.flatMap(category => category.items.map(item => item.name));
  assert.deepEqual(names.sort(), ['Sun hat', 'Water bowl']);
  assert.equal(packing.categories.some(category => category.name.includes('Max')), false);
});

test('links created before the change are filtered when opened', async () => {
  const repository = memoryRepository();
  const store = createTripShareStore({ repository });
  const share = await store.create(seededTrip());
  // Simulate a row written by the old code: the raw prose was stored as-is.
  const row = [...repository.rows.values()][0];
  row.snapshot.tripData.tripPlan.overview = 'A relaxed week for parents travelling with a 4-year-old and Max the dog.';
  row.snapshot.tripData.tripPlan.tips = ['Plan a nap for the 2-year-old after lunch.'];
  row.snapshot.tripData.scheduledItinerary[0].notes = 'Start early so the 4-year-old can nap.';
  row.snapshot.tripData.scheduledItinerary[0].scheduled[0].whyRecommended = 'Great for a 4-year-old.';
  repository.rows.set(row.share_token_hash, row);

  const opened = await store.read(share.token);
  assertNoSeeds(opened.snapshot, 'opened link');
  assert.equal(opened.snapshot.tripData.scheduledItinerary[0].scheduled[0].name, 'LEGOLAND');
});
