import assert from "node:assert/strict";
import test from "node:test";

import { buildTripSearchProperties } from "../../src/frontend/src/utils/analyticsPayloads.js";
import { metrics } from "../../src/backend/services/metrics.js";
import { parserLogContext } from "../../src/backend/services/privacyTelemetry.js";

const SENSITIVE_PROMPT = "Vegas with Maya age 3, peanut allergy, and wheelchair-accessible rooms";

test("web trip-search analytics emits only allowlisted derived properties", () => {
  const payload = buildTripSearchProperties(SENSITIVE_PROMPT, {
    hasProfile: true,
    search_text: SENSITIVE_PROMPT,
    destination: SENSITIVE_PROMPT,
  });

  assert.deepEqual(payload, {
    prompt_length_bucket: "41-120",
    has_profile: true,
  });
  assert.equal(JSON.stringify(payload).includes("peanut"), false);
  assert.equal(JSON.stringify(payload).includes("Maya"), false);
});

test("parser log context excludes raw free-form text", () => {
  const context = parserLogContext({
    reqId: "request-1",
    text: SENSITIVE_PROMPT,
    detectedLat: "36.1699",
    detectedLon: "-115.1398",
  });

  assert.deepEqual(context, {
    reqId: "request-1",
    textLen: SENSITIVE_PROMPT.length,
    textLengthBucket: "41-120",
    hasDetectedLocation: true,
  });
  assert.equal(JSON.stringify(context).includes("peanut"), false);
});

test("operational search metrics discard raw text before memory and persistence", async () => {
  metrics.recordSearch({
    text: SENSITIVE_PROMPT,
    destination: "Las Vegas",
    vibe: "family",
    childCount: 1,
    petCount: 0,
    ms: 42,
  });

  const snapshot = await metrics.getSnapshot();
  const recent = snapshot.recentSearches[0];
  assert.equal(recent.text, undefined);
  assert.equal(recent.textLengthBucket, "41-120");
  assert.equal(JSON.stringify(recent).includes("peanut"), false);
});
