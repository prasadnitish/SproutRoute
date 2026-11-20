import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTripDraft, searchTripPlaces } from '../../src/frontend/src/webmcp/actions.js';

const trip = { destination: 'Seattle', startDate: '2027-01-04', endDate: '2027-01-05' };
test('creates an editable draft that preserves dates, ages, pets, and activities', () => {
  const draft = makeTripDraft({ ...trip, children: [{ age: 0 }], pets: [{ type: 'dog', breed: 'terrier', weightLbs: 10, name: 'Pip' }], activities: ['parks'] });
  for (const detail of ['Seattle', '2027-01-04', '2027-01-05', '0', 'dog', 'terrier', '10', 'Pip', 'parks']) assert.ok(draft.includes(detail));
});

test('rejects invalid dates, reversed dates, out-of-range ages and extra fields', () => {
  for (const input of [{ ...trip, startDate: '2027-02-30' }, { ...trip, endDate: '2026-01-01' }, { ...trip, children: [{ age: -1 }] }, { ...trip, submit: true }]) {
    assert.throws(() => makeTripDraft(input));
  }
});

test('matches only grounded Places entries, deduplicates IDs and returns only public fields', () => {
  const place = { name: 'Seattle Aquarium', category: 'aquarium', grounded: true, placeId: 'p1', privateNotes: 'secret' };
  const places = [place, place, { ...place, grounded: false, placeId: 'p2' }, { ...place, placeId: null }];
  assert.deepEqual(searchTripPlaces({ query: 'AQUA' }, places), [{ name: place.name, category: place.category, place_id: 'p1' }]);
  assert.throws(() => searchTripPlaces({ query: '' }, places));
  assert.throws(() => searchTripPlaces({ query: 'aquarium', job_id: 'elsewhere' }, places));
});
