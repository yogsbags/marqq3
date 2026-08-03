/**
 * Marqq2-aligned North Star goal system (client-side for Marqq-test).
 * North Star = what agents optimize; sectionTargets = leading indicators (not a share of the NSM).
 */

export interface GtmSectionTargetNorm {
  sectionId: string;
  metric: string;
  contribution: string;
  owner: string;
  targetType: "leading_indicator" | "alignment";
  byWhen: string;
}

export interface GtmGoalSystemNorm {
  business_archetype: string | null;
  north_star_metric: string | null;
  metric_definition: string | null;
  ultimate_outcome_metric: string | null;
  quantified_target: string | null;
  timeline_target: string | null;
  priority_90d: string | null;
  channel_bet: string | null;
  baseline: string | null;
  target: string | number | null;
  measurement_period: string | null;
  metric_tree: string[];
  guardrails: string[];
  primary_loop: string[];
  rejects_as_nsm: string[];
  sectionTargets: GtmSectionTargetNorm[];
}

export const NORTH_STAR_PRINCIPLES = `You are defining the North Star Metric that Marqq agents will optimize for a customer organization.

Marqq is a GTM operating system: identify the customer's business/product outcome, then coordinate every agent toward that outcome.

Infer the business archetype ONLY from provided context. Do NOT assume a named company template.

Archetype patterns:
- b2b_services: paid engagements / outcome-defined client work (not lead volume alone)
- consumer_product: repeated users completing the core product value loop (not downloads alone)
- marketplace: qualified two-sided matches (not signups alone)
- platform_os: customer orgs making measurable progress on THEIR goal
- custom_delivery: solutions reaching production with verified client outcomes
- hybrid: blend carefully and explain

Rules for the operational North Star (what agents optimize):
1. Measure customer/product VALUE progress, not vanity activity (strategies written, chats, agent outputs).
2. Include an exact qualifying DEFINITION (what counts as one unit).
3. Prefer a metric agents can influence inside the stated timeline.
4. Also propose an ultimate_outcome_metric that is longer-horizon / partially external if needed.
5. Explicitly list vanity metrics to REJECT for this business (rejects_as_nsm).
6. Build a short metric_tree (north star → leading drivers).
7. Add guardrails so agents cannot game volume with low-quality activity.
8. quantified_target must be a concrete sentence: number + unit + by-when.
9. Never invent fake baselines — leave baseline null if unknown.
10. Section contributing metrics are LEADING INDICATORS — never assign a fractional share of the North Star to a section.
11. Only true acquisition/conversion/retention owners may directly reference North Star units.`;

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function arr(v: unknown, max = 12): string[] {
  return (Array.isArray(v) ? v : [])
    .map((x) => str(x))
    .filter(Boolean)
    .slice(0, max);
}

export function normalizeGoalSystem(
  raw: unknown,
  hints: { timeline?: string; objective?: string } = {}
): GtmGoalSystemNorm {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const northStar = str(src.north_star_metric || src.northStarMetric);
  const definition = str(src.metric_definition || src.definition || src.metricDefinition);
  const quantified = str(
    src.quantified_target ||
      src.quantifiedTarget ||
      (src.target != null && northStar
        ? `${src.target} ${northStar}${hints.timeline ? ` by ${hints.timeline}` : ""}`
        : "")
  );
  const timeline = str(src.timeline_target || src.timeline || hints.timeline || "");
  const sectionTargetsRaw = Array.isArray(src.sectionTargets) ? src.sectionTargets : [];

  return {
    business_archetype: str(src.business_archetype || src.archetype) || null,
    north_star_metric: northStar || quantified || null,
    metric_definition: definition || null,
    ultimate_outcome_metric: str(src.ultimate_outcome_metric || src.ultimateOutcome) || null,
    quantified_target: quantified || northStar || null,
    timeline_target: timeline || null,
    priority_90d: str(src.priority_90d || hints.objective) || null,
    channel_bet: str(src.channel_bet) || null,
    baseline: src.baseline == null || src.baseline === "" ? null : str(src.baseline),
    target: src.target == null || src.target === "" ? null : (src.target as string | number),
    measurement_period: str(src.measurement_period || src.measurementPeriod) || null,
    metric_tree: arr(src.metric_tree || src.metricTree, 8),
    guardrails: arr(src.guardrails, 10),
    primary_loop: arr(src.primary_loop || src.primary_flywheel || src.primaryProductLoop, 8),
    rejects_as_nsm: arr(src.rejects_as_nsm || src.rejectsAsNsm, 8),
    sectionTargets: sectionTargetsRaw
      .map((t) => {
        const row = t && typeof t === "object" ? (t as Record<string, unknown>) : {};
        return {
          sectionId: str(row.sectionId || row.section_id),
          metric: str(row.metric),
          contribution: str(row.contribution),
          owner: str(row.owner || row.ownerRole || "Accountable functional lead") || "Accountable functional lead",
          targetType:
            row.targetType === "alignment" ? ("alignment" as const) : ("leading_indicator" as const),
          byWhen: str(row.byWhen || row.by_when || timeline) || "Next review checkpoint",
        };
      })
      .filter((t) => t.sectionId),
  };
}

