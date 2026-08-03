/**
 * Persist GTM wizard state to Marqq2 `gtm_modules` table.
 */
import { getSupabaseWriteClient, getSupabaseReadClient } from '../lib/supabase.js';
import { useSupabasePersistence, isUuidWorkspace } from '../lib/persistence.js';

function client() {
  if (!useSupabasePersistence()) return null;
  return getSupabaseWriteClient();
}

export async function getActiveGtmModule(workspaceId) {
  const db = getSupabaseReadClient();
  if (!db || !isUuidWorkspace(workspaceId)) return null;
  const { data, error } = await db
    .from('gtm_modules')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[gtm_modules] get active:', error.message);
    return null;
  }
  return data;
}

export async function listGtmModules(workspaceId) {
  const db = getSupabaseReadClient();
  if (!db || !isUuidWorkspace(workspaceId)) return [];
  const { data, error } = await db
    .from('gtm_modules')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false });
  if (error) {
    console.warn('[gtm_modules] list:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Upsert wizard draft / strategy into gtm_modules.
 * Body shape from marqq3 wizard: { answers, strategy, phase, autoSections, ... }
 */
export async function upsertGtmModule({
  workspaceId,
  userId,
  moduleId = null,
  name = null,
  status = 'in_progress',
  profile = {},
  sectionState = {},
  sourceContext = {},
  active = false,
} = {}) {
  const db = client();
  if (!db || !isUuidWorkspace(workspaceId) || !userId) {
    return { ok: false, error: 'supabase_unavailable' };
  }

  const row = {
    workspace_id: workspaceId,
    user_id: userId,
    name: name || profile?.companyName || profile?.module_name || 'GTM Strategy',
    module_type: 'product',
    status: ['draft', 'in_progress', 'ready', 'archived'].includes(status) ? status : 'in_progress',
    profile: profile || {},
    section_state: sectionState || {},
    source_context: sourceContext || {},
    active: Boolean(active),
    updated_at: new Date().toISOString(),
  };

  try {
    if (moduleId) {
      const { data, error } = await db
        .from('gtm_modules')
        .update(row)
        .eq('id', moduleId)
        .eq('workspace_id', workspaceId)
        .select()
        .single();
      if (error) throw error;
      return { ok: true, module: data };
    }

    // Prefer updating existing active module for this workspace
    const existing = await getActiveGtmModule(workspaceId);
    if (existing?.id) {
      const { data, error } = await db
        .from('gtm_modules')
        .update(row)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return { ok: true, module: data };
    }

    const { data, error } = await db.from('gtm_modules').insert(row).select().single();
    if (error) throw error;
    return { ok: true, module: data };
  } catch (err) {
    console.error('[gtm_modules] upsert:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function lockGtmStrategy({ workspaceId, userId, wizardState } = {}) {
  const answers = wizardState?.answers || {};
  const strategy = wizardState?.strategy || null;
  return upsertGtmModule({
    workspaceId,
    userId,
    name: strategy?.title || strategy?.companyName || 'GTM Strategy',
    status: 'ready',
    active: true,
    profile: {
      answers,
      companyName: wizardState?.companyName || answers?.companyName,
      wizardVersion: wizardState?.version || 1,
    },
    sectionState: {
      phase: wizardState?.phase || 'complete',
      autoSections: wizardState?.autoSections || strategy?.autoSections || [],
      goalsSections: wizardState?.goalsSections || strategy?.goalsSections || [],
      strategy,
    },
    sourceContext: {
      website: wizardState?.website || '',
      lockedAt: new Date().toISOString(),
    },
  });
}
