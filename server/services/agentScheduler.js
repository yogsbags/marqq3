/**
 * Agent deployment scheduler + draft-gated agent runs (Marqq2 poller pattern).
 */

import { randomUUID } from 'node:crypto';
import { getDb, updateDb } from '../db.js';
import { AGENT_CATALOG, planAgentTask } from './agentOs.js';
import {
  ensureAgentCollections,
  listDeployments,
  loadAgentOsProfile,
  saveAgentOsProfile,
} from './agentOsStore.js';
import {
  appendAgentEvent,
  claimDeploymentsFromSupabase,
  claimAgentAction,
  getDeploymentFromSupabase,
  heartbeatAgentDeployment,
  persistAgentArtifact,
  persistAgentRunStep,
  persistAgentRun,
  persistApprovalToSupabase,
  persistDeploymentToSupabase,
  updateAgentActionReceipt,
} from './agentSupabase.js';
import { isUuidWorkspace, useSupabasePersistence } from '../lib/persistence.js';
import { notifyDeploymentResult } from './agentNotifications.js';
import { executionModeFromAgentOs, isAutonomousMode } from './executionMode.js';
import { chargeCredits, meteredStudioJson } from './credits/index.js';

const PORT = () => Number(process.env.PORT || 3001);
const INTERVAL_MS = Math.max(
  15_000,
  Number(process.env.AGENT_DEPLOYMENT_SCHEDULER_INTERVAL_MS || 60_000)
);

let timer = null;
let ticking = false;
const WORKER_ID = `${process.env.HOSTNAME || 'marqq-worker'}:${process.pid}:${randomUUID().slice(0, 8)}`;

const AGENT_BY_ID = new Map(AGENT_CATALOG.map((a) => [a.id, a]));

function retryDelayMinutes(attempt) {
  const base = Math.max(1, Number(process.env.AGENT_RETRY_BASE_MINUTES || 2));
  return Math.min(240, base * 2 ** Math.max(0, Number(attempt || 1) - 1));
}

function isRetryableAgentError(err) {
  const message = String(err?.message || err || '').toLowerCase();
  return !/(approval|permission|forbidden|unauthorized|policy|invalid|schema|not found)/i.test(message);
}

export function isDeploymentRunnable(entry, now = Date.now()) {
  if (!entry || !['pending', 'active'].includes(String(entry.status || ''))) return false;
  if (!entry.scheduledFor || entry.scheduledFor === 'next_cron_run') return true;
  const nextTs = Date.parse(String(entry.scheduledFor));
  return Number.isFinite(nextTs) && nextTs <= now;
}

export function resolveDeploymentNextRun(entry, from = new Date()) {
  const mins = Number(entry?.recurrenceMinutes || 10080);
  const safe = Number.isFinite(mins) && mins > 0 ? mins : 10080;
  return new Date(from.getTime() + safe * 60_000).toISOString();
}

