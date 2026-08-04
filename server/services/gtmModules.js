/**
 * GTM modules — one go-to-market per product / service / app / business line
 * inside a workspace. Mirrors Marqq2 gtm_modules + single-active semantics.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabaseWriteClient, getSupabaseReadClient } from '../lib/supabase.js';
import { useSupabasePersistence, isUuidWorkspace } from '../lib/persistence.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FS_PATH = join(__dirname, '../data/gtm-modules.json');

export const GTM_MODULE_TYPES = ['product', 'service', 'app', 'business_line'];

export function normalizeModuleType(value) {
  const t = String(value || '').trim().toLowerCase();
  return GTM_MODULE_TYPES.includes(t) ? t : 'product';
}

function writeClient() {
  if (!useSupabasePersistence()) return null;
  return getSupabaseWriteClient();
}

function readClient() {
  if (!useSupabasePersistence()) return null;
  return getSupabaseReadClient();
}

function ensureFs() {
  mkdirSync(dirname(FS_PATH), { recursive: true });
  if (!existsSync(FS_PATH)) writeFileSync(FS_PATH, JSON.stringify({ workspaces: {} }, null, 2));
}

function loadFs() {
  ensureFs();
  try {
    return JSON.parse(readFileSync(FS_PATH, 'utf8'));
  } catch {
    return { workspaces: {} };
  }
}

function saveFs(data) {
  ensureFs();
  writeFileSync(FS_PATH, JSON.stringify(data, null, 2));
}

function fsList(workspaceId) {
  const data = loadFs();
  const list = data.workspaces?.[workspaceId] || [];
  return list
    .filter((m) => m.status !== 'archived')
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

function fsSaveList(workspaceId, list) {
  const data = loadFs();
  if (!data.workspaces) data.workspaces = {};
  data.workspaces[workspaceId] = list;
  saveFs(data);
}

function publicModule(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    user_id: row.user_id || null,
    company_id: row.company_id || null,
    name: row.name,
    module_type: row.module_type || 'product',
    status: row.status || 'draft',
    source_context: row.source_context || {},
    profile: row.profile || {},
    section_state: row.section_state || {},
    active: Boolean(row.active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Prefer explicit userId; else workspace owner / first member (service-role writes). */
async function resolveModuleUserId(workspaceId, userId = null) {
  if (userId) return userId;
  const db = writeClient();
  if (!db || !isUuidWorkspace(workspaceId)) return null;
  try {
    const { data: owner } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();
    if (owner?.user_id) return owner.user_id;

    const { data, error } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('[gtm_modules] resolve owner:', error.message);
      return null;
    }
    return data?.user_id || null;
  } catch (err) {
    console.warn('[gtm_modules] resolve owner failed:', err.message);
    return null;
  }
}

/** Deactivate siblings (app-side; Postgres trigger also does this when present). */
async function deactivateOthers(workspaceId, exceptId) {
  const db = writeClient();
  if (db && isUuidWorkspace(workspaceId)) {
    await db
      .from('gtm_modules')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .neq('id', exceptId)
      .eq('active', true);
  }
  const data = loadFs();
  const list = data.workspaces?.[workspaceId] || [];
  if (!list.length) return;
  fsSaveList(
    workspaceId,
    list.map((m) =>
      m.id === exceptId ? m : { ...m, active: false, updated_at: new Date().toISOString() }
    )
  );
}

export async function listGtmModules(workspaceId) {
  if (!workspaceId) return [];
  const db = readClient();
  if (db && isUuidWorkspace(workspaceId)) {
    const { data, error } = await db
      .from('gtm_modules')
      .select('*')
      .eq('workspace_id', workspaceId)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false });
    if (error) {
      console.warn('[gtm_modules] list:', error.message);
    } else if (data?.length) {
      return data.map(publicModule);
    }
  }
  return fsList(workspaceId).map(publicModule);
}

export async function getActiveGtmModule(workspaceId) {
  if (!workspaceId) return null;
  const db = readClient();
  if (db && isUuidWorkspace(workspaceId)) {
    const { data, error } = await db
      .from('gtm_modules')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) console.warn('[gtm_modules] get active:', error.message);
    else if (data) return publicModule(data);
  }
  return publicModule(fsList(workspaceId).find((m) => m.active) || fsList(workspaceId)[0] || null);
}

export async function getGtmModuleById(workspaceId, moduleId) {
  if (!moduleId) return null;
  const db = readClient();
  if (db && isUuidWorkspace(workspaceId)) {
    const { data, error } = await db.from('gtm_modules').select('*').eq('id', moduleId).maybeSingle();
    if (!error && data) return publicModule(data);
  }
  const data = loadFs();
  for (const list of Object.values(data.workspaces || {})) {
    const hit = (list || []).find((m) => m.id === moduleId);
    if (hit) return publicModule(hit);
  }
  return null;
}

