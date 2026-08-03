/**
 * Feature flag for Supabase-backed persistence.
 * Default ON when service role is present; set USE_SUPABASE_PERSISTENCE=0 to roll back.
 */
import { supabaseConfigured } from './supabase.js';

export function useSupabasePersistence() {
  const flag = process.env.USE_SUPABASE_PERSISTENCE;
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  if (flag === '1' || flag === 'true' || flag === 'on') return true;
  return supabaseConfigured();
}

/** True when id looks like a UUID workspace (not legacy marqq-ws-1). */
export function isUuidWorkspace(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(id || '')
  );
}
