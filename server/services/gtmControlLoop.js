/**
 * GTM Control Loop — Measure → Diagnose → Recommend → Approve → Execute → Re-measure
 * Generic: works from any locked goal_system. No brand-specific hardcoding.
 */

import { normalizeGoalSystem, goalSystemToQuantifiedLabel } from '../lib/gtmNorthStar.js';
import { resolveGroqModel, withGroqReasoning } from './groqReasoning.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function groqKey() {
  return process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '';
}

function parseJsonLooseLocal(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw.trim());
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Fetch-based Groq JSON completion (Marqq-test pattern; no SDK). */
async function groqJsonCompletion({ system, user, temperature = 0.3, max_tokens = 1800 }) {
  const key = groqKey();
  if (!key) return null;
  const model = resolveGroqModel();
  const body = withGroqReasoning({
    model,
    temperature,
    max_tokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return parseJsonLooseLocal(data.choices?.[0]?.message?.content || '');
}

export const CONTROL_LOOP_PRINCIPLES = `You are Marqq's GTM control-loop engine.

Agents course-correct through: Measure → Diagnose → Recommend → Approve → Execute → Re-measure.

Hard rules:
1. Preserve the locked North Star Metric, deadline, and guardrails unless a human explicitly changes them.
2. Course-correct on leading/driver metric variance — diagnose the bottleneck stage, not only the north-star symptom.
3. Every intervention must be quantified: current → target, hypothesis, expected impact, duration, success + rollback conditions.
4. If behind plan, compute recovery math. If unrealistic, recommend increase resources / reduce scope / extend deadline — never silently change the target.
5. Agents may auto-adjust priorities, experiments, and recommendations. Human approval is required for NSM, deadline, financial targets, compliance, eligibility, and large budget changes.
6. Infer funnel stages from the goal_system.metric_tree and business_archetype — do not invent a marketplace funnel for a consumer app or vice versa.`;

export const DEFAULT_VARIANCE_THRESHOLDS = {
  green: 0.95,
  amber: 0.8,
  /** below amber = red; declining 2 periods = critical */
};

/**
 * Tiered review cadence inferred from goal_system archetype + metric tree.
 * Generic — no brand-specific metrics hardcoded.
 *
 * Principle: monitor continuously, optimize weekly, evaluate experiments biweekly,
 * reallocate monthly, rethink strategy quarterly.
 */
export function buildCadenceConfig(goalSystem) {
  const g = normalizeGoalSystem(goalSystem || {});
  const archetype = String(g.business_archetype || "").toLowerCase();
  const tree = Array.isArray(g.metric_tree) ? g.metric_tree.filter(Boolean) : [];
  const guardrails = Array.isArray(g.guardrails) ? g.guardrails.filter(Boolean) : [];
  const nsm = g.north_star_metric || "North Star progress";
  const leading = tree.slice(1, 5);
  const topFunnel = tree.slice(-3);

  const isConsumer = /consumer|product_loop|app|b2c/.test(archetype);
  const isMarketplace = /marketplace|two.?sided|match/.test(archetype);
  const isServices = /b2b_services|services|consult/.test(archetype);
  const isDelivery = /custom_delivery|production|implementation/.test(archetype);
  const isPlatform = /platform_os|operating.?system/.test(archetype);

  const realTime = [
    ...guardrails.slice(0, 4).map((x) => String(x)),
    "System / delivery failures",
    "Compliance or trust incidents",
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6);

  const daily = isConsumer
    ? [
        "Signups / installs",
        ...topFunnel.slice(0, 2).map(String),
        "Activation errors",
        "Crash / scan failures",
      ]
    : isMarketplace
      ? [
          "New verified supply",
          "New verified demand",
          "Match / interest events",
          "Response latency",
        ]
      : isServices || isDelivery
        ? [
            "Inbound / outbound responses",
            "Discovery meetings booked",
            "Pipeline stage moves",
            "Proposal or delivery blockers",
          ]
        : isPlatform
          ? [
              "Orgs activating goal systems",
              "Agent tasks completed",
              "Execution milestones hit",
              "Integration / data errors",
            ]
          : [
              "Leading volume signals",
              ...topFunnel.slice(0, 2).map(String),
              "Operational errors",
            ];

  const weekly = [
    nsm,
    ...leading.slice(0, 3).map(String),
    "Checkpoint attainment vs plan",
    "Open intervention impact",
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6);

  const biweekly = [
    "Messaging / creative experiments",
    "Onboarding or funnel experiments",
    "Channel mix tests",
    isConsumer ? "Recommendation / activation tests" : "Offer or outreach experiments",
  ];

  const monthly = [
    "CAC / efficiency of activated outcomes",
    "Retention or repeat quality",
    "Conversion to paid / committed outcome",
    "Agent contribution to North Star",
    "Resource reallocation across constraints",
  ];

  const quarterly = [
    "ICP and beachhead",
    "Positioning",
    "Pricing / packaging",
    "North Star target feasibility",
    "Product / offer priorities",
  ];

  const metricReviewWindows = isConsumer
    ? [
        { metric_class: "Acquisition CTR / install rate", review_after: "3–7 days" },
        { metric_class: "Profile / onboarding completion", review_after: "3–7 days" },
        { metric_class: "First activation event", review_after: "7 days" },
        { metric_class: "7-day retention / repeat loop", review_after: "7–14 days" },
        { metric_class: "30-day retention", review_after: "30–45 days" },
        { metric_class: "Subscription / monetization", review_after: "30–90 days" },
        { metric_class: "Long-horizon outcome metrics", review_after: "Research cycle — not weekly GTM" },
      ]
    : isMarketplace
      ? [
          { metric_class: "Supply / demand acquisition", review_after: "3–7 days" },
          { metric_class: "Match relevance / interest rate", review_after: "7–14 days" },
          { metric_class: "Two-sided conversation rate", review_after: "7–14 days" },
          { metric_class: "Match-to-commitment", review_after: "30–90 days" },
        ]
      : [
          { metric_class: "Outreach / response rates", review_after: "3–7 days" },
          { metric_class: "Meeting / opportunity creation", review_after: "7–14 days" },
          { metric_class: "Pipeline conversion", review_after: "14–30 days" },
          { metric_class: "Closed / production outcomes", review_after: "30–90 days" },
        ];

  return {
    principle:
      "Monitor continuously, optimize weekly, evaluate experiments biweekly, reallocate resources monthly, and rethink strategy quarterly.",
    real_time_monitoring: realTime,
    daily_review: daily.filter((v, i, a) => a.indexOf(v) === i).slice(0, 6),
    weekly_course_correction: weekly,
    biweekly_experiment_review: biweekly,
    monthly_resource_review: monthly,
    quarterly_strategy_review: quarterly,
    metric_review_windows: metricReviewWindows,
    practical_rules: [
      "Review high-frequency operational metrics daily.",
      "Course-correct tactical execution weekly.",
      "Evaluate experiments only after their predefined duration.",
      "Reallocate agent priorities monthly.",
      "Change strategy or North Star only quarterly, unless a major external event occurs.",
      "Escalate trust, safety, security, or compliance issues immediately.",
      "Prefer two consecutive underperforming periods before major changes, unless severe.",
      "Do not overreact to a single day of retention or late-funnel data.",
    ],
  };
}

/**
 * Extract first meaningful number from a quantified target string.
 * @param {unknown} value
 * @returns {number|null}
 */
export function extractTargetNumber(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).replace(/,/g, "");
  const m = s.match(/(\d+(?:\.\d+)?)\s*%?/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Rough months from timeline labels like "90 days", "30d", "2 quarters".
 */
export function timelineToPeriods(timeline, period = "month") {
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

/**
 * Build ramp checkpoints from baseline → target across periods.
 * Uses linear ramp when no custom checkpoints provided.
 */
export function buildCheckpoints(goalSystem, options = {}) {
  const g = normalizeGoalSystem(goalSystem);
  const periods = Number(options.periods) || timelineToPeriods(g.timeline_target, "month");
  const endTarget = extractTargetNumber(g.target) ?? extractTargetNumber(g.quantified_target);
  const baseline = extractTargetNumber(g.baseline) ?? 0;
  if (endTarget == null) {
    return {
      periods,
      unit: g.north_star_metric || "units",
      checkpoints: Array.from({ length: periods }, (_, i) => ({
        period: i + 1,
        label: `Period ${i + 1}`,
        target: null,
        actual: null,
        status: "unknown",
      })),
      endTarget: null,
      baseline,
    };
  }

  const checkpoints = [];
  for (let i = 1; i <= periods; i += 1) {
    const progress = i / periods;
    // Ease-in ramp: slower early, steeper later (common GTM scale path)
    const eased = progress * progress * (3 - 2 * progress); // smoothstep
    const target = Math.round(baseline + (endTarget - baseline) * eased);
    checkpoints.push({
      period: i,
      label: `Month ${i}`,
      target,
      actual: null,
      status: "pending",
    });
  }
  // Ensure final equals end target
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

/**
 * @param {number|null} actual
 * @param {number|null} target
 * @param {{ previousStatuses?: string[] }=} opts
 */
export function classifyVariance(actual, target, opts = {}) {
  if (actual == null || target == null || target === 0) {
    return { status: "unknown", attainment: null, band: null };
  }
  const attainment = actual / target;
  const { green, amber } = DEFAULT_VARIANCE_THRESHOLDS;
  let status = "red";
  if (attainment >= green) status = "green";
  else if (attainment >= amber) status = "amber";
  else status = "red";

  const prev = Array.isArray(opts.previousStatuses) ? opts.previousStatuses : [];
  const declining =
    prev.length >= 1 &&
    (status === "red" || status === "amber") &&
    prev.slice(-2).every((s) => s === "red" || s === "amber" || s === "critical");
  if (status === "red" && (declining || prev.slice(-1)[0] === "red")) {
    status = "critical";
  }

  return {
    status,
    attainment: Math.round(attainment * 1000) / 1000,
    attainmentPct: Math.round(attainment * 100),
    band: status,
  };
}

/**
 * Recovery math when behind plan.
 */
export function computeRecovery({ endTarget, expectedToDate, actualToDate, remainingPeriods }) {
  if (endTarget == null || remainingPeriods == null || remainingPeriods <= 0) {
    return null;
  }
  const expected = expectedToDate ?? null;
  const actual = actualToDate ?? 0;
  const shortfall = expected != null ? Math.max(0, expected - actual) : null;
  const remainingToGoal = Math.max(0, endTarget - actual);
  const requiredPerPeriod = remainingPeriods > 0 ? remainingToGoal / remainingPeriods : null;
  const plannedRemaining =
    expected != null && endTarget != null
      ? Math.max(0, endTarget - expected) / remainingPeriods
      : null;

  let recommendation = "on_track";
  if (shortfall != null && shortfall > 0) {
    const stretch =
      plannedRemaining != null && plannedRemaining > 0
        ? requiredPerPeriod / plannedRemaining
        : null;
    if (stretch != null && stretch > 1.6) recommendation = "extend_deadline_or_add_resources";
    else if (stretch != null && stretch > 1.25) recommendation = "increase_resources_or_reduce_scope";
    else recommendation = "recoverable_with_focus";
  }

  return {
    endTarget,
    expectedToDate: expected,
    actualToDate: actual,
    shortfall,
    remainingPeriods,
    remainingToGoal,
    requiredPerPeriod:
      requiredPerPeriod != null ? Math.round(requiredPerPeriod * 10) / 10 : null,
    recommendation,
    choices:
      recommendation === "on_track"
        ? []
        : ["increase_resources", "reduce_scope", "extend_deadline"],
  };
}

export function normalizeIntervention(raw) {
  const s = (v) => (v == null ? "" : String(v).trim());
  return {
    id: s(raw?.id) || `int_${Date.now()}`,
    problem: s(raw?.problem),
    affected_metric: s(raw?.affected_metric || raw?.affectedMetric),
    current_value: raw?.current_value ?? raw?.currentValue ?? null,
    target_value: raw?.target_value ?? raw?.targetValue ?? null,
    hypothesis: s(raw?.hypothesis),
    intervention: s(raw?.intervention),
    expected_impact: s(raw?.expected_impact || raw?.expectedImpact),
    owner: s(raw?.owner) || "GTM Agent",
    duration: s(raw?.duration) || "14 days",
    dependencies: Array.isArray(raw?.dependencies)
      ? raw.dependencies.map(String).filter(Boolean).slice(0, 6)
      : [],
    success_condition: s(raw?.success_condition || raw?.successCondition),
    rollback_condition: s(raw?.rollback_condition || raw?.rollbackCondition),
    requires_human_approval: Boolean(
      raw?.requires_human_approval ??
        raw?.requiresHumanApproval ??
        /north.?star|deadline|budget|compliance|eligib/i.test(
          `${raw?.intervention || ""} ${raw?.problem || ""}`
        )
    ),
    status: s(raw?.status) || "proposed", // proposed | approved | rejected | executing | done
    createdAt: raw?.createdAt || new Date().toISOString(),
  };
}

export function normalizeControlLoopState(raw, goalSystem) {
  const g = normalizeGoalSystem(goalSystem || raw?.goal_system || {});
  const plan = raw?.checkpointPlan || raw?.checkpoint_plan;
  const built =
    plan?.checkpoints?.length
      ? plan
      : buildCheckpoints(g, { periods: raw?.periods });

  const checkpoints = (built.checkpoints || []).map((c, idx) => {
    const actual = c.actual == null || c.actual === "" ? null : Number(c.actual);
    const target = c.target == null || c.target === "" ? null : Number(c.target);
    const prevStatuses = (built.checkpoints || [])
      .slice(0, idx)
      .map((p) => p.status)
      .filter(Boolean);
    const variance = classifyVariance(
      Number.isFinite(actual) ? actual : null,
      Number.isFinite(target) ? target : null,
      { previousStatuses: prevStatuses }
    );
    return {
      period: c.period ?? idx + 1,
      label: c.label || `Period ${idx + 1}`,
      target: Number.isFinite(target) ? target : null,
      actual: Number.isFinite(actual) ? actual : null,
      status: actual == null ? c.status || "pending" : variance.status,
      attainment: variance.attainment,
      attainmentPct: variance.attainmentPct,
    };
  });

  const currentIdx = (() => {
    const withActual = checkpoints.map((c, i) => (c.actual != null ? i : -1)).filter((i) => i >= 0);
    if (withActual.length) return withActual[withActual.length - 1];
    return 0;
  })();
  const current = checkpoints[currentIdx] || null;
  const remainingPeriods = Math.max(0, checkpoints.length - (currentIdx + 1));
  const expectedToDate = current?.target ?? null;
  const actualToDate = current?.actual ?? null;
  const recovery = computeRecovery({
    endTarget: built.endTarget,
    expectedToDate,
    actualToDate: actualToDate ?? 0,
    remainingPeriods: remainingPeriods || 1,
  });

  const funnel = Array.isArray(raw?.funnelActuals)
    ? raw.funnelActuals
    : Array.isArray(g.metric_tree)
      ? g.metric_tree.map((stage) => ({
          stage,
          target: null,
          actual: null,
          finding: null,
        }))
      : [];

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
      raw?.cadence && typeof raw.cadence === "object"
        ? { ...buildCadenceConfig(g), ...raw.cadence }
        : buildCadenceConfig(g),
    varianceThresholds: DEFAULT_VARIANCE_THRESHOLDS,
    checkpointPlan: {
      ...built,
      checkpoints,
    },
    currentPeriod: current,
    status: current?.status || "pending",
    recovery,
    funnelActuals: funnel,
    lastDiagnosis: raw?.lastDiagnosis || null,
    interventions: Array.isArray(raw?.interventions)
      ? raw.interventions.map(normalizeIntervention)
      : [],
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

/**
 * Bootstrap control loop from locked goal_system.
 */
export function bootstrapControlLoop(goalSystem, existing = null) {
  const g = normalizeGoalSystem(goalSystem);
  if (existing?.checkpointPlan?.checkpoints?.length) {
    return normalizeControlLoopState(existing, g);
  }
  return normalizeControlLoopState({ checkpointPlan: buildCheckpoints(g) }, g);
}

function parseJsonLoose(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw.trim());
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * LLM: diagnose bottleneck from metric tree + actuals.
 * First arg kept for Marqq2 call-site compat; ignored (uses env GROQ key).
 */
export async function diagnoseBottleneck(_groq, { goalSystem, controlLoop, notes }) {
  const g = normalizeGoalSystem(goalSystem);
  const loop = normalizeControlLoopState(controlLoop || {}, g);
  const fallback = {
    bottleneck_stage: (g.metric_tree || [])[1] || g.north_star_metric || "leading metric",
    summary: `Attainment is ${loop.currentPeriod?.attainmentPct ?? "unknown"}% of the current checkpoint. Inspect the metric tree for the weakest stage.`,
    funnel: loop.funnelActuals,
    primary_constraint: "Insufficient progress on a leading driver — diagnose which stage of the metric tree is underperforming.",
    reallocation: "Shift agent effort toward the largest constraint stage; pause secondary motions until the bottleneck moves.",
    diagnosedAt: new Date().toISOString(),
  };

  if (!groqKey()) return fallback;

  try {
    const parsed = await groqJsonCompletion({
      temperature: 0.3,
      max_tokens: 1800,
      system: `${CONTROL_LOOP_PRINCIPLES}

Return STRICT JSON:
{
  "bottleneck_stage": string,
  "summary": string,
  "funnel": [{ "stage": string, "target": number|null, "actual": number|null, "finding": "healthy"|"bottleneck"|"downstream_impact"|"unknown" }],
  "primary_constraint": string,
  "reallocation": string
}`,
      user: JSON.stringify(
        {
          goalSystem: g,
          controlLoop: {
            status: loop.status,
            currentPeriod: loop.currentPeriod,
            checkpoints: loop.checkpointPlan.checkpoints,
            recovery: loop.recovery,
            funnelActuals: loop.funnelActuals,
          },
          notes: notes || null,
        },
        null,
        2
      ).slice(0, 14000),
    });
    if (!parsed) return fallback;
    return {
      bottleneck_stage: String(parsed.bottleneck_stage || fallback.bottleneck_stage),
      summary: String(parsed.summary || fallback.summary),
      funnel: Array.isArray(parsed.funnel) ? parsed.funnel : fallback.funnel,
      primary_constraint: String(parsed.primary_constraint || fallback.primary_constraint),
      reallocation: String(parsed.reallocation || fallback.reallocation),
      diagnosedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[gtm-control-loop] diagnose failed:", err.message);
    return fallback;
  }
}

/**
 * LLM: propose quantified interventions for the bottleneck.
 */
export async function proposeInterventions(_groq, { goalSystem, controlLoop, diagnosis }) {
  const g = normalizeGoalSystem(goalSystem);
  const loop = normalizeControlLoopState(controlLoop || {}, g);

  const deterministic = [
    normalizeIntervention({
      problem: diagnosis?.summary || "Behind checkpoint target",
      affected_metric: diagnosis?.bottleneck_stage || g.north_star_metric,
      current_value: loop.currentPeriod?.actual,
      target_value: loop.currentPeriod?.target,
      hypothesis: "The largest constraint on the metric tree is limiting north-star progress.",
      intervention: diagnosis?.reallocation || "Reallocate agent effort to the bottleneck stage for 14 days.",
      expected_impact: "Move checkpoint attainment above 80%",
      owner: "Optimization Agent",
      duration: "14 days",
      success_condition: "Attainment returns to amber or green",
      rollback_condition: "Guardrail metrics worsen materially",
      requires_human_approval: false,
    }),
  ];

  if (!groqKey()) return deterministic;

  try {
    const parsed = await groqJsonCompletion({
      temperature: 0.35,
      max_tokens: 2200,
      system: `${CONTROL_LOOP_PRINCIPLES}

Propose 2-4 quantified interventions.
Return STRICT JSON:
{ "interventions": [{
  "problem": string,
  "affected_metric": string,
  "current_value": number|null,
  "target_value": number|null,
  "hypothesis": string,
  "intervention": string,
  "expected_impact": string,
  "owner": string,
  "duration": string,
  "dependencies": string[],
  "success_condition": string,
  "rollback_condition": string,
  "requires_human_approval": boolean
}] }`,
      user: JSON.stringify(
        {
          goalSystem: g,
          diagnosis: diagnosis || loop.lastDiagnosis,
          currentPeriod: loop.currentPeriod,
          recovery: loop.recovery,
          guardrails: g.guardrails,
          rejects_as_nsm: g.rejects_as_nsm,
        },
        null,
        2
      ).slice(0, 14000),
    });
    const list = Array.isArray(parsed?.interventions) ? parsed.interventions : [];
    if (!list.length) return deterministic;
    return list.map((item, i) =>
      normalizeIntervention({ ...item, id: `int_${Date.now()}_${i}` })
    );
  } catch (err) {
    console.warn("[gtm-control-loop] proposeInterventions failed:", err.message);
    return deterministic;
  }
}

/**
 * Apply a period measurement into control loop state.
 */
export function recordMeasurement(controlLoop, goalSystem, { period, actual, funnelActuals }) {
  const loop = normalizeControlLoopState(controlLoop || {}, goalSystem);
  const nextActual = Number(actual);
  if (!Number.isFinite(nextActual)) {
    throw new Error("actual must be a number");
  }

  let targetPeriod = period != null ? Number(period) : null;
  if (targetPeriod == null) {
    const pending = loop.checkpointPlan.checkpoints.find((c) => c.actual == null);
    targetPeriod = pending?.period ?? loop.currentPeriod?.period ?? 1;
  }

  const nextCheckpoints = loop.checkpointPlan.checkpoints.map((c) => {
    if (c.period !== targetPeriod) return c;
    const variance = classifyVariance(nextActual, c.target, {
      previousStatuses: loop.checkpointPlan.checkpoints
        .filter((p) => p.period < c.period)
        .map((p) => p.status),
    });
    return {
      ...c,
      actual: nextActual,
      status: variance.status,
      attainment: variance.attainment,
      attainmentPct: variance.attainmentPct,
    };
  });

  return normalizeControlLoopState(
    {
      ...loop,
      checkpointPlan: { ...loop.checkpointPlan, checkpoints: nextCheckpoints },
      funnelActuals: Array.isArray(funnelActuals) ? funnelActuals : loop.funnelActuals,
    },
    goalSystem
  );
}
