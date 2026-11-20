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

test("analytics starts only on planner URLs without callback or handoff data", async () => {
  const { isPlannerAnalyticsUrl } = await import("../../src/frontend/src/utils/analyticsConfig.js");
  for (const path of ["/", "/?utm_source=search"]) {
    assert.equal(isPlannerAnalyticsUrl(new URL(path, "https://sproutroute.app")), true);
  }
  for (const path of ["/s#secret", "/account", "/oauth/consent", "/?code=opaque", "/?authorization_id=opaque", "/#access_token=secret", "/?error_description=email"]) {
    assert.equal(isPlannerAnalyticsUrl(new URL(path, "https://sproutroute.app")), false);
  }
});
