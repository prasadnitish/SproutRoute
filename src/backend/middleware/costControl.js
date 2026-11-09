/**
 * API cost controls: per-device quotas proven with App Attest, per-IP quotas for everything else,
 * and a global daily spend cap. Counters live in Supabase (services/usageStore.js) so they survive
 * deploys; the express-rate-limit burst limiters in server.js stay in front of this.
 *
 * Nothing here fails a request because attestation is missing or wrong: such requests are counted
 * against the unattested per-IP limits instead. If storage is down, limits are enforced in memory.
 */
import crypto from "node:crypto";
import { ipKeyGenerator } from "express-rate-limit";
import {
  AttestError,
  DEFAULT_APP_ID,
  assertionClientData,
  createChallengeSigner,
  isKeyId,
  verifyAssertion,
  verifyAttestation,
} from "../services/appAttest.js";
import { createUsageStore } from "../services/usageStore.js";
import { aiAlerts } from "../services/aiAlerts.js";
import { log, errorFields } from "../utils/logger.js";

const DAY_MS = 86_400_000;
const DEVICE_TIME_WINDOW_MS = 5 * 60 * 1000;
const PURGE_INTERVAL_MS = 6 * 3600 * 1000;
const DEVICE_CACHE_MAX = 10_000;

// Route kind → quota category. Plans share one budget; packing and travel tips share another.
const KINDS = {
  plan: "plan",
  parse: "parse",
  packing: "assist",
  tips: "assist",
  places: "places",
  photo: null, // counts toward the spend cap only
};

const NOUNS = {
  plan: "trip plans",
  parse: "trip searches",
  assist: "packing and safety requests",
  places: "place lookups",
};

