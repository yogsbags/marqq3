/**
 * Server Supabase clients (Marqq2 parity).
 * Service role for workspace/GTM/outreach/agent writes; anon available for light reads.
 *
 * Node < 22 has no native WebSocket — supabase-js realtime requires an explicit
 * transport (`ws`). Without it, createClient() throws at boot on Railway/Nixpacks Node 18.
 *
 * IMPORTANT: clients are created LAZILY (on first getter call), not at module
 * import time. server/index.js loads `.env` / `.env.marqq-live` from disk with
 * its own loadEnvFile() — but ES module static imports are hoisted and run
 * before any of index.js's own top-level code, so a module-level
 * `const supabase = createClient(...)` evaluated here at import time would see
 * `process.env` as it existed *before* those files were parsed, i.e. missing
 * SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY on every local run that relies on the
 * .env files (Railway, which injects real env vars before the process starts,
 * was never affected by this — it only bites local `npm start` /
 * `npm run dev:backend`, verified in this environment: the admin client was
 * null even though .env.marqq-live has a working SUPABASE_SERVICE_ROLE_KEY).
 * These getters read `process.env` on first *use*, after index.js has already
 * loaded the env files, then cache the result.
 */
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

function resolveConfig(env = process.env) {
  return {
    url: env.SUPABASE_URL || env.VITE_SUPABASE_URL || null,
    anonKey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || null,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || null,
  };
}

function clientOptions(extra = {}) {
  return {
    realtime: {
      // Required on Node.js < 22 (no global WebSocket)
      transport: WebSocket,
    },
    ...extra,
  };
}

let _anonClient;
let _anonClientAttempted = false;
let _adminClient;
let _adminClientAttempted = false;
let _warnedMissingAnon = false;
let _warnedMissingAdmin = false;

/** Anon-key client (auth verification, light reads). Lazily created + cached. */
export function getSupabaseAnonClient() {
  if (_anonClientAttempted) return _anonClient;
  _anonClientAttempted = true;
  const { url, anonKey } = resolveConfig();
  if (!url || !anonKey) {
    if (!_warnedMissingAnon) {
      console.warn('[supabase] Missing SUPABASE_URL / ANON_KEY — auth verification limited');
      _warnedMissingAnon = true;
    }
    return null;
  }
  _anonClient = createClient(url, anonKey, clientOptions());
  return _anonClient;
}

/** Service-role client (workspace/GTM/outreach/agent writes). Lazily created + cached. */
export function getSupabaseAdminClient() {
  if (_adminClientAttempted) return _adminClient;
  _adminClientAttempted = true;
  const { url, serviceKey } = resolveConfig();
  if (!url || !serviceKey) {
    if (!_warnedMissingAdmin) {
      console.warn(
        '[supabase] Missing SUPABASE_SERVICE_ROLE_KEY — workspace/GTM/outreach persistence disabled'
      );
      _warnedMissingAdmin = true;
    }
    return null;
  }
  _adminClient = createClient(
    url,
    serviceKey,
    clientOptions({ auth: { persistSession: false, autoRefreshToken: false } })
  );
  return _adminClient;
}

export function getSupabaseReadClient() {
  return getSupabaseAdminClient() || getSupabaseAnonClient();
}

export function getSupabaseWriteClient() {
  return getSupabaseAdminClient() || getSupabaseAnonClient();
}

export function supabaseConfigured() {
  return Boolean(getSupabaseAdminClient());
}
