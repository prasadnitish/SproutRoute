import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/backend/server.js';

const sample = { trip: { destination: 'Florida' }, tripPlan: { dailyItinerary: [{ day: 'Day 1', activities: ['park'] }], suggestedActivities: [{ id: 'park', name: 'Park' }] } };

test('shared-trip API creates, retrieves and revokes snapshots without generation', async t => {
  let creates = 0;
  let revoked = false;
  const app = createApp({ tripShareStore: {
    create: async data => { creates++; assert.equal(data.trip.destination, 'Florida'); return { token: 'a'.repeat(43), ownerToken: 'b'.repeat(43), createdAt: '2026-10-07T00:00:00Z', expiresAt: '2026-10-14T00:00:00Z' }; },
    read: async token => { assert.equal(token, 'a'.repeat(43)); if (revoked) throw Object.assign(new Error('Unavailable'), { code: 'SHARE_UNAVAILABLE' }); return { snapshot: { schemaVersion: 1, tripData: sample }, expiresAt: '2026-10-14T00:00:00Z' }; },
    revoke: async (token, owner) => { assert.equal(owner, 'b'.repeat(43)); revoked = true; },
  }, generateTripPlanFn: () => { throw new Error('Must not generate shared trips'); }, enableRequestLogging: false });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1/trip/shares`;
  const created = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tripData: sample }) });
  assert.equal(created.status, 201);
  assert.equal(creates, 1);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  const read = await fetch(`${base}/view`, { headers: { 'x-trip-share-token': 'a'.repeat(43) } });
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).snapshot.tripData, sample);
  const revoke = await fetch(base, { method: 'DELETE', headers: { 'x-trip-share-token': 'a'.repeat(43), 'x-trip-share-owner-token': 'b'.repeat(43) } });
  assert.equal(revoke.status, 204);
  const missing = await fetch(`${base}/view`, { headers: { 'x-trip-share-token': 'a'.repeat(43) } });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, 'SHARE_UNAVAILABLE');
});

test('storage failure exposes an actionable error without internal details', async t => {
  const app = createApp({ tripShareStore: { create: async () => { throw new Error('SECRET CONNECTION DETAIL'); } }, enableRequestLogging: false });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/trip/shares`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tripData: sample }) });
  assert.equal(response.status, 503);
  assert.equal(JSON.stringify(await response.json()).includes('SECRET'), false);
});