function envNumber(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Fractions of a cent are kept (the counters are numeric(12,4)); only float noise is removed.
const usdToCents = (usd) => Math.round(usd * 1_000_000) / 10_000;

export function readCostControlConfig(env = process.env) {
  const n = (name, fallback) => envNumber(env, name, fallback);
  return {
    enabled: env.COST_CONTROLS_ENABLED !== "false",
    appId: DEFAULT_APP_ID,
    allowDevelopment: env.APP_ATTEST_ALLOW_DEVELOPMENT === "true",
    limits: {
      device: {
        plan: { day: n("DEVICE_PLAN_DAILY_LIMIT", 10), month: n("DEVICE_PLAN_MONTHLY_LIMIT", 40) },
        parse: { day: n("DEVICE_PARSE_DAILY_LIMIT", 40) },
        assist: { day: n("DEVICE_ASSIST_DAILY_LIMIT", 40) },
        places: { day: n("DEVICE_PLACES_DAILY_LIMIT", 40) },
      },
      ip: {
        plan: { day: n("IP_PLAN_DAILY_LIMIT", 5) },
        parse: { day: n("IP_PARSE_DAILY_LIMIT", 20) },
        assist: { day: n("IP_ASSIST_DAILY_LIMIT", 20) },
        places: { day: n("IP_PLACES_DAILY_LIMIT", 20) },
      },
    },
    costCents: {
      plan: n("COST_PLAN_CENTS", 5.5),
      parse: n("COST_PARSE_CENTS", 0.3),
      packing: n("COST_PACKING_CENTS", 0.5),
      tips: n("COST_TRAVEL_TIPS_CENTS", 0.5),
      places: n("COST_PLACES_ENRICH_CENTS", 3.5),
      photo: n("COST_PLACES_PHOTO_CENTS", 0.7),
    },
    dailyCapCents: usdToCents(n("DAILY_SPEND_CAP_USD", 25)),
    unattestedCapCents: usdToCents(n("UNATTESTED_DAILY_CAP_USD", 5)),
  };
}

const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const monthOf = (t) => new Date(t).toISOString().slice(0, 7);
function nextUtcDay(t) {
  const d = new Date(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}
function nextUtcMonth(t) {
  const d = new Date(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

export function createCostControl({
  store = createUsageStore(),
  config = readCostControlConfig(),
  alerts = aiAlerts,
  now = Date.now,
  logger = log,
  challengeSecret = process.env.DEVICE_CHALLENGE_SECRET,
  ipHashSecret = process.env.DEVICE_CHALLENGE_SECRET || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  attestRootPem, // tests only; defaults to the pinned Apple root inside verifyAttestation
} = {}) {
  // Secrets are resolved on first use so the warning lands in the logs of a running server, not at import.
  let signer;
  function challengeSigner() {
    if (!signer) {
      let secret = challengeSecret;
      if (!secret) {
        secret = crypto.randomBytes(32).toString("hex");
        logger.warn("cost-control:challenge-secret-missing", {
          detail: "DEVICE_CHALLENGE_SECRET is not set; using a per-process secret, so challenges issued before a restart or on another replica fail.",
        });
      }
      signer = createChallengeSigner({ secret, now });
    }
    return signer;
  }

  let ipKey;
  function hashIp(ip) {
    if (!ipKey) {
      const base = ipHashSecret || crypto.randomBytes(32).toString("hex");
      if (!ipHashSecret) logger.warn("cost-control:ip-hash-secret-missing", { detail: "per-IP counters reset on every restart" });
      ipKey = crypto.createHmac("sha256", base).update("sproutroute-usage-ip-v1").digest();
    }
    return crypto.createHmac("sha256", ipKey).update(ipKeyGenerator(ip || "unknown")).digest("base64url").slice(0, 22);
  }

  // Public key and environment never change for a key id; sign_count is authoritative in the database.
  const deviceCache = new Map();
  function cacheDevice(keyId, device) {
    deviceCache.delete(keyId);
    deviceCache.set(keyId, device);
    if (deviceCache.size > DEVICE_CACHE_MAX) deviceCache.delete(deviceCache.keys().next().value);
  }
  async function getDevice(keyId) {
    const cached = deviceCache.get(keyId);
    if (cached) return cached;
    const found = await store.findDevice(keyId);
    if (found) cacheDevice(keyId, found);
    return found;
  }

  let lastPurge = 0;
  function maybePurge() {
    if (now() - lastPurge < PURGE_INTERVAL_MS) return;
    lastPurge = now();
    store.purge().catch((error) => logger.warn("cost-control:purge-failed", errorFields(error)));
  }

  /** → { type: "device", keyId, signCount, device } | { type: "ip", reason? }. Sets the reattest header. */
  async function resolveIdentity(req, res) {
    const keyId = req.get("x-sr-device-key");
    const time = req.get("x-sr-device-time");
    const assertion = req.get("x-sr-device-assertion");
    if (!keyId && !time && !assertion) return { type: "ip" };

    const reattest = (reason) => {
      res.setHeader("X-SR-Device-Status", "reattest");
      return { type: "ip", reason };
    };
    if (!isKeyId(keyId) || !/^\d{10,16}$/.test(time ?? "") || !assertion) return reattest("headers-malformed");
    // A wrong device clock is not fixed by a new key, so no reattest here.
    if (Math.abs(now() - Number(time)) > DEVICE_TIME_WINDOW_MS) return { type: "ip", reason: "time-out-of-window" };

    let device;
    try {
      device = await getDevice(keyId);
    } catch {
      return { type: "ip", reason: "store-unavailable" };
    }
    if (!device) return reattest("unknown-key");
    if (device.environment === "development" && !config.allowDevelopment) return reattest("development-not-allowed");

    try {
      const clientData = assertionClientData({
        method: req.method,
        path: String(req.originalUrl || req.url).split("?")[0],
        time,
        rawBody: req.rawBody,
      });
      const { counter } = verifyAssertion({
        assertion,
        clientData,
        publicKeyPem: device.publicKeyPem,
        appId: config.appId,
        previousCounter: device.signCount,
      });
      return { type: "device", keyId, signCount: counter, device };
    } catch (error) {
      // Out-of-order arrival of two concurrent requests lands here too; the key itself is fine.
      if (error instanceof AttestError && error.reason === "counter-replay") return { type: "ip", reason: "counter-replay" };
      return reattest(error instanceof AttestError ? error.reason : "verify-error");
    }
  }

  function buildItems(kind, identity, req, t) {
    const category = KINDS[kind];
    const day = dayOf(t);
    const cost = config.costCents[kind];
    const item = (role, bucket, period, periodStart, limits) => ({
      role, bucket, period, periodStart, incCount: 1, incCost: cost, limitCount: null, limitCost: null, ...limits,
    });
    const items = [];
    if (category && identity.type === "device") {
      const limits = config.limits.device[category];
      items.push(item("device-day", `device:${identity.keyId}:${category}`, day, day, { limitCount: limits.day }));
      if (limits.month != null) {
        items.push(item("device-month", `device:${identity.keyId}:${category}`, monthOf(t), `${monthOf(t)}-01`, { limitCount: limits.month }));
      }
    } else if (category) {
      items.push(item("ip-day", `ip:${hashIp(req.ip)}:${category}`, day, day, { limitCount: config.limits.ip[category].day }));
      items.push(item("global-unattested", "global:unattested", day, day, { limitCost: config.unattestedCapCents }));
    }
    items.push(item("global-all", "global:all", day, day, { limitCost: config.dailyCapCents }));
    return items;
  }

  const alerted = new Set();
  function checkSpend(items, rows, t) {
    const day = dayOf(t);
    for (const item of items) {
      if (item.role !== "global-all" && item.role !== "global-unattested") continue;
      const row = rows.find((r) => r.bucket === item.bucket && r.period === item.period);
      if (!row || !item.limitCost) continue;
      const level = row.denied || row.cost >= item.limitCost ? 100 : row.cost >= 0.8 * item.limitCost ? 80 : 0;
      if (!level) continue;
      const tag = `${day}:${item.bucket}:${level}`;
      if (alerted.has(tag)) continue;
      if (alerted.size > 50) alerted.clear();
      alerted.add(tag);
      if (level === 100) alerted.add(`${day}:${item.bucket}:80`);
      const scope = item.role === "global-all" ? "all traffic" : "unattested (web and unverified) traffic";
      const cap = `$${(item.limitCost / 100).toFixed(2)}`;
      const spent = `$${(row.cost / 100).toFixed(2)}`;
      const text = level === 100
        ? `estimated spend for ${scope} reached the ${cap} daily cap (${spent}). Metered requests in that scope get 503 DAILY_CAPACITY_REACHED until 00:00 UTC.`
        : `estimated spend for ${scope} is ${spent}, over 80% of the ${cap} daily cap.`;
      logger.error("cost-control:spend-cap", { level, scope: item.bucket, spentCents: row.cost, capCents: item.limitCost });
      Promise.resolve(alerts?.notify?.({ kind: `spend_cap_${level}`, text })).catch(() => {});
    }
  }

  function denial(items, rows, kind, t) {
    const deniedRoles = new Set(items.filter((item) => rows.some((r) => r.denied && r.bucket === item.bucket && r.period === item.period)).map((i) => i.role));
    if (deniedRoles.size === 0) return null;
    const category = KINDS[kind];
    const noun = NOUNS[category];
    const quota = (code, limit, resetAt, sentence) => ({
      status: 429, resetAt, body: { code, message: sentence, limit, resetAt, retryable: false, category: "quota", quota: category },
    });
    if (deniedRoles.has("device-month")) {
      const limit = config.limits.device[category].month;
      return quota("DEVICE_MONTHLY_LIMIT", limit, nextUtcMonth(t), `This device has used this month's ${limit} free ${noun}. They reset on the 1st of next month (UTC).`);
    }
    if (deniedRoles.has("device-day")) {
      const limit = config.limits.device[category].day;
      return quota("DEVICE_DAILY_LIMIT", limit, nextUtcDay(t), `This device has used today's ${limit} free ${noun}. They reset at midnight UTC.`);
    }
    if (deniedRoles.has("ip-day")) {
      const limit = config.limits.ip[category].day;
      return quota("IP_DAILY_LIMIT", limit, nextUtcDay(t), `This network has used today's ${limit} free ${noun}. They reset at midnight UTC.`);
    }
    const resetAt = nextUtcDay(t);
    return {
      status: 503,
      resetAt,
      body: {
        code: "DAILY_CAPACITY_REACHED",
        message: "SproutRoute has reached today's planning capacity. Please try again tomorrow.",
        resetAt,
        retryable: false,
        category: "capacity",
      },
    };
  }

  /** Express middleware for one metered route kind: plan, parse, packing, tips, places, photo. */
  function meter(kind) {
    if (!(kind in KINDS)) throw new Error(`unknown metered kind ${kind}`);
    return async function costMeter(req, res, next) {
      if (!config.enabled) return next();
      let rejection = null;
      try {
        maybePurge();
        const t = now();
        let identity = KINDS[kind] ? await resolveIdentity(req, res) : { type: "none" };
        let items = buildItems(kind, identity, req, t);
        let result = await store.consume(items, identity.type === "device"
          ? { keyId: identity.keyId, signCount: identity.signCount, knownSignCount: identity.device.signCount }
          : null);
        if (result.replay) {
          identity = { type: "ip", reason: "counter-replay" };
          items = buildItems(kind, identity, req, t);
          result = await store.consume(items, null);
        } else if (identity.type === "device") {
          cacheDevice(identity.keyId, { ...identity.device, signCount: identity.signCount });
        }
        req.costControl = { identity: identity.type, reason: identity.reason, degraded: Boolean(result.degraded) };
        if (identity.reason) {
          logger.warn("cost-control:device-fallback", { kind, reason: identity.reason });
        } else if (identity.type === "ip" && /^SproutRoute-iOS\//.test(req.get("user-agent") || "")) {
          logger.info("cost-control:ios-unsigned", { kind });
        }
        checkSpend(items, result.rows, t);
        rejection = denial(items, result.rows, kind, t);
        if (rejection) {
          logger.warn("cost-control:rejected", { kind, identity: identity.type, code: rejection.body.code });
        }
      } catch (error) {
        logger.error("cost-control:meter-failed", { kind, failOpen: true, ...errorFields(error) });
      }
      if (!rejection) return next();
      res.locals.costControlRejected = true;
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((Date.parse(rejection.resetAt) - now()) / 1000))));
      return res.status(rejection.status).json({ ...rejection.body, requestId: req.reqId });
    };
  }

  function mountDeviceRoutes(app, { limiter }) {
    app.post("/api/v1/device/challenge", limiter, (req, res) => {
      res.set("Cache-Control", "no-store");
      res.json(challengeSigner().issue());
    });

    app.post("/api/v1/device/attest", limiter, async (req, res) => {
      const { keyId, attestation, challenge } = req.body ?? {};
      const invalid = (reason) => {
        logger.warn("device:attest-rejected", { reason });
        return res.status(400).json({
          code: "ATTESTATION_INVALID",
          message: "This copy of the app could not be verified.",
          category: "validation",
          retryable: false,
          requestId: req.reqId,
        });
      };
      if (!challengeSigner().verify(challenge)) return invalid("challenge-invalid-or-expired");

      let verified;
      try {
        verified = verifyAttestation({
          keyId,
          attestation,
          challenge,
          appId: config.appId,
          allowDevelopment: config.allowDevelopment,
          now: now(),
          ...(attestRootPem ? { rootPem: attestRootPem } : {}),
        });
      } catch (error) {
        if (!(error instanceof AttestError)) logger.error("device:attest-error", errorFields(error));
        return invalid(error instanceof AttestError ? error.reason : "verify-error");
      }

      let device = { publicKeyPem: verified.publicKeyPem, environment: verified.environment, signCount: 0 };
      try {
        const saved = await store.saveDevice({ keyId, publicKeyPem: verified.publicKeyPem, environment: verified.environment });
        if (saved.status === "conflict") return invalid("key-id-conflict");
        if (saved.status === "exists") device = saved.device;
      } catch (error) {
        // Kept in this process only; after a restart the app is told to re-attest.
        logger.error("device:attest-store-failed", { failOpen: true, ...errorFields(error) });
      }
      cacheDevice(keyId, device);
      logger.info("device:attested", { environment: verified.environment, validationCategory: verified.validationCategory });
      return res.json({ status: "attested" });
    });
  }

  return { meter, mountDeviceRoutes, config };
}
