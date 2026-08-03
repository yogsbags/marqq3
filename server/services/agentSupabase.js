/**
 * Agent OS + deployments on Marqq2 agent_* tables (dual-write with JSON DB).
 */
import { randomUUID } from 'node:crypto';
import { getSupabaseWriteClient, getSupabaseReadClient } from '../lib/supabase.js';
import { useSupabasePersistence, isUuidWorkspace } from '../lib/persistence.js';

function writeClient() {
  if (!useSupabasePersistence()) return null;
  return getSupabaseWriteClient();
}

const OS_ARTIFACT_TYPE = 'agent_os';

export async function persistAgentOsToSupabase(profile, workspaceId) {
  const db = writeClient();
  if (!db || !isUuidWorkspace(workspaceId)) return false;
  const id = `agent_os_${workspaceId}`;
  try {
    const { error } = await db.from('agent_artifacts').upsert(
      {
        id,
        company_id: workspaceId,
        agent: 'neel',
        type: OS_ARTIFACT_TYPE,
        data: profile || {},
        payload: profile || {},
        tags: ['agent_os'],
        saved_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) {
      console.warn('[agent_os supabase]', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[agent_os supabase]', err.message);
    return false;
  }
}

export async function loadAgentOsFromSupabase(workspaceId) {
  const db = getSupabaseReadClient();
  if (!db || !useSupabasePersistence() || !isUuidWorkspace(workspaceId)) return null;
  try {
    const { data, error } = await db
      .from('agent_artifacts')
      .select('*')
      .eq('id', `agent_os_${workspaceId}`)
      .maybeSingle();
    if (error || !data) return null;
    return data.payload || data.data || null;
  } catch {
    return null;
  }
}

export async function persistDeploymentToSupabase(deployment) {
  const db = writeClient();
  const workspaceId = deployment?.workspaceId || deployment?.workspace_id;
  if (!db || !deployment?.id || !isUuidWorkspace(workspaceId)) return false;
  try {
    const { error } = await db.from('agent_deployments').upsert(
      {
        id: String(deployment.id),
        workspace_id: workspaceId,
        company_id: deployment.companyId || workspaceId,
        status: deployment.status || 'pending',
        scheduled_for: deployment.scheduledFor || deployment.scheduled_for || null,
        updated_at: new Date().toISOString(),
        payload: deployment,
      },
      { onConflict: 'id' }
    );
    if (error) {
      console.warn('[agent_deployments]', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[agent_deployments]', err.message);
    return false;
  }
}

export async function listDeploymentsFromSupabase(workspaceId, status) {
  const db = getSupabaseReadClient();
  if (!db || !useSupabasePersistence() || !isUuidWorkspace(workspaceId)) return null;
  try {
    let q = db
      .from('agent_deployments')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return null;
    return (data || []).map((row) => row.payload || { id: row.id, status: row.status, workspaceId });
  } catch {
    return null;
  }
}

export async function persistApprovalToSupabase(approval) {
  const db = writeClient();
  const workspaceId = approval?.workspaceId || approval?.workspace_id;
  if (!db || !approval || !isUuidWorkspace(workspaceId)) return false;
  const id = String(approval.id || `appr_${randomUUID().slice(0, 8)}`);
  try {
    const { error } = await db.from('draft_approvals').upsert(
      {
        id,
        workspace_id: workspaceId,
        company_id: approval.companyId || workspaceId,
        status: approval.status || 'pending',
        scheduled_for: approval.scheduledFor || null,
        updated_at: new Date().toISOString(),
        payload: { ...approval, id },
      },
      { onConflict: 'id' }
    );
    if (error) {
      console.warn('[draft_approvals]', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[draft_approvals]', err.message);
    return false;
  }
}

export async function listApprovalsFromSupabase(workspaceId) {
  const db = getSupabaseReadClient();
  if (!db || !useSupabasePersistence() || !isUuidWorkspace(workspaceId)) return null;
  try {
    const { data, error } = await db
      .from('draft_approvals')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) return null;
    return (data || []).map((row) => row.payload || { id: row.id, status: row.status });
  } catch {
    return null;
  }
}
