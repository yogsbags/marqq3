/**
 * Control-loop orchestration over Agent OS profile (Marqq2 parity).
 * Measure → Diagnose → Propose → Decide, persisted via agentOsStore.
 */

import { normalizeGoalSystem } from '../lib/gtmNorthStar.js';
import {
  bootstrapControlLoop,
  recordMeasurement,
  diagnoseBottleneck,
  proposeInterventions,
  normalizeIntervention,
  normalizeControlLoopState,
} from './gtmControlLoop.js';
import { buildAgentRoster, reprioritizeAgentRoster } from './gtmAgentRoster.js';
import {
  loadAgentOsProfile,
  loadAgentOsProfileAsync,
  saveAgentOsProfile,
} from './agentOsStore.js';

const DEFAULT_WS = 'marqq-ws-1';

function resolveGoalSystem(os) {
  return (
    os?.goal_system ||
    os?.strategy_document?.goalAlignment ||
    os?.strategy_document?.goal_system ||
    null
  );
}

function ensureOsWithLoop(os, workspaceId) {
  const goalSystem = resolveGoalSystem(os);
  if (!goalSystem) {
    const err = new Error('Lock a North Star / activate strategy before opening the control loop');
    err.status = 409;
    throw err;
  }
  const g = normalizeGoalSystem(goalSystem);
  let loop = bootstrapControlLoop(g, os?.control_loop || null);
  let roster = os?.agent_roster;
  if (!roster?.agents?.length) {
    roster = buildAgentRoster({ goalSystem: g, controlLoop: loop, previousRoster: null });
  }
  const next = {
    ...(os || {}),
    workspaceId,
    version: 1,
    goal_system: g,
    control_loop: loop,
    agent_roster: roster,
    updatedAt: new Date().toISOString(),
  };
  return { os: next, goalSystem: g, loop, roster };
}

export async function getControlLoop(workspaceId = DEFAULT_WS) {
  const loaded = (await loadAgentOsProfileAsync(workspaceId)) || loadAgentOsProfile(workspaceId);
  if (!loaded && !resolveGoalSystem(loaded)) {
    // try empty — still 409
  }
  const { os, goalSystem, loop, roster } = ensureOsWithLoop(loaded || {}, workspaceId);
  const saved = saveAgentOsProfile(os, workspaceId);
  return {
    controlLoop: normalizeControlLoopState(saved.control_loop || loop, goalSystem),
    goalSystem,
    agentRoster: saved.agent_roster || roster,
    agentOs: saved,
  };
}

export async function measureControlLoop(workspaceId, { period, actual, funnelActuals } = {}) {
  const loaded = (await loadAgentOsProfileAsync(workspaceId)) || {};
  const { os, goalSystem, loop } = ensureOsWithLoop(loaded, workspaceId);
  const next = recordMeasurement(loop, goalSystem, { period, actual, funnelActuals });
  const saved = saveAgentOsProfile({ ...os, control_loop: next }, workspaceId);
  return { controlLoop: next, agentOs: saved };
}

export async function diagnoseControlLoop(workspaceId, { notes } = {}) {
  const loaded = (await loadAgentOsProfileAsync(workspaceId)) || {};
  const { os, goalSystem, loop } = ensureOsWithLoop(loaded, workspaceId);
  const diagnosis = await diagnoseBottleneck(null, {
    goalSystem,
    controlLoop: loop,
    notes: notes || null,
    workspaceId,
  });
  const next = {
    ...loop,
    lastDiagnosis: diagnosis,
    funnelActuals: Array.isArray(diagnosis.funnel) ? diagnosis.funnel : loop.funnelActuals,
    updatedAt: new Date().toISOString(),
  };
  const agentRoster = reprioritizeAgentRoster(os.agent_roster, {
    goalSystem,
    controlLoop: next,
  });
  const saved = saveAgentOsProfile(
    { ...os, control_loop: next, agent_roster: agentRoster },
    workspaceId
  );
  return { diagnosis, controlLoop: next, agentRoster, agentOs: saved };
}

export async function proposeControlLoopInterventions(workspaceId, { diagnosis } = {}) {
  const loaded = (await loadAgentOsProfileAsync(workspaceId)) || {};
  const { os, goalSystem, loop } = ensureOsWithLoop(loaded, workspaceId);
  const diag = diagnosis || loop.lastDiagnosis;
  const proposed = await proposeInterventions(null, {
    goalSystem,
    controlLoop: loop,
    diagnosis: diag,
    workspaceId,
  });
  const next = {
    ...loop,
    lastDiagnosis: diag || loop.lastDiagnosis,
    interventions: [...proposed, ...(loop.interventions || [])].slice(0, 40),
    updatedAt: new Date().toISOString(),
  };
  const saved = saveAgentOsProfile({ ...os, control_loop: next }, workspaceId);
  return { interventions: proposed, controlLoop: next, agentOs: saved };
}

export async function decideControlLoopIntervention(workspaceId, interventionId, decision) {
  const allowed = ['approved', 'rejected', 'executing', 'done'];
  const d = String(decision || '').toLowerCase();
  if (!allowed.includes(d)) {
    const err = new Error('decision must be approved|rejected|executing|done');
    err.status = 400;
    throw err;
  }
  const loaded = (await loadAgentOsProfileAsync(workspaceId)) || {};
  const { os, goalSystem, loop } = ensureOsWithLoop(loaded, workspaceId);
  const interventions = (loop.interventions || []).map((item) => {
    if (item.id !== interventionId) return item;
    return normalizeIntervention({
      ...item,
      status: d,
      decidedAt: new Date().toISOString(),
    });
  });
  const next = { ...loop, interventions, updatedAt: new Date().toISOString() };
  const saved = saveAgentOsProfile({ ...os, control_loop: next }, workspaceId);
  return { controlLoop: normalizeControlLoopState(next, goalSystem), agentOs: saved };
}

export async function refreshControlLoopRoster(workspaceId) {
  const loaded = (await loadAgentOsProfileAsync(workspaceId)) || {};
  const { os, goalSystem, loop } = ensureOsWithLoop(loaded, workspaceId);
  const agentRoster = buildAgentRoster({
    goalSystem,
    controlLoop: loop,
    previousRoster: os.agent_roster,
  });
  const saved = saveAgentOsProfile({ ...os, agent_roster: agentRoster }, workspaceId);
  return { agentRoster, agentOs: saved };
}
