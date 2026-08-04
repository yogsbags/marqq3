/**
 * Dual-write credit wallets + ledger to Supabase (UUID workspaces only).
 * JSON DB remains source of truth for legacy marqq-ws-* ids and offline fallback.
 */

import { getSupabaseWriteClient, getSupabaseReadClient } from '../../lib/supabase.js';
import { useSupabasePersistence, isUuidWorkspace } from '../../lib/persistence.js';

function writeClient() {
  if (!useSupabasePersistence()) return null;
  return getSupabaseWriteClient();
}

export async function persistWalletToSupabase(wallet) {
  const db = writeClient();
  const workspaceId = wallet?.workspaceId;
  if (!db || !wallet || !isUuidWorkspace(workspaceId)) return false;
  try {
    const { error } = await db.from('credit_wallets').upsert(
      {
        workspace_id: workspaceId,
        plan: wallet.plan || 'workspace',
        credits_total: wallet.credits_total ?? 0,
        credits_remaining: wallet.credits_remaining ?? 0,
        credits_reserved: wallet.credits_reserved ?? 0,
        credits_reset_at: wallet.credits_reset_at || null,
        lifetime_spent: wallet.lifetime_spent ?? 0,
        lifetime_usd: wallet.lifetime_usd ?? 0,
        updated_at: wallet.updatedAt || new Date().toISOString(),
        payload: wallet,
      },
      { onConflict: 'workspace_id' }
    );
    if (error) {
      console.warn('[credit_wallets supabase]', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[credit_wallets supabase]', err.message);
    return false;
  }
}

export async function loadWalletFromSupabase(workspaceId) {
  const db = getSupabaseReadClient();
  if (!db || !useSupabasePersistence() || !isUuidWorkspace(workspaceId)) return null;
  try {
    const { data, error } = await db
      .from('credit_wallets')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error || !data) return null;
    if (data.payload && typeof data.payload === 'object') {
      return { ...data.payload, workspaceId };
    }
    return {
      workspaceId,
      plan: data.plan || 'workspace',
      credits_total: data.credits_total,
      credits_remaining: data.credits_remaining,
      credits_reserved: data.credits_reserved || 0,
      credits_reset_at: data.credits_reset_at,
      lifetime_spent: data.lifetime_spent || 0,
      lifetime_usd: Number(data.lifetime_usd) || 0,
      updatedAt: data.updated_at,
    };
  } catch {
    return null;
  }
}

export async function persistLedgerEntryToSupabase(entry) {
  const db = writeClient();
  const workspaceId = entry?.workspaceId;
  if (!db || !entry?.id || !isUuidWorkspace(workspaceId)) return false;
  try {
    const { error } = await db.from('credit_ledger').upsert(
      {
        id: entry.id,
        workspace_id: workspaceId,
        at: entry.at || new Date().toISOString(),
        feature: entry.feature || null,
        provider: entry.provider || null,
        model: entry.model || null,
        status: entry.status || 'ok',
        estimated_credits: entry.estimatedCredits ?? null,
        actual_credits: entry.actualCredits ?? null,
        delta_credits: entry.deltaCredits ?? null,
        actual_usd: entry.actualUsd ?? null,
        reservation_id: entry.reservationId || null,
        payload: entry,
      },
      { onConflict: 'id' }
    );
    if (error) {
      console.warn('[credit_ledger supabase]', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[credit_ledger supabase]', err.message);
    return false;
  }
}

export async function listLedgerFromSupabase(workspaceId, { limit = 50 } = {}) {
  const db = getSupabaseReadClient();
  if (!db || !useSupabasePersistence() || !isUuidWorkspace(workspaceId)) return null;
  try {
    const { data, error } = await db
      .from('credit_ledger')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('at', { ascending: false })
      .limit(Math.min(200, Math.max(1, Number(limit) || 50)));
    if (error) return null;
    return (data || []).map((row) => row.payload || {
      id: row.id,
      workspaceId: row.workspace_id,
      at: row.at,
      feature: row.feature,
      provider: row.provider,
      actualCredits: row.actual_credits,
      status: row.status,
    });
  } catch {
    return null;
  }
}

/** Fire-and-forget dual-write (never blocks metering path). */
export function scheduleWalletPersist(wallet) {
  if (!wallet?.workspaceId || !isUuidWorkspace(wallet.workspaceId)) return;
  setImmediate(() => {
    persistWalletToSupabase(wallet).catch(() => {});
  });
}

export function scheduleLedgerPersist(entry) {
  if (!entry?.workspaceId || !isUuidWorkspace(entry.workspaceId)) return;
  setImmediate(() => {
    persistLedgerEntryToSupabase(entry).catch(() => {});
  });
}
