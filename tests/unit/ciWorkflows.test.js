import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const e2eWorkflow = readFileSync(new URL('../../.github/workflows/e2e.yml', import.meta.url), 'utf8');
const iosWorkflowURL = new URL('../../.github/workflows/ios.yml', import.meta.url);

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

test('iOS workflow exists for native TestFlight readiness gates', () => {
  assert.ok(existsSync(iosWorkflowURL), 'Native iOS CI workflow is required for TestFlight readiness.');
});

test('iOS workflow runs simulator tests and Release archive', () => {
  assert.ok(existsSync(iosWorkflowURL), 'Native iOS CI workflow is required for TestFlight readiness.');
  const iosWorkflow = readFileSync(iosWorkflowURL, 'utf8');

  assert.match(iosWorkflow, /push:\s*\n\s+branches:\s*\[\s*["']?\*\*["']?\s*\]/);
  assert.match(iosWorkflow, /xcodebuild[\s\S]+-project ios\/SproutRoute\/SproutRoute\.xcodeproj[\s\S]+-scheme SproutRoute[\s\S]+test/);
  assert.match(iosWorkflow, /xcodebuild[\s\S]+-configuration Release[\s\S]+-archivePath[\s\S]+archive/);
  assert.match(iosWorkflow, /Upload iOS archive/);
});

test('iOS workflow archive does not require Apple signing credentials on GitHub runners', () => {
  assert.ok(existsSync(iosWorkflowURL), 'Native iOS CI workflow is required for TestFlight readiness.');
  const iosWorkflow = readFileSync(iosWorkflowURL, 'utf8');

  assert.match(iosWorkflow, /CODE_SIGNING_ALLOWED=NO/);
  assert.match(iosWorkflow, /CODE_SIGNING_REQUIRED=NO/);
  assert.match(iosWorkflow, /CODE_SIGN_IDENTITY=""/);
});
