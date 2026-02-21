# Fix Failing Test

Use this skill when a test is failing and you need to debug it systematically.

## Step 1 — Identify the failure

Run the full suite and capture output:
```bash
npm test 2>&1 | head -80
```

For a specific file:
```bash
node --test tests/unit/[filename].test.js 2>&1
```

Look for:
- `AssertionError` — wrong value returned
- `TypeError` / `ReferenceError` — import/export problem or missing function
- `SyntaxError` — broken JS in source or test
- Timeout — async function hanging (missing `await`, infinite loop, or real API call leaking through)

## Step 2 — Trace the failure to root cause

For `AssertionError`:
1. Read the test to understand what it expects
2. Add `console.log(actual)` before the assertion to see what's returned
3. Trace back through the source function: what input path leads to this output?

For hanging test (timeout):
1. Check if `global.fetch` mock is set — real fetch calls will hang in test env
2. Check for missing `await` on async functions
3. Check for unclosed timers: `clearTimeout(timer)` in `afterEach`

For import errors:
1. Verify the export in the source file: `export function foo()` or `export default`
2. Verify the import path is correct (relative, includes extension `.js`)
3. Check `"type": "module"` is set in package.json (project uses ESM)

## Step 3 — Fix the source, not the test

**Golden rule: fix the implementation to match the test, never change the test to hide a bug.**

Exception: if the test itself was written incorrectly (tests the wrong thing), fix the test AND document why.

## Step 4 — Verify nothing else broke

After fixing:
```bash
npm test 2>&1 | tail -20
```

All previously-passing tests must still pass. If a fix breaks another test, there's a hidden coupling — investigate before pushing.

## Step 5 — Document if non-obvious

If the fix was non-obvious (e.g., ESM import caching, async timing issue, mock teardown), add a comment in the test explaining what it's guarding against:
```js
// Guard: fetch mock must be reset between tests to prevent test pollution.
// Without this, test B inherits test A's mock response.
afterEach(() => { global.fetch = originalFetch; });
```

## Common failure patterns in this codebase

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `fetch is not defined` | No `global.fetch` mock | Add mock before the call |
| Wrong result from geocoding | Cache not reset | Call `__resetGeocodingCachesForTests()` in `afterEach` |
| `createApp is not a function` | Wrong import | `import { createApp } from '../../src/backend/server.js'` |
| `Cannot read property of undefined` | Mock returning wrong shape | Check mock matches real API response shape |
| Test passes alone, fails in suite | State leak | Check `afterEach` cleanup, especially global mocks |
