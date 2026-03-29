/**
 * supabaseClient.js — Supabase client factory
 *
 * Two clients:
 *   - supabaseAdmin: service-role key, bypasses RLS (for server-side operations)
 *   - supabaseForUser(jwt): scoped to a specific user's RLS policies
 *
 * Usage:
 *   import { supabaseAdmin, supabaseForUser } from "../utils/supabaseClient.js";
 *
 *   // Admin operations (profile import normalization, precompute, etc.)
 *   const { data } = await supabaseAdmin.from("cities").select("*");
 *
 *   // User-scoped operations (profile CRUD, trip history)
 *   const client = supabaseForUser(req.headers.authorization);
 *   const { data } = await client.from("profiles").select("*");
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// ── Admin client (service role — bypasses RLS) ──────────────────────────────

let _adminClient = null;

export function getSupabaseAdmin() {
  if (_adminClient) return _adminClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  }
  _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}

// ── User-scoped client (anon key + JWT — respects RLS) ──────────────────────

export function supabaseForUser(authHeader) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  }
  const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Missing auth token");

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Convenience alias
export const supabaseAdmin = {
  get client() { return getSupabaseAdmin(); },
};
