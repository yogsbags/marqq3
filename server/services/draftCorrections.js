/**
 * draft_corrections — the runlog.jsonl analog. One row per human decision on
 * an agent draft: approved as-is (no signal needed), edited (something was
 * wrong, closed edit_type + note), or rejected (edit_type + note required).
 */
import { getSupabaseReadClient, getSupabaseWriteClient } from '../lib/supabase.js';

export const EDIT_TYPES = Object.freeze([
  'missing_rule',
  'wrong_field',
  'should_have_escalated',
  'stylistic',
  'out_of_scope',
  'other',
]);

export async function recordCorrection({
  workspaceId,
  userId = null,
  agentName,
  deploymentId = null,
  approvalId = null,
  action, // 'approved_as_is' | 'edited' | 'rejected'
  editType = null,
  note = null,
  confidence = null,
} = {}) {
  if (!workspaceId || !agentName || !action) {
    return { ok: false, error: 'workspaceId, agentName, and action are required' };
  }
  if (action !== 'approved_as_is' && !editType) {
    return { ok: false, error: 'edit_type is required when the draft was edited or rejected' };
  }

  const db = getSupabaseWriteClient();
  if (!db) return { ok: false, error: 'Supabase not configured' };

  const { data, error } = await db
    .from('draft_corrections')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      agent_name: agentName,
      deployment_id: deploymentId,
      approval_id: approvalId,
      action,
      edit_type: editType,
      note,
      confidence,
    })
    .select()
    .single();

  if (error) {
    if (/could not find the table/i.test(error.message || '')) {
      return { ok: false, error: 'draft_corrections table not found — run database/migrations/agent-self-improvement.sql' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, correction: data };
}

export async function listRecentCorrections(workspaceId, agentName, since) {
  const db = getSupabaseReadClient();
  if (!db) return [];
  let query = db
    .from('draft_corrections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (agentName) query = query.eq('agent_name', agentName);
  if (since) query = query.gte('created_at', since.toISOString());
  const { data, error } = await query;
  if (error) {
    if (!/could not find the table/i.test(error.message || '')) {
      console.warn('[draft-corrections] list failed:', error.message);
    }
    return [];
  }
  return data || [];
}
