/**
 * Marqq2-aligned auto strategy sections (Brand DNA → GTM Wizard briefs review).
 * Interview-backed sections (Goals / Offer / Audience) live in gtmInterview / gtmStrategySection.
 */

export const GTM_AUTO_STRATEGY_SECTIONS = [
  {
    id: "market_analysis",
    title: "Market analysis",
    blurb: "Who to win first, then expand.",
    bulletsLabel: "Decisions",
  },
  {
    id: "positioning_messaging",
    title: "Positioning & messaging",
    blurb: "Claims, hooks, proof, and competitive counters.",
    bulletsLabel: "Plays",
  },
  {
    id: "distribution_channels",
    title: "Distribution & channels",
    blurb: "Primary motion and supporting channels.",
    bulletsLabel: "Plays",
  },
  {
    id: "marketing_strategy",
    title: "Marketing strategy",
    blurb: "Campaign spine and demand gen toward the target.",
    bulletsLabel: "Plays",
  },
  {
    id: "sales_strategy",
    title: "Sales strategy",
    blurb: "Cadence, qualification SLAs, and objection handling.",
    bulletsLabel: "Plays",
  },
  {
    id: "launch_plan",
    title: "Launch plan",
    blurb: "Pre-launch → launch → post milestones.",
    bulletsLabel: "Plays",
  },
  {
    id: "measurement_optimization",
    title: "Measurement & optimization",
    blurb: "Primary KPI and weekly optimization loops.",
    bulletsLabel: "Plays",
  },
  {
    id: "risks_contingencies",
    title: "Risks & contingencies",
    blurb: "Kill criteria and pivot options.",
    bulletsLabel: "Plays",
  },
  {
    id: "timeline_roadmap",
    title: "Timeline & roadmap",
    blurb: "Week-by-week plan to the quantified target.",
    bulletsLabel: "Plays",
  },
] as const;

export type GtmAutoStrategySectionId = (typeof GTM_AUTO_STRATEGY_SECTIONS)[number]["id"];

export interface GtmStrategySubsection {
  title: string;
  body: string;
  bullets?: string[];
}

export interface GtmAutoSectionDraft {
  id: string;
  title: string;
  channel?: string;
  summary: string;
  bullets: string[];
  body: string;
  subsections?: GtmStrategySubsection[];
  approvedAt?: string;
}

export function gtmAutoSectionsStorageKey(workspaceId: string) {
  return `marqq_gtm_auto_sections_${workspaceId}`;
}

export function loadGtmAutoSections(workspaceId: string): GtmAutoSectionDraft[] {
  try {
    const raw = localStorage.getItem(gtmAutoSectionsStorageKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.sections)
      ? parsed.sections
      : Array.isArray(parsed)
        ? parsed
        : [];
  } catch {
    return [];
  }
}

export function saveGtmAutoSections(workspaceId: string, sections: GtmAutoSectionDraft[]) {
  localStorage.setItem(
    gtmAutoSectionsStorageKey(workspaceId),
    JSON.stringify({
      sections,
      savedAt: new Date().toISOString(),
      autoSectionIds: GTM_AUTO_STRATEGY_SECTIONS.map((s) => s.id),
    })
  );
}
