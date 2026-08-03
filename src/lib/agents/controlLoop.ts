import {
  goalSystemToQuantifiedLabel,
  normalizeGoalSystem,
  type GtmGoalSystemNorm,
} from "../gtmNorthStar";
import type { ControlLoopCheckpoint, ControlLoopState } from "./types";

export const DEFAULT_VARIANCE_THRESHOLDS = { green: 0.95, amber: 0.8 };

function extractTargetNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).replace(/,/g, "");
  const m = s.match(/(\d+(?:\.\d+)?)\s*%?/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function timelineToPeriods(timeline: unknown, period = "month"): number {
  const t = String(timeline || "90 days").toLowerCase();
  let days = 90;
  if (/30/.test(t)) days = 30;
  else if (/60/.test(t)) days = 60;
  else if (/90/.test(t)) days = 90;
  else if (/half|2.?quarter|6\s*month/.test(t)) days = 180;
  else if (/quarter|120/.test(t)) days = 120;
  else if (/year|12\s*month|365/.test(t)) days = 365;
  else {
    const m = t.match(/(\d+)\s*d/);
    if (m) days = Number(m[1]) || 90;
  }
  if (period === "week") return Math.max(2, Math.ceil(days / 7));
  return Math.max(2, Math.ceil(days / 30));
}

export function buildCadenceConfig(goalSystem: GtmGoalSystemNorm) {
  const g = normalizeGoalSystem(goalSystem || {});
  const archetype = String(g.business_archetype || "").toLowerCase();
  const tree = Array.isArray(g.metric_tree) ? g.metric_tree.filter(Boolean) : [];
  const guardrails = Array.isArray(g.guardrails) ? g.guardrails.filter(Boolean) : [];
  const nsm = g.north_star_metric || "North Star progress";
  const leading = tree.slice(1, 5);
  const topFunnel = tree.slice(-3);
  const isConsumer = /consumer|product_loop|app|b2c/.test(archetype);

  return {
    principle:
      "Monitor continuously, optimize weekly, evaluate experiments biweekly, reallocate resources monthly, and rethink strategy quarterly.",
    real_time_monitoring: [
      ...guardrails.slice(0, 4).map(String),
      "System / delivery failures",
      "Compliance or trust incidents",
    ]
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 6),
    daily_review: (
      isConsumer
        ? ["Signups / installs", ...topFunnel.slice(0, 2).map(String), "Activation errors"]
        : [
            "Leading volume signals",
            ...topFunnel.slice(0, 2).map(String),
            "Operational errors",
          ]
    )
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 6),
    weekly_course_correction: [nsm, ...leading.slice(0, 3).map(String), "Checkpoint attainment vs plan"]
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 6),
    biweekly_experiment_review: [
      "Messaging / creative experiments",
      "Onboarding or funnel experiments",
      "Channel mix tests",
    ],
    monthly_resource_review: [
      "CAC / efficiency of activated outcomes",
      "Agent contribution to North Star",
      "Resource reallocation across constraints",
    ],
    quarterly_strategy_review: [
      "ICP and beachhead",
      "Positioning",
      "Pricing / packaging",
      "North Star target feasibility",
    ],
    practical_rules: [
      "Review high-frequency operational metrics daily.",
      "Course-correct tactical execution weekly.",
      "Reallocate agent priorities monthly.",
      "Change strategy or North Star only quarterly, unless a major external event occurs.",
    ],
  };
}

export function buildCheckpoints(
  goalSystem: unknown,
  options: { periods?: number } = {}
) {
  const g = normalizeGoalSystem(goalSystem);
  const periods = Number(options.periods) || timelineToPeriods(g.timeline_target, "month");
  const endTarget =
    extractTargetNumber(g.target) ?? extractTargetNumber(g.quantified_target);
  const baseline = extractTargetNumber(g.baseline) ?? 0;

  if (endTarget == null) {
    return {
      periods,
      unit: g.north_star_metric || "units",
      checkpoints: Array.from({ length: periods }, (_, i) => ({
        period: i + 1,
        label: `Period ${i + 1}`,
        target: null as number | null,
        actual: null as number | null,
        status: "unknown",
      })),
      endTarget: null as number | null,
      baseline,
      quantified_target: goalSystemToQuantifiedLabel(g),
      timeline_target: g.timeline_target,
    };
  }

  const checkpoints: ControlLoopCheckpoint[] = [];
  for (let i = 1; i <= periods; i += 1) {
    const progress = i / periods;
    const eased = progress * progress * (3 - 2 * progress);
    const target = Math.round(baseline + (endTarget - baseline) * eased);
    checkpoints.push({
      period: i,
      label: `Month ${i}`,
      target,
      actual: null,
      status: "pending",
    });
  }
  if (checkpoints.length) checkpoints[checkpoints.length - 1].target = endTarget;

  return {
    periods,
    unit: g.north_star_metric || "units",
    checkpoints,
    endTarget,
    baseline,
    quantified_target: goalSystemToQuantifiedLabel(g),
    timeline_target: g.timeline_target,
  };
}

function classifyVariance(
  actual: number | null,
  target: number | null,
  opts: { previousStatuses?: string[] } = {}
) {
  if (actual == null || target == null || target === 0) {
    return { status: "unknown", attainment: null as number | null, attainmentPct: null as number | null };
  }
  const attainment = actual / target;
  const { green, amber } = DEFAULT_VARIANCE_THRESHOLDS;
  let status = "red";
  if (attainment >= green) status = "green";
  else if (attainment >= amber) status = "amber";

  const prev = Array.isArray(opts.previousStatuses) ? opts.previousStatuses : [];
  if (status === "red" && (prev.slice(-1)[0] === "red" || prev.slice(-2).every((s) => s === "red" || s === "amber"))) {
    status = "critical";
  }

  return {
    status,
    attainment: Math.round(attainment * 1000) / 1000,
    attainmentPct: Math.round(attainment * 100),
  };
}

