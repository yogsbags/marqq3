/**
 * Durable Agent OS + strategy → deployment seeding (Marqq2-style, JSON DB).
 */

import { randomUUID } from 'node:crypto';
import { getDb, updateDb } from '../db.js';
import { AGENT_CATALOG, planAgentTask } from './agentOs.js';
import {
  persistAgentOsToSupabase,
  loadAgentOsFromSupabase,
  persistDeploymentToSupabase,
  listDeploymentsFromSupabase,
} from './agentSupabase.js';
import { isUuidWorkspace } from '../lib/persistence.js';
import { bootstrapControlLoop } from './gtmControlLoop.js';
import { buildAgentRoster } from './gtmAgentRoster.js';
import { normalizeExecutionMode, EXECUTION_MODES } from './executionMode.js';

const DEFAULT_WS = 'marqq-ws-1';

/** Section → primary agent + open screen (mirrors src/lib/agents/ownership.ts). */
export const SECTION_OWNERSHIP = [
  { sectionId: 'market_analysis', primaryAgent: 'isha', openScreen: 'market', recurrenceMinutes: 10080 },
  { sectionId: 'positioning_messaging', primaryAgent: 'neel', openScreen: 'brand', recurrenceMinutes: 10080 },
  { sectionId: 'distribution_channels', primaryAgent: 'kiran', openScreen: 'social', recurrenceMinutes: 2880 }, // ~Mon/Wed/Fri cadence
  { sectionId: 'marketing_strategy', primaryAgent: 'zara', openScreen: 'campaigns', recurrenceMinutes: 10080 },
  { sectionId: 'sales_strategy', primaryAgent: 'arjun', openScreen: 'outreach', recurrenceMinutes: 10080 },
  { sectionId: 'launch_plan', primaryAgent: 'kiran', openScreen: 'calendar', recurrenceMinutes: 10080 },
  { sectionId: 'customer_success', primaryAgent: 'tara', openScreen: 'customer360', recurrenceMinutes: 10080 },
  { sectionId: 'measurement_optimization', primaryAgent: 'dev', openScreen: 'analytics', recurrenceMinutes: 10080 }, // weekly scorecard
  { sectionId: 'operations_execution', primaryAgent: 'neel', openScreen: 'orchestration', recurrenceMinutes: 10080 },
  { sectionId: 'timeline_roadmap', primaryAgent: 'neel', openScreen: 'orchestration', recurrenceMinutes: 10080 },
  { sectionId: 'financial_plan', primaryAgent: 'dev', openScreen: 'reporting', recurrenceMinutes: 20160 },
  { sectionId: 'risks_contingencies', primaryAgent: 'priya', openScreen: 'market', recurrenceMinutes: 10080 },
];

const AGENT_BY_ID = new Map(AGENT_CATALOG.map((a) => [a.id, a]));

function nowIso() {
  return new Date().toISOString();
}

export function ensureAgentCollections(state) {
  return {
    ...state,
    agent_os_by_workspace:
      state.agent_os_by_workspace && typeof state.agent_os_by_workspace === 'object'
        ? state.agent_os_by_workspace
        : {},
    agent_deployments: Array.isArray(state.agent_deployments) ? state.agent_deployments : [],
    scheduled_automations: Array.isArray(state.scheduled_automations) ? state.scheduled_automations : [],
    automation_runs: Array.isArray(state.automation_runs) ? state.automation_runs : [],
    approvals: Array.isArray(state.approvals) ? state.approvals : [],
    tasks: Array.isArray(state.tasks) ? state.tasks : [],
    agentLogs: state.agentLogs && typeof state.agentLogs === 'object' ? state.agentLogs : {},
  };
}

export function saveAgentOsProfile(profile, workspaceId = DEFAULT_WS) {
  const saved = {
    ...profile,
    workspaceId,
    version: 1,
    updatedAt: nowIso(),
  };
  updateDb((state) => {
    const next = ensureAgentCollections(state);
    return {
      ...next,
      agent_os_by_workspace: { ...next.agent_os_by_workspace, [workspaceId]: saved },
    };
  });
  void persistAgentOsToSupabase(saved, workspaceId);
  return saved;
}

/**
 * Per-workspace read — each workspace has its own slot (no more cross-tenant
 * bleed when multiple workspaces are active in the same process).
 */