export function isWeakGoalSystem(goalSystem: unknown): boolean {
  const g = normalizeGoalSystem(goalSystem);
  const v = String(g.quantified_target || g.north_star_metric || "").toLowerCase();
  if (!v || v.length < 8) return true;
  return /^(unset|tbd|n\/?a|ai_recommend|let marqq|not sure|unknown|none|skip)$/i.test(v);
}

export function goalSystemToQuantifiedLabel(goalSystem: unknown): string {
  const g = normalizeGoalSystem(goalSystem);
  if (g.quantified_target) return g.quantified_target;
  if (g.north_star_metric && g.target != null) {
    return `${g.target} ${g.north_star_metric}${g.timeline_target ? ` by ${g.timeline_target}` : ""}`;
  }
  return g.north_star_metric || "";
}

export function isPlaceholderSectionTarget(target: Partial<GtmSectionTargetNorm> | null | undefined): boolean {
  if (!target?.metric) return true;
  return (
    /^Leading indicator for /i.test(target.metric) ||
    /^Accountable functional lead$/i.test(String(target.owner || "")) ||
    /^Define and review the leading indicator/i.test(String(target.contribution || ""))
  );
}

/**
 * Preserve LLM section responsibilities; never invent a share of the North Star.
 */
export function normalizeSectionTargets(
  rawTargets: unknown,
  sectionIds: Array<string | { id: string }> = [],
  timeline = ""
): GtmSectionTargetNorm[] {
  const source = Array.isArray(rawTargets) ? rawTargets : [];
  const byId = new Map(
    source.map((target) => {
      const row = target && typeof target === "object" ? (target as Record<string, unknown>) : {};
      return [String(row.sectionId || row.section_id || ""), row];
    })
  );
  const ids = sectionIds.map((s) => (typeof s === "string" ? s : s.id));

  return ids.map((sectionId) => {
    const raw = byId.get(sectionId) || {};
    const metric =
      str(raw.metric) || `Leading indicator for ${sectionId.replace(/_/g, " ")}`;
    let contribution = str(raw.contribution);
    const directAllocation =
      /^(\d+(?:\.\d+)?|\$?\d+[\d,]*)\s*(contracts?|users?|customers?|ap[u]?s?|leads?)\b/i.test(
        contribution
      ) || /share of (the )?(north[- ]star|target)/i.test(contribution);
    if (!contribution || directAllocation) {
      contribution = directAllocation
        ? "Use this leading indicator to diagnose or improve the North Star; do not assign this section a fractional share of the final outcome."
        : `Define and review the leading indicator that moves the North Star through ${sectionId.replace(/_/g, " ")}.`;
    }
    const byWhen = str(raw.byWhen || raw.by_when || timeline || "Next review checkpoint").replace(
      /^by\s+/i,
      ""
    );
    return {
      sectionId,
      metric,
      contribution,
      owner: str(raw.owner || raw.ownerRole || "Accountable functional lead") || "Accountable functional lead",
      targetType: raw.targetType === "alignment" ? "alignment" : "leading_indicator",
      byWhen: byWhen || "Next review checkpoint",
    };
  });
}

export function sectionTargetsFromDrafts(
  drafts: Array<{
    id?: string;
    sectionTarget?: {
      metric?: string;
      contribution?: string;
      owner?: string;
      targetType?: string;
      byWhen?: string;
    } | null;
  }>
): GtmSectionTargetNorm[] {
  return (drafts || [])
    .filter((d) => d?.id && d?.sectionTarget)
    .map((d) => ({
      sectionId: String(d.id),
      metric: str(d.sectionTarget?.metric),
      contribution: str(d.sectionTarget?.contribution),
      owner: str(d.sectionTarget?.owner || "Accountable functional lead"),
      targetType:
        d.sectionTarget?.targetType === "alignment" ? ("alignment" as const) : ("leading_indicator" as const),
      byWhen: str(d.sectionTarget?.byWhen || "Next review checkpoint"),
    }))
    .filter((t) => t.sectionId && t.metric);
}

