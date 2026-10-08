import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShareSummary } from '../../src/frontend/src/utils/shareSummary.js';

test('shares the displayed schedule, dates, meals and every available day', () => {
  const summary = buildShareSummary({
    parsed: { destination: 'Florida, USA', startDate: '2026-12-20', endDate: '2026-12-27', rawInput: 'private input' },
    scheduledItinerary: [
      { date: '2026-12-20', scheduled: [{ name: 'LEGOLAND', scheduledStart: '9:00 AM' }, { name: 'Dinner', scheduledStart: '6:00 PM', isMeal: true }] },
      { date: '2026-12-27', scheduled: [{ name: 'Last stop' }] },
    ],
  }, 'https://sproutroute.app');
  assert.match(summary, /Dec 20, 2026 to Dec 27, 2026/);
  assert.match(summary, /Dec 20, 2026\n- 9:00 AM: LEGOLAND\n- 6:00 PM: Dinner/);
  assert.match(summary, /Dec 27, 2026\n- Last stop/);
  assert.match(summary, /Plan your own: https:\/\/sproutroute.app/);
  assert.doesNotMatch(summary, /private input|\?dest=/);
});

test('resolves raw activity IDs and names when scheduling is unavailable', () => {
  const summary = buildShareSummary({
    trip: { destination: 'Japan' },
    tripPlan: {
      suggestedActivities: [{ id: 'chunk-1:a1', name: 'Senso-ji' }],
      dailyItinerary: [{ day: 'Day 1', activities: ['chunk-1:a1', { title: 'Ueno Park' }, 'Walking tour'], meals: { dinner: { name: 'Sushi restaurant' } } }],
    },
  }, 'https://sproutroute.app');
  assert.match(summary, /Senso-ji/);
  assert.match(summary, /Ueno Park/);
  assert.match(summary, /Walking tour/);
  assert.match(summary, /Dinner: Sushi restaurant/);
  assert.doesNotMatch(summary, /chunk-1:a1|\[object Object\]/);
});

test('uses route title and stop dates for multi-city plans', () => {
  const summary = buildShareSummary({
    routePlan: { title: 'Tokyo to Kyoto', stops: [{ arrivalDate: '2026-12-20' }, { departureDate: '2026-12-27' }] },
    scheduledItinerary: [{ routeDate: '2026-12-23', stopName: 'Kyoto', scheduled: [{ name: 'Fushimi Inari' }] }],
  }, 'https://sproutroute.app');
  assert.match(summary, /Tokyo to Kyoto/);
  assert.match(summary, /Dec 23, 2026 — Kyoto/);
});

test('a partial or empty plan never invents activities or invalid dates', () => {
  const summary = buildShareSummary({ trip: { destination: 'Florida', startDate: 'invalid' } }, 'https://sproutroute.app');
  assert.match(summary, /Florida/);
  assert.doesNotMatch(summary, /Invalid Date|undefined|null/);
});

test('calendar dates remain correct in a negative-offset timezone', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    assert.match(buildShareSummary({ trip: { startDate: '2026-12-20', endDate: '2026-12-27' } }, 'https://sproutroute.app'), /Dec 20, 2026 to Dec 27, 2026/);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
