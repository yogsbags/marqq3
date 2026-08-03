import { AGENT_CATALOG, AGENT_CATALOG_BY_ID } from "./catalog";
import { bootstrapControlLoop } from "./controlLoop";
import { buildAgentRoster, normalizeAgentRoster, rosterSummaryLines } from "./roster";
import type { AgentOsProfile, AgentRoster, ControlLoopState, UiAgent } from "./types";

export const AGENT_OS_STORAGE_KEY = "marqq_agent_os";

export { rosterSummaryLines };

/** Build profile-shaped agent OS (mirrors Marqq2 gtm_modules.profile keys). */
export function buildAgentOs(input: {
  goalSystem: unknown;
  strategyDocument?: unknown;
  previousRoster?: AgentRoster | null;
  existingControlLoop?: ControlLoopState | null;
}): AgentOsProfile {
  const control_loop = bootstrapControlLoop(
    input.goalSystem,
    input.existingControlLoop || null
  );
  const agent_roster = buildAgentRoster({
    goalSystem: input.goalSystem,
    controlLoop: control_loop,
    previousRoster: input.previousRoster || null,
  });

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    goal_system: input.goalSystem,
    control_loop,
    agent_roster,
    strategy_document: input.strategyDocument ?? null,
    last_executed_task: null,
  };
}

export function saveAgentOs(os: AgentOsProfile): void {
  try {
    sessionStorage.setItem(AGENT_OS_STORAGE_KEY, JSON.stringify(os));
  } catch {
    /* ignore quota */
  }
}

export function loadAgentOs(): AgentOsProfile | null {
  try {
    const raw = sessionStorage.getItem(AGENT_OS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AgentOsProfile;
    if (!parsed?.agent_roster && !parsed?.goal_system) return null;
    return {
      ...parsed,
      version: 1,
      agent_roster: normalizeAgentRoster(parsed.agent_roster, {
        goalSystem: parsed.goal_system,
        controlLoop: parsed.control_loop,
      }),
      control_loop: parsed.control_loop,
    };
  } catch {
    return null;
  }
}

export function clearAgentOs(): void {
  try {
    sessionStorage.removeItem(AGENT_OS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Map roster status → Hub display status. */
function displayStatus(rosterStatus: string): string {
  switch (rosterStatus) {
    case "high_priority":
      return "Running";
    case "activated":
      return "Running";
    case "deprioritized":
      return "Waiting";
    case "retired":
      return "Completed";
    case "dormant":
    default:
      return "Waiting";
  }
}

/** Merge catalog + roster into Agents Hub rows. */
export function agentsFromOs(os: AgentOsProfile | null): UiAgent[] {
  const rosterById = new Map(
    (os?.agent_roster?.agents || []).map((a) => [a.id, a])
  );

  return AGENT_CATALOG.map((cat) => {
    const row = rosterById.get(cat.id);
    const rosterStatus = row?.status || (cat.tier === "core" ? "activated" : "dormant");
    return {
      id: cat.id,
      name: cat.name,
      role: cat.role,
      type: cat.type,
      avatarColor: cat.avatarColor,
      status: displayStatus(rosterStatus),
      lastAction: row?.mission || cat.purpose,
      successRate: "—",
      owner: "Marqq",
      purpose: cat.purpose,
      tools: cat.tools,
      dataAccess: cat.dataAccess,
      openScreen: cat.openScreen,
      tier: cat.tier,
      rosterStatus,
      mission: row?.mission || null,
      metric: row?.metric || null,
      target: row?.target || null,
      review_date: row?.review_date || null,
      capabilities: cat.capabilities,
    };
  });
}

/** Default UI agents when no OS yet (core activated, specialists dormant). */
export function defaultUiAgents(): UiAgent[] {
  return agentsFromOs(null);
}

export function getCatalogAgent(id: string) {
  return AGENT_CATALOG_BY_ID.get(id as never) || null;
}