/** Inject "Contribution to goal" subsections (Marqq2 alignStrategySectionsToLeadingMetrics). */
export function alignSectionsToLeadingMetrics<
  T extends {
    id: string;
    subsections?: Array<{ title: string; body: string; bullets?: string[] }>;
  },
>(sections: T[], sectionTargets: GtmSectionTargetNorm[]): T[] {
  const targets = new Map(sectionTargets.map((t) => [t.sectionId, t]));
  return (sections || []).map((section) => {
    const target = targets.get(section.id);
    if (!target) return section;
    const subsections = (section.subsections || []).filter(
      (sub) => !/contribution to goal/i.test(String(sub?.title || ""))
    );
    subsections.push({
      title: "Contribution to goal",
      body: `${target.metric}: ${target.contribution} Checkpoint: ${target.byWhen}. Owner: ${target.owner}. This section is a ${target.targetType} responsibility and does not claim a direct share of the final North Star.`,
      bullets: [
        `Leading metric: ${target.metric}`,
        `Review checkpoint: ${target.byWhen}`,
        `Accountable owner: ${target.owner}`,
      ],
    });
    return { ...section, subsections };
  });
}

/** Structural fallback from interview answers (no brand hardcoding). */
export function structuralGoalSystemFromAnswers(input: {
  outcome?: string;
  target?: string;
  timeline?: string;
  baseline?: string;
  channel?: string;
  companyName?: string;
  niche?: string;
}): GtmGoalSystemNorm {
  const timeline = input.timeline || "90 days";
  const objective = input.outcome || "business outcome progress";
  const existing = input.target || "";
  const company = input.companyName || "this organization";
  const niche = String(input.niche || "").toLowerCase();
  const isServices = /\b(consult|advisory|agency|services?|transformation)\b/i.test(niche);
  const isConsumer = /\b(app|consumer|nutrition|saas)\b/i.test(niche) && !isServices;

  const quantified =
    existing && existing.length > 8 && !/ai_recommend|let marqq|tbd|unset/i.test(existing)
      ? existing
      : `Define and hit a measurable ${objective} target for ${company} within ${timeline}`;

  return normalizeGoalSystem(
    {
      business_archetype: isServices
        ? "b2b_services"
        : isConsumer
          ? "consumer_product"
          : "other",
      north_star_metric: objective,
      metric_definition: quantified
        ? `One unit equals verified progress toward: ${quantified}`
        : "A unit counts only when it represents real customer/product value progress — not vanity activity.",
      ultimate_outcome_metric: objective || null,
      quantified_target: quantified,
      timeline_target: timeline,
      baseline: input.baseline || null,
      channel_bet: input.channel || null,
      priority_90d: objective,
      measurement_period: timeline,
      metric_tree: [
        quantified,
        input.channel || "Primary channel leading indicators",
        isServices ? "Qualified discoveries → proposals → closes" : "Activation → retention → paid conversion",
      ].filter(Boolean),
      guardrails: [
        "Quality over volume",
        "Do not scale without a CAC/CPL or capacity ceiling",
        "Reject vanity volume without qualification",
      ],
      primary_loop: isServices
        ? ["Attract ICP", "Qualify", "Discover", "Propose", "Close", "Deliver"]
        : ["Acquire", "Activate", "Retain", "Monetize", "Expand"],
      rejects_as_nsm: [
        "Raw lead volume without qualification",
        "Impressions / likes",
        "AI artifacts generated",
        "Unqualified meetings",
      ],
    },
    { timeline, objective }
  );
}

/**
 * Marqq2 assembleStrategy goalAlignment merge:
 * locked proposed/structural system + interview locks + normalized 16 sectionTargets.
 */
