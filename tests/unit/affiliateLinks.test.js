import { describe, it, afterEach } from "node:test";
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
