/** Marqq agent OS contracts — mirrors Marqq2 gtm_modules.profile keys. */

export type AgentTier = "core" | "specialist";
export type AgentStatus =
  | "dormant"
  | "activated"
  | "high_priority"
  | "deprioritized"
  | "retired";

export type AgentId =
  | "veena"
  | "isha"
  | "neel"
  | "zara"
  | "dev"
  | "priya"
  | "tara"
  | "sam"
  | "kiran"
  | "maya"
  | "riya"
  | "arjun";

export interface CatalogAgent {
  id: AgentId;
  name: string;
  role: string;
  type: string;
  tier: AgentTier;
  capabilities: string[];
  avatarColor: string;
  purpose: string;
  tools: string[];
  dataAccess: string[];
  openScreen: string | null;
}

export interface RosterEntry {
  id: AgentId;
  name: string;
  role: string;
  tier: AgentTier;
  capabilities: string[];
  status: AgentStatus;
  score: number;
  reason: string;
  mission: string;
  metric: string | null;
  target: string | null;
  review_date: string | null;
  specialist_label: string | null;
  retiredBy?: "human" | null;
}

export interface AgentRoster {
  version: 1;
  updatedAt: string;
  source: "rules" | "llm";
  rationale: string | null;
  principles: string;
  archetypeKey: string;
  business_archetype: string | null;
  north_star_metric: string | null;
  quantified_target: string | null;
  bottleneck_stage: string | null;
  agents: RosterEntry[];
  highPriority: string[];
  activated: string[];
  dormant: string[];
  humanApprovalRequired: string[];
  autoAdjustAllowed: string[];
}

export interface ControlLoopCheckpoint {
  period: number;
  label: string;
  target: number | null;
  actual: number | null;
  status: string;
  attainment?: number | null;
  attainmentPct?: number | null;
}

export interface ControlLoopState {
  version: 1;
  updatedAt: string;
  weeklyCycle: { day: string; focus: string }[];
  cadence: Record<string, unknown>;
  varianceThresholds: { green: number; amber: number };
  checkpointPlan: {
    periods: number;
    unit: string;
    checkpoints: ControlLoopCheckpoint[];
    endTarget: number | null;
    baseline: number;
    quantified_target?: string | null;
    timeline_target?: string | null;
  };
  currentPeriod: ControlLoopCheckpoint | null;
  status: string;
  recovery: Record<string, unknown> | null;
  funnelActuals: { stage: string; target: null; actual: null; finding: null }[];
  lastDiagnosis: Record<string, unknown> | null;
  interventions: unknown[];
  autoAdjustAllowed: string[];
  humanApprovalRequired: string[];
}

/** Execution destinations (Marqq2 AgentTarget subset for Marqq-test screens). */
export type AgentTarget =
  | "company_intel_icp"
  | "company_intel_competitors"
  | "company_intel_marketing_strategy"
  | "company_intel_sales_enablement"
  | "company_intel_pricing"
  | "company_intel_content_strategy"
  | "company_intel_seo"
  | "company_intel_channel_strategy"
  | "company_intel_social_calendar"
  | "company_intel_lead_magnets"
  | "company_intel_marketing_ideas"
  | "lead_intelligence"
  | "budget_optimization"
  | "performance_scorecard"
  | "user_engagement";

export interface SkillPack {
  marketingSkills: string[];
  agentName: AgentId;
  requiredConnectors: string[];
  optionalConnectors?: string[];
}

/** Mirrors Marqq2 gtm_modules.profile agent OS keys. */
export interface AgentOsProfile {
  version: 1;
  updatedAt: string;
  goal_system: unknown;
  control_loop: ControlLoopState;
  agent_roster: AgentRoster;
  strategy_document?: unknown;
  last_executed_task: unknown | null;
}

export interface PlannedAgentTask {
  agentName: AgentId;
  agentDisplayName: string;
  mission: string | null;
  metric: string | null;
  status: AgentStatus | null;
  skills: string[];
  requiredConnectors: string[];
  optionalConnectors: string[];
  goalBrief: string;
  sectionTargetsRelevant: unknown[];
  requiresHumanApproval: boolean;
  target: AgentTarget | null;
  sectionId: string | null;
  screenId: string | null;
}

/** UI agent row for Agents Hub / Command Center. */
export interface UiAgent {
  id: AgentId;
  name: string;
  role: string;
  type: string;
  avatarColor: string;
  status: string;
  lastAction: string;
  successRate: string;
  owner: string;
  purpose: string;
  tools: string[];
  dataAccess: string[];
  openScreen: string | null;
  tier: AgentTier;
  rosterStatus: AgentStatus;
  mission: string | null;
  metric: string | null;
  target: string | null;
  review_date: string | null;
  capabilities: string[];
}
