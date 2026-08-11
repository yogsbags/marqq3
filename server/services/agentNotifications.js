/**
 * Agent run notifications → Supabase agent_notifications (Marqq2 parity).
 */
import { getSupabaseWriteClient } from '../lib/supabase.js';

export async function resolveDeploymentNotificationUserId(deployment) {
  const workspaceId =
    typeof deployment?.workspaceId === 'string' && deployment.workspaceId.trim()
      ? deployment.workspaceId.trim()
      : typeof deployment?.companyId === 'string'
        ? deployment.companyId.trim()
        : null;
  const sb = getSupabaseWriteClient();
  if (!workspaceId || !sb) return null;

  try {
    const { data, error } = await sb
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

export async function createAgentNotification(notification) {
  const sb = getSupabaseWriteClient();
  if (!sb || !notification?.user_id) return null;
  try {
    const { data, error } = await sb.from('agent_notifications').insert(notification).select().single();
    if (error) {
      console.warn('[AgentNotification] insert failed:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[AgentNotification] insert failed:', err.message);
    return null;
  }
}

export async function notifyDeploymentResult(entry, { ok, approvalId, error, execution = null } = {}) {
  try {
    const userId = await resolveDeploymentNotificationUserId(entry);
    if (!userId) return null;
    const agentName = String(entry.agentName || 'agent').toLowerCase();
    const isHandoff = Boolean(ok && execution);
    return createAgentNotification({
      user_id: userId,
      workspace_id: entry.workspaceId || entry.companyId || null,
      agent_name: agentName,
      agent_role: entry.agentDisplayName || agentName,
      task_type: entry.scheduleMode || 'deployment',
      title: isHandoff
        ? `${entry.sectionTitle || 'Agent run'} handoff ready`
        : ok
          ? `${entry.sectionTitle || 'Agent run'} ready for review`
        : `${entry.sectionTitle || 'Agent run'} failed`,
      summary: isHandoff
        ? `${String(execution.summary || 'Approved execution produced a safe handoff.').slice(0, 360)}${execution.next_step ? ` Next: ${String(execution.next_step).slice(0, 220)}` : ''}`
        : ok
          ? `Draft queued${approvalId ? ` (${approvalId})` : ''}. Open Approvals or the studio to continue.`
        : String(error || 'Run failed').slice(0, 400),
      status: ok ? 'success' : 'error',
      read: false,
      action_items: ok
        ? [
            {
              label: isHandoff ? 'Open handoff' : 'Review draft',
              priority: 'high',
              url: entry.openScreen || 'approvals',
            },
          ]
        : [],
      full_output: {
        deploymentId: entry.id,
        approvalId: approvalId || null,
        openScreen: entry.openScreen || null,
        execution: isHandoff ? execution : null,
      },
    });
  } catch (err) {
    console.warn('[AgentNotification] notify failed:', err.message);
    return null;
  }
}
