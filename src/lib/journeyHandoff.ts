/**
 * Cross-screen journey handoffs — strategy section → execute room.
 * sessionStorage key mirrors Ask Marqq pattern.
 */

import { ownershipForScreen, ownershipForSection, SECTION_OWNERSHIP } from "./agents/ownership";
import { loadAgentOs, agentsFromOs } from "./agents/persist";
import { planAgentTask } from "./agents/planTask";
import { AGENT_CATALOG_BY_ID } from "./agents/catalog";
import { formatStrategySectionForChat, stashAskMarqqContext } from "./askMarqqContext";

export const JOURNEY_HANDOFF_KEY = "marqq_journey_handoff";

export type JourneyHandoff = {
  from: string;
  toScreen: string;
  sectionId?: string | null;
  sectionTitle?: string | null;
  agentId?: string | null;
  metric?: string | null;
  mission?: string | null;
  summary?: string | null;
  nextScreen?: string | null;
  createdAt: string;
};

type StrategySectionRow = {
  id: string;
  title: string;
  content?: string;
  summary?: string;
  body?: string;
  bullets?: string[];
  subsections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
};

export function loadStrategyDoc(): {
  title?: string;
  executiveSummary?: string;
  goalAlignment?: Record<string, unknown>;
  sections?: StrategySectionRow[];
  nextSteps?: string[];
} | null {
  try {
    const raw = sessionStorage.getItem("marqq_gtm_strategy");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sectionPlainText(section: StrategySectionRow | null | undefined): string {
  if (!section) return "";
  if (typeof section.content === "string" && section.content.trim()) {
    return section.content.trim();
  }
  return formatStrategySectionForChat(section);
}

export function stashJourneyHandoff(input: Omit<JourneyHandoff, "createdAt">): void {
  const payload: JourneyHandoff = {
    ...input,
    createdAt: new Date().toISOString(),
  };
  try {
    sessionStorage.setItem(JOURNEY_HANDOFF_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function consumeJourneyHandoff(): JourneyHandoff | null {
  try {
    const raw = sessionStorage.getItem(JOURNEY_HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(JOURNEY_HANDOFF_KEY);
    return JSON.parse(raw) as JourneyHandoff;
  } catch {
    return null;
  }
}

export function peekJourneyHandoff(): JourneyHandoff | null {
  try {
    const raw = sessionStorage.getItem(JOURNEY_HANDOFF_KEY);
    return raw ? (JSON.parse(raw) as JourneyHandoff) : null;
  } catch {
    return null;
  }
}

/** Open a strategy section's owned screen with handoff context. */
export function openSectionScreen(
  sectionId: string,
  setActiveScreen: (id: string) => void,
  opts: { summary?: string; sectionTitle?: string } = {}
): boolean {
  if (typeof setActiveScreen !== "function") return false;

  const own = ownershipForSection(sectionId);
  const screen = own?.openScreen || null;
  const doc = loadStrategyDoc();
  const section = (doc?.sections || []).find((s) => s.id === sectionId);
  const title = opts.sectionTitle || section?.title || own?.sectionId || sectionId;
  const summary =
    (opts.summary && String(opts.summary).trim()) ||
    sectionPlainText(section) ||
    "";

  // No execute room, or destination is Strategy itself → Ask Marqq with this section
  if (!screen || screen === "strategy") {
    stashAskMarqqContext({
      sectionId,
      title,
      text:
        summary ||
        `## ${title}\n\n(No written content yet — ask Marqq to draft or refine this section.)`,
    });
    setActiveScreen("chat");
    return true;
  }

  const target = planAgentTask({ sectionId, screenId: screen });
  try {
    stashJourneyHandoff({
      from: "strategy",
      toScreen: screen,
      sectionId,
      sectionTitle: title,
      agentId: target.agentName,
      metric: target.metric,
      mission: target.mission,
      summary: summary ? summary.slice(0, 500) : null,
      nextScreen: suggestNextScreen(screen),
    });
  } catch {
    /* still navigate */
  }
  setActiveScreen(screen);
  return true;
}

export function openAgentScreen(
  agentId: string,
  setActiveScreen: (id: string) => void
): boolean {
  const cat = AGENT_CATALOG_BY_ID.get(agentId as never);
  const screen = cat?.openScreen;
  if (!screen) return false;
  const plan = planAgentTask({ screenId: screen });
  stashJourneyHandoff({
    from: "agents",
    toScreen: screen,
    agentId,
    mission: plan.mission,
    metric: plan.metric,
    sectionTitle: cat?.role || null,
    nextScreen: suggestNextScreen(screen),
  });
  setActiveScreen(screen);
  return true;
}

const NEXT_BY_SCREEN: Record<string, string> = {
  market: "audiences",
  audiences: "brand",
  brand: "pricing",
  pricing: "landingpages",
  landingpages: "leadmagnets",
  leadmagnets: "campaigns",
  campaigns: "paid",
  paid: "approvals",
  social: "calendar",
  calendar: "content",
  content: "creative",
  creative: "approvals",
  crm: "outreach",
  outreach: "approvals",
  customer360: "crm",
  analytics: "orchestration",
  seo: "content",
  reporting: "analytics",
  ideas: "campaigns",
  strategy: "analytics",
  orchestration: "analytics",
  workflows: "tasks",
  integrations: "analytics",
  knowledge: "brand",
};

export function suggestNextScreen(screenId: string): string | null {
  return NEXT_BY_SCREEN[screenId] || "strategy";
}

/** Highest-priority next action from agent OS + strategy. */
export function getNextBestAction(): {
  label: string;
  detail: string;
  screen: string;
  agentName?: string;
  sectionId?: string;
} | null {
  const doc = loadStrategyDoc();
  const os = loadAgentOs();
  if (!doc?.goalAlignment && !os) {
    return {
      label: "Finish GTM Wizard",
      detail: "Lock North Star and strategy before executing journeys.",
      screen: "gtmwizard",
    };
  }

  const high = os?.agent_roster?.agents?.find((a) => a.status === "high_priority");
  if (high) {
    const cat = AGENT_CATALOG_BY_ID.get(high.id);
    const screen = cat?.openScreen || "agents";
    return {
      label: `Activate ${high.name}`,
      detail: high.mission || high.reason,
      screen,
      agentName: high.name,
    };
  }

  const targets = Array.isArray((doc?.goalAlignment as { sectionTargets?: unknown[] })?.sectionTargets)
    ? ((doc!.goalAlignment as { sectionTargets: Array<{ sectionId: string; metric?: string }> }).sectionTargets)
    : [];
  const first = targets[0];
  if (first?.sectionId) {
    const own = ownershipForSection(first.sectionId);
    return {
      label: `Advance ${first.sectionId.replace(/_/g, " ")}`,
      detail: first.metric || "Leading indicator from strategy",
      screen: own?.openScreen || "strategy",
      sectionId: first.sectionId,
    };
  }

  return {
    label: "Generate Marketing Ideas",
    detail: "Turn locked strategy into executable ideas.",
    screen: "ideas",
  };
}

export function sectionBriefForScreen(screenId: string): {
  sectionId: string | null;
  title: string | null;
  content: string | null;
  metric: string | null;
  agentId: string | null;
} {
  const own = ownershipForScreen(screenId);
  const doc = loadStrategyDoc();
  // Prefer exact openScreen match over primary-agent heuristic
  const sectionOwn =
    SECTION_OWNERSHIP.find((s) => s.openScreen === screenId) ||
    SECTION_OWNERSHIP.find((s) => own && s.primaryAgent === own.primary);
  const sectionId = sectionOwn?.sectionId || null;
  const section = sectionId
    ? (doc?.sections || []).find((s) => s.id === sectionId)
    : null;
  const targets = Array.isArray((doc?.goalAlignment as { sectionTargets?: unknown[] })?.sectionTargets)
    ? ((doc!.goalAlignment as { sectionTargets: Array<{ sectionId: string; metric?: string }> }).sectionTargets)
    : [];
  const t = sectionId ? targets.find((x) => x.sectionId === sectionId) : null;
  let content: string | null = null;
  if (section) {
    if (typeof section.content === "string" && section.content.trim()) {
      content = section.content.trim();
    } else {
      const formatted = formatStrategySectionForChat(section);
      content = formatted || null;
    }
  }
  return {
    sectionId,
    title: section?.title || sectionOwn?.sectionId || null,
    content,
    metric: t?.metric || null,
    agentId: own?.primary || sectionOwn?.primaryAgent || null,
  };
}

export function northStarLabel(): string {
  const doc = loadStrategyDoc();
  const g = doc?.goalAlignment as { north_star_metric?: string; quantified_target?: string } | undefined;
  if (g?.quantified_target) return String(g.quantified_target);
  if (g?.north_star_metric) return String(g.north_star_metric);
  return "No North Star locked";
}

export function rosterActiveAgents() {
  return agentsFromOs(loadAgentOs()).filter(
    (a) => a.rosterStatus === "high_priority" || a.rosterStatus === "activated"
  );
}
