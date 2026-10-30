import test from "node:test";
import assert from "node:assert/strict";
import { CONSENT_KEY, readConsent, writeConsent, shouldLoadAnalytics, shouldAskConsent } from "../../src/frontend/src/utils/analyticsConsent.js";

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
};
const blockedStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };

test("nothing is stored until the visitor chooses, and only the two known answers are honored", () => {
  assert.equal(readConsent(memoryStorage()), null);
  assert.equal(readConsent(memoryStorage({ [CONSENT_KEY]: "granted" })), "granted");
  assert.equal(readConsent(memoryStorage({ [CONSENT_KEY]: "denied" })), "denied");
  assert.equal(readConsent(memoryStorage({ [CONSENT_KEY]: "yes please" })), null);
});

test("a choice is written and read back", () => {
  const storage = memoryStorage();
  writeConsent(storage, "granted");
  assert.equal(readConsent(storage), "granted");
  assert.equal(storage.data[CONSENT_KEY], "granted");
});

test("blocked storage reads as no consent and never throws", () => {
  assert.equal(readConsent(blockedStorage), null);
  assert.doesNotThrow(() => writeConsent(blockedStorage, "granted"));
  assert.equal(readConsent(undefined), null);
});

test("PostHog loads only in production, with a key, after an explicit yes", () => {
  const base = { isProd: true, key: "phc_x", consent: "granted" };
  assert.equal(shouldLoadAnalytics(base), true);
  for (const override of [{ consent: null }, { consent: "denied" }, { isProd: false }, { key: "" }]) {
    assert.equal(shouldLoadAnalytics({ ...base, ...override }), false, JSON.stringify(override));
  }
});

test("the choice is asked for once, and only where analytics could run", () => {
  const base = { isProd: true, key: "phc_x", consent: null };
  assert.equal(shouldAskConsent(base), true);
  for (const override of [{ consent: "granted" }, { consent: "denied" }, { isProd: false }, { key: "" }]) {
    assert.equal(shouldAskConsent({ ...base, ...override }), false, JSON.stringify(override));
  }
});
