# Add API Route

Use this skill when adding a new Express endpoint. Replace [PLACEHOLDERS] with specifics.

## Route spec

Method + path: [e.g. POST /api/v1/trip/resolve]
Legacy alias: [e.g. POST /api/resolve-destination → keep for one release cycle]
Handler file: [e.g. src/backend/services/geocoding.js — function to call]
Request shape: [describe required/optional fields]
Response shape: [describe success response]

## Implementation checklist

### 1. Write the contract test first (TDD)

In `tests/integration/apiV1.contract.test.js`:
```js
it('POST /api/v1/[path] returns standard shape', async () => {
  const res = await invokeRoute(app, 'POST', '/api/v1/[path]', { /* valid body */ });
  assert.strictEqual(res.status, 200);
  // Assert required response fields
  assert.ok(res.body.[field]);
});

it('POST /api/v1/[path] returns error envelope on bad input', async () => {
  const res = await invokeRoute(app, 'POST', '/api/v1/[path]', { /* missing required field */ });
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.code);       // error code string
  assert.ok(res.body.message);    // human message
  assert.ok(res.body.category);   // error category
  assert.strictEqual(typeof res.body.retryable, 'boolean');
  assert.ok(res.body.requestId);  // for correlation
});
```

### 2. Add route in server.js

```js
// NEW versioned route
app.post('/api/v1/[path]', async (req, res) => {
  const requestId = crypto.randomUUID();
  try {
    // validate required fields
    const { requiredField } = req.body;
    if (!requiredField) {
      return res.status(400).json({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'requiredField is required.',
        category: 'validation',
        retryable: false,
        requestId,
      });
    }

    const result = await serviceFunction(requiredField);
    res.json({ ...result, requestId });

  } catch (err) {
    const isRetryable = err.status === 503 || err.status === 502;
    res.status(err.status || 500).json({
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred.',
      category: err.category || 'server',
      retryable: isRetryable,
      requestId,
    });
  }
});

// Legacy alias (deprecation notice in header)
app.post('/api/[old-path]', (req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', '</api/v1/[path]>; rel="successor-version"');
  req.url = '/api/v1/[path]';
  app._router.handle(req, res, next);
});
```

### 3. Standard error envelope (always use this shape)

```js
{
  code: 'SNAKE_CASE_ERROR_CODE',     // machine-readable
  message: 'Human-readable message.', // shown to users
  category: 'weather|ai|geocoding|validation|server|rate_limit',
  retryable: true | false,
  requestId: 'uuid-v4',
  details: {}  // optional, debug info only (never user-facing)
}
```

### 4. PostHog event (every new route)

```js
posthog.capture({ distinctId: 'anonymous', event: '[route_name]_called',
  properties: { client: req.body.client || 'web', schemaVersion: req.body.schemaVersion || '1' }
});
```

### 5. Definition of Done

- [ ] Contract test passes (validates request/response shape)
- [ ] Error envelope test passes (bad input returns correct shape)
- [ ] Legacy alias works (same response as v1 route)
- [ ] PostHog event fires
- [ ] No new TypeScript/ESLint errors
- [ ] `npm test` — all tests green
