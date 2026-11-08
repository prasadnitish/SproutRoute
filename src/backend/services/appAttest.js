/**
 * Apple App Attest verification with node:crypto only (no new dependencies).
 *
 * Steps follow Apple's "Validating apps that connect to your server" and the
 * attestation object validation guide (developer.apple.com/documentation/devicecheck).
 *
 * Attestation (once per app install, POST /api/v1/device/attest):
 *   x5c chain to the pinned Apple App Attestation Root CA; nonce extension
 *   (OID 1.2.840.113635.100.8.2) equals SHA256(authData || SHA256(challenge));
 *   SHA256(uncompressed credCert public key) equals keyId; rpIdHash equals
 *   SHA256(appId); counter is 0; aaguid is the production or development value;
 *   credentialId equals keyId.
 * Assertion (every metered request): nonce = SHA256(authenticatorData || SHA256(clientData)),
 *   ECDSA P-256 signature over nonce with the stored key, rpIdHash, counter greater than stored.
 */
import crypto, { X509Certificate } from "node:crypto";
import { APPLE_APP_ATTEST_ROOT_PEM, APPLE_APP_ATTEST_ROOT_SHA256 } from "../data/appleAppAttestRootCA.js";

export const DEFAULT_APP_ID = "YNCCXQ5TUR.com.sproutroute.app";
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const CHALLENGE_SKEW_MS = 60 * 1000;
const NONCE_OID = Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x08, 0x02]);
const AAGUID_PRODUCTION = Buffer.concat([Buffer.from("appattest"), Buffer.alloc(7)]);
const AAGUID_DEVELOPMENT = Buffer.from("appattestdevelop");
const FLAG_ATTESTED_CREDENTIAL = 0x40;
const FLAG_EXTENSIONS = 0x80;
const KEY_ID_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

if (new X509Certificate(APPLE_APP_ATTEST_ROOT_PEM).fingerprint256 !== APPLE_APP_ATTEST_ROOT_SHA256) {
  throw new Error("Pinned Apple App Attestation Root CA does not match its recorded fingerprint");
}

export class AttestError extends Error {
  constructor(reason, message = reason) {
    super(message);
    this.name = "AttestError";
    this.reason = reason;
  }
}

const sha256 = (data) => crypto.createHash("sha256").update(data).digest();
const fail = (reason) => { throw new AttestError(reason); };

export function isKeyId(value) {
  return typeof value === "string" && KEY_ID_PATTERN.test(value);
}

// ── CBOR (RFC 8949), the subset App Attest uses: definite lengths, ints, bytes, text, arrays, maps ──

export function decodeCbor(buf, offset = 0) {
  return readCbor(buf, offset, 0);
}

function readCbor(buf, pos, depth) {
  if (depth > 16) fail("cbor-too-deep");
  if (pos >= buf.length) fail("cbor-truncated");
  const initial = buf[pos++];
  const major = initial >> 5;
  const info = initial & 0x1f;
  if (major === 7) {
    const simple = { 20: false, 21: true, 22: null, 23: undefined };
    if (info in simple) return { value: simple[info], end: pos };
    fail("cbor-unsupported");
  }
  let len;
  if (info < 24) len = info;
  else if (info === 24) { need(buf, pos, 1); len = buf[pos]; pos += 1; }
  else if (info === 25) { need(buf, pos, 2); len = buf.readUInt16BE(pos); pos += 2; }
  else if (info === 26) { need(buf, pos, 4); len = buf.readUInt32BE(pos); pos += 4; }
  else if (info === 27) {
    need(buf, pos, 8);
    const big = buf.readBigUInt64BE(pos);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) fail("cbor-too-large");
    len = Number(big);
    pos += 8;
  } else fail("cbor-unsupported");

  switch (major) {
    case 0: return { value: len, end: pos };
    case 1: return { value: -1 - len, end: pos };
    case 2: need(buf, pos, len); return { value: buf.subarray(pos, pos + len), end: pos + len };
    case 3: need(buf, pos, len); return { value: buf.toString("utf8", pos, pos + len), end: pos + len };
    case 4: {
      if (len > buf.length - pos) fail("cbor-truncated");
      const value = [];
      for (let i = 0; i < len; i++) {
        const item = readCbor(buf, pos, depth + 1);
        value.push(item.value);
        pos = item.end;
      }
      return { value, end: pos };
    }
    case 5: {
      if (len > buf.length - pos) fail("cbor-truncated");
      const value = Object.create(null);
      for (let i = 0; i < len; i++) {
        const key = readCbor(buf, pos, depth + 1);
        if (typeof key.value !== "string" && typeof key.value !== "number") fail("cbor-bad-key");
        const item = readCbor(buf, key.end, depth + 1);
        value[String(key.value)] = item.value;
        pos = item.end;
      }
      return { value, end: pos };
    }
    default: // 6: tag, ignored
      return readCbor(buf, pos, depth + 1);
  }
}

