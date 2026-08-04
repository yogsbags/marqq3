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
import { notifyDeploymentResult } from './agentNotifications.js';
import { executionModeFromAgentOs, isAutonomousMode } from './executionMode.js';
import { chargeCredits } from './credits/index.js';

const PORT = () => Number(process.env.PORT || 3001);
const INTERVAL_MS = Math.max(
  15_000,
  Number(process.env.AGENT_DEPLOYMENT_SCHEDULER_INTERVAL_MS || 60_000)
);

let timer = null;
let ticking = false;

const AGENT_BY_ID = new Map(AGENT_CATALOG.map((a) => [a.id, a]));

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
    deployment = listDeployments({}).find((d) => d.id === depId) || null;
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

  updateDb((state) => {
    const next = ensureAgentCollections(state);
    const approval = {
      id: approvalId,
      type: 'Agent draft',
      title,
      owner: `${agent.name} · ${agent.role}`,
      risk: autonomous ? 'Auto-approved' : 'Low risk',
      riskClass: autonomous ? 'tag tag-accent' : 'tag tag-outline',
      preview,
      deadline: autonomous ? 'Auto-cleared' : 'Awaiting review',
      deploymentId: depId,
      agentName: agent.id,
      openScreen,
      sectionId: deployment?.sectionId || null,
      deliveryMode: delivery_mode || 'draft',
      executionMode: mode,
      createdAt: new Date().toISOString(),
      status: autonomous ? 'approved' : 'pending',
      decidedAt: autonomous ? new Date().toISOString() : null,
      decidedBy: autonomous ? 'autonomous' : null,
    };
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

    let agent_os = next.agent_os;
    if (agent_os) {
      agent_os = {
        ...agent_os,
        last_executed_task: {
          agentName: agent.id,
          deploymentId: depId,
          approvalId,
          at: new Date().toISOString(),
          triggered_by,
          executionMode: mode,
        },
        updatedAt: new Date().toISOString(),
      };
    }

    return { ...next, approvals, approvedActions, tasks, agentLogs, agent_os };
  });

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
    delivery_mode: entry.deliveryMode || 'draft',
    triggered_by: 'scheduled_deployment',
  });
}

export async function processDeploymentQueueTick({ force = false, workspaceId = null } = {}) {
  if (ticking) return { skipped: true };
  ticking = true;
  const result = { ran: [], failed: [], skipped: 0 };
  try {
    const db = ensureAgentCollections(getDb());
    const queue = [...(db.agent_deployments || [])];
    const now = Date.now();
    const ws = workspaceId ? String(workspaceId).trim() : null;

    for (let i = 0; i < queue.length; i += 1) {
      const entry = queue[i];
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
