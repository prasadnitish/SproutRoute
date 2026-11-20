import { test, expect } from '@playwright/test';
import { MOCK_TRIP_PLAN } from '../fixtures/trip-data';
import { mockAllApis, buildSSEBody, overrideSSE } from '../fixtures/mock-api';

test.use({ launchOptions: {
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--enable-features=WebMCP', '--enable-experimental-web-platform-features'],
} });

test('the planner works when the browser has no tool registry', async ({ page }) => {
  await mockAllApis(page);
  await page.addInitScript(() => Object.defineProperty(document, 'modelContext', { value: undefined }));
  const toolChunks: string[] = [];
  page.on('request', req => { if (/\/assets\/Tools-/.test(req.url())) toolChunks.push(req.url()); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Plan it' })).toBeDisabled();
  await page.getByRole('textbox').fill('Seattle next weekend');
  await expect(page.getByRole('button', { name: 'Plan it' })).toBeEnabled();
  expect(toolChunks).toEqual([]);
});

test('browser registrations follow the build flag and active planning screen', async ({ page }) => {
  await mockAllApis(page);
  await page.addInitScript(() => {
    const tools = new Map();
    Object.assign(window, { registeredTools: tools });
    Object.defineProperty(document, 'modelContext', { value: {
      registerTool(tool, { signal }) {
        tools.set(tool.name, tool);
        signal.addEventListener('abort', () => tools.delete(tool.name), { once: true });
      }
    } });
  });
  const activity = { ...MOCK_TRIP_PLAN.tripPlan.suggestedActivities[0], grounded: true, placeId: 'hana-id' };
  await overrideSSE(page, {body: buildSSEBody({tripPlan: {...MOCK_TRIP_PLAN.tripPlan, suggestedActivities: [activity]}})});
  await page.route('**/api/v1/telemetry/journey', route => route.fulfill({status: 204}));
  let parses = 0;
  page.on('request', request => { if (request.url().includes('/trip/parse-input')) parses++; });
  await page.goto('/');
  const names = () => page.evaluate(() => Array.from((window as any).registeredTools.keys()));
  await expect(page.getByRole('button', { name: 'Plan it' })).toBeVisible();
  if (process.env.VITE_WEBMCP_ENABLED !== 'true') {
    expect(await names()).toEqual([]);
    return;
  }
  await expect.poll(names).toEqual(['plan_trip']);
  const call = await page.evaluate(() => (window as any).registeredTools.get('plan_trip').execute({
    destination: 'Seattle', startDate: '2027-02-01', endDate: '2027-02-03',
  }, { signal: new AbortController().signal }));
  expect(JSON.stringify(call)).toContain('awaiting_confirmation');
  await expect(page.getByRole('textbox')).toHaveValue(/Seattle/);
  await page.getByRole('textbox').fill('My own draft');
  const refused = await page.evaluate(() => (window as any).registeredTools.get('plan_trip').execute({
    destination: 'Paris', startDate: '2027-02-01', endDate: '2027-02-03',
  }));
  expect(refused.isError).toBe(true);
  await expect(page.getByRole('textbox')).toHaveValue('My own draft');
  expect(parses).toBe(0);
  await page.getByRole('button', { name: 'Plan it' }).click();
  await expect.poll(() => parses).toBe(1);
  await expect.poll(names).toEqual(['search_places']);
  const found = await page.evaluate(() => (window as any).registeredTools.get('search_places').execute({ query: 'hana' }));
  expect(JSON.parse(found.content[0].text).places).toEqual([{ place_id: 'hana-id', name: activity.name, category: activity.category }]);
  await page.getByRole('button', { name: 'Back to input' }).click();
  await expect.poll(names).toEqual(['plan_trip']);
});

test('Chrome discovers and executes the draft tool', async ({ page }) => {
  test.skip(process.env.VITE_WEBMCP_ENABLED !== 'true', 'Requires an experiment build.');
  await mockAllApis(page);
  await page.goto('/');
  const available = await page.evaluate(() => typeof (document as any).modelContext?.getTools === 'function');
  test.skip(!available, 'This browser does not implement the WebMCP imperative API.');
  await expect.poll(() => page.evaluate(async () => (await (document as any).modelContext.getTools()).map(tool => tool.name))).toContain('plan_trip');
  const result = await page.evaluate(async () => {
    const registry = (document as any).modelContext;
    const tool = (await registry.getTools()).find(tool => tool.name === 'plan_trip');
    return await registry.executeTool(tool, {destination: 'Paris', startDate: '2027-02-01', endDate: '2027-02-03'});
  });
  expect(JSON.stringify(result)).toContain('awaiting_confirmation');
  await expect(page.getByRole('textbox')).toHaveValue(/Paris/);
});
