# Add a Test

Use this skill to add a specific test for a behavior you want to guard.

## Instruction template

"Add a test for [BEHAVIOR] in [TEST FILE].

Use the existing patterns:
- Mock fetch: `global.fetch = async () => ({...})`
- DI: `createApp({ [dep]: mockFn })`
- Cache reset: call `__reset*ForTests()` in afterEach

The test must fail BEFORE the implementation exists. Show me the failing output before writing any implementation."

## Test patterns reference

### Pattern 1: Unit test with fetch mock

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { functionToTest } from '../../src/backend/services/myService.js';

describe('myService', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;  // IMPORTANT: always restore
  });

  it('handles 503 by throwing retryable error', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
      json: async () => { throw new SyntaxError('Not JSON'); },
    });

    await assert.rejects(
      () => functionToTest('some input'),
      (err) => {
        assert.ok(err.message.includes('temporarily unavailable'));
        assert.strictEqual(err.retryable, true);
        return true;
      }
    );
  });
});
```

### Pattern 2: Integration test with DI

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/backend/server.js';

// Helper to call a route
async function invokeRoute(app, method, path, body) {
  const req = { method, url: path, body, headers: {} };
  let responseData = {};
  let statusCode = 200;
  const res = {
    status: (code) => { statusCode = code; return res; },
    json: (data) => { responseData = data; return res; },
    setHeader: () => res,
  };
  await new Promise((resolve) => {
    app(req, res, resolve);
  });
  return { status: statusCode, body: responseData };
}

describe('POST /api/v1/trip/resolve', () => {
  it('returns destination info on valid input', async () => {
    const mockGeocode = async () => ({
      name: 'Denver, CO',
      lat: 39.7392,
      lon: -104.9903,
      stateCode: 'CO',
    });

    const app = createApp({ geocodeDestination: mockGeocode });
    const res = await invokeRoute(app, 'POST', '/api/v1/trip/resolve', {
      destination: 'Denver',
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.name);
    assert.ok(res.body.lat);
  });
});
```

### Pattern 3: Frontend component test (Vitest + RTL)

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyComponent from '../MyComponent';

describe('MyComponent', () => {
  it('calls onConfirm when confirm button clicked', async () => {
    const user = userEvent.setup();
    const mockConfirm = vi.fn();

    render(<MyComponent onConfirm={mockConfirm} />);

    await user.click(screen.getByRole('button', { name: /confirm/i }));
    expect(mockConfirm).toHaveBeenCalledOnce();
  });
});
```

## Test naming conventions

```
it('[subject] [behavior] when [condition]')

Good:
  it('fetchWithRetry retries on 503 up to maxRetries times')
  it('PackingChecklist persists custom items after list regeneration')
  it('car seat rules return AAP fallback for uncovered state')

Avoid:
  it('works')
  it('test 1')
  it('should do the thing')
```
