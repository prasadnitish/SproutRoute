# Affiliate Product Recommendations + Trip Generation Bug Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add affiliate search links to unchecked packing list items (monetization) and fix 5 critical bugs in the trip generation flow.

**Architecture:** AI prompt adds `searchQuery` per packing item → new `affiliateLinks.js` builds affiliate-tagged URLs server-side → `server.js` attaches `shopLinks[]` to response → `PackingChecklist.jsx` renders expandable Shop panel on unchecked items. Separately, `useTrip.js` gets error handling fixes for JSON parse failures, error property mismatches, and silent swallowing.

**Tech Stack:** Node.js, Express, React 18, node:test, Playwright

---

### Task 1: Fix trip generation error handling (`useTrip.js`)

**Files:**
- Modify: `src/frontend/src/hooks/useTrip.js:83-121`

This task fixes 4 bugs in the trip generation flow that cause crashes and silent failures.

- [ ] **Step 1: Fix error property mismatch (line 85)**

The backend returns `{ error: "..." }` but the frontend reads `errBody.message`. Fix:

```jsx
// In useTrip.js, line 83-86, replace:
if (!tripRes.ok) {
  const errBody = await tripRes.json().catch(() => ({}));
  throw new Error(errBody.message || "Failed to generate trip plan");
}

// With:
if (!tripRes.ok) {
  const errBody = await tripRes.json().catch(() => ({}));
  throw new Error(errBody.error || errBody.message || "Failed to generate trip plan");
}
```

- [ ] **Step 2: Fix JSON parse crash on HTML 502 errors (line 84)**

When the backend returns HTML (502 Bad Gateway), `response.json()` throws a SyntaxError. The `.catch(() => ({}))` on line 84 already handles this — but the same pattern is missing on line 87 and on the packing/safety response parsing. Also add a guard for the `tripRes.json()` call on line 87:

```jsx
// Line 87, replace:
const tripResult = await tripRes.json();

// With:
let tripResult;
try {
  tripResult = await tripRes.json();
} catch {
  throw new Error("Server returned an invalid response. Please try again.");
}
```

- [ ] **Step 3: Fix silent error swallowing in packing & safety steps (lines 91-121)**

Replace the empty `catch` blocks with console warnings so failures are visible:

```jsx
// Packing step (lines 91-103), replace:
try {
  const packRes = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formData),
  });
  if (packRes.ok) {
    setPackingList(await packRes.json());
  }
} catch { /* non-blocking */ }

// With:
try {
  const packRes = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formData),
  });
  if (packRes.ok) {
    setPackingList(await packRes.json());
  } else {
    console.warn("Packing list failed:", packRes.status);
  }
} catch (err) {
  console.warn("Packing list error (non-blocking):", err.message);
}
```

Apply the same pattern to the safety step (lines 105-121):

```jsx
try {
  const safetyRes = await fetch("/api/safety/travel-tips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      destination: parsed.destination,
      childrenAges: parsed.childrenAges,
      countryCode: tripResult?.trip?.countryCode || "",
    }),
  });
  if (safetyRes.ok) {
    setSafetyData(await safetyRes.json());
  } else {
    console.warn("Safety data failed:", safetyRes.status);
  }
} catch (err) {
  console.warn("Safety data error (non-blocking):", err.message);
}
```

- [ ] **Step 4: Run tests to verify nothing breaks**

Run: `npm test`
Expected: All existing tests pass (these are frontend changes, unit tests are backend-only)

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/hooks/useTrip.js
git commit -m "fix: trip generation error handling — JSON parse crash, error property mismatch, silent failures"
```

---

### Task 2: Create affiliate link builder (`affiliateLinks.js`)

**Files:**
- Create: `src/backend/utils/affiliateLinks.js`
- Create: `tests/unit/affiliateLinks.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/affiliateLinks.test.js`:

```js
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildShopLinks } from "../../src/backend/utils/affiliateLinks.js";

