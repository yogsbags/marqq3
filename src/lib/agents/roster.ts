import { normalizeGoalSystem, type GtmGoalSystemNorm } from "../gtmNorthStar";
import {
  AGENT_CATALOG,
  AGENT_ROSTER_PRINCIPLES,
  AGENT_STATUSES,
  AUTO_ADJUST_ALLOWED,
  CORE_AGENT_IDS,
  HUMAN_APPROVAL_REQUIRED,
} from "./catalog";
import type { AgentRoster, AgentStatus, ControlLoopState, RosterEntry } from "./types";

export const ARCHETYPE_CAPABILITY_WEIGHTS: Record<string, Record<string, number>> = {
  consumer_product: {
    aso: 0.95,
    onboarding: 1,
    activation: 1,
    subscription: 0.9,
    retention: 0.85,
    conversion: 0.85,
    messaging: 0.7,
    social: 0.65,
    seo: 0.6,
    editorial: 0.55,
    trust_safety: 0.7,
    paid_media: 0.55,
  },
  b2b_services: {
    account_intelligence: 0.95,
    industry_intelligence: 0.9,
    abm: 0.95,
    executive_outreach: 1,
    proposals: 0.95,
    sales_enablement: 0.9,
    case_studies: 0.9,
    offer_packaging: 0.85,
    roi_business_case: 0.9,
    prospecting: 0.85,
    thought_leadership: 0.7,
    messaging: 0.75,
  },
  custom_delivery: {
    account_intelligence: 0.9,
    industry_intelligence: 0.85,
    roi_business_case: 1,
    pilot_design: 1,
    proposals: 0.9,
    sales_enablement: 0.85,
    stakeholder_mapping: 0.8,
    prospecting: 0.75,
    case_studies: 0.85,
    compliance_signals: 0.7,
  },
  marketplace: {
    supply_acquisition: 1,
    demand_acquisition: 1,
    abm: 0.7,
    conversion: 0.8,
    lifecycle: 0.75,
    analytics: 0.8,
    matching: 0.9,
    social: 0.55,
  },
  platform_os: {
    onboarding: 0.9,
    activation: 0.95,
    analytics: 0.9,
    channel_strategy: 0.8,
    editorial: 0.7,
    messaging: 0.75,
    sales_enablement: 0.7,
    abm: 0.65,
  },
  hybrid: {
    messaging: 0.7,
    conversion: 0.7,
    prospecting: 0.65,
    content_pipeline: 0.6,
    analytics: 0.7,
  },
  other: {
    messaging: 0.6,
    conversion: 0.6,
    prospecting: 0.55,
    analytics: 0.65,
    editorial: 0.5,
  },
};

const BOTTLENECK_CAPABILITY_HINTS: { re: RegExp; caps: string[] }[] = [
  { re: /install|signup|acquisition|top.?funnel|awareness|ctr|aso|app.?store/i, caps: ["aso", "paid_media", "social", "demand_acquisition", "seo"] },
  { re: /activat|onboard|first.?value|aha|setup|scan|personaliz/i, caps: ["onboarding", "activation", "conversion", "messaging"] },
  { re: /retain|churn|subscri|renew|ltv|habit/i, caps: ["subscription", "lifecycle", "editorial", "conversion"] },
  { re: /meeting|discovery|outreach|reply|response.?rate|pipeline.?creat/i, caps: ["executive_outreach", "prospecting", "abm", "messaging"] },
  { re: /proposal|close|win.?rate|roi|business.?case|procurement/i, caps: ["proposals", "roi_business_case", "sales_enablement", "case_studies"] },
  { re: /pilot|deliver|production|implement|outcome|readiness/i, caps: ["pilot_design", "roi_business_case", "account_intelligence", "compliance_signals"] },
  { re: /match|liquidity|supply|demand.?side|two.?sid/i, caps: ["supply_acquisition", "demand_acquisition", "conversion"] },
  { re: /trust|privacy|claim|compliance|safety|security/i, caps: ["trust_safety", "compliance_signals", "trust_claims", "messaging"] },
  { re: /content|seo|organic|thought.?lead/i, caps: ["seo", "editorial", "content_pipeline", "thought_leadership"] },
  { re: /paid|roas|cac|spend|media/i, caps: ["paid_media", "analytics", "attribution", "channel_strategy"] },
];

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export function resolveArchetypeKey(goalSystem: GtmGoalSystemNorm | Record<string, unknown>): string {
  const raw = str(
    (goalSystem as GtmGoalSystemNorm).business_archetype ||
      (goalSystem as { archetype?: string }).archetype
  ).toLowerCase();
  if (/consumer|product_loop|app|b2c|mobile/.test(raw)) return "consumer_product";
  if (/marketplace|two.?sided|match/.test(raw)) return "marketplace";
  if (/custom_delivery|production|implementation|ai.?dev|services.?delivery/.test(raw)) {
    return "custom_delivery";
  }
  if (/b2b_services|services|consult|agency/.test(raw)) return "b2b_services";
  if (/platform_os|operating.?system|gtm.?os/.test(raw)) return "platform_os";
  if (/hybrid/.test(raw)) return "hybrid";
  if (ARCHETYPE_CAPABILITY_WEIGHTS[raw]) return raw;
  return "other";
}

