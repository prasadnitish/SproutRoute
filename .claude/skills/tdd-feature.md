# TDD Feature Workflow

Use this skill when starting any new feature. Replace [PLACEHOLDERS] with specifics.

## Setup

Feature: [FEATURE NAME]
Test file: [TEST FILE PATH — e.g. tests/unit/myFeature.test.js]
Source file: [SOURCE FILE PATH — e.g. src/backend/utils/myFeature.js]

## Step 1 — RED: Write the failing test FIRST

Write tests in [TEST FILE] covering:
- Happy path: [describe expected input → output]
- Error case: [describe what error condition to handle]
- Edge case: [describe boundary condition]

Do NOT write any implementation yet. Run `npm test` and confirm the tests fail with the expected error (not a syntax error — they should fail because the function doesn't exist yet or returns wrong values).

Show me the failing test output before proceeding.

## Step 2 — GREEN: Minimum implementation

Implement [FEATURE] in [SOURCE FILE] — write the simplest code that makes the failing tests pass. Do not over-engineer.

Run `npm test` and confirm ALL tests pass (new + existing).

## Step 3 — REFACTOR: Clean up

Refactor [FEATURE] for clarity, performance, or better naming. Run `npm test` again to confirm still green.

Do not proceed if any test is red.

## Step 4 — Edge cases

Write additional tests for:
- [EDGE CASE 1]
- [EDGE CASE 2]

Repeat Steps 1-3 for each edge case.

## Patterns to reuse (from existing tests)

```js
// Mock fetch (from geocoding.test.js):
global.fetch = async (url, opts) => ({
  ok: true,
  status: 200,
  json: async () => ({ /* mock response */ }),
  text: async () => JSON.stringify({ /* mock response */ }),
});

// DI via createApp (from api.integration.test.js):
const app = createApp({ geocodeDestination: async () => mockResult });

// Cache reset (from geocoding.test.js):
import { __resetGeocodingCachesForTests } from '../src/backend/services/geocoding.js';
afterEach(() => __resetGeocodingCachesForTests());
```

## Test file template

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

describe('[FEATURE NAME]', () => {
  beforeEach(() => {
    // reset state
  });

  afterEach(() => {
    // cleanup
  });

  it('happy path: [description]', async () => {
    // arrange
    // act
    // assert
    assert.strictEqual(actual, expected);
  });

  it('error case: [description]', async () => {
    await assert.rejects(
      () => functionUnderTest(badInput),
      { message: /expected error message/ }
    );
  });
});
```
