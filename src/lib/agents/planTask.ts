import {
  goalAlignmentToMarkdown,
  normalizeGoalSystem,
  type GtmSectionTargetNorm,
} from "../gtmNorthStar";
import { AGENT_CATALOG_BY_ID } from "./catalog";
import {
  ownershipForScreen,
  ownershipForSection,
  SCREEN_TO_AGENT_TARGET,
  skillsForAgentTarget,
} from "./ownership";
import { loadAgentOs } from "./persist";
import type {
  AgentId,
  AgentOsProfile,
  AgentTarget,
  PlannedAgentTask,
} from "./types";

export interface PlanAgentTaskInput {
  target?: AgentTarget | string | null;
  sectionId?: string | null;
  screenId?: string | null;
  agentOs?: AgentOsProfile | null;
}

function resolveTarget(input: PlanAgentTaskInput): {
  target: AgentTarget | null;
  sectionId: string | null;
  screenId: string | null;
  agentId: AgentId;
} {
  const sectionId = input.sectionId || null;
  const screenId = input.screenId || null;

  if (input.target && typeof input.target === "string") {
    const pack = skillsForAgentTarget(input.target as AgentTarget);
    return {
      target: input.target as AgentTarget,
      sectionId,
      screenId,
      agentId: pack.agentName,
    };
  }

  if (sectionId) {
    const own = ownershipForSection(sectionId);
    if (own) {
      const mapped =
        (own.openScreen && SCREEN_TO_AGENT_TARGET[own.openScreen]) || null;
      return {
        target: mapped,
        sectionId,
        screenId: own.openScreen,
        agentId: own.primaryAgent,
      };
    }
  }

  if (screenId) {
    const own = ownershipForScreen(screenId);
    const mapped = SCREEN_TO_AGENT_TARGET[screenId] || null;
    if (mapped) {
      const pack = skillsForAgentTarget(mapped);
      return {
        target: mapped,
        sectionId,
        screenId,
        agentId: pack.agentName,
      };
    }
    if (own) {
      return {
        target: null,
        sectionId,
        screenId,
        agentId: own.primary,
      };
    }
  }

  return {
    target: "company_intel_marketing_ideas",
    sectionId,
    screenId,
    agentId: "neel",
  };
}

/** Plan what an agent would run — no LLM execution. */
export function planAgentTask(input: PlanAgentTaskInput = {}): PlannedAgentTask {
  const os = input.agentOs ?? loadAgentOs();
  const resolved = resolveTarget(input);
  const pack = resolved.target
    ? skillsForAgentTarget(resolved.target)
    : {
        agentName: resolved.agentId,
        marketingSkills: [] as string[],
        requiredConnectors: [] as string[],
        optionalConnectors: [] as string[],
      };

  const agentId = pack.agentName || resolved.agentId;
  const catalog = AGENT_CATALOG_BY_ID.get(agentId);
  const rosterRow = os?.agent_roster?.agents?.find((a) => a.id === agentId);

  const goalSystem = normalizeGoalSystem(os?.goal_system || {});
  const sectionTargets = Array.isArray(goalSystem.sectionTargets)
    ? goalSystem.sectionTargets
    : [];
  const sectionTargetsRelevant: GtmSectionTargetNorm[] = resolved.sectionId
    ? sectionTargets.filter((t) => t.sectionId === resolved.sectionId)
    : sectionTargets.filter((t) => {
        const own = ownershipForSection(t.sectionId);
        return own?.primaryAgent === agentId || own?.supportingAgents?.includes(agentId);
      });

  const goalBriefParts = [
    goalAlignmentToMarkdown(goalSystem),
    rosterRow?.mission ? `Agent mission: ${rosterRow.mission}` : null,
    rosterRow?.metric ? `Owned metric: ${rosterRow.metric}` : null,
  ].filter(Boolean);

  const requiresHumanApproval =
    /north.?star|deadline|pricing|budget|compliance/i.test(
      `${rosterRow?.mission || ""} ${goalSystem.north_star_metric || ""}`
    ) || Boolean(pack.requiredConnectors?.length);

  return {
    agentName: agentId,
    agentDisplayName: catalog?.name || agentId,
    mission: rosterRow?.mission || catalog?.purpose || null,
    metric: rosterRow?.metric || null,
    status: rosterRow?.status || null,
    skills: pack.marketingSkills || [],
    requiredConnectors: pack.requiredConnectors || [],
    optionalConnectors: pack.optionalConnectors || [],
    goalBrief: goalBriefParts.join("\n\n").slice(0, 4000),
    sectionTargetsRelevant,
    requiresHumanApproval,
    target: resolved.target,
    sectionId: resolved.sectionId,
    screenId: resolved.screenId,
  };
}
