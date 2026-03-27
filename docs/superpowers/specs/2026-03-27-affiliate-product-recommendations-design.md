# Affiliate Product Recommendations — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Scope:** Packing list monetization via affiliate search links

---

## Problem

Users generate packing lists with 20-30 items. They check off what they own and need to buy the rest — but the app gives them no help acquiring those items. Users leave the app to search Amazon/Walmart/Target manually. This is a missed monetization opportunity and a UX gap.

## Solution

Add inline affiliate-tagged search links to unchecked packing list items. When a user hasn't checked off an item, a "Shop" button appears. Tapping it expands an inline panel showing search links to Amazon, Walmart, and Target with the item's AI-optimized search query. Each link opens in a new tab. SproutRoute earns affiliate commission (avg ~4%) on purchases.

## Design Decisions

### Option B selected: Separate inline expansion with multi-store price comparison

- "Shop" button appears next to each unchecked item
- Tapping expands an inline panel with 3 store search links (Amazon, Walmart, Target)
- Each link is an affiliate-tagged search URL — no product API integration needed
- FTC/Apple disclosure shown per-expansion: "SproutRoute may earn a small commission — at no extra cost to you"

### Option A (inline per-item button only) was considered but lacked price comparison value.

---

## Architecture

### 1. AI Prompt Change (`packingListAI.js`)

Add `searchQuery` field to the packing list item schema in the AI prompt:

```json
{
  "name": "Reef-safe sunscreen SPF 50+",
  "quantity": "2",
  "reason": "Tropical climate, water activities",
  "searchQuery": "reef safe sunscreen SPF 50 kids travel size"
}
```

The AI generates an optimized search query that includes trip context (kid ages, climate, destination type). This is zero additional API calls — just a schema addition to the existing prompt.

**Prompt addition (system message):**
```
For EACH item, also include a "searchQuery" field: a short, specific Amazon/retail search query
(3-8 words) optimized for finding the best product. Include relevant qualifiers like "kids",
"travel size", "family pack", age-appropriate terms, or climate-specific terms.
Do NOT include brand names in searchQuery — keep it generic for best search results.
```

**Repair prompt update:** The `buildRepairPrompt` function in `packingListAI.js` must also include `searchQuery` in its repair schema. Otherwise, packing lists that go through the repair fallback path will silently lose all `searchQuery` fields, and users will see no Shop buttons. If repair strips `searchQuery`, the server-side mapping degrades gracefully (`shopLinks: []`) but this must be tested.

### 2. Affiliate Link Builder (`affiliateLinks.js` — new file)

**Location:** `src/backend/utils/affiliateLinks.js`

```js
buildShopLinks(searchQuery) → [
  { store: "Amazon",  url: "https://amazon.com/s?k=...", color: "#ff9900", icon: "amazon" },
  { store: "Walmart", url: "https://walmart.com/search?q=...", color: "#0071dc", icon: "walmart" },
  { store: "Target",  url: "https://target.com/s?searchTerm=...", color: "#cc0000", icon: "target" },
]
```

**Security: URL construction rules:**
- Always use `encodeURIComponent(searchQuery)` for query parameters — never manual string concatenation
- Sanitize `searchQuery` before URL construction: strip HTML tags, enforce max 100 chars, trim whitespace
- This prevents URL injection from AI-echoed user input (e.g., destination containing special characters)

**Affiliate tag injection:**
- Amazon: `&tag=${AMAZON_AFFILIATE_TAG}` URL parameter (Associates program)
- Walmart: Impact Radius link wrapping (future — search URL works day 1 without tracking)
- Target: Impact affiliate link wrapping (future — search URL works day 1 without tracking)

**Environment variables:**
- `AMAZON_AFFILIATE_TAG` — Amazon Associates tag (e.g., `sproutroute-20`)
- `WALMART_AFFILIATE_ID` — future
- `TARGET_AFFILIATE_ID` — future

Tags stored server-side only. Frontend receives pre-built URLs.

**Missing env var behavior:** If `AMAZON_AFFILIATE_TAG` is not set, `buildShopLinks` omits the `&tag=` parameter entirely. Links still work (users can shop), but no commission is tracked. A warning is logged at server startup if the tag is missing. Unit test covers this case.

### 3. Backend Integration (`server.js` — packing list route)

After `generatePackingList()` returns parsed items, iterate and attach `shopLinks`:

```js
const items = parsedList.items.map(item => ({
  ...item,
  shopLinks: item.searchQuery ? buildShopLinks(item.searchQuery) : [],
}));
```

This runs synchronously (URL string construction only) — no latency impact.

**All packing list routes:** The `buildShopLinks` mapping must be applied in EVERY route that returns packing list data. Audit `server.js` for all calls to `generatePackingListFn` — currently this includes:
- `POST /api/generate` (standalone packing list)
- The combined trip-plan orchestration route (if it returns packing data)

Both must apply the same `shopLinks` mapping.

### 4. Frontend: PackingChecklist.jsx

**New behavior for unchecked items:**
- Render a "Shop" button (shopping cart icon) next to each unchecked item
- On tap: expand an inline panel below the item showing 3 store link buttons
- Each button: store logo/icon + store name, colored by brand
- Below the store links: disclosure text "SproutRoute may earn a small commission — at no extra cost to you"
- On check (item marked as owned): collapse and hide the Shop button

**Checked items:** No Shop button, no expansion. Clean checklist.

**Defensive rendering:** Use optional chaining for `shopLinks` access: `item.shopLinks?.length > 0` (not `item.shopLinks.length > 0`). Items from the repair fallback path or older cached responses may lack `shopLinks` entirely. Empty packing lists render normally with no Shop buttons and no errors.

