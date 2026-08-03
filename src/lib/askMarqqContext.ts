/** Handoff: GTM strategy section → Ask Marqq channel chat */

export const MARQQ_ASK_CONTEXT_KEY = "marqq_ask_context";

const SECTION_CHANNEL_OVERRIDES: Record<string, string> = {
  customer_success: "customer-success-retention",
};

export function sectionIdToAskChannel(sectionId: string): string {
  if (SECTION_CHANNEL_OVERRIDES[sectionId]) return SECTION_CHANNEL_OVERRIDES[sectionId];
  return String(sectionId || "general").replace(/_/g, "-");
}

export function formatStrategySectionForChat(section: {
  id?: string;
  title?: string;
  summary?: string;
  body?: string;
  bullets?: string[];
  subsections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
}): string {
  const title = section.title || section.id || "Strategy section";
  const lines: string[] = [`## ${title}`, ""];
  if (section.summary?.trim()) {
    lines.push(section.summary.trim(), "");
  }
  if (section.body?.trim()) {
    lines.push(section.body.trim(), "");
  }
  if (Array.isArray(section.bullets) && section.bullets.length) {
    for (const b of section.bullets) {
      const t = String(b || "").trim();
      if (t) lines.push(`• ${t}`);
    }
    lines.push("");
  }
  if (Array.isArray(section.subsections)) {
    for (const sub of section.subsections) {
      if (!sub?.title && !sub?.body) continue;
      lines.push(`### ${sub.title || "Detail"}`, "");
      if (sub.body?.trim()) lines.push(sub.body.trim(), "");
      if (Array.isArray(sub.bullets)) {
        for (const b of sub.bullets) {
          const t = String(b || "").trim();
          if (t) lines.push(`• ${t}`);
        }
        lines.push("");
      }
    }
  }
  return lines.join("\n").trim();
}

export type MarqqAskContext = {
  channel: string;
  sectionId: string;
  title: string;
  text: string;
  seededAt: string;
};

export function stashAskMarqqContext(input: {
  sectionId: string;
  title: string;
  text: string;
}): void {
  const payload: MarqqAskContext = {
    channel: sectionIdToAskChannel(input.sectionId),
    sectionId: input.sectionId,
    title: input.title,
    text: input.text,
    seededAt: new Date().toISOString(),
  };
  try {
    sessionStorage.setItem(MARQQ_ASK_CONTEXT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function consumeAskMarqqContext(): MarqqAskContext | null {
  try {
    const raw = sessionStorage.getItem(MARQQ_ASK_CONTEXT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(MARQQ_ASK_CONTEXT_KEY);
    const parsed = JSON.parse(raw) as MarqqAskContext;
    if (!parsed?.channel || !parsed?.text) return null;
    return parsed;
  } catch {
    return null;
  }
}

const GTM_STRATEGY_SESSION_KEY = "marqq_gtm_strategy";

export type StrategyChannelSeed = {
  channel: string;
  sectionId: string;
  title: string;
  text: string;
};

/** Load every GTM strategy section into Ask Marqq channel seeds. */
export function loadStrategySectionsForAskMarqq(): StrategyChannelSeed[] {
  try {
    const raw = sessionStorage.getItem(GTM_STRATEGY_SESSION_KEY);
    if (!raw) return [];
    const doc = JSON.parse(raw) as {
      title?: string;
      executiveSummary?: string;
      sections?: Array<{
        id?: string;
        title?: string;
        summary?: string;
        body?: string;
        bullets?: string[];
        subsections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
      }>;
    };
    const sections = Array.isArray(doc.sections) ? doc.sections : [];
    const seeds: StrategyChannelSeed[] = [];

    for (const section of sections) {
      if (!section?.id) continue;
      const channel = sectionIdToAskChannel(section.id);
      let text = formatStrategySectionForChat(section);
      if (section.id === "executive_summary" && doc.executiveSummary?.trim()) {
        const exec = doc.executiveSummary.trim();
        if (!text.includes(exec)) {
          text = formatStrategySectionForChat({
            ...section,
            title: section.title || "Executive summary",
            summary: section.summary || exec,
            body: section.body || (section.summary ? exec : section.body),
          });
          if (!section.summary?.trim() && !section.body?.trim()) {
            text = `## ${section.title || "Executive summary"}\n\n${exec}`;
          }
        }
      }
      if (!text.trim()) {
        text = `## ${section.title || section.id}\n\n(No written content yet — ask Marqq to draft or refine this section.)`;
      }
      seeds.push({
        channel,
        sectionId: section.id,
        title: section.title || section.id,
        text,
      });
    }

    // Ensure executive-summary channel exists even if only top-level summary was written
    if (
      doc.executiveSummary?.trim() &&
      !seeds.some((s) => s.channel === "executive-summary")
    ) {
      seeds.unshift({
        channel: "executive-summary",
        sectionId: "executive_summary",
        title: "Executive summary",
        text: `## Executive summary\n\n${doc.executiveSummary.trim()}`,
      });
    }

    return seeds;
  } catch {
    return [];
  }
}
