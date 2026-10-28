import test from "node:test";
import assert from "node:assert/strict";
import { posthogOptions } from "../../src/frontend/src/utils/analyticsConfig.js";

test("web analytics never records sessions", () => {
  assert.equal(posthogOptions.disable_session_recording, true);
  assert.equal(posthogOptions.session_recording, undefined);
});

test("web analytics keeps person profiles limited to identified users and still counts page views", () => {
  assert.equal(posthogOptions.person_profiles, "identified_only");
  assert.equal(posthogOptions.capture_pageview, true);
});