### 5. RAG Template Update (`ragTemplates.js`)

Update packing base templates to include `searchQuery` examples so the AI has few-shot guidance:

```
- { "name": "Sunscreen SPF 50+", "quantity": "2", "reason": "tropical sun", "searchQuery": "reef safe sunscreen SPF 50 kids travel size" }
- { "name": "Stroller rain cover", "quantity": "1", "reason": "rainy forecast", "searchQuery": "universal stroller rain cover clear" }
```

---

## API Response Shape Change

**Current packing list item:**
```json
{ "name": "Sunscreen SPF 50+", "quantity": "2", "reason": "tropical climate" }
```

**New packing list item:**
```json
{
  "name": "Sunscreen SPF 50+",
  "quantity": "2",
  "reason": "tropical climate",
  "searchQuery": "reef safe sunscreen SPF 50 kids travel size",
  "shopLinks": [
    { "store": "Amazon", "url": "https://amazon.com/s?k=reef+safe+sunscreen+SPF+50+kids+travel+size&tag=sproutroute-20", "color": "#ff9900" },
    { "store": "Walmart", "url": "https://walmart.com/search?q=reef+safe+sunscreen+SPF+50+kids+travel+size", "color": "#0071dc" },
    { "store": "Target", "url": "https://target.com/s?searchTerm=reef+safe+sunscreen+SPF+50+kids+travel+size", "color": "#cc0000" }
  ]
}
```

**Backward compatible:** Existing clients that don't read `searchQuery` or `shopLinks` are unaffected.

---

## Data Flow

```
User submits trip
  → POST /api/generate (packing list)
  → packingListAI.js generates items with searchQuery field
  → server.js maps items through buildShopLinks()
  → Response includes shopLinks[] on each item
  → PackingChecklist.jsx renders Shop button on unchecked items
  → User taps Shop → inline panel with 3 store links
  → User clicks store link → new tab with affiliate-tagged search
  → Purchase → commission (avg ~4%)
```

---

## Monetization Math

| Metric | Value |
|--------|-------|
| Avg items per packing list | 20-30 |
| Avg items user needs to buy | 6-8 (30-40%) |
| Avg purchase value per item | ~$20 |
| Avg order value per trip | ~$120-160 |
| Amazon affiliate commission | ~4% avg |
| Revenue per converting trip | ~$5-6 |
| Click-to-buy conversion rate | ~15-20% |
| **Effective revenue per trip plan** | **~$0.75-1.20** |
| Cost per trip plan (AI + Places) | ~$0.05-0.08 |
| **Gross margin** | **~89%** |
| Breakeven | ~2,200 trips/month |

---

## Files Changed

| File | Change |
|------|--------|
| `src/backend/services/packingListAI.js` | Add `searchQuery` to item schema in AI prompt |
| `src/backend/utils/affiliateLinks.js` | **New** — `buildShopLinks(query)` URL builder |
| `src/backend/server.js` | Map items through `buildShopLinks` in packing route |
| `src/backend/services/ragTemplates.js` | Add `searchQuery` examples to packing templates |
| `src/frontend/src/components/PackingChecklist.jsx` | Shop button + inline expansion for unchecked items |
| `tests/unit/affiliateLinks.test.js` | **New** — URL construction tests |
| `tests/unit/packingListAI.test.js` | Verify searchQuery in prompt schema |
| `tests/e2e/tiles/packing-tile.spec.ts` | Shop button visibility + expand/collapse |
| `tests/integration/api.integration.test.js` | Add test: `/api/generate` response includes `shopLinks` |

---

## Testing

### Unit tests (`tests/unit/affiliateLinks.test.js` — new)
- `buildShopLinks("reef safe sunscreen")` returns 3 store objects
- Each URL contains the `encodeURIComponent`-encoded search query
- Amazon URL includes affiliate tag from env when `AMAZON_AFFILIATE_TAG` is set
- Amazon URL omits `&tag=` when `AMAZON_AFFILIATE_TAG` is unset
- Empty/null query returns empty array
- Special characters and HTML tags are sanitized before URL encoding
- Query longer than 100 chars is truncated

### Unit tests (`tests/unit/packingListAI.test.js` — update)
- AI prompt includes `searchQuery` in the item schema
- Parsed response contains `searchQuery` on each item
- Repair prompt schema includes `searchQuery` field
- Items from repair fallback path degrade gracefully (shopLinks: []) when searchQuery is missing

### Integration test (`tests/integration/api.integration.test.js` — update)
- `POST /api/generate` with mocked AI response containing `searchQuery` → response items include `shopLinks` array
- `shopLinks` contains 3 store objects with valid URLs

### E2E tests (`tests/e2e/tiles/packing-tile.spec.ts` — update)
- Mock packing response includes `shopLinks` on items
- "Shop" button visible on unchecked items
- "Shop" button hidden on checked items
- Tap Shop → inline panel expands with 3 store links
- Disclosure text visible in expanded panel
- Check item → Shop button disappears

---

## Day 1 vs Future

**Day 1 (this spec):**
- Amazon affiliate links with real tag
- Walmart + Target search links (no affiliate tracking yet)
- AI-generated searchQuery per item
- Inline expansion UI in PackingChecklist

**Future:**
- Register for Walmart (Impact Radius) and Target affiliate programs
- Track click-through rates per store per item category
- A/B test link placement and copy
- Add "Popular with families" badge based on click data
- Personalized recommendations based on past trips