export function assembleGoalAlignment(input: {
  proposed?: unknown;
  sectionIds: Array<string | { id: string }>;
  draftTargets?: GtmSectionTargetNorm[];
  llmTargets?: unknown;
  answers?: {
    priority_90d?: string;
    quantified_target?: string;
    timeline_target?: string;
    channel_bet?: string;
    success_baseline?: string;
  };
  ctx?: {
    outcome?: string;
    target?: string;
    timeline?: string;
    baseline?: string;
    channel?: string;
    companyName?: string;
    niche?: string;
  };
}): GtmGoalSystemNorm {
  const timeline =
    input.answers?.timeline_target || input.ctx?.timeline || "90 days";
  const outcome = input.answers?.priority_90d || input.ctx?.outcome || "";
  const quantifiedAnswer = input.answers?.quantified_target || input.ctx?.target || "";
  const structural = structuralGoalSystemFromAnswers({
    outcome,
    target: quantifiedAnswer,
    timeline,
    baseline: input.answers?.success_baseline || input.ctx?.baseline,
    channel: input.answers?.channel_bet || input.ctx?.channel,
    companyName: input.ctx?.companyName,
    niche: input.ctx?.niche,
  });
  const proposed = input.proposed ? normalizeGoalSystem(input.proposed, { timeline, objective: outcome }) : null;
  const locked = proposed && !isWeakGoalSystem(proposed) ? proposed : structural;

  const sectionTargets = normalizeSectionTargets(
    [
      ...(input.draftTargets || []),
      ...(Array.isArray(input.llmTargets) ? input.llmTargets : []),
      ...(locked.sectionTargets || []),
    ],
    input.sectionIds,
    locked.timeline_target || timeline
  );

  return {
    ...locked,
    quantified_target:
      locked.quantified_target ||
      quantifiedAnswer ||
      goalSystemToQuantifiedLabel(locked) ||
      null,
    timeline_target: locked.timeline_target || timeline || null,
    priority_90d: outcome || locked.priority_90d || null,
    channel_bet: input.answers?.channel_bet || input.ctx?.channel || locked.channel_bet || null,
    baseline:
      input.answers?.success_baseline || input.ctx?.baseline || locked.baseline || null,
    measurement_period: locked.measurement_period || timeline || null,
    sectionTargets,
  };
}

/** Marqq2 strategyToMarkdown North Star block. */
export function goalAlignmentToMarkdown(goalAlignment: unknown): string {
  const ga = normalizeGoalSystem(goalAlignment);
  const targets = Array.isArray((goalAlignment as GtmGoalSystemNorm)?.sectionTargets)
    ? (goalAlignment as GtmGoalSystemNorm).sectionTargets
    : ga.sectionTargets;
  if (
    !ga.north_star_metric &&
    !ga.quantified_target &&
    !ga.timeline_target &&
    !(targets || []).length
  ) {
    return "";
  }
  const lines: string[] = ["## North-star goal system", ""];
  if (ga.business_archetype) lines.push(`**Archetype:** ${ga.business_archetype}`);
  if (ga.north_star_metric) lines.push(`**North Star Metric:** ${ga.north_star_metric}`);
  if (ga.metric_definition) lines.push(`**Definition:** ${ga.metric_definition}`);
  if (ga.ultimate_outcome_metric) lines.push(`**Ultimate outcome:** ${ga.ultimate_outcome_metric}`);
  if (ga.quantified_target) lines.push(`**Target:** ${ga.quantified_target}`);
  if (ga.timeline_target) lines.push(`**Timeline:** ${ga.timeline_target}`);
  if (ga.priority_90d) lines.push(`**Primary outcome:** ${ga.priority_90d}`);
  if (ga.channel_bet) lines.push(`**Channel bet:** ${ga.channel_bet}`);
  lines.push("");
  if ((ga.metric_tree || []).length) {
    lines.push("### Metric tree", "");
    for (const m of ga.metric_tree) lines.push(`- ${m}`);
    lines.push("");
  }
  if ((ga.primary_loop || []).length) {
    lines.push("### Primary loop", "");
    lines.push(`- ${(ga.primary_loop || []).join(" → ")}`);
    lines.push("");
  }
  if ((ga.guardrails || []).length) {
    lines.push("### Guardrails", "");
    for (const g of ga.guardrails) lines.push(`- ${g}`);
    lines.push("");
  }
  if ((ga.rejects_as_nsm || []).length) {
    lines.push("### Do not optimize as NSM", "");
    for (const r of ga.rejects_as_nsm) lines.push(`- ${r}`);
    lines.push("");
  }
  for (const t of targets || []) {
    lines.push(
      `- ${t.sectionId}: ${t.metric || ""} — ${t.contribution || ""}${t.byWhen ? ` (by ${t.byWhen})` : ""}`
    );
  }
  if ((targets || []).length) lines.push("");
  return lines.join("\n");
}

export function countPlaceholderSectionTargets(targets: GtmSectionTargetNorm[]): number {
  return (targets || []).filter((t) => isPlaceholderSectionTarget(t)).length;
}
