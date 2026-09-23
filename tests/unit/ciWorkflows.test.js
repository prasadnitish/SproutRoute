import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const e2eWorkflow = readFileSync(new URL('../../.github/workflows/e2e.yml', import.meta.url), 'utf8');

test('E2E workflow runs on every pushed branch', () => {
  assert.match(
    e2eWorkflow,
    /push:\s*\n\s+branches:\s*\[\s*["']?\*\*["']?\s*\]/,
    'E2E workflow must run for every branch pushed to GitHub, including codex/* feature branches.'
  );
});

test('E2E workflow runs the mocked Playwright suite in CI', () => {
  assert.match(e2eWorkflow, /npx playwright test --project=mocked/);
  assert.match(e2eWorkflow, /npx playwright install --with-deps chromium/);
});