function need(buf, pos, n) {
  if (pos + n > buf.length) fail("cbor-truncated");
}

// ── Authenticator data (WebAuthn layout) ──

export function parseAuthData(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 37) fail("authdata-short");
  const out = {
    rpIdHash: buf.subarray(0, 32),
    flags: buf[32],
    counter: buf.readUInt32BE(33),
  };
  let pos = 37;
  if (out.flags & FLAG_ATTESTED_CREDENTIAL) {
    if (buf.length < pos + 18) fail("authdata-short");
    out.aaguid = buf.subarray(pos, pos + 16);
    const idLength = buf.readUInt16BE(pos + 16);
    pos += 18;
    if (buf.length < pos + idLength) fail("authdata-short");
    out.credentialId = buf.subarray(pos, pos + idLength);
    pos += idLength;
    const key = decodeCbor(buf, pos);
    out.credentialPublicKey = key.value;
    pos = key.end;
  }
  if (out.flags & FLAG_EXTENSIONS) {
    const ext = decodeCbor(buf, pos);
    out.extensions = ext.value;
  }
  return out;
}

// An assertion carries only the 37-byte header. iPhones still set the attested-credential flag (0x40)
// with no credential data after it, so the full parser above would reject every real assertion.
function parseAssertionAuthData(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 37) fail("authdata-short");
  const out = { rpIdHash: buf.subarray(0, 32), flags: buf[32], counter: buf.readUInt32BE(33) };
  if (out.flags & FLAG_EXTENSIONS && buf.length > 37) {
    try {
      out.extensions = decodeCbor(buf, 37).value;
    } catch {
      // The signature already covers these bytes; an unreadable extension is not a reason to reject.
    }
  }
  return out;
}

// Apple documents an apple_validation_category_01 (assertion docs: validationCategory) value in the
// extensions dictionary. It is reported, not enforced, until real-device values have been observed.
function validationCategory(auth) {
  const ext = auth.extensions;
  if (!ext || typeof ext !== "object") return null;
  return ext.apple_validation_category_01 ?? ext.validationCategory ?? null;
}

// ── DER: find the nonce in the credential certificate's 1.2.840.113635.100.8.2 extension ──

function readTlv(buf, pos) {
  if (pos + 2 > buf.length) fail("der-truncated");
  const tag = buf[pos];
  let len = buf[pos + 1];
  let header = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4 || pos + 2 + n > buf.length) fail("der-bad-length");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[pos + 2 + i];
    header = 2 + n;
  }
  const start = pos + header;
  const end = start + len;
  if (end > buf.length) fail("der-truncated");
  return { tag, start, end };
}

function derChildren(buf, { start, end }) {
  const out = [];
  for (let pos = start; pos < end;) {
    const tlv = readTlv(buf, pos);
    out.push(tlv);
    pos = tlv.end;
  }
  return out;
}