export function loadAgentOsProfile(workspaceId = DEFAULT_WS) {
  // Sync path keeps JSON DB; async hydrate happens via loadAgentOsProfileAsync
  const db = ensureAgentCollections(getDb());
  return db.agent_os_by_workspace[workspaceId] || null;
}

export async function loadAgentOsProfileAsync(workspaceId = DEFAULT_WS) {
  if (isUuidWorkspace(workspaceId)) {
    const fromSb = await loadAgentOsFromSupabase(workspaceId);
    if (fromSb) {
      const hydrated = { ...fromSb, workspaceId };
      updateDb((state) => {
        const next = ensureAgentCollections(state);
        return {
          ...next,
          agent_os_by_workspace: { ...next.agent_os_by_workspace, [workspaceId]: hydrated },
        };
      });
      return hydrated;
    }
  }
  return loadAgentOsProfile(workspaceId);
}

function sectionBlob(section) {
  if (!section || typeof section !== 'object') return { summary: '', bullets: [] };
  const summary = String(section.summary || section.body || section.content || '').trim();
  const bullets = Array.isArray(section.bullets)
    ? section.bullets.map(String).filter(Boolean)
    : [];
  return { summary, bullets };
}

function agentMeta(agentId) {
  return AGENT_BY_ID.get(agentId) || {
    id: agentId,
    name: agentId,
    role: 'Agent',
    avatarColor: '#888',
  };
}

/**
 * Seed / sync deployments from locked strategy sections.
 * - Creates missing section→agent deployments (idempotent).
 * - When revisedSectionId is set, updates that section's live deployments with new
 *   summary/bullets and re-queues them as pending drafts (strategy_revise).
 */
export function seedDeploymentsFromStrategy({
  strategy,
  workspaceId = DEFAULT_WS,
  companyId = DEFAULT_WS,
  runImmediately = true,
  revisedSectionId = null,
} = {}) {
  const sections = Array.isArray(strategy?.sections)
    ? strategy.sections
    : [
        ...(Array.isArray(strategy?.autoSections) ? strategy.autoSections : []),
        ...(Array.isArray(strategy?.goalsSections) ? strategy.goalsSections : []),
      ];
  const byId = new Map(sections.map((s) => [s.id, s]));
  const created = [];
  const updated = [];
  const scheduledFor = runImmediately ? nowIso() : new Date(Date.now() + 60_000).toISOString();
  const reviseId = revisedSectionId ? String(revisedSectionId) : null;

  updateDb((state) => {
    const next = ensureAgentCollections(state);
    const queue = [...next.agent_deployments];
    const tasks = [...next.tasks];

    for (const own of SECTION_OWNERSHIP) {
      const section = byId.get(own.sectionId);
      if (!section) continue;
      const { summary, bullets } = sectionBlob(section);
      const existingIdx = queue.findIndex(
        (d) =>
          d.sectionId === own.sectionId &&
          d.agentName === own.primaryAgent &&
          d.workspaceId === workspaceId &&
          ['pending', 'active', 'running'].includes(String(d.status || ''))
      );
      const existing = existingIdx >= 0 ? queue[existingIdx] : null;

      if (existing) {
        const patch = {
          ...existing,
          sectionTitle: section.title || own.sectionId,
          summary: summary.slice(0, 400) || existing.summary,
          bullets: bullets.slice(0, 6),
          tasks: bullets.slice(0, 4),
          updatedAt: nowIso(),
        };
        if (reviseId && own.sectionId === reviseId) {
          patch.status = 'pending';
          patch.scheduledFor = scheduledFor;
          patch.triggeredBy = 'strategy_revise';
          patch.deliveryMode = 'draft';
        }
        queue[existingIdx] = patch;
        updated.push(patch);

        const taskIdx = tasks.findIndex((t) => t.deploymentId === existing.id);
        if (taskIdx >= 0) {
          tasks[taskIdx] = {
            ...tasks[taskIdx],
            title: `${patch.agentDisplayName || own.primaryAgent}: ${patch.sectionTitle}`,
            status: reviseId && own.sectionId === reviseId ? 'Scheduled' : tasks[taskIdx].status,
            due: reviseId && own.sectionId === reviseId ? 'Next scheduler tick' : tasks[taskIdx].due,
          };
        }
        continue;
      }

      const meta = agentMeta(own.primaryAgent);
      const plan = planAgentTask({
        sectionId: own.sectionId,
        screenId: own.openScreen,
      });
      const id = `dep_${randomUUID().slice(0, 8)}`;
      const entry = {
        id,
        agentName: own.primaryAgent,
        agentDisplayName: meta.name,
        agentTarget: plan?.target || null,
        workspaceId,
        companyId,
        sectionId: own.sectionId,
        sectionTitle: section.title || own.sectionId,
        summary: summary.slice(0, 400) || `${meta.name} executes ${own.sectionId}`,
        bullets: bullets.slice(0, 6),
        tasks: bullets.slice(0, 4),
        openScreen: own.openScreen,
        scheduleMode: 'recurring',
        recurrenceMinutes: own.recurrenceMinutes || 10080,
        deliveryMode: 'draft',
        status: 'pending',
        createdAt: nowIso(),
        scheduledFor,
        runCount: 0,
        triggeredBy: reviseId && own.sectionId === reviseId ? 'strategy_revise' : 'strategy_activate',
      };
      queue.push(entry);
      created.push(entry);

      tasks.unshift({
        id: `t_${id}`,
        title: `${meta.name}: ${entry.sectionTitle}`,
        assignee: meta.name,
        avatarColor: meta.avatarColor,
        avatarLetter: String(meta.name || 'A')[0],
        due: 'Next scheduler tick',
        priority: own.recurrenceMinutes <= 2880 ? 'High' : 'Medium',
        priorityClass: own.recurrenceMinutes <= 2880 ? 'tag tag-accent-2' : 'tag tag-outline',
        status: 'Scheduled',
        deploymentId: id,
        sectionId: own.sectionId,
        agentName: own.primaryAgent,
      });
    }

    return { ...next, agent_deployments: queue, tasks: tasks.slice(0, 80) };
  });

  for (const entry of [...created, ...updated]) {
    void persistDeploymentToSupabase(entry);
  }

  return {
    created,
    updated,
    count: created.length + updated.length,
    deploymentsCreated: created.length,
    deploymentsUpdated: updated.length,
  };
}