function bottleneckCapabilities(controlLoop: ControlLoopState | null | undefined): Set<string> {
  const diag = controlLoop?.lastDiagnosis as
    | { bottleneck_stage?: string; primary_constraint?: string; summary?: string; reallocation?: string }
    | null
    | undefined;
  const text = [
    diag?.bottleneck_stage,
    diag?.primary_constraint,
    diag?.summary,
    diag?.reallocation,
  ]
    .filter(Boolean)
    .join(" ");
  const set = new Set<string>();
  if (!text) return set;
  for (const hint of BOTTLENECK_CAPABILITY_HINTS) {
    if (hint.re.test(text)) hint.caps.forEach((c) => set.add(c));
  }
  return set;
}

function capabilityScoreForAgent(
  agent: (typeof AGENT_CATALOG)[number],
  weights: Record<string, number>,
  bottleneckCaps: Set<string>
): number {
  let score = 0;
  for (const cap of agent.capabilities || []) {
    score += Number(weights[cap] || 0);
    if (bottleneckCaps.has(cap)) score += 0.55;
  }
  return score;
}

function missionForAgent(
  agent: (typeof AGENT_CATALOG)[number],
  archetypeKey: string,
  bottleneckCaps: Set<string>,
  goalSystem: GtmGoalSystemNorm
): string {
  const nsm = str(goalSystem.north_star_metric) || "North Star progress";
  const overlapping = (agent.capabilities || []).filter(
    (c) =>
      bottleneckCaps.has(c) || (ARCHETYPE_CAPABILITY_WEIGHTS[archetypeKey] || {})[c] >= 0.75
  );
  if (agent.tier === "core") {
    const coreMissions: Record<string, string> = {
      veena: `Keep account/context current for ${nsm}`,
      isha: `Maintain ICP and segment truth for ${nsm}`,
      neel: `Orchestrate GTM toward ${nsm}; course-correct on variance`,
      zara: `Allocate channel effort to the constrained stage`,
      dev: `Measure ${nsm} and metric-tree leading indicators`,
      priya: `Watch external/competitive + trust signals`,
    };
    return coreMissions[agent.id] || `Support locked North Star: ${nsm}`;
  }
  if (overlapping.length) {
    return `Specialize on ${overlapping.slice(0, 3).join(", ")} to move ${nsm}`;
  }
  return `Stand by for ${archetypeKey} motions tied to ${nsm}`;
}

function ownedMetricForAgent(
  agent: (typeof AGENT_CATALOG)[number],
  goalSystem: GtmGoalSystemNorm,
  controlLoop: ControlLoopState | null
): string | null {
  const tree = Array.isArray(goalSystem.metric_tree)
    ? goalSystem.metric_tree.filter(Boolean)
    : [];
  const bottleneck = str(
    (controlLoop?.lastDiagnosis as { bottleneck_stage?: string } | null)?.bottleneck_stage
  );
  if (
    bottleneck &&
    (agent.capabilities || []).some((c) => bottleneckCapabilities(controlLoop).has(c))
  ) {
    return bottleneck;
  }
  if (agent.id === "dev" || agent.id === "neel") {
    return str(goalSystem.north_star_metric) || tree[0] || null;
  }
  if (agent.id === "tara") {
    return tree.find((m) => /activ|onboard|convert|trial/i.test(String(m))) || tree[1] || null;
  }
  if (agent.id === "arjun") {
    return (
      tree.find((m) => /pipeline|meeting|lead|match|supply|demand/i.test(String(m))) ||
      tree[2] ||
      null
    );
  }
  if (agent.id === "sam") {
    return tree.find((m) => /proposal|win|reply|outreach/i.test(String(m))) || null;
  }
  if (agent.id === "maya") {
    return tree.find((m) => /organic|seo|install|aso/i.test(String(m))) || null;
  }
  return tree[1] || null;
}

function finalizeRoster(
  agents: RosterEntry[],
  opts: {
    source: "rules" | "llm";
    goalSystem: GtmGoalSystemNorm;
    controlLoop: ControlLoopState | null;
    archetypeKey: string;
    rationale?: string | null;
  }
): AgentRoster {
  const { goalSystem: g, controlLoop: loop, archetypeKey, source, rationale } = opts;
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    source,
    rationale: rationale || null,
    principles: AGENT_ROSTER_PRINCIPLES,
    archetypeKey,
    business_archetype: g.business_archetype || archetypeKey,
    north_star_metric: g.north_star_metric || null,
    quantified_target: g.quantified_target || null,
    bottleneck_stage:
      ((loop?.lastDiagnosis as { bottleneck_stage?: string } | null)?.bottleneck_stage as
        | string
        | null) || null,
    agents,
    highPriority: agents.filter((a) => a.status === "high_priority").map((a) => a.id),
    activated: agents
      .filter((a) => a.status === "activated" || a.status === "high_priority")
      .map((a) => a.id),
    dormant: agents.filter((a) => a.status === "dormant").map((a) => a.id),
    humanApprovalRequired: HUMAN_APPROVAL_REQUIRED,
    autoAdjustAllowed: AUTO_ADJUST_ALLOWED,
  };
}

