import { test, expect } from '@playwright/test';
import { mockAllApis, goToResults } from '../fixtures/mock-api';

test.beforeEach(async ({ page }) => {
  await mockAllApis(page);
});

test('Share opens a summary and Escape returns focus to the trigger', async ({ page }) => {
  await goToResults(page);
  await page.getByRole('button', { name: 'Share trip summary' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share your trip' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Trip summary')).toHaveValue(/Maui, Hawaii[\s\S]*Road to Hana[\s\S]*Snorkeling at Molokini/);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Share trip summary' })).toBeFocused();
});

test('Copy confirms success only after the clipboard write resolves', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as any).copiedSummary = text; } } });
  });
  await goToResults(page);
  await page.getByRole('button', { name: 'Share trip summary' }).click();
  await page.getByRole('button', { name: 'Copy summary', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Summary copied. Paste it into a message or email.');
  expect(await page.evaluate(() => (window as any).copiedSummary)).toContain('Road to Hana');
  expect(await page.evaluate(() => (window as any).copiedSummary)).not.toContain('?dest=');
});

test('clipboard denial leaves a selectable summary and actionable feedback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } } });
  });
  await goToResults(page);
  await page.getByRole('button', { name: 'Share trip summary' }).click();
  await page.getByRole('button', { name: 'Copy summary', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText("Couldn't copy automatically. Select the summary below and copy it manually.");
  await expect(page.getByLabel('Trip summary')).toBeFocused();
});

test('native Share receives itinerary text and confirms completion', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => { (window as any).sharedTrip = data; } });
  });
  await goToResults(page);
  await page.getByRole('button', { name: 'Share trip summary' }).click();
  await page.getByRole('button', { name: 'Share via…' }).click();
  await expect(page.getByRole('status')).toHaveText('Trip summary shared.');
  expect(await page.evaluate(() => (window as any).sharedTrip.text)).toContain('Snorkeling at Molokini');
});

test('cancelling native Share does not claim success or trigger copying', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Cancelled', 'AbortError'); } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { (window as any).unexpectedCopy = true; } } });
  });
  await goToResults(page);
  await page.getByRole('button', { name: 'Share trip summary' }).click();
  await page.getByRole('button', { name: 'Share via…' }).click();
  await expect(page.getByRole('status')).toHaveText('');
  expect(await page.evaluate(() => (window as any).unexpectedCopy)).toBeUndefined();
});

test('native sharing failure offers copying and the panel fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new Error('Unavailable'); } });
  });
  await goToResults(page);
  await page.getByRole('button', { name: 'Share trip summary' }).click();
  await page.getByRole('button', { name: 'Share via…' }).click();
  await expect(page.getByRole('status')).toHaveText("Couldn't open sharing. Copy the summary instead.");
  const bounds = await page.getByRole('dialog', { name: 'Share your trip' }).boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Close sharing' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
