// Captures the actual React UI with a saved synthetic AI generation.
// No customer data, external analytics, or live API calls are used.
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { scheduleItinerary } from '../src/backend/services/itineraryScheduler.js';
import { generatePackingList } from '../src/backend/services/deterministicPacking.js';
const root = new URL('../docs/brag-sproutroute-2026-09-26/', import.meta.url);
const out = new URL('screens/', root);
await mkdir(out, { recursive: true });
const pilot = JSON.parse(await readFile(new URL('../docs/benchmarks/2026-09-26-recovery-pilot.json', import.meta.url)));
const tripPlan = pilot.rows[0].plan;
const parsed = { destination: 'Las Vegas, Nevada', startDate: '2026-10-10', endDate: '2026-10-11', adults: 2, childrenAges: [6], vibe: 'family museums and gardens', suggestedDestinations: [] };
const trip = { ...parsed, lat: 36.1699, lon: -115.1398, countryCode: 'US', duration: 2, children: [{ age: 6 }], activities: ['museums', 'parks'] };
const weather = { summary: 'Illustrative weather for this demo.', forecast: [
  { date: '2026-10-10', name: 'Saturday', high: 82, low: 61, condition: 'Sunny', precipitation: 0 },
  { date: '2026-10-11', name: 'Sunday', high: 80, low: 60, condition: 'Partly cloudy', precipitation: 5 },
] };
const packingList = await generatePackingList(trip, weather);
const scheduledItinerary = scheduleItinerary(tripPlan, {}, trip.startDate);
const safety = { advisoryLevel: 'low', emergencyNumber: '911', healthTips: ['Carry water and take shaded breaks.', 'Plan outdoor time for the cooler part of the day.'], familyTips: ['Set a meeting point before exploring busy places.'], localCustoms: [], source: 'demo-fixture' };
const body = [ ['destination', trip], ['weather', { weather }], ['itinerary-chunk', { tripPlan, scheduledItinerary }], ['packing', { packingList }], ['done', {}] ].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
const evidence = [];
for (const mobile of [false, true]) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, deviceScaleFactor: 2, isMobile: mobile, reducedMotion: 'reduce', colorScheme: 'light' });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname.startsWith('/api/')) {
      let payload = {};
      if (url.pathname.endsWith('parse-input')) payload = parsed;
      else if (url.pathname.endsWith('/stream')) { await new Promise(r => setTimeout(r, 800)); return route.fulfill({ contentType: 'text/event-stream', body }); }
      else if (url.pathname.endsWith('/generate')) payload = packingList;
      else if (url.pathname.endsWith('travel-tips')) payload = safety;
      else if (url.pathname.endsWith('/detect')) payload = { lat: 47.61, lon: -122.2, region: 'Bellevue, WA' };
      else if (url.pathname.includes('/profile/')) payload = { profile: null };
      else if (url.pathname.endsWith('/enrich')) payload = null;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
    }
    if (/posthog|sentry|analytics/.test(url.hostname)) return route.abort();
    return route.continue();
  });
  await page.goto(process.env.DEMO_BASE_URL || 'http://127.0.0.1:4174');
  await page.locator('textarea').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const prefix = mobile ? 'mobile' : 'desktop';
  const shot = async name => { await page.waitForTimeout(800); await page.screenshot({ path: new URL(`${prefix}-${name}.png`, out).pathname }); evidence.push(`${prefix}-${name}.png`); };
  await shot('input');
  await page.locator('textarea').fill('Two days in Las Vegas with our 6-year-old. Museums, gardens, and a little room to wander. October 10–11.');
  await shot('prompt');
  await page.getByRole('button', { name: /plan it/i }).click();
  await page.getByRole('heading', { level: 2, name: /Las Vegas/ }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(3000);
  await shot('plan');
  const weatherTile = page.getByText('🌤 Weather', { exact: true }).locator('..').locator('..');
  await weatherTile.screenshot({ path: new URL(`${prefix}-weather.png`, out).pathname });
  evidence.push(`${prefix}-weather.png`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: /^Pack/ }).click();
  await page.waitForTimeout(200);
  await shot('pack');
  const checks = page.getByRole('checkbox');
  for (let i = 0; i < Math.min(3, await checks.count()); i++) await checks.nth(i).check();
  await shot('packed');
  await page.getByRole('button', { name: /^Safety/ }).click();
  await page.waitForTimeout(200);
  await shot('safety');
  await page.getByRole('button', { name: /^Plan$/ }).click();
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo(0, 500));
  await shot('itinerary');
  await context.close();
}
await browser.close();
await writeFile(new URL('capture-evidence.json', root), JSON.stringify({ synthetic: true, ui: 'unmodified React application', source: '2026-09-26-recovery-pilot.json rows[0]', weather: 'illustrative fixture, not a forecast', venues: 'model suggestions, not verified', timing: 'edited, not live model latency', files: evidence }, null, 2));
console.log(JSON.stringify(evidence));
