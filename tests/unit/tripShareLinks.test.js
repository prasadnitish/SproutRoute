import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_STORE_URL, planYourOwnHref } from '../../src/frontend/src/utils/tripShare.js';

test('"Plan your own trip" goes to the App Store on iPhone and iPad, and to the web planner elsewhere', () => {
  assert.equal(APP_STORE_URL, 'https://apps.apple.com/app/id6759532704');
  const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 };
  const ipadDesktopMode = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 };
  const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 };
  const android = { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)', maxTouchPoints: 5 };
  assert.equal(planYourOwnHref(iphone), APP_STORE_URL);
  assert.equal(planYourOwnHref(ipadDesktopMode), APP_STORE_URL);
  assert.equal(planYourOwnHref(mac), '/');
  assert.equal(planYourOwnHref(android), '/');
  assert.equal(planYourOwnHref(undefined), '/');
});
