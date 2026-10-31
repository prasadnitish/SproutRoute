import crypto from "node:crypto";
import net from "node:net";
import { log } from "./logger.js";

// Behind Cloudflare, Express (trust proxy: 1) sees Cloudflare's address, so every per-IP limit counts a
// Cloudflare server shared by many visitors, not the visitor. Cloudflare's own CF-Connecting-IP header has
// the visitor, but a caller who reaches the origin directly can send that header too. So it is trusted only
// when the request also carries ORIGIN_SECRET_HEADER, whose value is CF_ORIGIN_SECRET: a Cloudflare
// Transform Rule adds it to proxied requests, and a direct caller cannot produce it. Anything else keeps
// Express's own address, which is already correct for clients that call the origin directly (iOS, Expo).
export const ORIGIN_SECRET_HEADER = "x-origin-secret";
const MIN_SECRET_LENGTH = 32;
const WARN_INTERVAL_MS = 10 * 60 * 1000;

function sameSecret(provided, expected) {
  const digest = (value) => crypto.createHash("sha256").update(String(value)).digest();
  return crypto.timingSafeEqual(digest(provided), digest(expected));
}

export function createClientIpMiddleware({
  getSecret = () => process.env.CF_ORIGIN_SECRET || "",
  logger = log,
  now = Date.now,
} = {}) {
  let lastWarning = -Infinity;

  // Throttled: a Cloudflare header without proof means either the Transform Rule is not set up yet or
  // someone is sending it directly. Either way, one line per window is enough.
  function warnUnverified(reason) {
    if (now() - lastWarning < WARN_INTERVAL_MS) return;
    lastWarning = now();
    logger.warn("client-ip:cloudflare-header-not-verified", { reason });
  }

  return function clientIp(req, _res, next) {
    const claimed = req.headers["cf-connecting-ip"];
    if (!claimed) return next();

    const secret = getSecret();
    const provided = req.headers[ORIGIN_SECRET_HEADER];
    if (secret.length < MIN_SECRET_LENGTH) {
      warnUnverified("no-secret-configured");
      return next();
    }
    if (!provided) {
      warnUnverified("missing-secret-header");
      return next();
    }
    if (!sameSecret(provided, secret)) {
      warnUnverified("wrong-secret");
      return next();
    }

    const address = String(claimed).trim();
    if (net.isIP(address) !== 0) {
      // Express defines req.ip as a getter on the prototype; an own property shadows it for this request.
      Object.defineProperty(req, "ip", { value: address, configurable: true, enumerable: true });
    }
    next();
  };
}
