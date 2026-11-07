import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../utils/supabaseClient.js';
import { buildSharedTripSnapshot } from '../../shared/shareSnapshot.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SHARE_TTL_MS = 7 * DAY_MS;
export const SHARE_MAX_TTL_MS = 400 * DAY_MS;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
const unavailable = () => Object.assign(new Error('This trip link has expired, was stopped, or is unavailable.'), { code: 'SHARE_UNAVAILABLE' });

// A link stays open until the end of the 7th day (UTC) after the trip's end date,
// never shorter than 7 days or longer than 400 days from creation.
// A missing or invalid end date falls back to 7 days.
export function shareExpiryMs(snapshot, createdMs) {
  const endDate = snapshot?.tripData?.trip?.endDate ?? snapshot?.tripData?.parsed?.endDate;
  const match = typeof endDate === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDate);
  const endMs = match ? Date.UTC(+match[1], +match[2] - 1, +match[3]) : NaN;
  if (!Number.isFinite(endMs) || new Date(endMs).toISOString().slice(0, 10) !== endDate) return createdMs + SHARE_TTL_MS;
  return Math.min(createdMs + SHARE_MAX_TTL_MS, Math.max(createdMs + SHARE_TTL_MS, endMs + 8 * DAY_MS));
}

function databaseRepository() {
  return {
    async insert(row) {
      const { error } = await getSupabaseAdmin().from('trip_shares').insert(row);
      if (error) throw error;
    },
    async find(hash) {
      const { data, error } = await getSupabaseAdmin().from('trip_shares').select('snapshot,created_at,expires_at,revoked_at').eq('share_token_hash', hash).maybeSingle();
      if (error) throw error;
      return data;
    },
    async revoke(hash, ownerHash, timestamp) {
      const { data, error } = await getSupabaseAdmin().from('trip_shares').update({ revoked_at: timestamp }).eq('share_token_hash', hash).eq('owner_token_hash', ownerHash).select('share_token_hash').maybeSingle();
      if (error) throw error;
      return !!data;
    },
  };
}

export function createTripShareStore({ repository = databaseRepository(), now = Date.now } = {}) {
  return {
    async create(tripData) {
      const snapshot = buildSharedTripSnapshot(tripData);
      const timestamp = now();
      const createdAt = new Date(timestamp).toISOString();
      const expiresAt = new Date(shareExpiryMs(snapshot, timestamp)).toISOString();
      const token = crypto.randomBytes(32).toString('base64url');
      const ownerToken = crypto.randomBytes(32).toString('base64url');
      await repository.insert({ share_token_hash: digest(token), owner_token_hash: digest(ownerToken), snapshot, created_at: createdAt, expires_at: expiresAt });
      return { token, ownerToken, createdAt, expiresAt };
    },
    async read(token) {
      if (!TOKEN_PATTERN.test(token || '')) throw unavailable();
      const row = await repository.find(digest(token));
      if (!row || row.revoked_at || !Number.isFinite(Date.parse(row.expires_at)) || now() >= Date.parse(row.expires_at)) throw unavailable();
      return { snapshot: row.snapshot, createdAt: row.created_at, expiresAt: row.expires_at };
    },
    async revoke(token, ownerToken) {
      if (!TOKEN_PATTERN.test(token || '') || !TOKEN_PATTERN.test(ownerToken || '')) throw unavailable();
      if (!await repository.revoke(digest(token), digest(ownerToken), new Date(now()).toISOString())) throw unavailable();
    },
  };
}
