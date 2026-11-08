import test from "node:test";
import assert from "node:assert/strict";
import crypto, { X509Certificate } from "node:crypto";
import fs from "node:fs";
import { encodeCbor } from "../helpers/cbor.js";
import {
  AttestError,
  DEFAULT_APP_ID,
  CHALLENGE_TTL_MS,
  assertionClientData,
  createChallengeSigner,
  decodeCbor,
  extractAttestNonce,
  parseAuthData,
  verifyAssertion,
  verifyAttestation,
} from "../../src/backend/services/appAttest.js";
import { APPLE_APP_ATTEST_ROOT_PEM, APPLE_APP_ATTEST_ROOT_SHA256 } from "../../src/backend/data/appleAppAttestRootCA.js";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/appAttest/attestations.json", import.meta.url)));
const FIXTURE_NOW = Date.parse(fixture.issuedAt) + 60_000;
const sha256 = (d) => crypto.createHash("sha256").update(d).digest();

function rejects(fn, reason) {
  assert.throws(fn, (err) => err instanceof AttestError && err.reason === reason, `expected ${reason}`);
}

export function makeAssertion({ privateKey, counter, clientData, appId = DEFAULT_APP_ID, flags = 0x01 }) {
  const counterBytes = Buffer.alloc(4);
  counterBytes.writeUInt32BE(counter);
  const authenticatorData = Buffer.concat([sha256(appId), Buffer.from([flags]), counterBytes]);
  const nonce = sha256(Buffer.concat([authenticatorData, sha256(Buffer.from(clientData, "utf8"))]));
  const signature = crypto.sign("sha256", nonce, privateKey);
  return encodeCbor({ signature, authenticatorData }).toString("base64");
}

// ── Challenges ──

test("a challenge verifies for 10 minutes and then expires", () => {
  let now = Date.parse("2026-11-07T10:00:00Z");
  const signer = createChallengeSigner({ secret: "s".repeat(32), now: () => now });
  const { challenge, expiresAt } = signer.issue();
  assert.match(challenge, /^[A-Za-z0-9_-]{54}$/);
  assert.equal(expiresAt, "2026-11-07T10:10:00.000Z");
  assert.equal(signer.verify(challenge), true);
  now += CHALLENGE_TTL_MS;
  assert.equal(signer.verify(challenge), true);
  now += 1;
  assert.equal(signer.verify(challenge), false);
});

test("a challenge from another secret, a tampered one, or junk does not verify", () => {
  const now = () => Date.parse("2026-11-07T10:00:00Z");
  const signer = createChallengeSigner({ secret: "a".repeat(32), now });
  const other = createChallengeSigner({ secret: "b".repeat(32), now });
  const { challenge } = signer.issue();
  assert.equal(other.verify(challenge), false);
  const raw = Buffer.from(challenge, "base64url");
  raw[20] ^= 1; // the timestamp
  assert.equal(signer.verify(raw.toString("base64url")), false);
  for (const junk of [undefined, "", "x".repeat(54), 42, `${challenge}A`]) assert.equal(signer.verify(junk), false);
});

test("a challenge stamped in the future beyond clock skew does not verify", () => {
  const now = Date.parse("2026-11-07T10:00:00Z");
  const issuedAhead = (ms) => createChallengeSigner({ secret: "c".repeat(32), now: () => now + ms }).issue().challenge;
  const verifier = createChallengeSigner({ secret: "c".repeat(32), now: () => now });
  assert.equal(verifier.verify(issuedAhead(2 * 60_000)), false);
  assert.equal(verifier.verify(issuedAhead(30_000)), true);
});

// ── Client data ──

test("assertion client data is METHOD, path, time and the body hash on separate lines", () => {
  const body = Buffer.from('{"destination":"Seattle"}');
  assert.equal(
    assertionClientData({ method: "post", path: "/api/v1/trip/stream", time: "1762500000000", rawBody: body }),
    `POST\n/api/v1/trip/stream\n1762500000000\n${sha256(body).toString("hex")}`,
  );
  // An empty or missing body hashes the empty string.
  const empty = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  assert.equal(assertionClientData({ method: "GET", path: "/p", time: "1", rawBody: undefined }), `GET\n/p\n1\n${empty}`);
  assert.equal(assertionClientData({ method: "GET", path: "/p", time: "1", rawBody: Buffer.alloc(0) }), `GET\n/p\n1\n${empty}`);
});