/** Deterministic adaptive roster from locked goal_system + optional control loop. */
export function buildAgentRoster(input: {
  goalSystem?: unknown;
  controlLoop?: ControlLoopState | null;
  previousRoster?: AgentRoster | null;
} = {}): AgentRoster {
  const g = normalizeGoalSystem(input.goalSystem || {});
  const loop = input.controlLoop || null;
  const archetypeKey = resolveArchetypeKey(g);
  const weights = {
    ...(ARCHETYPE_CAPABILITY_WEIGHTS[archetypeKey] || ARCHETYPE_CAPABILITY_WEIGHTS.other),
  };
  const bottleneckCaps = bottleneckCapabilities(loop);
  const prevById = new Map(
    (Array.isArray(input.previousRoster?.agents) ? input.previousRoster!.agents : []).map((a) => [
      a.id,
      a,
    ])
  );

  const scored: RosterEntry[] = AGENT_CATALOG.map((agent) => {
    const score = capabilityScoreForAgent(agent, weights, bottleneckCaps);
    const isCore = CORE_AGENT_IDS.has(agent.id);
    let status: AgentStatus = "dormant";
    let reason = "Not required for current archetype/bottleneck";

    if (isCore) {
      status = "activated";
      reason = "Stable core agent for every GTM module";
      if (bottleneckCaps.size && (agent.capabilities || []).some((c) => bottleneckCaps.has(c))) {
        status = "high_priority";
        reason = `Elevated: bottleneck touches ${[...bottleneckCaps].slice(0, 3).join(", ")}`;
      }
    } else if (score >= 0.85) {
      status = "high_priority";
      reason = `High fit for ${archetypeKey}${bottleneckCaps.size ? " + active bottleneck" : ""}`;
    } else if (score >= 0.45) {
      status = "activated";
      reason = `Specialist activated for ${archetypeKey}`;
    } else if (score > 0.15) {
      status = "deprioritized";
      reason = "Secondary for this archetype; available if bottleneck shifts";
    } else {
      status = "dormant";
      reason = "Not prioritized for current strategy phase";
    }

    const prev = prevById.get(agent.id);
    if (prev?.status === "retired" && prev?.retiredBy === "human") {
      status = "retired";
      reason = prev.reason || "Retired by human";
    }

    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      tier: agent.tier,
      capabilities: agent.capabilities,
      status,
      score: Math.round(score * 100) / 100,
      reason,
      mission: missionForAgent(agent, archetypeKey, bottleneckCaps, g),
      metric: ownedMetricForAgent(agent, g, loop),
      target: g.quantified_target || null,
      review_date: null,
      specialist_label: null,
      retiredBy: status === "retired" ? "human" : null,
    };
  });

  const now = Date.now();
  for (const a of scored) {
    const days = a.status === "high_priority" ? 7 : a.status === "activated" ? 14 : 28;
    a.review_date = new Date(now + days * 86400000).toISOString().slice(0, 10);
  }

  scored.sort((a, b) => {
    const order: Record<string, number> = {
      high_priority: 0,
      activated: 1,
      deprioritized: 2,
      dormant: 3,
      retired: 4,
    };
    const d = (order[a.status] ?? 9) - (order[b.status] ?? 9);
    if (d !== 0) return d;
    return (b.score || 0) - (a.score || 0);
  });

  return finalizeRoster(scored, {
    source: "rules",
    goalSystem: g,
    controlLoop: loop,
    archetypeKey,
  });
}

export function normalizeAgentRoster(
  raw: unknown,
  opts: { goalSystem?: unknown; controlLoop?: ControlLoopState | null } = {}
): AgentRoster {
  const r = raw as AgentRoster | null;
  if (r?.agents?.length && r?.version) {
    return {
      ...r,
      agents: r.agents.map((a) => ({
        ...a,
        status: (AGENT_STATUSES as readonly string[]).includes(a.status)
          ? a.status
          : "dormant",
      })),
    };
  }
  return buildAgentRoster({
    goalSystem: opts.goalSystem,
    controlLoop: opts.controlLoop,
    previousRoster: r,
  });
}

export function rosterSummaryLines(roster: AgentRoster | null | undefined): string[] {
  if (!roster?.agents?.length) return [];
  const lines = [
    `Agent roster (${roster.archetypeKey}${roster.source ? `, ${roster.source}` : ""}): high_priority=[${(roster.highPriority || []).join(", ")}]`,
  ];
  if (roster.rationale) lines.push(`Roster rationale: ${roster.rationale}`);
  for (const a of roster.agents
    .filter((x) => x.status === "high_priority" || x.status === "activated")
    .slice(0, 8)) {
    const label = a.specialist_label ? ` [${a.specialist_label}]` : "";
    lines.push(
      `${a.name}${label} (${a.status}): ${a.mission}${a.metric ? ` | owns: ${a.metric}` : ""} — ${a.reason}`
    );
  }
  return lines;
}
