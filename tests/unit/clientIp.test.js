import test from "node:test";
import assert from "node:assert/strict";
import { createClientIpMiddleware, ORIGIN_SECRET_HEADER } from "../../src/backend/utils/clientIp.js";

// Behind Cloudflare, Express sees Cloudflare's address, so per-IP limits count Cloudflare, not the visitor.
// The visitor's address (CF-Connecting-IP) is trusted only when the request also carries the secret that a
// Cloudflare Transform Rule adds. A caller who reaches the origin directly has no way to produce it.

const SECRET = "origin-secret-".padEnd(48, "x");

function run({ headers = {}, secret = SECRET, now = () => 0, warnings = [] } = {}) {
  const req = { ip: "198.51.100.1", headers };
  const middleware = createClientIpMiddleware({
    getSecret: () => secret,
    now,
    logger: { warn: (msg, meta) => warnings.push({ msg, meta }) },
  });
  let called = false;
  middleware(req, {}, () => { called = true; });
  assert.equal(called, true, "the middleware must always call next()");
  return { req, warnings };
}

test("a request carrying the origin secret takes the visitor address from CF-Connecting-IP", () => {
  const { req } = run({ headers: { "cf-connecting-ip": "203.0.113.7", [ORIGIN_SECRET_HEADER]: SECRET } });
  assert.equal(req.ip, "203.0.113.7");
});

test("IPv6 visitor addresses are accepted", () => {
  const { req } = run({ headers: { "cf-connecting-ip": "2001:db8::1", [ORIGIN_SECRET_HEADER]: SECRET } });
  assert.equal(req.ip, "2001:db8::1");
});

test("without the secret header the claimed address is ignored", () => {
  const { req } = run({ headers: { "cf-connecting-ip": "203.0.113.7" } });
  assert.equal(req.ip, "198.51.100.1");
});

test("with the wrong secret the claimed address is ignored", () => {
  const { req } = run({ headers: { "cf-connecting-ip": "203.0.113.7", [ORIGIN_SECRET_HEADER]: "wrong".padEnd(48, "x") } });
  assert.equal(req.ip, "198.51.100.1");
});

test("an unset or short origin secret never matches, even against an empty header", () => {
  for (const secret of ["", "short-secret"]) {
    const { req } = run({ secret, headers: { "cf-connecting-ip": "203.0.113.7", [ORIGIN_SECRET_HEADER]: secret } });
    assert.equal(req.ip, "198.51.100.1", `secret=${JSON.stringify(secret)}`);
  }
});

test("a verified request with a malformed or multi-value address keeps the Express address", () => {
  for (const claimed of ["not-an-ip", "203.0.113.7, 198.51.100.9", "203.0.113.7:443", " "]) {
    const { req } = run({ headers: { "cf-connecting-ip": claimed, [ORIGIN_SECRET_HEADER]: SECRET } });
    assert.equal(req.ip, "198.51.100.1", `claimed=${JSON.stringify(claimed)}`);
  }
});

test("a request with no Cloudflare header is left alone and logs nothing", () => {
  const { req, warnings } = run({ headers: {} });
  assert.equal(req.ip, "198.51.100.1");
  assert.deepEqual(warnings, []);
});

test("an unverified Cloudflare header logs one warning per ten minutes, with the reason and no address", () => {
  // One middleware instance, so the throttle state is shared between the calls.
  const warnings = [];
  const middleware = createClientIpMiddleware({
    getSecret: () => SECRET,
    now: () => 0,
    logger: { warn: (msg, meta) => warnings.push({ msg, meta }) },
  });
  const send = () => middleware({ ip: "198.51.100.1", headers: { "cf-connecting-ip": "203.0.113.7" } }, {}, () => {});
  send();
  send();
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].msg, "client-ip:cloudflare-header-not-verified");
  assert.equal(warnings[0].meta.reason, "missing-secret-header");
  assert.equal(JSON.stringify(warnings[0]).includes("203.0.113.7"), false);
});

test("the warning repeats after the ten minutes pass, and names a wrong secret", () => {
  // One middleware instance, so the throttle state is shared between the two calls.
  const warnings = [];
  let time = 0;
  const middleware = createClientIpMiddleware({
    getSecret: () => SECRET,
    now: () => time,
    logger: { warn: (msg, meta) => warnings.push({ msg, meta }) },
  });
  const send = (headers) => middleware({ ip: "198.51.100.1", headers }, {}, () => {});
  send({ "cf-connecting-ip": "203.0.113.7", [ORIGIN_SECRET_HEADER]: "wrong".padEnd(48, "x") });
  send({ "cf-connecting-ip": "203.0.113.7", [ORIGIN_SECRET_HEADER]: "wrong".padEnd(48, "x") });
  time = 10 * 60 * 1000 + 1;
  send({ "cf-connecting-ip": "203.0.113.7", [ORIGIN_SECRET_HEADER]: "wrong".padEnd(48, "x") });
  assert.equal(warnings.length, 2);
  assert.equal(warnings[0].meta.reason, "wrong-secret");
});
