import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_CONSENT_KEY, AI_CONSENT_VERSION, AI_DISCLOSURE, hasAiConsent, grantAiConsent, withdrawAiConsent,
} from "../../src/frontend/src/utils/aiConsent.js";

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    data,
  };
};
const blockedStorage = {
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("blocked"); },
  removeItem() { throw new Error("blocked"); },
};

test("no consent until the visitor agrees", () => {
  const storage = memoryStorage();
  assert.equal(hasAiConsent(storage), false);
  assert.equal(grantAiConsent(storage), true);
  assert.equal(storage.data[AI_CONSENT_KEY], String(AI_CONSENT_VERSION));
  assert.equal(hasAiConsent(storage), true);
});

test("consent to an older disclosure version does not count", () => {
  assert.equal(hasAiConsent(memoryStorage({ [AI_CONSENT_KEY]: String(AI_CONSENT_VERSION - 1) })), false);
  assert.equal(hasAiConsent(memoryStorage({ [AI_CONSENT_KEY]: "yes" })), false);
});

test("consent can be withdrawn", () => {
  const storage = memoryStorage({ [AI_CONSENT_KEY]: String(AI_CONSENT_VERSION) });
  withdrawAiConsent(storage);
  assert.equal(hasAiConsent(storage), false);
});

test("blocked storage reads as no consent and reports that the answer was not saved", () => {
  assert.equal(hasAiConsent(blockedStorage), false);
  assert.equal(grantAiConsent(blockedStorage), false);
  assert.doesNotThrow(() => withdrawAiConsent(blockedStorage));
});

test("the disclosure names what is sent, what is not, and every provider with a privacy link", () => {
  assert.ok(AI_DISCLOSURE.sentItems.includes("Your children's ages"));
  assert.ok(AI_DISCLOSURE.notSentItems.length >= 1);
  assert.deepEqual(AI_DISCLOSURE.providers.map((p) => p.name), ["OpenAI", "Google (Gemini)", "Anthropic"]);
  for (const p of AI_DISCLOSURE.providers) assert.match(p.privacyUrl, /^https:\/\//);
});

test("the disclosure is honest about location: the website can send it when the visitor turns it on", () => {
  const all = [...AI_DISCLOSURE.sentItems, ...AI_DISCLOSURE.notSentItems].join(" | ");
  assert.ok(!AI_DISCLOSURE.notSentItems.includes("Your device location"));
  assert.match(AI_DISCLOSURE.sentItems.join(" | "), /city and state.*Use my location/);
  assert.match(AI_DISCLOSURE.notSentItems.join(" | "), /exact coordinates/);
  assert.match(AI_DISCLOSURE.locationNote, /OpenStreetMap/);
  assert.match(AI_DISCLOSURE.locationNote, /not the coordinates/);
  assert.ok(all.length > 0);
});
