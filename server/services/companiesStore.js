/**
 * Brand / company persistence on Marqq2 `companies` (+ optional company_artifacts metadata).
 * File blobs remain on disk under data/brand-dna/<workspaceId>/.
 */
import { getSupabaseWriteClient, getSupabaseReadClient } from '../lib/supabase.js';
import { useSupabasePersistence, isUuidWorkspace } from '../lib/persistence.js';
import { writeBrandContext, readBrandContext } from './brandStore.js';

function writeClient() {
  if (!useSupabasePersistence()) return null;
  return getSupabaseWriteClient();
}

/** Company id = workspace UUID (TEXT PK). */
export async function upsertCompanyFromBrand({ workspaceId, context = {} } = {}) {
  const db = writeClient();
  const fsContext = await writeBrandContext(workspaceId, context);

  if (!db || !isUuidWorkspace(workspaceId)) {
    return { ok: true, context: fsContext, supabase: false };
  }

  const profile = {
    ...fsContext,
    niche: fsContext.niche || context.niche || '',
    icp: fsContext.icp || context.icp || '',
    brandSummary: fsContext.brandSummary || '',
    positioningTags: fsContext.positioningTags || [],
    colors: fsContext.colors || [],
    fonts: fsContext.fonts || '',
    toneOfVoice: fsContext.toneOfVoice || '',
    knowledgeFiles: fsContext.knowledgeFiles || [],
  };

  const row = {
    id: workspaceId,
    workspace_id: workspaceId,
    company_name: String(fsContext.companyName || context.companyName || 'Company').trim(),
    website_url: String(fsContext.website || context.website || '').trim() || null,
    profile,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await db.from('companies').upsert(row, { onConflict: 'id' }).select().single();
    if (error) throw error;

    // Light workspace_context sync for Marqq2 GeneralTab compatibility
    await db.from('workspace_context').upsert(
      {
        workspace_id: workspaceId,
        company: row.company_name,
        website_url: row.website_url || '',
        industry: profile.niche || '',
        icp: profile.icp || '',
        primary_goal: profile.outcome || profile.target || '',
        goals: profile.brandSummary || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id' }
    );

    return { ok: true, context: fsContext, company: data, supabase: true };
  } catch (err) {
    console.warn('[companies] upsert failed, FS saved:', err.message);
    return { ok: true, context: fsContext, supabase: false, error: err.message };
  }
}

export async function loadCompanyBrand(workspaceId) {
  // Prefer filesystem (has binaries paths); overlay company profile from Supabase
  const fsContext = await readBrandContext(workspaceId);
  const db = getSupabaseReadClient();
  if (!db || !isUuidWorkspace(workspaceId)) {
    return fsContext;
  }
  try {
    const { data, error } = await db.from('companies').select('*').eq('id', workspaceId).maybeSingle();
    if (error || !data) return fsContext;
    const profile = data.profile && typeof data.profile === 'object' ? data.profile : {};
    return {
      ...(fsContext || {}),
      ...profile,
      companyName: data.company_name || profile.companyName || fsContext?.companyName,
      website: data.website_url || profile.website || fsContext?.website,
      workspaceId,
      updatedAt: data.updated_at || fsContext?.updatedAt,
    };
  } catch {
    return fsContext;
  }
}

export async function saveCompanyArtifactMeta({
  workspaceId,
  artifactType = 'brand_dna_file',
  data = {},
} = {}) {
  const db = writeClient();
  if (!db || !isUuidWorkspace(workspaceId)) return null;
  try {
    const { data: row, error } = await db
      .from('company_artifacts')
      .upsert(
        {
          company_id: workspaceId,
          workspace_id: workspaceId,
          artifact_type: artifactType,
          data: { ...data, title: data.title || artifactType },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,artifact_type' }
      )
      .select()
      .maybeSingle();
    if (error) {
      console.warn('[company_artifacts]', error.message);
      return null;
    }
    return row;
  } catch (err) {
    console.warn('[company_artifacts]', err.message);
    return null;
  }
}
