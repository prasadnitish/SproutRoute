import { test, expect } from '@playwright/test';
import { mockAllApis, goToResults } from '../fixtures/mock-api';
import { MOCK_TRIP_PLAN } from '../fixtures/trip-data';

const token = 'a'.repeat(43);
const ownerToken = 'b'.repeat(43);
const createdAt = new Date().toISOString();
const expiresAt = new Date(Date.parse(createdAt) + 7 * 24 * 60 * 60 * 1000).toISOString();
const snapshot = { schemaVersion: 1, tripData: { ...MOCK_TRIP_PLAN, parsed: { destination: 'Maui, Hawaii', startDate: '2026-04-12', endDate: '2026-04-19' } } };

test('creating a link shows public-access disclosure and seven-day expiry', async ({ page }) => {
  await mockAllApis(page);
  await page.route('**/api/v1/trip/shares', async route => {
    const request = route.request();
    const body = request.postDataJSON();
    expect(body.tripData.parsed.childrenAges).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('rawInput');
    expect(JSON.stringify(body)).not.toContain('savedProfile');
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ token, ownerToken, createdAt, expiresAt }) });
  });
  await goToResults(page);
  await page.getByRole('button', { name: 'Share trip summary' }).click();
  await expect(page.getByText(/Public link: anyone with the link/)).toBeVisible();
  await expect(page.getByText(/original prompt and imported profile are not shared/)).toBeVisible();
  await page.getByRole('button', { name: 'Create 7-day link' }).click();
  await expect(page.getByLabel('Trip link', { exact: true })).toHaveValue(new RegExp(`/s#${token}$`));
  await expect(page.getByText(/^Expires /)).toContainText(new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  await expect(page.getByRole('button', { name: 'Stop sharing' })).toBeVisible();
});

test('shared URL renders the same itinerary with zero generation or enrichment requests', async ({ page }) => {
  const unexpected: string[] = [];
  page.on('request', request => {
    if (/parse-input|trip\/stream|trip\/bundle|places\/enrich|safety\/travel-tips/.test(request.url())) unexpected.push(request.url());
  });
  await page.route('**/api/v1/trip/shares/view', async route => {
    expect(route.request().headers()['x-trip-share-token']).toBe(token);
    expect(route.request().url()).not.toContain(token);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ snapshot, createdAt, expiresAt }) });
  });
  await page.goto(`/s#${token}`);
  await expect(page.getByRole('heading', { name: 'Maui, Hawaii', level: 2 })).toBeVisible();
  await expect(page.getByText('Road to Hana').first()).toBeVisible();
  await page.getByRole('button', { name: 'Mon, Apr 13' }).click();
  await expect(page.getByText('Snorkeling at Molokini').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit trip', exact: true })).toHaveCount(0);
  await expect(page.getByText(/original prompt and imported profile are not shared/)).toBeVisible();
  expect(unexpected).toEqual([]);
});

test('an expired shared link shows a clear state without regenerating', async ({ page }) => {
  await page.route('**/api/v1/trip/shares/view', route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'SHARE_UNAVAILABLE', message: 'This trip link has expired, was stopped, or is unavailable.' }) }));
  await page.goto(`/s#${token}`);
  await expect(page.getByRole('alert')).toContainText('expired');
  await expect(page.getByRole('link', { name: 'Plan your own trip' })).toBeVisible();
});

test('link storage failure preserves summary copying and shows an error', async ({ page }) => {
  await mockAllApis(page);
  await page.route('**/api/v1/trip/shares', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Trip links are temporarily unavailable. You can still copy the summary.' }) }));
  await goToResults(page);
  await page.getByRole('button', { name: 'Share trip summary' }).click();
  await page.getByRole('button', { name: 'Create 7-day link' }).click();
  await expect(page.getByRole('status')).toContainText('temporarily unavailable');
  await expect(page.getByRole('button', { name: 'Copy summary', exact: true })).toBeEnabled();
});

test('creator can stop a link and its owner credential is not in the shared URL', async ({ page }) => {
  await mockAllApis(page);
  await page.route('**/api/v1/trip/shares', async route => {
    if (route.request().method() === 'DELETE') {
      expect(route.request().headers()['x-trip-share-owner-token']).toBe(ownerToken);
      await route.fulfill({ status: 204 });
    } else await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ token, ownerToken, expiresAt }) });
  });
  await goToResults(page);
  await page.getByRole('button', { name: 'Share trip summary' }).click();
  await page.getByRole('button', { name: 'Create 7-day link' }).click();
  await expect(page.getByLabel('Trip link', { exact: true })).not.toHaveValue(new RegExp(ownerToken));
  await page.getByRole('button', { name: 'Stop sharing' }).click();
  await expect(page.getByRole('status')).toHaveText('Sharing stopped. The old link no longer opens this trip.');
});
