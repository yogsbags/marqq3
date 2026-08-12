/** Executable agent workstreams for consumer health / nutrition apps (e.g. Nouriva). */

export interface ConsumerHealthWorkstream {
  id: string;
  sectionIds?: string[];
  name: string;
  phase: string;
  primaryAgent: string;
  supportingAgents?: string[];
  dependsOn?: string[];
  tools: string[];
  inputs: string[];
  outputs: string[];
  approval: string;
  metric: string;
  deadline: string;
  stopRule: string;
  mode: string;
}

function answerLabel(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && value !== null && "label" in value) {
    return String((value as { label?: string }).label || "").trim();
  }
  return String(value).trim();
}

export function isConsumerHealthNiche(niche = "", icp = "", extra = ""): boolean {
  const blob = `${niche} ${icp} ${extra}`;
  return (
    /health|nutrition|wellness|medical|lab|diabetes|pcos|thyroid/i.test(blob) &&
    /app|consumer|subscription|trial|user|product/i.test(blob)
  );
}

export function buildConsumerHealthWorkstreams(params: {
  target?: string;
  channelBet?: string;
} = {}): ConsumerHealthWorkstream[] {
  const channel = String(params.channelBet || "Content / SEO").replace(/_/g, " ");
  const target = params.target || "200 paid conversions / month";

  return [
    {
      id: "measurement-foundation",
      sectionIds: ["measurement_optimization"],
      name: "Measurement foundation",
      phase: "Weeks 1–2",
      primaryAgent: "dev",
      supportingAgents: ["maya"],
      dependsOn: [],
      tools: ["GA4", "Google Tag Manager", "Google Search Console"],
      inputs: ["Current analytics access", "Trial and subscription events", "Locked North Star and baseline"],
      outputs: ["Event dictionary", "Validated funnel dashboard", "Attribution QA checklist"],
      approval: "Human approval for data access, consent wording, and event definitions",
      metric: "Event completeness and attributable trial-to-paid conversion",
      deadline: "End of week 2",
      stopRule: "Pause channel decisions when critical events are missing, duplicated, or untrusted",
      mode: "Draft first; publish tracking changes only after approval",
    },
    {
      id: "audience-and-topic-map",
      sectionIds: ["market_analysis", "target_customer"],
      name: "Audience and search-demand map",
      phase: "Weeks 1–2",
      primaryAgent: "maya",
      supportingAgents: ["isha", "veena"],
      dependsOn: ["measurement-foundation"],
      tools: ["Google Search Console", "Public web research", "Brand DNA"],
      inputs: ["Locked audience", "Approved product boundaries", "Existing search data if available"],
      outputs: ["Audience card", "Prioritized topic map", "Search-intent and exclusion list"],
      approval: "Human approval for condition-specific claims and audience language",
      metric: "Qualified trial starts attributed to approved search topics",
      deadline: "End of week 2",
      stopRule: "Deprioritize topics that attract traffic but no qualified trial behavior after two review cycles",
      mode: "Draft research and briefs",
    },
    {
      id: "content-and-seo-production",
      sectionIds: ["distribution_channels"],
      name: "Content and SEO production",
      phase: "Weeks 3–12",
      primaryAgent: "riya",
      supportingAgents: ["maya", "sam"],
      dependsOn: ["audience-and-topic-map", "claims-and-privacy-review"],
      tools: ["CMS or website editor", "Google Search Console", "SEO audit tools"],
      inputs: ["Approved topic briefs", "Brand voice", "Approved claim register", "Internal-link map"],
      outputs: ["Article or landing-page draft", "Metadata and schema draft", "Internal links", "Trial CTA"],
      approval: "Human approval for health claims and final publication",
      metric: `${channel} qualified trial starts and first-value completion`,
      deadline: "First production batch by end of week 4; weekly thereafter",
      stopRule: "Pause a topic cluster when it produces traffic without qualified trials after two review cycles",
      mode: "Draft-safe content creation; human publish approval",
    },
    {
      id: "activation-funnel",
      sectionIds: ["operations_execution"],
      name: "Trial-to-first-value funnel",
      phase: "Weeks 2–6",
      primaryAgent: "neel",
      supportingAgents: ["tara", "dev"],
      dependsOn: ["measurement-foundation"],
      tools: ["Product analytics", "GA4", "Experiment log"],
      inputs: ["Current onboarding flow", "First-value definition", "Drop-off events"],
      outputs: ["Funnel diagnosis", "One experiment brief", "Onboarding copy or flow draft", "Decision log"],
      approval: "Human approval for product changes and user-facing copy",
      metric: "Trial-to-first-value completion rate",
      deadline: "First diagnosis by end of week 3; one experiment per week",
      stopRule: "Do not scale an experiment until event quality is validated and the result beats the prior baseline",
      mode: "Draft experiment; human approval before live change",
    },
    {
      id: "consented-lifecycle",
      sectionIds: ["customer_success"],
      name: "Consented lifecycle conversion",
      phase: "Weeks 3–8",
      primaryAgent: "kiran",
      supportingAgents: ["tara", "sam"],
      dependsOn: ["measurement-foundation", "activation-funnel", "claims-and-privacy-review"],
      tools: ["Email or lifecycle connector", "Product messaging", "Analytics"],
      inputs: ["Consent state", "Trial stage", "First-value event", "Approved message library"],
      outputs: ["Welcome sequence", "First-value reminder", "Upgrade prompt drafts", "Lifecycle experiment log"],
      approval: "Human approval for consent, frequency, claims, and live sends",
      metric: "Consented trial-to-paid conversion and early retention",
      deadline: "First sequence draft by end of week 4",
      stopRule: "Pause messaging when consent is absent, complaints rise, or the sequence does not improve a defined funnel step",
      mode: "Draft-safe messages; human approval before send",
    },
    {
      id: "pricing-learning",
      sectionIds: ["pricing_monetization", "financial_plan"],
      name: "Pricing and packaging learning",
      phase: "Weeks 2–8",
      primaryAgent: "tara",
      supportingAgents: ["dev", "neel"],
      dependsOn: ["measurement-foundation", "activation-funnel"],
      tools: ["Billing or checkout analytics", "Experiment log", "Survey form"],
      inputs: ["Current trial mechanics", "Current price if any", "Upgrade and refund baseline"],
      outputs: ["Packaging hypotheses", "Pricing test brief", "Retention-aware decision memo"],
      approval: "Human approval required for any price, billing, or discount change",
      metric: "Trial-to-paid conversion with refund and early-retention guardrails",
      deadline: "Baseline by end of week 2; first test brief by week 4",
      stopRule: "Do not change price when baseline, sample, or retention data is insufficient",
      mode: "Analysis and draft recommendations only until approved",
    },
    {
      id: "claims-and-privacy-review",
      sectionIds: ["risks_contingencies"],
      name: "Claims, consent, and privacy review",
      phase: "Every week",
      primaryAgent: "priya",
      supportingAgents: ["sam", "dev"],
      dependsOn: [],
      tools: ["Claim register", "Consent log", "Approval queue"],
      inputs: ["All proposed customer-facing copy", "Data-flow description", "Product boundaries"],
      outputs: ["Approved claim register", "Rejected or revised claims", "Consent and data-minimization checklist"],
      approval: "Human compliance approval for sensitive claims or data use",
      metric: "Zero unapproved claims or consent violations shipped",
      deadline: "Before every publication, send, tracking change, or campaign launch",
      stopRule: "Block publication or execution when a claim or data use cannot be substantiated or consented",
      mode: "Always draft-gated",
    },
    {
      id: "weekly-gtm-control-loop",
      sectionIds: ["timeline_roadmap"],
      name: "Weekly GTM control loop",
      phase: "Every Monday",
      primaryAgent: "neel",
      supportingAgents: ["dev", "maya", "riya", "kiran"],
      dependsOn: ["measurement-foundation"],
      tools: ["Performance scorecard", "Orchestration", "Approval queue"],
      inputs: ["North Star target", "Funnel actuals", "Workstream outputs", "Open risks"],
      outputs: ["Variance diagnosis", "Next-best-action queue", "Continue, revise, or pause decisions"],
      approval: "Human approval for pricing, high-cost spend, new markets, or safety-rule changes",
      metric: `${target} progress with weekly trial-to-first-value and retention signals`,
      deadline: "Every Monday before new work is launched",
      stopRule: "Do not add channels while the current funnel has unresolved measurement or trust failures",
      mode: "Draft recommendations; approved actions enter orchestration",
    },
  ];
}

export function withConsumerHealthWorkstreams<T extends { workstreams?: ConsumerHealthWorkstream[] }>(
  ctx: { niche?: string; icp?: string; target?: string; businessSummary?: string },
  answers: Record<string, unknown>,
  doc: T
): T {
  if (Array.isArray(doc.workstreams) && doc.workstreams.length > 0) return doc;
  if (!isConsumerHealthNiche(ctx.niche || "", ctx.icp || "", ctx.businessSummary || "")) return doc;
  const channelBet = answerLabel(answers.channel_bet) || "Content / SEO";
  const target = answerLabel(answers.quantified_target) || ctx.target || "200 paid conversions / month";
  return {
    ...doc,
    workstreams: buildConsumerHealthWorkstreams({ target, channelBet }),
  };
}
