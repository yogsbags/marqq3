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

function readClient() {
  if (!useSupabasePersistence()) return null;
  return getSupabaseReadClient();
}

const OS_ARTIFACT_TYPE = 'agent_os';

export async function loadWorkspacePreferencesFromSupabase(workspaceId) {
  const db = getSupabaseReadClient();
  if (!db || !isUuidWorkspace(workspaceId)) return null;
  try {
    const { data, error } = await db.from('agent_artifacts').select('payload, data').eq('id', `workspace_prefs_${workspaceId}`).maybeSingle();
    if (error || !data) return null;
    return data.payload || data.data || null;
  } catch { return null; }
}

export async function persistWorkspacePreferencesToSupabase(workspaceId, preferences) {
  const db = writeClient();
  if (!db || !isUuidWorkspace(workspaceId)) return false;
  try {
    const { error } = await db.from('agent_artifacts').upsert({
      id: `workspace_prefs_${workspaceId}`,
      company_id: workspaceId,
      agent: 'workspace',
      type: 'workspace_prefs',
      data: preferences || {},
      payload: preferences || {},
      tags: ['workspace_preferences'],
      saved_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    return !error;
  } catch { return false; }
}

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

export async function persistDeploymentToSupabase(deployment, { runtime = false } = {}) {
  const db = writeClient();
  const workspaceId = deployment?.workspaceId || deployment?.workspace_id;
  if (!db || !deployment?.id || !isUuidWorkspace(workspaceId)) return false;
  try {
    const base = {
        id: String(deployment.id),
        workspace_id: workspaceId,
        company_id: deployment.companyId || workspaceId,
        status: deployment.status || 'pending',
        scheduled_for: deployment.scheduledFor || deployment.scheduled_for || null,
        created_at: deployment.createdAt || deployment.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        payload: deployment,
    };
    const runtimeFields = runtime
      ? {
          worker_id: deployment.workerId || deployment.worker_id || null,
          claimed_at: deployment.claimedAt || deployment.claimed_at || null,
          lease_expires_at: deployment.leaseExpiresAt || deployment.lease_expires_at || null,
          heartbeat_at: deployment.heartbeatAt || deployment.heartbeat_at || null,
          attempt_count: Number(deployment.attemptCount || deployment.attempt_count || 0),
          max_attempts: Number(deployment.maxAttempts || deployment.max_attempts || 3),
          next_retry_at: deployment.nextRetryAt || deployment.next_retry_at || null,
          last_error: deployment.lastError || deployment.last_error || null,
          run_id: deployment.runId || deployment.run_id || null,
          started_at: deployment.startedAt || deployment.started_at || null,
          completed_at: deployment.completedAt || deployment.completed_at || null,
          failed_at: deployment.failedAt || deployment.failed_at || null,
        }
      : {};
    const { error } = await db.from('agent_deployments').upsert(
      { ...base, ...runtimeFields },
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

export async function heartbeatAgentDeployment({ deploymentId, workerId, leaseSeconds = 300 } = {}) {
  const db = writeClient();
  if (!db || !deploymentId || !workerId) return false;
  try {
    const now = new Date().toISOString();
    const lease = new Date(Date.now() + Math.max(30, Number(leaseSeconds) || 300) * 1000).toISOString();
    const { error } = await db
      .from('agent_deployments')
      .update({ heartbeat_at: now, lease_expires_at: lease, updated_at: now })
      .eq('id', String(deploymentId))
      .eq('worker_id', String(workerId))
      .eq('status', 'running');
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[agent_deployments heartbeat]', err?.message || err);
    return false;
  }
}

export async function getDeploymentFromSupabase(deploymentId) {
  const db = getSupabaseReadClient();
  if (!db || !useSupabasePersistence() || !deploymentId) return null;
  try {
    const { data, error } = await db
      .from('agent_deployments')
      .select('*')
      .eq('id', String(deploymentId))
      .maybeSingle();
    if (error || !data) return null;
    return {
      ...(data.payload || {}),
      id: data.id,
      workspaceId: data.workspace_id,
      companyId: data.company_id || data.workspace_id,
      status: data.status,
      runId: data.run_id,
      workerId: data.worker_id,
      attemptCount: data.attempt_count,
    };
  } catch {
    return null;
  }
}

export async function persistAgentArtifact(artifact) {
  const db = writeClient();
  if (!db || !artifact?.id || !isUuidWorkspace(artifact.workspaceId || artifact.workspace_id)) return false;
  try {
    const { error } = await db.from('agent_artifacts').upsert(
      {
        id: String(artifact.id),
        company_id: artifact.workspaceId || artifact.workspace_id,
        agent: artifact.agentName || artifact.agent || 'agent',
        type: artifact.type || 'agent_runtime_artifact',
        data: artifact.data || {},
        payload: artifact.data || {},
        tags: artifact.tags || ['agent_runtime'],
        saved_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[agent_artifacts]', err?.message || err);
    return false;
  }
}

export async function persistAgentMailThread(thread) {
  const db = writeClient();
  const workspaceId = thread?.workspaceId || thread?.workspace_id;
  if (!db || !thread?.id || !isUuidWorkspace(workspaceId)) return false;
  try {
    const { error } = await db.from('agent_mail_threads').upsert({
      id: String(thread.id),
      workspace_id: workspaceId,
      inbox_id: String(thread.inboxId || thread.inbox_id || ''),
      thread_id: thread.threadId || thread.thread_id || null,
      user_email: thread.userEmail || thread.user_email || null,
      user_name: thread.userName || thread.user_name || null,
      connector_id: String(thread.connectorId || thread.connector_id || 'unknown'),
      automations: thread.automations || [],
      status: thread.status || 'pending',
      expires_at: thread.expiresAt || thread.expires_at || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (!error) return true;
    if (!/agent_mail_threads|schema cache|relation .* does not exist/i.test(error.message || '')) throw error;
  } catch (err) {
    if (!/agent_mail_threads|schema cache|relation .* does not exist/i.test(err?.message || '')) {
      console.warn('[agent_mail_threads]', err?.message || err);
      return false;
    }
  }
  // Compatibility path: agent_artifacts is already present in older schemas.
  try {
    const { error } = await db.from('agent_artifacts').upsert({
      id: String(thread.id),
      company_id: workspaceId,
      agent: 'neel',
      type: 'agent_mail_thread',
      data: thread,
      payload: thread,
      tags: ['agent_runtime', 'agent_mail'],
      saved_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[agent_mail thread artifact]', err?.message || err);
    return false;
  }
}

export async function getAgentMailThread({ workspaceId, inboxId, threadId } = {}) {
  const db = getSupabaseReadClient();
  if (!db || !useSupabasePersistence() || !inboxId) return null;
  try {
    let q = db.from('agent_mail_threads').select('*').eq('inbox_id', String(inboxId));
    if (isUuidWorkspace(workspaceId)) q = q.eq('workspace_id', workspaceId);
    if (threadId) q = q.eq('thread_id', String(threadId));
    const { data, error } = threadId ? await q.maybeSingle() : await q.order('updated_at', { ascending: false }).limit(1);
    if (error || !data) {
      if (!threadId) return null;
      const artifactId = `mail_thread_${inboxId}_${threadId}`;
      const fallback = await db.from('agent_artifacts').select('payload, data').eq('id', artifactId).maybeSingle();
      if (fallback.error || !fallback.data) return null;
      const value = fallback.data.payload || fallback.data.data || {};
      if (value.status !== 'pending' || (value.expiresAt && Date.parse(value.expiresAt) <= Date.now())) return null;
      return value;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.status !== 'pending' || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) return null;
    return { ...row, workspaceId: row.workspace_id, inboxId: row.inbox_id, threadId: row.thread_id, connectorId: row.connector_id, userEmail: row.user_email, userName: row.user_name, expiresAt: row.expires_at };
  } catch (err) {
    console.warn('[agent_mail_threads read]', err?.message || err);
    return null;
  }
}

export async function claimAgentMailEvent(event) {
  const db = readClient();
  if (!db || !event?.eventKey || !isUuidWorkspace(event.workspaceId)) return null;
  try {
    const { data, error } = await db.rpc('claim_agent_mail_event', {
      p_event_key: String(event.eventKey),
      p_workspace_id: isUuidWorkspace(event.workspaceId) ? event.workspaceId : null,
      p_inbox_id: event.inboxId || null,
      p_thread_id: event.threadId || null,
      p_message_id: event.messageId || null,
      p_from_email: event.from || null,
      p_subject: event.subject || null,
      p_payload: event.payload || {},
    });
    if (error) {
      if (!/agent_mail_events|claim_agent_mail_event|function .* does not exist|schema cache/i.test(error.message || '')) console.warn('[agent_mail_events claim]', error.message);
      if (!/agent_mail_events|claim_agent_mail_event|function .* does not exist|schema cache/i.test(error.message || '')) return null;
    } else {
      return Boolean(data);
    }
  } catch (err) {
    if (!/agent_mail_events|claim_agent_mail_event|function .* does not exist|schema cache/i.test(err?.message || '')) console.warn('[agent_mail_events claim]', err?.message || err);
    if (!/agent_mail_events|claim_agent_mail_event|function .* does not exist|schema cache/i.test(err?.message || '')) return null;
  }
  // Compatibility path: deterministic artifact ID + INSERT gives an atomic
  // duplicate barrier even before agent_mail_events is migrated.
  try {
    const artifactId = `mail_event_${event.eventKey}`;
    const { error } = await db.from('agent_artifacts').insert({
      id: artifactId,
      company_id: isUuidWorkspace(event.workspaceId) ? event.workspaceId : null,
      agent: 'neel',
      type: 'agent_mail_event',
      data: { ...event, status: 'processing' },
      payload: { ...event, status: 'processing' },
      tags: ['agent_runtime', 'agent_mail', 'idempotency'],
      saved_at: new Date().toISOString(),
    });
    if (error) {
      if (/duplicate|unique/i.test(error.message || '')) return false;
      throw error;
    }
    return true;
  } catch (err) {
    console.warn('[agent_mail event artifact]', err?.message || err);
    return null;
  }
}

export async function completeAgentMailEvent({ eventKey, status = 'completed', deploymentIds = [] } = {}) {
  const db = writeClient();
  if (!db || !eventKey) return false;
  try {
    const { error } = await db.from('agent_mail_events').update({ status, deployment_ids: deploymentIds, updated_at: new Date().toISOString() }).eq('event_key', String(eventKey));
    if (!error) return true;
    if (!/agent_mail_events|schema cache|relation .* does not exist/i.test(error.message || '')) throw error;
  } catch (err) {
    if (!/agent_mail_events|schema cache|relation .* does not exist/i.test(err?.message || '')) {
      console.warn('[agent_mail_events update]', err?.message || err);
      return false;
    }
  }
  try {
    const artifactId = `mail_event_${eventKey}`;
    const { data: existing, error: readError } = await db.from('agent_artifacts').select('payload, data').eq('id', artifactId).maybeSingle();
    if (readError || !existing) return false;
    const value = { ...(existing.payload || existing.data || {}), status, deploymentIds };
    const { error } = await db.from('agent_artifacts').update({ data: value, payload: value, saved_at: new Date().toISOString() }).eq('id', artifactId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[agent_mail event artifact update]', err?.message || err);
    return false;
  }
}

export async function claimAgentAction({
  workspaceId,
  runId,
  stepKey = 'execute',
  actionKey,
  actionType,
  request = {},
} = {}) {
  const db = readClient();
  if (!db || !isUuidWorkspace(workspaceId) || !runId || !actionKey || !actionType) return null;
  try {
    const { data, error } = await db.rpc('claim_agent_action', {
      p_workspace_id: workspaceId,
      p_run_id: String(runId),
      p_step_key: String(stepKey),
      p_action_key: String(actionKey),
      p_action_type: String(actionType),
      p_request: request || {},
    });
    if (error) {
      console.warn('[agent_action_receipts]', error.message);
      return null;
    }
    return Boolean(data);
  } catch (err) {
    console.warn('[agent_action_receipts]', err?.message || err);
    return null;
  }
}

export async function updateAgentActionReceipt({
  workspaceId,
  actionKey,
  status,
  response = null,
} = {}) {
  const db = writeClient();
  if (!db || !isUuidWorkspace(workspaceId) || !actionKey) return false;
  if (!['claimed', 'completed', 'skipped', 'failed'].includes(String(status))) return false;
  try {
    const { error } = await db
      .from('agent_action_receipts')
      .update({ status, response: response || null, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .eq('action_key', String(actionKey));
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[agent_action_receipts update]', err?.message || err);
    return false;
  }
}

export async function listAgentActivity(workspaceId, { limit = 80 } = {}) {
  const db = readClient();
  if (!db || !isUuidWorkspace(workspaceId)) return null;
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 80));
  try {
    const [eventsRes, runsRes, receiptsRes, approvalsRes] = await Promise.all([
      db.from('agent_events').select('id, run_id, deployment_id, event_type, step_key, payload, created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(safeLimit),
      db.from('agent_runs').select('id, deployment_id, agent_name, status, current_step, output, error, started_at, completed_at, updated_at').eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).limit(safeLimit),
      db.from('agent_action_receipts').select('id, run_id, step_key, action_key, action_type, status, request, response, created_at, updated_at').eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).limit(safeLimit),
      db.from('draft_approvals').select('id, status, payload, created_at, updated_at').eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).limit(safeLimit),
    ]);
    const firstError = [eventsRes, runsRes, receiptsRes, approvalsRes].find((result) => result.error && !/relation .* does not exist|schema cache/i.test(result.error.message || ''));
    if (firstError) throw firstError.error;
    const events = (eventsRes.data || []).map((row) => ({ id: `event:${row.id}`, kind: 'event', timestamp: row.created_at, title: row.event_type, detail: row.payload?.summary || row.payload?.next_step || row.step_key || 'Agent event', status: row.payload?.status || 'info', runId: row.run_id, deploymentId: row.deployment_id, payload: row.payload || {} }));
    const runs = (runsRes.data || []).map((row) => ({ id: `run:${row.id}`, kind: 'run', timestamp: row.updated_at || row.completed_at || row.started_at, title: `${row.agent_name || 'Agent'} run`, detail: row.output?.summary || row.error || row.current_step || 'Agent run', status: row.status, runId: row.id, deploymentId: row.deployment_id, payload: row.output || {} }));
    const receipts = (receiptsRes.data || []).map((row) => ({ id: `action:${row.id}`, kind: 'action', timestamp: row.updated_at || row.created_at, title: row.action_type || 'Agent action', detail: row.response?.summary || row.response?.error || row.action_key, status: row.status, runId: row.run_id, payload: row.response || row.request || {} }));
    const approvals = (approvalsRes.data || []).map((row) => { const payload = row.payload || {}; return { id: `approval:${row.id}`, kind: 'approval', timestamp: row.updated_at || row.created_at, title: payload.title || 'Approval', detail: payload.preview || payload.owner || 'Approval decision', status: row.status, runId: payload.runId || null, payload }; });
    return [...events, ...runs, ...receipts, ...approvals].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)).slice(0, safeLimit);
  } catch (err) {
    console.warn('[agent activity]', err?.message || err);
    return null;
  }
}

export async function listWorkspaceWorkQueue(workspaceId, userId, { limit = 80 } = {}) {
  const activity = await listAgentActivity(workspaceId, { limit });
  const db = readClient();
  if (!db || !userId || !isUuidWorkspace(workspaceId)) return activity || [];
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 80));
  try {
    const { data, error } = await db
      .from('agent_notifications')
      .select('id, agent_name, agent_role, task_type, title, summary, action_items, full_output, read, created_at, workspace_id')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(safeLimit);
    if (error) throw error;
    const notifications = (data || []).map((row) => ({
      id: `notification:${row.id}`,
      kind: 'notification',
      timestamp: row.created_at,
      title: row.title || `${row.agent_name || 'Agent'} update`,
      detail: row.summary || row.task_type || 'Agent update',
      status: row.read ? 'read' : 'unread',
      agentName: row.agent_name,
      agentRole: row.agent_role,
      actionItems: row.action_items || [],
      campaignId: row.full_output?.campaignId || null,
      campaignName: row.full_output?.campaignName || null,
      fullOutput: row.full_output || {},
    }));
    return [...(activity || []), ...notifications]
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, safeLimit);
  } catch (err) {
    if (!/relation .* does not exist|schema cache|workspace_id/i.test(err?.message || '')) {
      console.warn('[work queue notifications]', err?.message || err);
    }
    return activity || [];
  }
}

/** Atomically claim due deployments through the Postgres lease function. */
export async function claimDeploymentsFromSupabase({
  workerId,
  workspaceId = null,
  leaseSeconds = 300,
  limit = 10,
  workspaceConcurrency = 2,
  force = false,
} = {}) {
  const db = readClient();
  if (!db || !workerId) return null;
  try {
    const { data, error } = await db.rpc('claim_agent_deployments', {
      p_worker_id: String(workerId),
      p_lease_seconds: Number(leaseSeconds) || 300,
      p_workspace_id: isUuidWorkspace(workspaceId) ? workspaceId : null,
      p_limit: Number(limit) || 10,
      p_workspace_concurrency: Math.max(1, Number(workspaceConcurrency) || 2),
      p_force: Boolean(force),
    });
    if (error) {
      // The migration may not have been applied yet. Returning null lets the
      // legacy JSON scheduler remain the safe local fallback.
      if (!/claim_agent_deployments|function .* does not exist|schema cache/i.test(error.message || '')) {
        console.warn('[agent_deployments claim]', error.message);
      }
      return null;
    }
    return (data || []).map((row) => ({
      ...(row.payload || {}),
      id: row.id,
      workspaceId: row.workspace_id,
      companyId: row.company_id || row.workspace_id,
      status: row.status,
      workerId: row.worker_id,
      claimedAt: row.claimed_at,
      leaseExpiresAt: row.lease_expires_at,
      heartbeatAt: row.heartbeat_at,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      nextRetryAt: row.next_retry_at,
      runId: row.run_id,
      startedAt: row.started_at,
    }));
  } catch (err) {
    if (!/claim_agent_deployments|function .* does not exist|schema cache/i.test(err?.message || '')) {
      console.warn('[agent_deployments claim]', err?.message || err);
    }
    return null;
  }
}

export async function persistAgentRun(run) {
  const db = writeClient();
  if (!db || !run?.id || !isUuidWorkspace(run.workspaceId || run.workspace_id)) return false;
  const row = {
    id: String(run.id),
    deployment_id: String(run.deploymentId || run.deployment_id || ''),
    workspace_id: run.workspaceId || run.workspace_id,
    agent_name: String(run.agentName || run.agent_name || 'agent'),
    status: run.status || 'running',
    trigger: run.trigger || run.triggeredBy || null,
    attempt_count: Number(run.attemptCount || run.attempt_count || 0),
    current_step: run.currentStep || run.current_step || null,
    input: run.input || {},
    output: run.output || null,
    error: run.error || null,
    started_at: run.startedAt || run.started_at || new Date().toISOString(),
    heartbeat_at: run.heartbeatAt || run.heartbeat_at || new Date().toISOString(),
    completed_at: run.completedAt || run.completed_at || null,
    updated_at: new Date().toISOString(),
  };
  try {
    const { error } = await db.from('agent_runs').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[agent_runs]', err?.message || err);
    return false;
  }
}

export async function persistAgentRunStep(step) {
  const db = writeClient();
  if (!db || !step?.id || !step?.runId || !isUuidWorkspace(step.workspaceId || step.workspace_id)) return false;
  try {
    const { error } = await db.from('agent_run_steps').upsert(
      {
        id: String(step.id),
        run_id: String(step.runId || step.run_id),
        workspace_id: step.workspaceId || step.workspace_id,
        step_index: Number(step.stepIndex ?? step.step_index ?? 0),
        step_key: String(step.stepKey || step.step_key || 'step'),
        status: step.status || 'pending',
        input: step.input || {},
        output: step.output || null,
        error: step.error || null,
        attempt_count: Number(step.attemptCount || step.attempt_count || 0),
        started_at: step.startedAt || step.started_at || null,
        completed_at: step.completedAt || step.completed_at || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[agent_run_steps]', err?.message || err);
    return false;
  }
}

export async function appendAgentEvent(event) {
  const db = writeClient();
  if (!db || !event?.runId || !isUuidWorkspace(event.workspaceId || event.workspace_id)) return false;
  try {
    const { error } = await db.from('agent_events').insert({
      run_id: String(event.runId),
      deployment_id: event.deploymentId || null,
      workspace_id: event.workspaceId || event.workspace_id,
      event_type: String(event.eventType || event.event_type || 'runtime.event'),
      step_key: event.stepKey || event.step_key || null,
      payload: event.payload || {},
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[agent_events]', err?.message || err);
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

/** User-safe execution summaries for the Orchestration view. */
export async function listAgentExecutionSummaries(workspaceId, { limit = 20 } = {}) {
  const db = getSupabaseReadClient();
  if (!db || !useSupabasePersistence() || !isUuidWorkspace(workspaceId)) return null;
  try {
    const [{ data: deployments, error: deploymentsError }, { data: runs, error: runsError }, { data: artifacts, error: artifactsError }] = await Promise.all([
      db.from('agent_deployments')
        .select('id, status, payload, run_id, attempt_count, next_retry_at, last_error, started_at, completed_at, failed_at, updated_at')
        .eq('workspace_id', workspaceId)
        .order('updated_at', { ascending: false })
        .limit(Number(limit) || 20),
      db.from('agent_runs')
        .select('id, deployment_id, agent_name, status, current_step, output, error, started_at, completed_at, updated_at')
        .eq('workspace_id', workspaceId)
        .order('updated_at', { ascending: false })
        .limit((Number(limit) || 20) * 2),
      db.from('agent_artifacts')
        .select('id, type, data, payload, saved_at')
        .eq('company_id', workspaceId)
        .eq('type', 'agent_execution_handoff')
        .order('saved_at', { ascending: false })
        .limit(Number(limit) || 20),
    ]);
    if (deploymentsError || runsError || artifactsError) return null;
    const runByDeployment = new Map((runs || []).map((run) => [String(run.deployment_id), run]));
    const artifactByDeployment = new Map();
    for (const row of artifacts || []) {
      const data = row.payload || row.data || {};
      if (data.deploymentId && !artifactByDeployment.has(String(data.deploymentId))) {
        artifactByDeployment.set(String(data.deploymentId), { ...data, savedAt: row.saved_at });
      }
    }
    return (deployments || []).map((row) => {
      const payload = row.payload || {};
      const run = runByDeployment.get(String(row.id)) || null;
      return {
        id: row.id,
        agentName: payload.agentName || run?.agent_name || 'agent',
        agentDisplayName: payload.agentDisplayName || payload.agentName || run?.agent_name || 'Agent',
        sectionTitle: payload.sectionTitle || payload.sectionId || 'Agent deployment',
        openScreen: payload.openScreen || null,
        status: row.status || payload.status || 'pending',
        executionPhase: payload.executionPhase || null,
        scheduledFor: payload.scheduledFor || null,
        attemptCount: row.attempt_count || 0,
        nextRetryAt: row.next_retry_at || null,
        lastError: row.last_error || null,
        updatedAt: row.updated_at || null,
        run: run ? {
          id: run.id,
          status: run.status,
          currentStep: run.current_step,
          output: run.output || null,
          error: run.error || null,
          startedAt: run.started_at,
          completedAt: run.completed_at,
          updatedAt: run.updated_at,
        } : null,
        handoff: artifactByDeployment.get(String(row.id)) || null,
      };
    });
  } catch (err) {
    console.warn('[agent execution summaries]', err?.message || err);
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

export async function listApprovalsForUserFromSupabase(userId) {
  const db = getSupabaseReadClient();
  if (!db || !useSupabasePersistence() || !userId) return null;
  try {
    const { data: memberships, error: memberError } = await db
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId);
    if (memberError) return null;
    const workspaceIds = (memberships || []).map((row) => row.workspace_id).filter(isUuidWorkspace);
    if (!workspaceIds.length) return [];
    const { data, error } = await db
      .from('draft_approvals')
      .select('*')
      .in('workspace_id', workspaceIds)
      .order('created_at', { ascending: false });
    if (error) return null;
    return (data || []).map((row) => row.payload || { id: row.id, status: row.status });
  } catch {
    return null;
  }
}

export async function getApprovalFromSupabase(approvalId) {
  const db = getSupabaseReadClient();
  if (!db || !useSupabasePersistence() || !approvalId) return null;
  try {
    const { data, error } = await db
      .from('draft_approvals')
      .select('*')
      .eq('id', String(approvalId))
      .maybeSingle();
    if (error || !data) return null;
    return data.payload || { id: data.id, status: data.status, workspaceId: data.workspace_id };
  } catch {
    return null;
  }
}
