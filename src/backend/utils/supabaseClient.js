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

function supabaseUrl() {
  return process.env.SUPABASE_URL;
}

function supabaseServiceKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function supabaseAnonKey() {
  return process.env.SUPABASE_ANON_KEY;
}

// ── Admin client (service role — bypasses RLS) ──────────────────────────────

let _adminClient = null;

export function getSupabaseAdmin() {
  if (_adminClient) return _adminClient;
  const url = supabaseUrl();
  const serviceKey = supabaseServiceKey();
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  }
  _adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}

// ── User-scoped client (anon key + JWT — respects RLS) ──────────────────────

export function supabaseForUser(authHeader) {
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  }
  const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Missing auth token");

  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// NOTE: Only export getSupabaseAdmin() and supabaseForUser().
// Callers that need the admin client must call getSupabaseAdmin() explicitly,
// making it visible at every call site that RLS is being bypassed.
