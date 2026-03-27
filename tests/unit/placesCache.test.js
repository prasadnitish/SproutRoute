// tests/unit/placesCache.test.js
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PlacesCache } from "../../src/backend/utils/placesCache.js";

describe("PlacesCache", () => {
  let cache;
  beforeEach(() => { cache = new PlacesCache({ maxSize: 3, ttlMs: 100 }); });

  it("returns null for cache miss", () => {
    assert.equal(cache.get("unknown", "city"), null);
  });

  it("stores and retrieves a value", () => {
    cache.set("Mama's Fish House", "Maui", { rating: 4.9 });
    const result = cache.get("Mama's Fish House", "Maui");
    assert.deepEqual(result, { rating: 4.9 });
  });

  it("returns null after TTL expires", async () => {
    cache.set("place", "city", { data: true });
    await new Promise(r => setTimeout(r, 150));
    assert.equal(cache.get("place", "city"), null);
  });

  it("evicts oldest entry when maxSize exceeded", () => {
    cache.set("a", "city", { n: 1 });
    cache.set("b", "city", { n: 2 });
    cache.set("c", "city", { n: 3 });
    cache.set("d", "city", { n: 4 });
    assert.equal(cache.get("a", "city"), null);
    assert.deepEqual(cache.get("d", "city"), { n: 4 });
  });

  it("generates consistent cache keys regardless of case", () => {
    cache.set("Mama's Fish House", "Maui, Hawaii", { rating: 4.9 });
    const result = cache.get("mama's fish house", "maui, hawaii");
    assert.deepEqual(result, { rating: 4.9 });
  });
});