// ── Assertions ──

test("an assertion signed by the stored key verifies and reports its counter", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const clientData = assertionClientData({ method: "POST", path: "/api/v1/trip/bundle", time: "1762500000000", rawBody: Buffer.from("{}") });
  const assertion = makeAssertion({ privateKey, counter: 1, clientData });
  assert.deepEqual(verifyAssertion({ assertion, clientData, publicKeyPem, previousCounter: 0 }), { counter: 1, validationCategory: null });
});

test("a device assertion verifies when its flags carry the attested-credential bit", () => {
  // Real iPhones send 37 bytes of authenticator data with flag 0x40 set, but no credential data after it.
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const clientData = assertionClientData({ method: "POST", path: "/api/v1/trip/stream", time: "1762500000000", rawBody: Buffer.from("{}") });
  for (const flags of [0x40, 0x41, 0xc0]) {
    const assertion = makeAssertion({ privateKey, counter: 2, clientData, flags });
    assert.equal(verifyAssertion({ assertion, clientData, publicKeyPem, previousCounter: 1 }).counter, 2);
  }
});

test("an assertion is rejected when the body, key, App ID or counter is wrong", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const clientData = assertionClientData({ method: "POST", path: "/api/v1/trip/bundle", time: "1", rawBody: Buffer.from('{"a":1}') });
  const assertion = makeAssertion({ privateKey, counter: 5, clientData });

  const otherBody = assertionClientData({ method: "POST", path: "/api/v1/trip/bundle", time: "1", rawBody: Buffer.from('{"a":2}') });
  rejects(() => verifyAssertion({ assertion, clientData: otherBody, publicKeyPem }), "signature-invalid");

  const otherKey = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ type: "spki", format: "pem" });
  rejects(() => verifyAssertion({ assertion, clientData, publicKeyPem: otherKey }), "signature-invalid");

  const wrongApp = makeAssertion({ privateKey, counter: 5, clientData, appId: "AAAAAAAAAA.com.example.other" });
  rejects(() => verifyAssertion({ assertion: wrongApp, clientData, publicKeyPem }), "rp-id-mismatch");

  // Replay: the counter must be strictly greater than the stored one.
  rejects(() => verifyAssertion({ assertion, clientData, publicKeyPem, previousCounter: 5 }), "counter-replay");
  rejects(() => verifyAssertion({ assertion, clientData, publicKeyPem, previousCounter: 9 }), "counter-replay");
  rejects(() => verifyAssertion({ assertion: makeAssertion({ privateKey, counter: 0, clientData }), clientData, publicKeyPem }), "counter-replay");
});

test("malformed assertions are rejected without throwing anything but AttestError", () => {
  const publicKeyPem = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ type: "spki", format: "pem" });
  for (const assertion of ["", "!!!", Buffer.from([0xa1, 0x61]).toString("base64"), encodeCbor({ signature: "x" }).toString("base64"), "A".repeat(5000)]) {
    assert.throws(() => verifyAssertion({ assertion, clientData: "x", publicKeyPem }), AttestError);
  }
});

// ── CBOR and authenticator data ──

test("the CBOR decoder reads the App Attest subset and rejects truncated input", () => {
  const encoded = encodeCbor({ fmt: "apple-appattest", n: -7, big: 70000, list: [1, Buffer.from([9])], t: true });
  const { value, end } = decodeCbor(encoded);
  assert.equal(end, encoded.length);
  assert.equal(value.fmt, "apple-appattest");
  assert.equal(value.n, -7);
  assert.equal(value.big, 70000);
  assert.deepEqual(value.list[1], Buffer.from([9]));
  assert.throws(() => decodeCbor(encoded.subarray(0, encoded.length - 1)), AttestError);
  assert.throws(() => decodeCbor(Buffer.from([0x5f])), AttestError); // indefinite length
});

test("authenticator data exposes rpIdHash, counter, aaguid, credentialId and extensions", () => {
  const credentialId = crypto.randomBytes(32);
  const idLength = Buffer.from([0, 32]);
  const counter = Buffer.from([0, 0, 0, 7]);
  const authData = Buffer.concat([
    sha256(DEFAULT_APP_ID), Buffer.from([0x40 | 0x80]), counter, Buffer.from("appattestdevelop"), idLength, credentialId,
    encodeCbor(new Map([[1, 2], [-1, 1]])), encodeCbor({ apple_validation_category_01: 1 }),
  ]);
  const parsed = parseAuthData(authData);
  assert.equal(parsed.counter, 7);
  assert.deepEqual(parsed.credentialId, credentialId);
  assert.equal(parsed.aaguid.toString(), "appattestdevelop");
  assert.equal(parsed.extensions.apple_validation_category_01, 1);
  assert.throws(() => parseAuthData(authData.subarray(0, 40)), AttestError);
});