describe("buildShopLinks", () => {
  const originalEnv = process.env.AMAZON_AFFILIATE_TAG;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.AMAZON_AFFILIATE_TAG = originalEnv;
    } else {
      delete process.env.AMAZON_AFFILIATE_TAG;
    }
  });

  it("returns 3 store objects for a valid query", () => {
    process.env.AMAZON_AFFILIATE_TAG = "sproutroute-20";
    const links = buildShopLinks("reef safe sunscreen SPF 50");
    assert.equal(links.length, 3);
    assert.equal(links[0].store, "Amazon");
    assert.equal(links[1].store, "Walmart");
    assert.equal(links[2].store, "Target");
  });

  it("includes affiliate tag in Amazon URL when env var is set", () => {
    process.env.AMAZON_AFFILIATE_TAG = "sproutroute-20";
    const links = buildShopLinks("kids sunscreen");
    assert.ok(links[0].url.includes("tag=sproutroute-20"));
  });

  it("omits affiliate tag from Amazon URL when env var is unset", () => {
    delete process.env.AMAZON_AFFILIATE_TAG;
    const links = buildShopLinks("kids sunscreen");
    assert.ok(!links[0].url.includes("tag="));
  });

  it("URL-encodes the search query", () => {
    process.env.AMAZON_AFFILIATE_TAG = "test-20";
    const links = buildShopLinks("kids sun & sand toys");
    assert.ok(links[0].url.includes("kids%20sun%20%26%20sand%20toys"));
    assert.ok(links[1].url.includes("kids%20sun%20%26%20sand%20toys"));
    assert.ok(links[2].url.includes("kids%20sun%20%26%20sand%20toys"));
  });

  it("returns empty array for null/empty query", () => {
    assert.deepEqual(buildShopLinks(null), []);
    assert.deepEqual(buildShopLinks(""), []);
    assert.deepEqual(buildShopLinks(undefined), []);
  });

  it("strips HTML tags from query", () => {
    process.env.AMAZON_AFFILIATE_TAG = "test-20";
    const links = buildShopLinks('<script>alert("xss")</script>sunscreen');
    assert.ok(!links[0].url.includes("<script>"));
    assert.ok(links[0].url.includes("sunscreen"));
  });

  it("truncates query longer than 100 chars", () => {
    process.env.AMAZON_AFFILIATE_TAG = "test-20";
    const longQuery = "a".repeat(150);
    const links = buildShopLinks(longQuery);
    // The encoded query in URL should be based on truncated (100 char) input
    const decodedQuery = decodeURIComponent(links[0].url.split("k=")[1].split("&")[0]);
    assert.ok(decodedQuery.length <= 100);
  });

  it("includes correct colors for each store", () => {
    process.env.AMAZON_AFFILIATE_TAG = "test-20";
    const links = buildShopLinks("test");
    assert.equal(links[0].color, "#ff9900");
    assert.equal(links[1].color, "#0071dc");
    assert.equal(links[2].color, "#cc0000");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/affiliateLinks.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `affiliateLinks.js`**

Create `src/backend/utils/affiliateLinks.js`:

```js
// affiliateLinks.js — Builds affiliate-tagged search URLs for packing list items.
// Sanitizes AI-generated searchQuery before URL construction.

const STORES = [
  { store: "Amazon",  baseUrl: "https://www.amazon.com/s",  paramKey: "k",          color: "#ff9900" },
  { store: "Walmart", baseUrl: "https://www.walmart.com/search", paramKey: "q",     color: "#0071dc" },
  { store: "Target",  baseUrl: "https://www.target.com/s",  paramKey: "searchTerm", color: "#cc0000" },
];

const MAX_QUERY_LENGTH = 100;

function sanitizeQuery(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/<[^>]*>/g, "")      // strip HTML tags
    .replace(/\s+/g, " ")         // collapse whitespace
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

/**
 * Build affiliate-tagged search URLs for the given search query.
 * @param {string|null} searchQuery - AI-generated product search query
 * @returns {Array<{store: string, url: string, color: string}>}
 */
export function buildShopLinks(searchQuery) {
  const query = sanitizeQuery(searchQuery);
  if (!query) return [];

  const encoded = encodeURIComponent(query);
  const amazonTag = process.env.AMAZON_AFFILIATE_TAG;

  return STORES.map(({ store, baseUrl, paramKey, color }) => {
    let url = `${baseUrl}?${paramKey}=${encoded}`;
    if (store === "Amazon" && amazonTag) {
      url += `&tag=${encodeURIComponent(amazonTag)}`;
    }
    return { store, url, color };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/affiliateLinks.test.js`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/backend/utils/affiliateLinks.js tests/unit/affiliateLinks.test.js
git commit -m "feat: add affiliate link builder with sanitization and multi-store support"
```

---

### Task 3: Add `searchQuery` to packing list AI prompt

**Files:**
- Modify: `src/backend/services/packingListAI.js:42-68` (repair prompt) and `src/backend/services/packingListAI.js:214-253` (main prompt)
- Modify: `tests/unit/packingListAI.test.js` (if it exists, otherwise the prompt change is implicitly tested via integration)

- [ ] **Step 1: Add `searchQuery` to the main prompt item schema**

In `src/backend/services/packingListAI.js`, in the `buildPrompt` function, find the item schema in the system message (around line 222-228) and add `searchQuery`:

```js
// Replace the item schema block:
        {
          "name": "Item name",
          "quantity": "number or range like '2-3'",
          "reason": "Brief explanation (weather-based, activity-based, or child age-based)"
        }

// With:
        {
          "name": "Item name",
          "quantity": "number or range like '2-3'",
          "reason": "Brief explanation (weather-based, activity-based, or child age-based)",
          "searchQuery": "Short retail search query (3-8 words) for finding this product online"
        }
```

- [ ] **Step 2: Add searchQuery instruction to the requirements section**

In the same system message, after the existing numbered requirements (after the `sizeGuardrail` variable insertion), add:

```js
// After ${sizeGuardrail}, before the "Return ONLY the JSON" line, add:

For EACH item, include a "searchQuery" field: a short, specific Amazon/retail search query
(3-8 words) optimized for finding the best product. Include relevant qualifiers like "kids",
"travel size", "family pack", age-appropriate terms, or climate-specific terms.
Do NOT include brand names in searchQuery — keep it generic for best search results.
```

- [ ] **Step 3: Add `searchQuery` to the repair prompt schema**

In `buildRepairPrompt` (line 42-68), update the repair schema to include `searchQuery`:

```js
// Replace the item schema in the repair prompt:
        {
          "name": "string",
          "quantity": "string",
          "reason": "string"
        }

// With:
        {
          "name": "string",
          "quantity": "string",
          "reason": "string",
          "searchQuery": "string"
        }
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/packingListAI.js
git commit -m "feat: add searchQuery field to packing list AI prompt and repair schema"
```

---

### Task 4: Wire `buildShopLinks` into server.js packing routes

**Files:**
- Modify: `src/backend/server.js` (all routes that return packing list data)

- [ ] **Step 1: Find all packing list routes**

Search `server.js` for all calls to `generatePackingListFn` or `generatePackingList`. There should be:
- `POST /api/generate` (standalone packing list endpoint)
- Any combined endpoint that returns packing data

- [ ] **Step 2: Import `buildShopLinks` and add mapping**

At the top of `server.js`, add the import:

```js
import { buildShopLinks } from "./utils/affiliateLinks.js";
```

- [ ] **Step 3: Add `shopLinks` mapping after packing list generation**

In each route that returns packing list data, after `generatePackingListFn` returns the parsed list, map `shopLinks` onto each item:

```js
// After: const packingList = await generatePackingListFn(...)
// Before: res.json(packingList)

// Add shopLinks to each item in each category
if (packingList?.categories) {
  for (const category of packingList.categories) {
    category.items = category.items.map(item => ({
      ...item,
      shopLinks: item.searchQuery ? buildShopLinks(item.searchQuery) : [],
    }));
  }
}
```

Apply this to ALL routes that return packing list data.

- [ ] **Step 4: Add startup warning for missing affiliate tag**

Near the top of `server.js` where the server starts listening, add:

```js
if (!process.env.AMAZON_AFFILIATE_TAG) {
  console.warn("⚠️  AMAZON_AFFILIATE_TAG not set — affiliate links will work but won't earn commission");
}
```

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/backend/server.js
git commit -m "feat: wire affiliate shopLinks into packing list API responses"
```

---

### Task 5: Update RAG templates with `searchQuery` examples

**Files:**
- Modify: `src/backend/services/ragTemplates.js`

- [ ] **Step 1: Add `searchQuery` to packing template item format**

In `ragTemplates.js`, find the `PACKING_BASE` object. Each template currently uses string format like:
```
- Lightweight breathable clothing (moisture-wicking)
```

The AI needs to see the JSON item format with `searchQuery` to produce consistent output. Add a comment block above `PACKING_BASE` showing the expected format:

```js
// Each packing item should include: name, quantity, reason, searchQuery
// Example JSON items for the AI:
// { "name": "Reef-safe sunscreen SPF 50+", "quantity": "2", "reason": "tropical sun", "searchQuery": "reef safe sunscreen SPF 50 kids travel size" }
// { "name": "Stroller rain cover", "quantity": "1", "reason": "rainy forecast", "searchQuery": "universal stroller rain cover clear" }
// { "name": "Insect repellent", "quantity": "1", "reason": "tropical bugs", "searchQuery": "kids insect repellent DEET free travel" }
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/backend/services/ragTemplates.js
git commit -m "feat: add searchQuery examples to RAG packing templates"
```

---

### Task 6: Add Shop button UI to PackingChecklist

**Files:**
- Modify: `src/frontend/src/components/PackingChecklist.jsx`

- [ ] **Step 1: Add state for expanded shop panels**

At the top of the component, after the existing state declarations (line 21), add:

```jsx
const [expandedShop, setExpandedShop] = useState(null); // itemId of currently expanded shop panel
```

- [ ] **Step 2: Add the ShopPanel inline component**

Before the `return` statement (around line 127), add the ShopPanel component:

```jsx
const ShopPanel = ({ shopLinks }) => (
  <div className="ml-7 mt-1 mb-2 p-3 bg-gray-50 dark:bg-dark-bg rounded-xl border border-gray-100 dark:border-dark-border print:hidden">
    <div className="flex gap-2 flex-wrap">
      {shopLinks.map(({ store, url, color }) => (
        <a
          key={store}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-80"
          style={{ backgroundColor: color }}
          onClick={(e) => e.stopPropagation()}
        >
          {store === "Amazon" ? "🛒" : store === "Walmart" ? "🏪" : "🎯"} {store}
        </a>
      ))}
    </div>
    <p className="text-[10px] text-gray-400 mt-2">
      SproutRoute may earn a small commission — at no extra cost to you
    </p>
  </div>
);
```

- [ ] **Step 3: Add Shop button next to unchecked items**

In the item rendering loop (inside the `<label>` element, around line 260-285), after the item reason text and before the custom item remove button, add the Shop button for unchecked items:

```jsx
{/* After the item reason <p> tag (line ~284), before the isCustom remove button */}
{!isChecked && item.shopLinks?.length > 0 && (
  <button
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      setExpandedShop(expandedShop === itemId ? null : itemId);
    }}
    className="text-xs text-sprout-dark hover:text-sprout-base transition-colors shrink-0 mt-0.5 print:hidden"
    aria-label={`Shop for ${item.name}`}
  >
    🛒
  </button>
)}
```

- [ ] **Step 4: Render the ShopPanel below expanded items**

Right after the `</label>` closing tag (around line 298), add the conditional ShopPanel:

```jsx
{expandedShop === itemId && item.shopLinks?.length > 0 && (
  <ShopPanel shopLinks={item.shopLinks} />
)}
```

- [ ] **Step 5: Collapse shop panel when item is checked**

In the `toggleItem` function (line 42-56), add a line to collapse the shop panel when an item is checked:

```jsx
const toggleItem = (itemId) => {
  const newChecked = new Set(checkedItems);
  if (newChecked.has(itemId)) {
    newChecked.delete(itemId);
  } else {
    newChecked.add(itemId);
    setExpandedShop(null); // collapse shop when item is checked
  }
  setCheckedItems(newChecked);
  localStorage.setItem(
    "sproutroute_checked",
    JSON.stringify([...newChecked]),
  );
  if (onUpdate) onUpdate(newChecked);
};
```

- [ ] **Step 6: Build frontend to verify no compile errors**

Run: `cd src/frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/PackingChecklist.jsx
git commit -m "feat: add inline Shop panel with affiliate links for unchecked packing items"
```

---

### Task 7: Integration test for shopLinks in API response

**Files:**
- Modify: `tests/integration/api.integration.test.js`

- [ ] **Step 1: Add integration test for packing list with shopLinks**

In `tests/integration/api.integration.test.js`, add a new test:

```js
it("POST /api/generate includes shopLinks on items with searchQuery", async () => {
  process.env.AMAZON_AFFILIATE_TAG = "test-20";

  const app = createApp({
    generatePackingListFn: async () => ({
      categories: [
        {
          name: "Toiletries",
          items: [
            { name: "Sunscreen", quantity: "2", reason: "tropical", searchQuery: "reef safe sunscreen SPF 50" },
            { name: "Toothbrush", quantity: "1", reason: "hygiene" }, // no searchQuery
          ],
        },
      ],
    }),
  });

  const res = await request(app)
    .post("/api/generate")
    .send({ destination: "Maui", startDate: "2026-04-12", endDate: "2026-04-19", activities: ["beach"], children: [{ age: 5 }] });

  assert.equal(res.status, 200);
  const items = res.body.categories[0].items;

  // Item with searchQuery should have shopLinks
  assert.ok(Array.isArray(items[0].shopLinks));
  assert.equal(items[0].shopLinks.length, 3);
  assert.equal(items[0].shopLinks[0].store, "Amazon");
  assert.ok(items[0].shopLinks[0].url.includes("tag=test-20"));

  // Item without searchQuery should have empty shopLinks
  assert.deepEqual(items[1].shopLinks, []);

  delete process.env.AMAZON_AFFILIATE_TAG;
});
```

- [ ] **Step 2: Run integration tests**

Run: `node --test tests/integration/api.integration.test.js`
Expected: New test passes alongside existing tests

- [ ] **Step 3: Commit**

```bash
git add tests/integration/api.integration.test.js
git commit -m "test: add integration test for packing list shopLinks in API response"
```

---

### Task 8: E2E tests for Shop button in packing tile

**Files:**
- Modify: `tests/e2e/tiles/packing-tile.spec.ts`
- Modify: `tests/e2e/fixtures/trip-data.ts` (add shopLinks to mock packing data)

- [ ] **Step 1: Update mock packing data with shopLinks**

In `tests/e2e/fixtures/trip-data.ts`, update `MOCK_PACKING_LIST` to include `shopLinks` on items:

```ts
// Add shopLinks to the first few items in the mock packing list categories
// Each item that has a searchQuery should also have shopLinks
{
  name: "Sunscreen SPF 50+",
  quantity: "2",
  reason: "tropical sun",
  searchQuery: "reef safe sunscreen SPF 50 kids",
  shopLinks: [
    { store: "Amazon", url: "https://www.amazon.com/s?k=reef%20safe%20sunscreen&tag=test-20", color: "#ff9900" },
    { store: "Walmart", url: "https://www.walmart.com/search?q=reef%20safe%20sunscreen", color: "#0071dc" },
    { store: "Target", url: "https://www.target.com/s?searchTerm=reef%20safe%20sunscreen", color: "#cc0000" },
  ],
}
```

- [ ] **Step 2: Add E2E tests for Shop button behavior**

In `tests/e2e/tiles/packing-tile.spec.ts`, add these tests:

```ts
test("Shop button visible on unchecked items with shopLinks", async ({ page }) => {
  await goToResults(page);
  await page.getByRole("tab", { name: /pack/i }).click();
  const shopButton = page.getByLabel(/shop for sunscreen/i).first();
  await expect(shopButton).toBeVisible();
});

test("Shop button hidden on checked items", async ({ page }) => {
  await goToResults(page);
  await page.getByRole("tab", { name: /pack/i }).click();
  // Check the item
  const checkbox = page.getByRole("checkbox").first();
  await checkbox.check();
  // Shop button should disappear
  const shopButton = page.getByLabel(/shop for sunscreen/i).first();
  await expect(shopButton).not.toBeVisible();
});

test("Tapping Shop expands panel with 3 store links", async ({ page }) => {
  await goToResults(page);
  await page.getByRole("tab", { name: /pack/i }).click();
  const shopButton = page.getByLabel(/shop for sunscreen/i).first();
  await shopButton.click();
  await expect(page.getByText("Amazon")).toBeVisible();
  await expect(page.getByText("Walmart")).toBeVisible();
  await expect(page.getByText("Target")).toBeVisible();
});

test("Disclosure text visible in expanded Shop panel", async ({ page }) => {
  await goToResults(page);
  await page.getByRole("tab", { name: /pack/i }).click();
  const shopButton = page.getByLabel(/shop for sunscreen/i).first();
  await shopButton.click();
  await expect(page.getByText(/may earn a small commission/i)).toBeVisible();
});
```

- [ ] **Step 3: Run E2E tests**

Run: `npx playwright test tests/e2e/tiles/packing-tile.spec.ts --project=mocked`
Expected: All packing tile tests pass

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/tiles/packing-tile.spec.ts tests/e2e/fixtures/trip-data.ts
git commit -m "test: add E2E tests for packing list Shop button and affiliate panel"
```

---

### Task 9: Run full test suite and push

**Files:** None (verification only)

- [ ] **Step 1: Run unit + integration tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run E2E tests**

Run: `npx playwright test --project=mocked`
Expected: All mocked tests pass

- [ ] **Step 3: Build frontend**

Run: `cd src/frontend && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Push to main**

```bash
git push origin main
```

Expected: Railway auto-deploys. Set `AMAZON_AFFILIATE_TAG` env var in Railway dashboard.