function buildDeploymentRunQuery(entry) {
  const bullets = (entry.bullets || []).slice(0, 5).map((b) => `- ${b}`).join('\n');
  return [
    `Execute draft work for GTM section "${entry.sectionTitle || entry.sectionId}".`,
    entry.summary ? `Brief: ${entry.summary}` : '',
    bullets ? `Plays:\n${bullets}` : '',
    `Delivery mode: ${entry.deliveryMode || 'draft'} (do not spend or publish live).`,
    `Open screen when human continues: ${entry.openScreen || 'orchestration'}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Local agent run: plan + task update.
 * Human-gated → Approvals queue. Autonomous → auto-approved draft (still no live spend/publish).
 */
export async function executeAgentRun({
  agentName,
  company_id,
  query,
  deployment_id,
  delivery_mode = 'draft',
  triggered_by = 'manual',
  execution_mode = null,
  run_id = null,
  deployment_record = null,
} = {}) {
  const agent = AGENT_BY_ID.get(String(agentName || '').toLowerCase()) || {
    id: agentName,
    name: agentName,
    role: 'Agent',
    avatarColor: '#888',
  };
  const depId = deployment_id || null;
  let deployment = null;
  if (depId) {
    deployment = deployment_record || listDeployments({}).find((d) => d.id === depId) || null;
  }

  const ws =
    String(company_id || deployment?.companyId || deployment?.workspaceId || '').trim() ||
    'marqq-ws-1';
  const os = loadAgentOsProfile(ws);
  const mode =
    execution_mode != null
      ? executionModeFromAgentOs({ execution_mode })
      : executionModeFromAgentOs(os);
  const autonomous = isAutonomousMode(mode);

  const plan = planAgentTask({
    sectionId: deployment?.sectionId || null,
    screenId: deployment?.openScreen || agent.openScreen || null,
    target: deployment?.agentTarget || null,
  });

  const approvalId = `appr_${randomUUID().slice(0, 8)}`;
  const title = deployment
    ? `${agent.name}: ${deployment.sectionTitle || deployment.sectionId} (draft)`
    : `${agent.name}: scheduled draft run`;
  const preview = String(query || deployment?.summary || plan?.mission || 'Draft agent run').slice(
    0,
    280
  );
  const openScreen = deployment?.openScreen || agent.openScreen || 'approvals';

  let createdApproval = null;
  updateDb((state) => {
    const next = ensureAgentCollections(state);
    const confidence = plan?.confidence || 'medium';
    const approval = {
      id: approvalId,
      type: 'Agent draft',
      title,
      owner: `${agent.name} · ${agent.role}`,
      risk: confidence === 'low' ? 'Needs review — low confidence' : autonomous ? 'Auto-approved' : 'Low risk',
      riskClass: confidence === 'low' ? 'tag tag-accent-2' : autonomous ? 'tag tag-accent' : 'tag tag-outline',
      preview,
      deadline: autonomous ? 'Auto-cleared' : 'Awaiting review',
      deploymentId: depId,
      // workspaceId was missing here entirely — draft_corrections capture in
      // /api/approvals/decide silently never fired without it (confirmed).
      workspaceId: ws,
      agentName: agent.id,
      confidence,
      openScreen,
      sectionId: deployment?.sectionId || null,
      deliveryMode: delivery_mode || 'draft',
      executionMode: mode,
      runId: run_id,
      createdAt: new Date().toISOString(),
      status: autonomous ? 'approved' : 'pending',
      decidedAt: autonomous ? new Date().toISOString() : null,
      decidedBy: autonomous ? 'autonomous' : null,
    };
    createdApproval = approval;
    const approvals = [approval, ...(next.approvals || [])].slice(0, 60);

    const approvedActions = { ...(next.approvedActions || {}) };
    if (autonomous) approvedActions[approvalId] = 'approved';

    const tasks = (next.tasks || []).map((t) => {
      if (depId && t.deploymentId === depId) {
        return autonomous
          ? { ...t, status: 'Ready', due: 'Autonomous — open studio' }
          : { ...t, status: 'Needs approval', due: 'Awaiting approval' };
      }
      return t;
    });

    const logEntry = {
      id: `l_${randomUUID().slice(0, 8)}`,
      time: new Date().toLocaleString(),
      observed: preview,
      action: autonomous
        ? `Autonomous draft ready (${approvalId}). Open ${openScreen} to continue — no live spend.`
        : `Queued draft for approval (${approvalId}). Open Approvals to continue.`,
      confidence: 'scheduled',
      deploymentId: depId,
      triggered_by,
      executionMode: mode,
    };
    const agentLogs = { ...(next.agentLogs || {}) };
    const key = agent.id;
    agentLogs[key] = [logEntry, ...(agentLogs[key] || [])].slice(0, 40);

    const existingOs = next.agent_os_by_workspace?.[ws];
    let agentOsByWorkspace = next.agent_os_by_workspace;
    if (existingOs) {
      agentOsByWorkspace = {
        ...agentOsByWorkspace,
        [ws]: {
          ...existingOs,
          last_executed_task: {
            agentName: agent.id,
            deploymentId: depId,
            approvalId,
            at: new Date().toISOString(),
            triggered_by,
            executionMode: mode,
          },
          updatedAt: new Date().toISOString(),
        },
      };
    }

    return { ...next, approvals, approvedActions, tasks, agentLogs, agent_os_by_workspace: agentOsByWorkspace };
  });
  void persistApprovalToSupabase(createdApproval);

  // Meter agent draft run (fixed feature estimate; no LLM tokens on this path yet)
  const credit = chargeCredits({
    workspaceId: ws,
    feature: 'agent_run',
    provider: 'internal',
    actualCredits: 5,
    meta: { agentName: agent.id, deploymentId: depId, triggered_by },
    allowNegative: true, // soft meter during beta — never block drafts
  });

  return {
    ok: true,
    agentName: agent.id,
    agentDisplayName: agent.name,
    approvalId,
    runId: run_id,
    deploymentId: depId,
    deliveryMode: delivery_mode || 'draft',
    executionMode: mode,
    autonomous,
    plan,
    credits: credit?.ok ? { actualCredits: credit.actualCredits, wallet: credit.wallet } : credit,
    openScreen: autonomous ? openScreen : 'approvals',
    message: autonomous
      ? 'Autonomous draft ready (no live spend/publish).'
      : 'Draft queued for approval (no live spend/publish).',
  };
}

async function invokeLocalRun(entry) {
  // Prefer in-process call (same process) over HTTP to avoid boot races
  return executeAgentRun({
    agentName: entry.agentName,
    company_id: entry.companyId || entry.workspaceId,
    query: buildDeploymentRunQuery(entry),
    deployment_id: entry.id,
    run_id: entry.runId || null,
    deployment_record: entry,
    delivery_mode: entry.deliveryMode || 'draft',
    triggered_by: 'scheduled_deployment',
  });
}

function startDeploymentHeartbeat(entry) {
  const intervalMs = Math.max(15_000, Number(process.env.AGENT_HEARTBEAT_INTERVAL_MS || 30_000));
  const timer = setInterval(() => {
    heartbeatAgentDeployment({
      deploymentId: entry.id,
      workerId: WORKER_ID,
      leaseSeconds: Number(process.env.AGENT_DEPLOYMENT_LEASE_SECONDS || 300),
    }).catch(() => {});
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

async function processClaimedSupabaseDeployment(entry) {
  const heartbeatTimer = startDeploymentHeartbeat(entry);
  if (entry.executionPhase === 'execute' && entry.runId) {
    return processApprovedExecution(entry, heartbeatTimer);
  }
  const recurring = entry.scheduleMode === 'recurring' || entry.scheduleMode === 'monitor';
  const runId = entry.runId || `run_${randomUUID().slice(0, 12)}`;
  const startedAt = new Date().toISOString();
  await persistAgentRun({
    id: runId,
    deploymentId: entry.id,
    workspaceId: entry.workspaceId,
    agentName: entry.agentName,
    trigger: entry.triggeredBy || 'scheduled_deployment',
    status: 'running',
    attemptCount: entry.attemptCount || 1,
    currentStep: 'plan',
    input: { query: buildDeploymentRunQuery(entry) },
    startedAt,
  });
  await appendAgentEvent({
    runId,
    deploymentId: entry.id,
    workspaceId: entry.workspaceId,
    eventType: 'run.claimed',
    payload: { workerId: WORKER_ID, attempt: entry.attemptCount || 1 },
  });
  await persistAgentRunStep({
    id: `${runId}:plan`,
    runId,
    workspaceId: entry.workspaceId,
    stepIndex: 1,
    stepKey: 'plan',
    status: 'running',
    input: { query: buildDeploymentRunQuery(entry) },
    attemptCount: entry.attemptCount || 1,
    startedAt,
  });

  try {
    const run = await invokeLocalRun({ ...entry, runId });
    const completed = {
      ...entry,
      status: recurring ? 'active' : 'completed',
      runId,
      lastRunAt: new Date().toISOString(),
      runCount: Number(entry.runCount || 0) + 1,
      lastApprovalId: run.approvalId,
      scheduledFor: recurring ? resolveDeploymentNextRun(entry) : entry.scheduledFor,
      completedAt: recurring ? null : new Date().toISOString(),
      leaseExpiresAt: null,
      workerId: null,
      heartbeatAt: null,
      error: null,
    };
    await persistDeploymentToSupabase(completed, { runtime: true });
    await persistAgentRunStep({
      id: `${runId}:plan`,
      runId,
      workspaceId: entry.workspaceId,
      stepIndex: 1,
      stepKey: 'plan',
      status: 'completed',
      input: { query: buildDeploymentRunQuery(entry) },
      output: { agentName: run.agentName, approvalId: run.approvalId },
      attemptCount: entry.attemptCount || 1,
      startedAt,
      completedAt: new Date().toISOString(),
    });
    await persistAgentRunStep({
      id: `${runId}:approval`,
      runId,
      workspaceId: entry.workspaceId,
      stepIndex: 2,
      stepKey: 'approval',
      status: run.autonomous ? 'completed' : 'waiting_for_approval',
      input: { approvalId: run.approvalId },
      output: run.autonomous ? { decision: 'approved' } : null,
      startedAt: new Date().toISOString(),
      completedAt: run.autonomous ? new Date().toISOString() : null,
    });
    await persistAgentRun({
      id: runId,
      deploymentId: entry.id,
      workspaceId: entry.workspaceId,
      agentName: entry.agentName,
      trigger: entry.triggeredBy || 'scheduled_deployment',
      status: run.autonomous ? 'completed' : 'waiting_for_approval',
      attemptCount: entry.attemptCount || 1,
      currentStep: run.autonomous ? 'draft_ready' : 'approval',
      output: { approvalId: run.approvalId },
      completedAt: run.autonomous ? new Date().toISOString() : null,
    });
    await appendAgentEvent({
      runId,
      deploymentId: entry.id,
      workspaceId: entry.workspaceId,
      eventType: 'run.waiting_for_approval',
      payload: { approvalId: run.approvalId },
    });
    void notifyDeploymentResult(completed, { ok: true, approvalId: run.approvalId });
    clearInterval(heartbeatTimer);
    return { id: entry.id, agentName: entry.agentName, approvalId: run.approvalId };
  } catch (err) {
    clearInterval(heartbeatTimer);
    const message = err?.message || String(err);
    const attempts = Number(entry.attemptCount || 1);
    const maxAttempts = Number(entry.maxAttempts || process.env.AGENT_MAX_ATTEMPTS || 3);
    const shouldRetry = isRetryableAgentError(err) && attempts < maxAttempts;
    const failed = {
      ...entry,
      status: shouldRetry ? 'pending' : recurring ? 'active' : 'failed',
      runId,
      error: message,
      lastError: message,
      failedAt: shouldRetry ? null : new Date().toISOString(),
      scheduledFor: shouldRetry
        ? new Date(Date.now() + retryDelayMinutes(attempts) * 60_000).toISOString()
        : recurring
          ? resolveDeploymentNextRun(entry)
          : entry.scheduledFor,
      nextRetryAt: shouldRetry
        ? new Date(Date.now() + retryDelayMinutes(attempts) * 60_000).toISOString()
        : null,
      leaseExpiresAt: null,
      workerId: null,
      heartbeatAt: null,
    };
    await persistDeploymentToSupabase(failed, { runtime: true });
    await persistAgentRun({
      id: runId,
      deploymentId: entry.id,
      workspaceId: entry.workspaceId,
      agentName: entry.agentName,
      trigger: entry.triggeredBy || 'scheduled_deployment',
      status: 'failed',
      attemptCount: entry.attemptCount || 1,
      currentStep: 'plan',
      error: message,
      completedAt: new Date().toISOString(),
    });
    await appendAgentEvent({
      runId,
      deploymentId: entry.id,
      workspaceId: entry.workspaceId,
      eventType: 'run.failed',
      payload: { error: message },
    });
    void notifyDeploymentResult(failed, { ok: false, error: message });
    throw err;
  }
}

async function processApprovedExecution(entry, heartbeatTimer = null) {
  const runId = entry.runId;
  const workspaceId = entry.workspaceId;
  const startedAt = new Date().toISOString();
  const safeSystem = `You are Marqq's approved execution planner.
The user approved a draft, but this worker is still draft-safe.
Return JSON only with this shape:
{"status":"draft_ready|human_required|blocked","summary":"string","actions":[{"type":"draft_only|open_studio|request_connector|measure","label":"string","details":"string"}],"risks":["string"],"next_step":"string"}
Never publish, spend money, send messages, change CRM records, or call an irreversible external action.
If the requested action needs a connector or live side effect, use request_connector or human_required.`;
  const user = [
    `Approved deployment: ${entry.sectionTitle || entry.sectionId || entry.id}`,
    `Agent: ${entry.agentName}`,
    `Original brief: ${entry.summary || ''}`,
    `Plays:\n${(entry.bullets || []).slice(0, 8).map((b) => `- ${b}`).join('\n')}`,
    `Open screen: ${entry.openScreen || 'orchestration'}`,
  ].join('\n');
  const claimedActionKeys = [];

  await persistAgentRun({
    id: runId,
    deploymentId: entry.id,
    workspaceId,
    agentName: entry.agentName,
    trigger: 'approved_execution',
    status: 'running',
    attemptCount: entry.attemptCount || 1,
    currentStep: 'execute',
    input: { user },
    startedAt,
  });
  await persistAgentRunStep({
    id: `${runId}:execute`,
    runId,
    workspaceId,
    stepIndex: 3,
    stepKey: 'execute',
    status: 'running',
    input: { user },
    attemptCount: entry.attemptCount || 1,
    startedAt,
  });
  await appendAgentEvent({
    runId,
    deploymentId: entry.id,
    workspaceId,
    eventType: 'execution.started',
    payload: { workerId: WORKER_ID },
  });

  try {
    const result = await meteredStudioJson({
      workspaceId,
      feature: 'agent_execution',
      system: safeSystem,
      user,
      temperature: 0.2,
      max_tokens: 1800,
      meta: { runId, deploymentId: entry.id, phase: 'approved_execution' },
    });
    const allowedStatuses = new Set(['draft_ready', 'human_required', 'blocked']);
    const status = allowedStatuses.has(result?.status) ? result.status : 'human_required';
    const output = {
      status,
      summary: String(result?.summary || 'Execution handoff created').slice(0, 1200),
      actions: Array.isArray(result?.actions) ? result.actions.slice(0, 12) : [],
      risks: Array.isArray(result?.risks) ? result.risks.slice(0, 12) : [],
      next_step: String(result?.next_step || 'Review the execution handoff in the relevant studio.').slice(0, 500),
      live_side_effects: false,
    };
    const actions = [];
    for (const [index, action] of output.actions.entries()) {
      const type = String(action?.type || 'human_required').slice(0, 80);
      const label = String(action?.label || `Action ${index + 1}`).slice(0, 180);
      const details = String(action?.details || '').slice(0, 800);
      const actionKey = `${entry.id}:execute:${index}:${type}:${label}`.toLowerCase().replace(/\s+/g, '-');
      const accepted = await claimAgentAction({
        workspaceId,
        runId,
        stepKey: 'execute',
        actionKey,
        actionType: type,
        request: { label, details, live: false },
      });
      if (accepted === true) claimedActionKeys.push(actionKey);
      actions.push({
        type,
        label,
        details,
        actionKey,
        idempotency: accepted === true ? 'claimed' : accepted === false ? 'duplicate' : 'unavailable',
        dispatch: 'draft_only',
      });
    }
    output.actions = actions;
    const artifactSaved = await persistAgentArtifact({
      id: `execution_${runId}`,
      workspaceId,
      agentName: entry.agentName,
      type: 'agent_execution_handoff',
      data: { runId, deploymentId: entry.id, ...output },
      tags: ['agent_runtime', 'execution_handoff', status],
    });
    if (!artifactSaved) throw new Error('Execution handoff artifact could not be persisted');
    for (const actionKey of claimedActionKeys) {
      await updateAgentActionReceipt({
        workspaceId,
        actionKey,
        status: 'completed',
        response: { dispatch: 'draft_only', runId, status },
      });
    }
    await persistAgentRunStep({
      id: `${runId}:execute`,
      runId,
      workspaceId,
      stepIndex: 3,
      stepKey: 'execute',
      status: 'completed',
      input: { user },
      output,
      attemptCount: entry.attemptCount || 1,
      startedAt,
      completedAt: new Date().toISOString(),
    });
    await persistAgentRun({
      id: runId,
      deploymentId: entry.id,
      workspaceId,
      agentName: entry.agentName,
      trigger: 'approved_execution',
      status: 'completed',
      attemptCount: entry.attemptCount || 1,
      currentStep: 'execution_handoff',
      output,
      completedAt: new Date().toISOString(),
    });
    await persistDeploymentToSupabase(
      { ...entry, status: 'completed', executionPhase: 'completed', completedAt: new Date().toISOString(), workerId: null, leaseExpiresAt: null },
      { runtime: true }
    );
    await appendAgentEvent({
      runId,
      deploymentId: entry.id,
      workspaceId,
      eventType: 'execution.completed',
      payload: output,
    });
    void notifyDeploymentResult(
      { ...entry, status: 'completed' },
      { ok: true, execution: output }
    );
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    return { id: entry.id, agentName: entry.agentName, runId, execution: output };
  } catch (err) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    const message = err?.message || String(err);
    for (const actionKey of claimedActionKeys) {
      await updateAgentActionReceipt({
        workspaceId,
        actionKey,
        status: 'failed',
        response: { error: message, runId },
      });
    }
    const attempts = Number(entry.attemptCount || 1);
    const maxAttempts = Number(entry.maxAttempts || process.env.AGENT_MAX_ATTEMPTS || 3);
    const shouldRetry = isRetryableAgentError(err) && attempts < maxAttempts;
    await persistDeploymentToSupabase(
      {
        ...entry,
        status: shouldRetry ? 'pending' : 'failed',
        executionPhase: shouldRetry ? 'execute' : 'failed',
        scheduledFor: shouldRetry
          ? new Date(Date.now() + retryDelayMinutes(attempts) * 60_000).toISOString()
          : entry.scheduledFor,
        nextRetryAt: shouldRetry
          ? new Date(Date.now() + retryDelayMinutes(attempts) * 60_000).toISOString()
          : null,
        lastError: message,
        failedAt: shouldRetry ? null : new Date().toISOString(),
        workerId: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      },
      { runtime: true }
    );
    await persistAgentRunStep({
      id: `${runId}:execute`,
      runId,
      workspaceId,
      stepIndex: 3,
      stepKey: 'execute',
      status: 'failed',
      input: { user },
      error: message,
      attemptCount: entry.attemptCount || 1,
      startedAt,
      completedAt: new Date().toISOString(),
    });
    await persistAgentRun({
      id: runId,
      deploymentId: entry.id,
      workspaceId,
      agentName: entry.agentName,
      trigger: 'approved_execution',
      status: 'failed',
      attemptCount: entry.attemptCount || 1,
      currentStep: 'execute',
      error: message,
      completedAt: new Date().toISOString(),
    });
    await appendAgentEvent({
      runId,
      deploymentId: entry.id,
      workspaceId,
      eventType: 'execution.failed',
      payload: { error: message },
    });
    void notifyDeploymentResult(
      { ...entry, status: shouldRetry ? 'pending' : 'failed' },
      { ok: false, error: shouldRetry ? `Execution paused and will retry: ${message}` : message }
    );
    throw err;
  }
}

async function processSupabaseQueueTick({ workspaceId = null, force = false } = {}) {
  if (!useSupabasePersistence()) return null;
  const claimed = await claimDeploymentsFromSupabase({
    workerId: WORKER_ID,
    workspaceId,
    leaseSeconds: Number(process.env.AGENT_DEPLOYMENT_LEASE_SECONDS || 300),
    limit: Number(process.env.AGENT_DEPLOYMENT_BATCH_SIZE || 10),
    force,
  });
  if (claimed == null) return null;
  const result = { ran: [], failed: [], skipped: 0, source: 'supabase' };
  for (const entry of claimed) {
    try {
      result.ran.push(await processClaimedSupabaseDeployment(entry));
    } catch (err) {
      result.failed.push({ id: entry.id, error: err?.message || String(err) });
    }
  }
  return result;
}

export async function processDeploymentQueueTick({ force = false, workspaceId = null } = {}) {
  if (ticking) return { skipped: true };
  ticking = true;
  const result = { ran: [], failed: [], skipped: 0 };
  try {
    const supabaseResult = await processSupabaseQueueTick({ workspaceId, force });
    if (supabaseResult) {
      result.ran.push(...supabaseResult.ran);
      result.failed.push(...supabaseResult.failed);
      if (supabaseResult.ran.length || supabaseResult.failed.length) {
        console.log(
          `[agent-scheduler] supabase ran=${supabaseResult.ran.length} failed=${supabaseResult.failed.length}`
        );
      }
    }
    const db = ensureAgentCollections(getDb());
    const queue = [...(db.agent_deployments || [])];
    const now = Date.now();
    const ws = workspaceId ? String(workspaceId).trim() : null;

    for (let i = 0; i < queue.length; i += 1) {
      const entry = queue[i];
      // UUID workspaces are claimed from Supabase when the runtime migration
      // is installed. Legacy/non-UUID workspaces continue using JSON DB.
      if (supabaseResult && isUuidWorkspace(entry.workspaceId)) {
        result.skipped += 1;
        continue;
      }
      if (ws && entry.workspaceId && entry.workspaceId !== ws) {
        result.skipped += 1;
        continue;
      }
      const runnable = force
        ? ['pending', 'active'].includes(String(entry.status || ''))
        : isDeploymentRunnable(entry, now);
      if (!runnable) {
        result.skipped += 1;
        continue;
      }

      queue[i] = {
        ...entry,
        status: 'running',
        startedAt: new Date().toISOString(),
      };
      updateDb((state) => ({
        ...ensureAgentCollections(state),
        agent_deployments: queue,
      }));

      try {
        const run = await invokeLocalRun(queue[i]);
        const recurring = entry.scheduleMode === 'recurring' || entry.scheduleMode === 'monitor';
        queue[i] = {
          ...queue[i],
          status: recurring ? 'active' : 'completed',
          lastRunAt: new Date().toISOString(),
          runCount: Number(entry.runCount || 0) + 1,
          lastApprovalId: run.approvalId,
          scheduledFor: recurring ? resolveDeploymentNextRun(entry) : entry.scheduledFor,
          completedAt: recurring ? undefined : new Date().toISOString(),
          error: null,
        };
        result.ran.push({ id: entry.id, agentName: entry.agentName, approvalId: run.approvalId });
        void notifyDeploymentResult(queue[i], { ok: true, approvalId: run.approvalId });
      } catch (err) {
        const recurring = entry.scheduleMode === 'recurring' || entry.scheduleMode === 'monitor';
        queue[i] = {
          ...queue[i],
          status: recurring ? 'active' : 'failed',
          error: err?.message || String(err),
          failedAt: new Date().toISOString(),
          scheduledFor: recurring ? resolveDeploymentNextRun(entry) : entry.scheduledFor,
        };
        result.failed.push({ id: entry.id, error: err?.message || String(err) });
        void notifyDeploymentResult(queue[i], { ok: false, error: err?.message || String(err) });
      }

      updateDb((state) => ({
        ...ensureAgentCollections(state),
        agent_deployments: queue,
      }));
    }

    // scheduled_automations: bump next_run and enqueue a real deployment when due
    updateDb((state) => {
      const next = ensureAgentCollections(state);
      const queue = [...(next.agent_deployments || [])];
      const enqueued = [];
      const autos = (next.scheduled_automations || []).map((row) => {
        if (!row.active) return row;
        const due = !row.next_run || Date.parse(row.next_run) <= Date.now();
        if (!due) return row;
        const mins =
          row.cron === 'every_2_days' ? 2880 : row.cron === 'twice_weekly' ? 5040 : 10080;
        const agentName = String(row.params?.agent || 'neel').toLowerCase();
        const sectionId = row.params?.sectionId || null;
        const depId = `dep_auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        queue.unshift({
          id: depId,
          agentName,
          agentDisplayName: agentName,
          workspaceId: row.company_id || 'marqq-ws-1',
          companyId: row.company_id || 'marqq-ws-1',
          sectionId,
          sectionTitle: sectionId || row.automation_id || 'Scheduled automation',
          summary: `Automation ${row.automation_id || row.id}`,
          bullets: [],
          openScreen: row.params?.openScreen || null,
          scheduleMode: 'once',
          recurrenceMinutes: mins,
          deliveryMode: 'draft',
          status: 'pending',
          createdAt: new Date().toISOString(),
          scheduledFor: new Date().toISOString(),
          runCount: 0,
          triggeredBy: 'automation',
          automationId: row.automation_id || row.id,
        });
        enqueued.push(depId);
        return {
          ...row,
          last_run: new Date().toISOString(),
          next_run: new Date(Date.now() + mins * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        };
      });
      const runs = [
        ...(enqueued.length
          ? [
              {
                id: `ar_${randomUUID().slice(0, 8)}`,
                at: new Date().toISOString(),
                deployments: enqueued,
                source: 'automations',
              },
            ]
          : []),
        ...(result.ran.length
          ? [
              {
                id: `ar_${randomUUID().slice(0, 8)}`,
                at: new Date().toISOString(),
                deployments: result.ran,
              },
            ]
          : []),
        ...(next.automation_runs || []),
      ].slice(0, 50);
      return {
        ...next,
        scheduled_automations: autos,
        agent_deployments: queue,
        automation_runs: runs,
      };
    });

    if (result.ran.length || result.failed.length) {
      console.log(
        `[agent-scheduler] tick ran=${result.ran.length} failed=${result.failed.length} skipped=${result.skipped}`
      );
    }
    return result;
  } finally {
    ticking = false;
  }
}