/**
 * Activate strategy on server: persist OS + seed deployments.
 */
export function activateStrategyExecution({
  strategy,
  agentOs,
  workspaceId = DEFAULT_WS,
  companyId = DEFAULT_WS,
  revisedSectionId = null,
} = {}) {
  if (!strategy || typeof strategy !== 'object') {
    throw new Error('strategy required');
  }
  const profile =
    agentOs && typeof agentOs === 'object'
      ? {
          ...agentOs,
          strategy_document: strategy,
          goal_system: agentOs.goal_system || strategy.goalAlignment || null,
          execution_mode: normalizeExecutionMode(
            agentOs.execution_mode ?? agentOs.executionMode ?? EXECUTION_MODES.HUMAN_GATED
          ),
        }
      : {
          version: 1,
          updatedAt: nowIso(),
          goal_system: strategy.goalAlignment || null,
          control_loop: null,
          agent_roster: null,
          strategy_document: strategy,
          last_executed_task: null,
          execution_mode: EXECUTION_MODES.HUMAN_GATED,
        };
  profile.executionMode = profile.execution_mode;

  const goalSystem = profile.goal_system || strategy.goalAlignment || null;
  if (goalSystem) {
    if (!profile.control_loop?.checkpointPlan?.checkpoints?.length) {
      profile.control_loop = bootstrapControlLoop(goalSystem, profile.control_loop || null);
    }
    if (!profile.agent_roster?.agents?.length) {
      profile.agent_roster = buildAgentRoster({
        goalSystem,
        controlLoop: profile.control_loop,
        previousRoster: null,
      });
    }
  }

  const savedOs = saveAgentOsProfile(profile, workspaceId);
  const seeded = seedDeploymentsFromStrategy({
    strategy,
    workspaceId,
    companyId,
    runImmediately: true,
    revisedSectionId,
  });

  // Seed lightweight scheduled_automations mirrors for Workflows UI
  updateDb((state) => {
    const next = ensureAgentCollections(state);
    const autos = [...next.scheduled_automations];
    const specs = [
      {
        automation_id: 'weekly_measurement_scorecard',
        cron: 'weekly_monday',
        params: { sectionId: 'measurement_optimization', agent: 'dev' },
      },
      {
        automation_id: 'social_carousel_cadence',
        cron: 'every_2_days',
        params: { sectionId: 'distribution_channels', agent: 'kiran' },
      },
      {
        automation_id: 'seo_blog_cadence',
        cron: 'twice_weekly',
        params: { sectionId: 'distribution_channels', agent: 'maya' },
      },
    ];
    for (const spec of specs) {
      const idx = autos.findIndex(
        (a) => a.company_id === companyId && a.automation_id === spec.automation_id
      );
      const row = {
        id: idx >= 0 ? autos[idx].id : `sa_${randomUUID().slice(0, 8)}`,
        company_id: companyId,
        automation_id: spec.automation_id,
        cron: spec.cron,
        params: spec.params,
        active: true,
        next_run: nowIso(),
        last_run: null,
        created_by_agent: 'neel',
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      if (idx >= 0) autos[idx] = { ...autos[idx], ...row, active: true };
      else autos.push(row);
    }
    return { ...next, scheduled_automations: autos };
  });

  return {
    ok: true,
    workspaceId,
    agentOs: savedOs,
    deploymentsCreated: seeded.deploymentsCreated ?? seeded.created?.length ?? 0,
    deploymentsUpdated: seeded.deploymentsUpdated ?? seeded.updated?.length ?? 0,
    deployments: [...(seeded.created || []), ...(seeded.updated || [])],
    revisedSectionId: revisedSectionId || null,
  };
}

export function listDeployments({ workspaceId = DEFAULT_WS, status } = {}) {
  const db = ensureAgentCollections(getDb());
  let items = db.agent_deployments.filter(
    (d) => !workspaceId || !d.workspaceId || d.workspaceId === workspaceId
  );
  if (status) items = items.filter((d) => d.status === status);
  return items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function listDeploymentsAsync({ workspaceId = DEFAULT_WS, status } = {}) {
  if (isUuidWorkspace(workspaceId)) {
    const fromSb = await listDeploymentsFromSupabase(workspaceId, status);
    if (Array.isArray(fromSb) && fromSb.length) return fromSb;
  }
  return listDeployments({ workspaceId, status });
}

export function listScheduledAutomations(companyId = DEFAULT_WS) {
  const db = ensureAgentCollections(getDb());
  return (db.scheduled_automations || []).filter(
    (a) => !companyId || a.company_id === companyId
  );
}

/**
 * Persist human_gated | autonomous on Agent OS.
 * When switching to autonomous, auto-approve pending agent drafts.
 */
export function setAgentExecutionMode(workspaceId = DEFAULT_WS, mode, { approvePending = true } = {}) {
  const nextMode = normalizeExecutionMode(mode);
  const existing = loadAgentOsProfile(workspaceId) || {
    version: 1,
    workspaceId,
    goal_system: null,
    control_loop: null,
    agent_roster: null,
    strategy_document: null,
    last_executed_task: null,
  };
  const saved = saveAgentOsProfile(
    {
      ...existing,
      execution_mode: nextMode,
      executionMode: nextMode,
    },
    workspaceId
  );

  let autoApproved = 0;
  if (nextMode === EXECUTION_MODES.AUTONOMOUS && approvePending) {
    const db = ensureAgentCollections(getDb());
    const pendingIds = (db.approvals || [])
      .filter((a) => {
        const decided = db.approvedActions?.[a.id];
        return a.status !== 'approved' && a.status !== 'rejected' && !decided;
      })
      .map((a) => a.id);
    autoApproved = pendingIds.length;
    if (pendingIds.length) {
      updateDb((state) => {
        const next = ensureAgentCollections(state);
        const approvedActions = { ...(next.approvedActions || {}) };
        for (const id of pendingIds) approvedActions[id] = 'approved';
        const approvals = (next.approvals || []).map((a) => {
          if (!pendingIds.includes(a.id)) return a;
          return {
            ...a,
            status: 'approved',
            decidedAt: nowIso(),
            decidedBy: 'autonomous',
            executionMode: nextMode,
            risk: 'Auto-approved',
            riskClass: 'tag tag-accent',
            deadline: 'Auto-cleared',
          };
        });
        const tasks = (next.tasks || []).map((t) =>
          t.status === 'Needs approval'
            ? { ...t, status: 'Ready', due: 'Autonomous — open studio' }
            : t
        );
        return { ...next, approvals, approvedActions, tasks };
      });
    }
  }

  return { agentOs: saved, executionMode: nextMode, autoApproved };
}