function computeRecovery(input: {
  endTarget: number | null;
  expectedToDate: number | null;
  actualToDate: number;
  remainingPeriods: number;
}) {
  const { endTarget, expectedToDate, actualToDate, remainingPeriods } = input;
  if (endTarget == null || remainingPeriods <= 0) return null;
  const shortfall =
    expectedToDate != null ? Math.max(0, expectedToDate - actualToDate) : null;
  const remainingToGoal = Math.max(0, endTarget - actualToDate);
  const requiredPerPeriod = remainingToGoal / remainingPeriods;
  let recommendation = "on_track";
  if (shortfall != null && shortfall > 0) recommendation = "recoverable_with_focus";

  return {
    endTarget,
    expectedToDate,
    actualToDate,
    shortfall,
    remainingPeriods,
    remainingToGoal,
    requiredPerPeriod: Math.round(requiredPerPeriod * 10) / 10,
    recommendation,
    choices:
      recommendation === "on_track"
        ? []
        : ["increase_resources", "reduce_scope", "extend_deadline"],
  };
}

export function normalizeControlLoopState(
  raw: unknown,
  goalSystem?: unknown
): ControlLoopState {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const g = normalizeGoalSystem(goalSystem || src.goal_system || {});
  const plan = (src.checkpointPlan || src.checkpoint_plan) as
    | ReturnType<typeof buildCheckpoints>
    | undefined;
  const built =
    plan?.checkpoints?.length ? plan : buildCheckpoints(g, { periods: src.periods as number });

  const checkpoints = (built.checkpoints || []).map((c, idx) => {
    const actual = c.actual == null || c.actual === ("" as unknown) ? null : Number(c.actual);
    const target = c.target == null || c.target === ("" as unknown) ? null : Number(c.target);
    const prevStatuses = (built.checkpoints || [])
      .slice(0, idx)
      .map((p) => p.status)
      .filter(Boolean);
    const variance = classifyVariance(
      Number.isFinite(actual as number) ? (actual as number) : null,
      Number.isFinite(target as number) ? (target as number) : null,
      { previousStatuses: prevStatuses }
    );
    return {
      period: c.period ?? idx + 1,
      label: c.label || `Period ${idx + 1}`,
      target: Number.isFinite(target as number) ? (target as number) : null,
      actual: Number.isFinite(actual as number) ? (actual as number) : null,
      status: actual == null ? c.status || "pending" : variance.status,
      attainment: variance.attainment,
      attainmentPct: variance.attainmentPct,
    };
  });

  const withActual = checkpoints
    .map((c, i) => (c.actual != null ? i : -1))
    .filter((i) => i >= 0);
  const currentIdx = withActual.length ? withActual[withActual.length - 1] : 0;
  const current = checkpoints[currentIdx] || null;
  const remainingPeriods = Math.max(0, checkpoints.length - (currentIdx + 1));

  const funnel = Array.isArray(src.funnelActuals)
    ? (src.funnelActuals as ControlLoopState["funnelActuals"])
    : (g.metric_tree || []).map((stage) => ({
        stage,
        target: null,
        actual: null,
        finding: null,
      }));

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    weeklyCycle: [
      { day: "Monday", focus: "Analytics reports actuals vs target" },
      { day: "Tuesday", focus: "Diagnose largest bottleneck on metric tree" },
      { day: "Wednesday", focus: "Agents propose quantified interventions" },
      { day: "Thursday", focus: "Owner approves or rejects interventions" },
      { day: "Friday", focus: "Execution agents launch approved actions" },
      { day: "Next week", focus: "Measure impact and reallocate priorities" },
    ],
    cadence:
      src.cadence && typeof src.cadence === "object"
        ? { ...buildCadenceConfig(g), ...(src.cadence as object) }
        : buildCadenceConfig(g),
    varianceThresholds: DEFAULT_VARIANCE_THRESHOLDS,
    checkpointPlan: { ...built, checkpoints },
    currentPeriod: current,
    status: current?.status || "pending",
    recovery: computeRecovery({
      endTarget: built.endTarget,
      expectedToDate: current?.target ?? null,
      actualToDate: current?.actual ?? 0,
      remainingPeriods: remainingPeriods || 1,
    }),
    funnelActuals: funnel,
    lastDiagnosis: (src.lastDiagnosis as ControlLoopState["lastDiagnosis"]) || null,
    interventions: Array.isArray(src.interventions) ? src.interventions : [],
    autoAdjustAllowed: [
      "priorities",
      "recommendations",
      "campaign_mix",
      "experiment_allocation",
      "alert_frequency",
    ],
    humanApprovalRequired: [
      "north_star_metric",
      "deadline",
      "financial_targets",
      "compliance_rules",
      "eligibility_rules",
      "external_campaigns_above_budget_threshold",
      "quarterly_strategy_changes",
    ],
  };
}

/** Bootstrap control loop from locked goal_system. */
export function bootstrapControlLoop(
  goalSystem: unknown,
  existing: ControlLoopState | null = null
): ControlLoopState {
  const g = normalizeGoalSystem(goalSystem);
  if (existing?.checkpointPlan?.checkpoints?.length) {
    return normalizeControlLoopState(existing, g);
  }
  return normalizeControlLoopState({ checkpointPlan: buildCheckpoints(g) }, g);
}
