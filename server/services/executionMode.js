/**
 * Workspace agent execution gate: human_gated (default) vs autonomous.
 * Autonomous skips the Approvals queue; it still does not live-spend/publish.
 */

export const EXECUTION_MODES = Object.freeze({
  HUMAN_GATED: 'human_gated',
  AUTONOMOUS: 'autonomous',
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

export function executionModeFromAgentOs(agentOs) {
  return normalizeExecutionMode(
    agentOs?.execution_mode ?? agentOs?.executionMode ?? EXECUTION_MODES.HUMAN_GATED
  );
}
