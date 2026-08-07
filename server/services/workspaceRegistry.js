/**
 * Multi-tenant workspace registry — the Supabase `workspaces` table is the
 * durable source of truth for "which tenants exist" (already used by
 * agentNotifications.js / agentSupabase.js for per-workspace dual-writes).
 *
 * This module gives the co-founder digest scheduler ("run once per workspace
 * per day", mirroring marqq-2's per-workspace Python scheduler) a way to
 * discover the live tenant list instead of hardcoding a single workspace id.
 */
import { getSupabaseReadClient } from '../lib/supabase.js';
import { isUuidWorkspace } from '../lib/persistence.js';

/**
 * List every real (UUID) workspace id currently in Supabase.
 * Returns [] (not an error) when Supabase isn't configured — callers should
 * treat that as "nothing to iterate", not a hard failure, consistent with the
 * rest of this codebase's graceful-degradation style.
 */
export async function listActiveWorkspaceIds() {
  const db = getSupabaseReadClient();
  if (!db) return [];
  try {
    const { data, error } = await db.from('workspaces').select('id').order('created_at', { ascending: true });
    if (error) {
      console.warn('[workspace-registry] list failed:', error.message);
      return [];
    }
    return (data || []).map((row) => row.id).filter(isUuidWorkspace);
  } catch (err) {
    console.warn('[workspace-registry] list failed:', err.message);
    return [];
  }
}

/**
 * Resolve the user_id a workspace-level row should be attributed to (owner
 * first, else any member) — generalized from
 * agentNotifications.js#resolveDeploymentNotificationUserId so the digest
 * writer and the per-run notification writer stay consistent.
 */
export async function resolveWorkspaceOwnerUserId(workspaceId) {
  const db = getSupabaseReadClient();
  if (!db || !isUuidWorkspace(workspaceId)) return null;
  try {
    const { data, error } = await db
      .from('workspace_members')
      .select('user_id, role')
      .eq('workspace_id', workspaceId)
      .order('role', { ascending: true });
    if (error) return null;
    const owner = (data || []).find((row) => row.role === 'owner');
    return owner?.user_id || data?.[0]?.user_id || null;
  } catch {
    return null;
  }
}