/**
 * Always insert a new module (never overwrite active).
 */
export async function createGtmModule({
  workspaceId,
  userId = null,
  companyId = null,
  name = null,
  moduleType = 'product',
  sourceContext = {},
  active = true,
} = {}) {
  if (!workspaceId) return { ok: false, error: 'workspaceId required' };

  const type = normalizeModuleType(moduleType);
  const now = new Date().toISOString();
  const title = String(name || 'Untitled module').trim() || 'Untitled module';
  const id = randomUUID();

  const row = {
    id,
    workspace_id: workspaceId,
    user_id: userId,
    company_id: companyId,
    name: title,
    module_type: type,
    status: 'draft',
    source_context: sourceContext || {},
    profile: {
      module: { type, name: title },
      locked_sections: [],
      inferences: {},
    },
    section_state: {},
    active: Boolean(active),
    created_at: now,
    updated_at: now,
  };

  if (row.active) await deactivateOthers(workspaceId, id);

  const db = writeClient();
  const ownerId = await resolveModuleUserId(workspaceId, userId);
  if (db && isUuidWorkspace(workspaceId) && ownerId) {
    try {
      const { data, error } = await db
        .from('gtm_modules')
        .insert({
          workspace_id: workspaceId,
          user_id: ownerId,
          company_id: companyId,
          name: title,
          module_type: type,
          status: 'draft',
          source_context: row.source_context,
          profile: row.profile,
          section_state: {},
          active: row.active,
        })
        .select('*')
        .single();
      if (error) throw error;
      // Mirror to FS for local tooling
      const list = fsList(workspaceId);
      list.unshift(publicModule(data));
      fsSaveList(workspaceId, list);
      return { ok: true, module: publicModule(data) };
    } catch (err) {
      console.warn('[gtm_modules] create supabase failed, using FS:', err.message);
    }
  } else if (db && isUuidWorkspace(workspaceId) && !ownerId) {
    console.warn(
      '[gtm_modules] create skipped Supabase — no userId / workspace member for',
      workspaceId
    );
  }

  const list = loadFs().workspaces?.[workspaceId] || [];
  list.unshift(row);
  fsSaveList(workspaceId, list);
  return { ok: true, module: publicModule(row) };
}

export async function activateGtmModule({ workspaceId, moduleId } = {}) {
  if (!workspaceId || !moduleId) return { ok: false, error: 'workspaceId and moduleId required' };

  await deactivateOthers(workspaceId, moduleId);
  const now = new Date().toISOString();

  const db = writeClient();
  if (db && isUuidWorkspace(workspaceId)) {
    try {
      const { data, error } = await db
        .from('gtm_modules')
        .update({ active: true, updated_at: now })
        .eq('id', moduleId)
        .eq('workspace_id', workspaceId)
        .select('*')
        .single();
      if (error) throw error;
      // FS mirror
      const dataFs = loadFs();
      const list = (dataFs.workspaces?.[workspaceId] || []).map((m) =>
        m.id === moduleId ? { ...m, active: true, updated_at: now } : { ...m, active: false }
      );
      fsSaveList(workspaceId, list);
      return { ok: true, module: publicModule(data) };
    } catch (err) {
      console.warn('[gtm_modules] activate supabase failed, using FS:', err.message);
    }
  }

  const dataFs = loadFs();
  const list = dataFs.workspaces?.[workspaceId] || [];
  const idx = list.findIndex((m) => m.id === moduleId);
  if (idx < 0) return { ok: false, error: 'Module not found' };
  const next = list.map((m, i) => ({
    ...m,
    active: i === idx,
    updated_at: i === idx ? now : m.updated_at,
  }));
  fsSaveList(workspaceId, next);
  return { ok: true, module: publicModule(next[idx]) };
}

