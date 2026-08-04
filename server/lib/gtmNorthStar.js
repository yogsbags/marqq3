/**
 * Minimal North Star helpers for control-loop server (mirrors Marqq2 gtmNorthStar).
 */

export function normalizeGoalSystem(raw, hints = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const str = (v) => (v == null ? "" : String(v).trim());
  const arr = (v, max = 12) =>
    (Array.isArray(v) ? v : [])
      .map((x) => str(x))
      .filter(Boolean)
      .slice(0, max);

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
    target: src.target == null || src.target === "" ? null : src.target,
    measurement_period: str(src.measurement_period || src.measurementPeriod) || null,
    metric_tree: arr(src.metric_tree || src.metricTree, 8),
    guardrails: arr(src.guardrails, 10),
    primary_loop: arr(src.primary_loop || src.primary_flywheel || src.primaryProductLoop, 8),
    rejects_as_nsm: arr(src.rejects_as_nsm || src.rejectsAsNsm, 8),
    sectionTargets: sectionTargetsRaw
      .map((t) => {
        const row = t && typeof t === "object" ? t : {};
        return {
          sectionId: str(row.sectionId || row.section_id),
          metric: str(row.metric),
          contribution: str(row.contribution),
          owner: str(row.owner || row.ownerRole || "Accountable functional lead") || "Accountable functional lead",
          targetType: row.targetType === "alignment" ? "alignment" : "leading_indicator",
          byWhen: str(row.byWhen || row.by_when || timeline) || "Next review checkpoint",
        };
      })
      .filter((t) => t.sectionId),
  };
}

export function goalSystemToQuantifiedLabel(goalSystem) {
  const g = normalizeGoalSystem(goalSystem);
  return g.quantified_target || g.north_star_metric || "North Star progress";
}