export function extractAttestNonce(der) {
  const cert = readTlv(der, 0);
  const [tbs] = derChildren(der, cert);
  const extWrapper = derChildren(der, tbs).find((t) => t.tag === 0xa3);
  if (!extWrapper) fail("nonce-missing");
  const [extensions] = derChildren(der, extWrapper);
  for (const ext of derChildren(der, extensions)) {
    const parts = derChildren(der, ext);
    if (parts[0]?.tag !== 0x06 || !der.subarray(parts[0].start, parts[0].end).equals(NONCE_OID)) continue;
    const value = parts[parts.length - 1];
    if (value.tag !== 0x04) fail("nonce-malformed");
    // extnValue is SEQUENCE { [1] EXPLICIT OCTET STRING nonce }
    const seq = readTlv(der, value.start);
    if (seq.tag !== 0x30) fail("nonce-malformed");
    const tagged = derChildren(der, seq).find((t) => t.tag === 0xa1);
    if (!tagged) fail("nonce-malformed");
    const octets = readTlv(der, tagged.start);
    if (octets.tag !== 0x04) fail("nonce-malformed");
    return der.subarray(octets.start, octets.end);
  }
  return fail("nonce-missing");
}

// ── Challenges: stateless, base64url(16 random || 8-byte ms timestamp || HMAC-SHA256[0..16]) ──

export function createChallengeSigner({ secret, now = Date.now, ttlMs = CHALLENGE_TTL_MS }) {
  const key = crypto.createHmac("sha256", secret).update("sproutroute-device-challenge-v1").digest();
  const mac = (body) => crypto.createHmac("sha256", key).update(body).digest().subarray(0, 16);
  return {
    issue() {
      const t = now();
      const stamp = Buffer.alloc(8);
      stamp.writeBigUInt64BE(BigInt(t));
      const body = Buffer.concat([crypto.randomBytes(16), stamp]);
      return {
        challenge: Buffer.concat([body, mac(body)]).toString("base64url"),
        expiresAt: new Date(t + ttlMs).toISOString(),
      };
    },
    verify(challenge) {
      if (typeof challenge !== "string" || !/^[A-Za-z0-9_-]{54}$/.test(challenge)) return false;
      const raw = Buffer.from(challenge, "base64url");
      if (raw.length !== 40) return false;
      const body = raw.subarray(0, 24);
      if (!crypto.timingSafeEqual(raw.subarray(24), mac(body))) return false;
      const age = now() - Number(body.readBigUInt64BE(16));
      return age >= -CHALLENGE_SKEW_MS && age <= ttlMs;
    },
  };
}

// ── Attestation ──

function certTimeValid(cert, at) {
  return Date.parse(cert.validFrom) <= at && at <= Date.parse(cert.validTo);
}

function verifyChain(x5c, rootPem, at) {
  if (!Array.isArray(x5c) || x5c.length < 2 || x5c.length > 4 || !x5c.every(Buffer.isBuffer)) fail("x5c-malformed");
  let certs;
  try {
    certs = [...x5c.map((der) => new X509Certificate(der)), new X509Certificate(rootPem)];
  } catch {
    fail("x5c-unparseable");
  }
  for (let i = 0; i < certs.length - 1; i++) {
    const child = certs[i];
    const parent = certs[i + 1];
    if (!parent.ca) fail("x5c-issuer-not-ca");
    if (!child.checkIssued(parent) || !child.verify(parent.publicKey)) fail("x5c-chain-invalid");
  }
  if (!certs.every((c) => certTimeValid(c, at))) fail("x5c-expired");
  return certs[0];
}

function uncompressedPoint(keyObject) {
  const jwk = keyObject.export({ format: "jwk" });
  if (jwk.kty !== "EC" || jwk.crv !== "P-256") fail("key-not-p256");
  return Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
}

/**
 * Returns { publicKeyPem, environment, validationCategory } or throws AttestError.
 * clientDataHash is SHA256 of the UTF-8 challenge string, as the iOS app computes it.
 */