export async function patchGtmModule({
  workspaceId,
  moduleId,
  name,
  moduleType,
  status,
  active,
  profile,
  sectionState,
  sourceContext,
} = {}) {
  if (!moduleId) return { ok: false, error: 'moduleId required' };

  if (active === true && workspaceId) {
    await deactivateOthers(workspaceId, moduleId);
  }

  const now = new Date().toISOString();
  const patch = { updated_at: now };
  if (typeof name === 'string' && name.trim()) patch.name = name.trim();
  if (moduleType) patch.module_type = normalizeModuleType(moduleType);
  if (['draft', 'in_progress', 'ready', 'archived'].includes(status)) patch.status = status;
  if (typeof active === 'boolean') patch.active = active;
  if (profile) patch.profile = profile;
  if (sectionState) patch.section_state = sectionState;
  if (sourceContext) patch.source_context = sourceContext;

  const db = writeClient();
  if (db && isUuidWorkspace(workspaceId)) {
    try {
      let q = db.from('gtm_modules').update(patch).eq('id', moduleId);
      if (workspaceId) q = q.eq('workspace_id', workspaceId);
      const { data, error } = await q.select('*').single();
      if (error) throw error;
      return { ok: true, module: publicModule(data) };
    } catch (err) {
      console.warn('[gtm_modules] patch supabase failed, using FS:', err.message);
    }
  }

  const dataFs = loadFs();
  const wsId = workspaceId || Object.keys(dataFs.workspaces || {}).find((k) =>
    (dataFs.workspaces[k] || []).some((m) => m.id === moduleId)
  );
  if (!wsId) return { ok: false, error: 'Module not found' };
  const list = dataFs.workspaces[wsId] || [];
  const idx = list.findIndex((m) => m.id === moduleId);
  if (idx < 0) return { ok: false, error: 'Module not found' };

  const existing = list[idx];
  const nextProfile = { ...(existing.profile || {}), ...(profile || {}) };
  if (patch.name || patch.module_type) {
    nextProfile.module = {
      ...(nextProfile.module || {}),
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.module_type ? { type: patch.module_type } : {}),
    };
  }
  const updated = {
    ...existing,
    ...patch,
    profile: nextProfile,
    section_state: sectionState ? sectionState : existing.section_state,
    source_context: sourceContext ? sourceContext : existing.source_context,
  };
  list[idx] = updated;
  if (updated.active) {
    for (let i = 0; i < list.length; i++) {
      if (i !== idx) list[i] = { ...list[i], active: false };
    }
  }
  fsSaveList(wsId, list);
  return { ok: true, module: publicModule(updated) };
}

/**
 * Upsert wizard draft / strategy into gtm_modules.
 * Pass moduleId to update a specific module; otherwise updates active (or creates first).
 */
export async function upsertGtmModule({
  workspaceId,
  userId,
  moduleId = null,
  name = null,
  moduleType = null,
  status = 'in_progress',
  profile = {},
  sectionState = {},
  sourceContext = {},
  active = false,
} = {}) {
  if (!workspaceId) return { ok: false, error: 'workspaceId required' };

  const type = normalizeModuleType(moduleType || profile?.module?.type || 'product');
  const now = new Date().toISOString();
  const title =
    String(name || profile?.companyName || profile?.module_name || profile?.module?.name || 'GTM Strategy').trim() ||
    'GTM Strategy';

  // Explicit module update — if stale/missing id, fall through to active or create
  if (moduleId) {
    const patched = await patchGtmModule({
      workspaceId,
      moduleId,
      name: title,
      moduleType: type,
      status,
      active: active ? true : undefined,
      profile: {
        ...profile,
        module: { type, name: title, ...(profile?.module || {}) },
      },
      sectionState,
      sourceContext,
    });
    if (patched.ok) return patched;
    console.warn('[gtm_modules] upsert moduleId miss, recreating:', moduleId, patched.error);
  }

  const existing = await getActiveGtmModule(workspaceId);
  if (existing?.id) {
    return patchGtmModule({
      workspaceId,
      moduleId: existing.id,
      name: title,
      moduleType: type,
      status,
      active: active ? true : undefined,
      profile: {
        ...(existing.profile || {}),
        ...profile,
        module: { type, name: title, ...(profile?.module || {}) },
      },
      sectionState,
      sourceContext,
    });
  }

  // First module for workspace
  const created = await createGtmModule({
    workspaceId,
    userId,
    name: title,
    moduleType: type,
    sourceContext,
    active: true,
  });
  if (!created.ok) return created;
  return patchGtmModule({
    workspaceId,
    moduleId: created.module.id,
    name: title,
    moduleType: type,
    status,
    active: true,
    profile: {
      ...profile,
      module: { type, name: title },
    },
    sectionState,
    sourceContext,
  });
}

export async function lockGtmStrategy({ workspaceId, userId, wizardState, moduleId = null } = {}) {
  const answers = wizardState?.answers || {};
  const strategy = wizardState?.strategy || null;
  const typeFromAnswers = answers?.module_type?.value || answers?.module_type || null;
  const nameFromAnswers = answers?.module_name?.value || answers?.module_name || null;

  return upsertGtmModule({
    workspaceId,
    userId,
    moduleId: moduleId || null,
    name:
      nameFromAnswers ||
      strategy?.title ||
      strategy?.companyName ||
      wizardState?.companyName ||
      'GTM Strategy',
    moduleType: typeFromAnswers || 'product',
    status: 'ready',
    active: true,
    profile: {
      answers,
      companyName: wizardState?.companyName || answers?.companyName,
      wizardVersion: wizardState?.version || 1,
      module: {
        type: normalizeModuleType(typeFromAnswers),
        name: nameFromAnswers || strategy?.title || wizardState?.companyName,
      },
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
