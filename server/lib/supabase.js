/**
 * Server Supabase clients (Marqq2 parity).
 * Service role for workspace/GTM/outreach/agent writes; anon available for light reads.
 *
 * Node < 22 has no native WebSocket — supabase-js realtime requires an explicit
 * transport (`ws`). Without it, createClient() throws at boot on Railway/Nixpacks Node 18.
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

const { url, anonKey, serviceKey } = resolveConfig();

export const supabase = url && anonKey ? createClient(url, anonKey, clientOptions()) : null;

export const supabaseAdmin =
  url && serviceKey
    ? createClient(
        url,
        serviceKey,
        clientOptions({
          auth: { persistSession: false, autoRefreshToken: false },
        })
      )
    : null;

if (!supabase) {
  console.warn('[supabase] Missing SUPABASE_URL / ANON_KEY — auth verification limited');
}
if (!supabaseAdmin) {
  console.warn(
    '[supabase] Missing SUPABASE_SERVICE_ROLE_KEY — workspace/GTM/outreach persistence disabled'
  );
}

export function getSupabaseReadClient() {
  return supabaseAdmin || supabase;
}

export function getSupabaseWriteClient() {
  return supabaseAdmin || supabase;
}

export function supabaseConfigured() {
  return Boolean(supabaseAdmin);
}