export function startDeploymentScheduler() {
  if (timer) return { already: true, intervalMs: INTERVAL_MS };
  // First tick shortly after boot so strategy activate → visible drafts quickly
  setTimeout(() => {
    processDeploymentQueueTick().catch((err) =>
      console.warn('[agent-scheduler] boot tick failed:', err?.message || err)
    );
  }, 3_000);
  timer = setInterval(() => {
    processDeploymentQueueTick().catch((err) =>
      console.warn('[agent-scheduler] tick failed:', err?.message || err)
    );
  }, INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`✓ Agent deployment scheduler every ${INTERVAL_MS}ms`);
  startOutreachDueScheduler();
  return { started: true, intervalMs: INTERVAL_MS };
}

export function stopDeploymentScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  stopOutreachDueScheduler();
}

let outreachDueTimer = null;
const OUTREACH_DUE_MS = Math.max(
  30_000,
  Number(process.env.OUTREACH_DUE_SEND_INTERVAL_MS || 60_000)
);

export function startOutreachDueScheduler() {
  if (outreachDueTimer) return { already: true, intervalMs: OUTREACH_DUE_MS };
  const tick = async () => {
    try {
      const { processDueOutreachSends } = await import('./outreach.js');
      const result = await processDueOutreachSends();
      if (result?.processed) {
        console.log(`[outreach-due] processed=${result.processed}`);
      }
    } catch (err) {
      console.warn('[outreach-due] tick failed:', err?.message || err);
    }
  };
  setTimeout(() => {
    tick().catch(() => {});
  }, 8_000);
  outreachDueTimer = setInterval(() => {
    tick().catch(() => {});
  }, OUTREACH_DUE_MS);
  if (typeof outreachDueTimer.unref === 'function') outreachDueTimer.unref();
  console.log(`✓ Outreach due-send scheduler every ${OUTREACH_DUE_MS}ms`);
  return { started: true, intervalMs: OUTREACH_DUE_MS };
}

export function stopOutreachDueScheduler() {
  if (outreachDueTimer) clearInterval(outreachDueTimer);
  outreachDueTimer = null;
}

export { buildDeploymentRunQuery, loadAgentOsProfile, saveAgentOsProfile };
