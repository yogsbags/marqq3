/**
 * Workspace agent execution gates.
 * Approval mode controls the Approvals queue; action mode controls external side effects.
 */

export const EXECUTION_MODES = Object.freeze({
  HUMAN_GATED: 'human_gated',
  AUTONOMOUS: 'autonomous',
});

export const ACTION_MODES = Object.freeze({
  DRAFT_SAFE: 'draft_safe',
  LIVE_DRAFTS: 'live_drafts',
  LIVE_PUBLISH: 'live_publish',
});

export function normalizeExecutionMode(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (raw === 'autonomous' || raw === 'auto' || raw === 'ungated') {
    return EXECUTION_MODES.AUTONOMOUS;
  }
  return EXECUTION_MODES.HUMAN_GATED;
}

export function isAutonomousMode(value) {
  return normalizeExecutionMode(value) === EXECUTION_MODES.AUTONOMOUS;
}

export function normalizeActionMode(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (raw === ACTION_MODES.LIVE_DRAFTS || raw === 'drafts' || raw === 'provider_drafts') {
    return ACTION_MODES.LIVE_DRAFTS;
  }
  if (raw === ACTION_MODES.LIVE_PUBLISH || raw === 'live' || raw === 'publish') {
    return ACTION_MODES.LIVE_PUBLISH;
  }
  return ACTION_MODES.DRAFT_SAFE;
}

export function actionModeFromAgentOs(agentOs) {
  return normalizeActionMode(agentOs?.action_mode ?? agentOs?.actionMode ?? ACTION_MODES.DRAFT_SAFE);
}

export function executionModeFromAgentOs(agentOs) {
  return normalizeExecutionMode(
    agentOs?.execution_mode ?? agentOs?.executionMode ?? EXECUTION_MODES.HUMAN_GATED
  );
}