// ── Attestation ──

test("the pinned Apple root matches its recorded fingerprint", () => {
  const root = new X509Certificate(APPLE_APP_ATTEST_ROOT_PEM);
  assert.equal(root.fingerprint256, APPLE_APP_ATTEST_ROOT_SHA256);
  assert.equal(root.subject, "CN=Apple App Attestation Root CA\nO=Apple Inc.\nST=California");
  assert.equal(root.ca, true);
});

test("a structurally real attestation chained to the fixture root verifies (production and development)", () => {
  const prod = fixture.production;
  const result = verifyAttestation({ keyId: prod.keyId, attestation: prod.attestation, challenge: prod.challenge, now: FIXTURE_NOW, rootPem: fixture.rootPem });
  assert.equal(result.environment, "production");
  assert.ok(crypto.createPublicKey(result.publicKeyPem).equals(crypto.createPublicKey(crypto.createPrivateKey(prod.privateKeyPem))));

  const dev = fixture.development;
  const args = { keyId: dev.keyId, attestation: dev.attestation, challenge: dev.challenge, now: FIXTURE_NOW, rootPem: fixture.rootPem };
  assert.equal(verifyAttestation({ ...args, allowDevelopment: true }).environment, "development");
  rejects(() => verifyAttestation(args), "development-not-allowed");
});

test("attestation rejection paths", () => {
  const prod = fixture.production;
  const base = { keyId: prod.keyId, attestation: prod.attestation, challenge: prod.challenge, now: FIXTURE_NOW, rootPem: fixture.rootPem };

  // Under Apple's real root the fixture chain does not verify.
  rejects(() => verifyAttestation({ ...base, rootPem: undefined }), "x5c-chain-invalid");
  rejects(() => verifyAttestation({ ...base, challenge: fixture.development.challenge }), "nonce-mismatch");
  rejects(() => verifyAttestation({ ...base, keyId: fixture.development.keyId }), "key-id-mismatch");
  rejects(() => verifyAttestation({ ...base, appId: "AAAAAAAAAA.com.example.other" }), "rp-id-mismatch");
  rejects(() => verifyAttestation({ ...base, now: Date.parse("2200-01-01T00:00:00Z") }), "x5c-expired");
  rejects(() => verifyAttestation({ ...base, keyId: "not-a-key-id" }), "key-id-malformed");

  const object = decodeCbor(Buffer.from(prod.attestation, "base64")).value;
  const reencode = (patch) => encodeCbor({ fmt: object.fmt, attStmt: { x5c: object.attStmt.x5c, receipt: object.attStmt.receipt }, authData: object.authData, ...patch }).toString("base64");
  rejects(() => verifyAttestation({ ...base, attestation: reencode({ fmt: "packed" }) }), "format-not-apple-appattest");
  rejects(() => verifyAttestation({ ...base, attestation: reencode({ attStmt: { x5c: [object.attStmt.x5c[0]] } }) }), "x5c-malformed");
  rejects(() => verifyAttestation({ ...base, attestation: reencode({ attStmt: { x5c: [object.attStmt.x5c[1], object.attStmt.x5c[0]] } }) }), "x5c-issuer-not-ca");

  // Any change to authData (here a non-zero counter) breaks the nonce bound into the certificate.
  const tampered = Buffer.from(object.authData);
  tampered[36] = 1;
  rejects(() => verifyAttestation({ ...base, attestation: reencode({ authData: tampered }) }), "nonce-mismatch");
});

test("the nonce extension is read from the credential certificate and missing elsewhere", () => {
  const object = decodeCbor(Buffer.from(fixture.production.attestation, "base64")).value;
  assert.equal(extractAttestNonce(object.attStmt.x5c[0]).length, 32);
  rejects(() => extractAttestNonce(new X509Certificate(APPLE_APP_ATTEST_ROOT_PEM).raw), "nonce-missing");
});
