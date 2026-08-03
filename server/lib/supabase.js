/**
 * Server Supabase clients (Marqq2 parity).
 * Service role for workspace/GTM/outreach/agent writes; anon available for light reads.
 */
import { createClient } from '@supabase/supabase-js';

function resolveConfig(env = process.env) {
  return {
    url: env.SUPABASE_URL || env.VITE_SUPABASE_URL || null,
    anonKey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || null,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || null,
  };
}

const { url, anonKey, serviceKey } = resolveConfig();

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const supabaseAdmin =
  url && serviceKey
    ? createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
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