export function verifyAttestation({
  keyId,
  attestation,
  challenge,
  appId = DEFAULT_APP_ID,
  allowDevelopment = false,
  now = Date.now(),
  rootPem = APPLE_APP_ATTEST_ROOT_PEM,
}) {
  if (!isKeyId(keyId)) fail("key-id-malformed");
  if (typeof attestation !== "string" || attestation.length === 0) fail("attestation-missing");
  if (typeof challenge !== "string") fail("challenge-missing");
  const keyIdBytes = Buffer.from(keyId, "base64");

  const object = decodeCbor(Buffer.from(attestation, "base64")).value;
  if (!object || object.fmt !== "apple-appattest") fail("format-not-apple-appattest");
  const authData = object.authData;
  if (!Buffer.isBuffer(authData)) fail("authdata-missing");

  const credCert = verifyChain(object.attStmt?.x5c, rootPem, now);

  const nonce = sha256(Buffer.concat([authData, sha256(Buffer.from(challenge, "utf8"))]));
  if (!extractAttestNonce(credCert.raw).equals(nonce)) fail("nonce-mismatch");

  if (!sha256(uncompressedPoint(credCert.publicKey)).equals(keyIdBytes)) fail("key-id-mismatch");

  const auth = parseAuthData(authData);
  if (!auth.rpIdHash.equals(sha256(appId))) fail("rp-id-mismatch");
  if (auth.counter !== 0) fail("counter-not-zero");

  let environment;
  if (auth.aaguid?.equals(AAGUID_PRODUCTION)) environment = "production";
  else if (auth.aaguid?.equals(AAGUID_DEVELOPMENT) && allowDevelopment) environment = "development";
  else fail(auth.aaguid?.equals(AAGUID_DEVELOPMENT) ? "development-not-allowed" : "aaguid-invalid");

  if (!auth.credentialId?.equals(keyIdBytes)) fail("credential-id-mismatch");

  return {
    publicKeyPem: credCert.publicKey.export({ type: "spki", format: "pem" }),
    environment,
    validationCategory: validationCategory(auth),
  };
}

// ── Assertions ──

/** The string the iOS app hashes into clientDataHash for each metered request. */
export function assertionClientData({ method, path, time, rawBody }) {
  const bodyHash = crypto.createHash("sha256").update(rawBody ?? Buffer.alloc(0)).digest("hex");
  return `${String(method).toUpperCase()}\n${path}\n${time}\n${bodyHash}`;
}

const keyObjects = new Map();
function publicKeyObject(pem) {
  let key = keyObjects.get(pem);
  if (!key) {
    key = crypto.createPublicKey(pem);
    if (keyObjects.size > 5000) keyObjects.clear();
    keyObjects.set(pem, key);
  }
  return key;
}

/** Returns { counter } or throws AttestError. previousCounter is the stored sign count. */
export function verifyAssertion({ assertion, clientData, publicKeyPem, appId = DEFAULT_APP_ID, previousCounter = 0 }) {
  if (typeof assertion !== "string" || assertion.length === 0 || assertion.length > 4096) fail("assertion-malformed");
  const object = decodeCbor(Buffer.from(assertion, "base64")).value;
  const { signature, authenticatorData } = object ?? {};
  if (!Buffer.isBuffer(signature) || !Buffer.isBuffer(authenticatorData)) fail("assertion-malformed");

  const nonce = sha256(Buffer.concat([authenticatorData, sha256(Buffer.from(clientData, "utf8"))]));
  let valid = false;
  try {
    valid = crypto.verify("sha256", nonce, publicKeyObject(publicKeyPem), signature);
  } catch {
    valid = false;
  }
  if (!valid) fail("signature-invalid");

  const auth = parseAssertionAuthData(authenticatorData);
  if (!auth.rpIdHash.equals(sha256(appId))) fail("rp-id-mismatch");
  if (!(auth.counter > previousCounter)) fail("counter-replay");
  return { counter: auth.counter, validationCategory: validationCategory(auth) };
}
