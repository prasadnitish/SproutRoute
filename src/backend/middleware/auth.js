/**
 * auth.js — Supabase Auth middleware
 *
 * Verifies the JWT from the Authorization header against Supabase Auth.
 * Attaches `req.user` with { id, email } on success.
 *
 * Two variants:
 *   - requireAuth: 401 if no valid token
 *   - optionalAuth: attaches user if token present, continues if not
 */

import { createClient } from "@supabase/supabase-js";
import { log } from "../utils/logger.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

async function resolveUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  try {
    // Delegated tokens belong exclusively to the private MCP resource. This
    // precheck only rejects credentials. Supabase verifies every accepted JWT.
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    const nativeAudience = claims.aud === "authenticated" || (
      Array.isArray(claims.aud) && claims.aud.length === 1 && claims.aud[0] === "authenticated"
    );
    if (claims.client_id || !nativeAudience) return null;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;

    return { id: user.id, email: user.email, isAnonymous: user.is_anonymous === true };
  } catch {
    log.warn("auth:resolve-failed");
    return null;
  }
}

/**
 * Require a valid Supabase JWT. Returns 401 if missing/invalid.
 */
export function requireAuth(req, res, next) {
  resolveUser(req).then((user) => {
    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    req.user = user;
    next();
  }).catch((err) => {
    log.error("auth:middleware-error", { error: err.message });
    res.status(500).json({ error: "Auth verification failed" });
  });
}

/**
 * Attach user if token present, but don't require it.
 * Trip generation works for anonymous users too.
 */
export function optionalAuth(req, res, next) {
  resolveUser(req).then((user) => {
    req.user = user || null;
    next();
  }).catch(() => {
    req.user = null;
    next();
  });
}
