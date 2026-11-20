import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  verifiedSubscriber,
  createSocialBilling,
  syncRevenueCat,
} from "../../src/backend/services/socialBilling.js";

const now = Date.parse("2026-11-01T00:00:00Z");
const premium = {
  product_identifier: "annual",
  expires_date: "2026-10-30T00:00:00Z",
  grace_period_expires_date: "2026-11-03T00:00:00Z",
};
const purchase = {
  store: "app_store",
  is_sandbox: true,
  refunded_at: null,
  unsubscribe_detected_at: "2026-10-29T00:00:00Z",
};
const snapshot = (sub = purchase) => ({
  request_date_ms: now,
  subscriber: { entitlements: { premium }, subscriptions: { annual: sub } },
});
test("cancelled family subscription retains grace access, refunds and other environments do not", () => {
  assert.equal(
    verifiedSubscriber(
      snapshot({ ...purchase, ownership_type: "FAMILY_SHARED" }),
      true,
    ).expires,
    "2026-11-03T00:00:00.000Z",
  );
  assert.equal(
    verifiedSubscriber(
      snapshot({ ...purchase, refunded_at: "2026-11-01" }),
      true,
    ).expires,
    null,
  );
  assert.equal(verifiedSubscriber(snapshot(), false).expires, null);
});
test("malformed response or failed provider read cannot erase entitlement", async () => {
  let writes = 0;
  await assert.rejects(
    syncRevenueCat(randomUUID(), {
      apiKey: "fixture",
      fetchFn: async () => ({ ok: true, json: async () => ({}) }),
      rpc: async () => writes++,
    }),
  );
  assert.equal(writes, 0);
});
test("billing disabled rejects compute before calling provider", async () => {
  const billing = createSocialBilling({ enabled: false, preview: false });
  let ran = false;
  await assert.rejects(
    billing.extract(
      randomUUID(),
      { source: "https://example.org" },
      randomUUID(),
      () => {
        ran = true;
      },
    ),
    { code: "EXTRACTION_UNAVAILABLE" },
  );
  assert.equal(ran, false);
});
test("no evidence and model failure release the allowance; ambiguous settlement is never refunded", async () => {
  const finishes = [];
  let unavailable = false;
  const billing = createSocialBilling({
    enabled: true,
    rpc: async (name, args) => {
      if (name === "billing_reserve")
        return { state: "reserved", token: randomUUID() };
      finishes.push(args);
      if (unavailable) throw new Error("settlement lost");
      return true;
    },
  });
  const run = (fn) =>
    billing.extract(
      randomUUID(),
      { source: "https://example.org" },
      randomUUID(),
      fn,
    );
  await run(async () => ({ status: "needs_evidence", candidates: [] }));
  await assert.rejects(
    run(async () => {
      throw new Error("provider down");
    }),
  );
  unavailable = true;
  await assert.rejects(
    run(async () => ({ status: "review", candidates: [{ name: "Park" }] })),
  );
  assert.deepEqual(
    finishes.map((x) => x.consume),
    [false, false, true],
  );
});
test("daily reconciliation visits all known customers and reports retryable failures", async () => {
  const { reconcileBilling } =
    await import("../../src/backend/services/socialBilling.js");
  const checked = [];
  const pages = [[{ user_id: "a" }, { user_id: "b" }], [{ user_id: "c" }], []];
  const summary = await reconcileBilling({
    list: async () => pages.shift(),
    sync: async (id) => {
      checked.push(id);
      if (id === "a") throw new Error("temporary");
    },
  });
  assert.deepEqual(checked, ["a", "b", "c"]);
  assert.deepEqual(summary, { processed: 3, failed: 1 });
});
