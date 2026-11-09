import test from "node:test";
import assert from "node:assert/strict";
import { loadCloudflareBeacon, BEACON_SRC } from "../../src/frontend/src/utils/cloudflareBeacon.js";

function fakeDoc({ existing = false } = {}) {
  const appended = [];
  return {
    appended,
    querySelector: () => (existing ? {} : null),
    createElement: () => {
      const attrs = {};
      return { attrs, setAttribute(key, value) { attrs[key] = value; } };
    },
    body: { appendChild: (el) => appended.push(el) },
  };
}

test("the beacon is added once the visitor has allowed analytics in production", () => {
  const doc = fakeDoc();
  assert.equal(loadCloudflareBeacon({ isProd: true, consent: "granted", doc }), true);

  assert.equal(doc.appended.length, 1);
  const script = doc.appended[0];
  assert.equal(script.src, BEACON_SRC);
  assert.equal(script.type, "module");
  assert.match(JSON.parse(script.attrs["data-cf-beacon"]).token, /^[0-9a-f]{32}$/);
});

test("no beacon without a yes: undecided, declined, or outside production", () => {
  for (const [consent, isProd] of [[null, true], ["denied", true], ["granted", false]]) {
    const doc = fakeDoc();
    assert.equal(loadCloudflareBeacon({ isProd, consent, doc }), false);
    assert.equal(doc.appended.length, 0, `consent=${consent} isProd=${isProd}`);
  }
});

test("a second call, or a beacon Cloudflare already injected, does not add a duplicate", () => {
  const doc = fakeDoc({ existing: true });
  assert.equal(loadCloudflareBeacon({ isProd: true, consent: "granted", doc }), false);
  assert.equal(doc.appended.length, 0);
});

test("without a document nothing is attempted", () => {
  assert.equal(loadCloudflareBeacon({ isProd: true, consent: "granted", doc: undefined }), false);
});
