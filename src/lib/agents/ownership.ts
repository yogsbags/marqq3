import type { AgentId, AgentTarget, SkillPack } from "./types";

export interface SectionOwnership {
  sectionId: string;
  primaryAgent: AgentId;
  supportingAgents?: AgentId[];
  openScreen: string | null;
}

/** GTM strategy section → primary agent + app screen. */
export const SECTION_OWNERSHIP: SectionOwnership[] = [
  { sectionId: "executive_summary", primaryAgent: "neel", openScreen: null },
  { sectionId: "market_analysis", primaryAgent: "isha", supportingAgents: ["veena", "priya"], openScreen: "market" },
  { sectionId: "target_customer", primaryAgent: "isha", supportingAgents: ["veena"], openScreen: "audiences" },
  { sectionId: "product_strategy", primaryAgent: "neel", openScreen: "strategy" },
  { sectionId: "positioning_messaging", primaryAgent: "neel", supportingAgents: ["sam"], openScreen: "brand" },
  { sectionId: "pricing_monetization", primaryAgent: "tara", openScreen: "pricing" },
  { sectionId: "distribution_channels", primaryAgent: "zara", supportingAgents: ["dev"], openScreen: "campaigns" },
  { sectionId: "marketing_strategy", primaryAgent: "zara", supportingAgents: ["neel"], openScreen: "campaigns" },
  { sectionId: "sales_strategy", primaryAgent: "arjun", supportingAgents: ["sam"], openScreen: "crm" },
  { sectionId: "customer_success", primaryAgent: "tara", openScreen: "customer360" },
  { sectionId: "launch_plan", primaryAgent: "kiran", supportingAgents: ["riya"], openScreen: "calendar" },
  { sectionId: "operations_execution", primaryAgent: "neel", openScreen: "workflows" },
  { sectionId: "financial_plan", primaryAgent: "dev", openScreen: "reporting" },
  { sectionId: "measurement_optimization", primaryAgent: "dev", supportingAgents: ["maya"], openScreen: "analytics" },
  { sectionId: "risks_contingencies", primaryAgent: "priya", openScreen: "market" },
  { sectionId: "timeline_roadmap", primaryAgent: "neel", openScreen: "orchestration" },
];

export const SECTION_OWNERSHIP_BY_ID = new Map(
  SECTION_OWNERSHIP.map((s) => [s.sectionId, s])
);

/** App screen → owning agent(s). */
export const SCREEN_OWNERSHIP: Record<string, { primary: AgentId; supporting?: AgentId[] }> = {
  market: { primary: "isha", supporting: ["veena", "priya"] },
  audiences: { primary: "isha" },
  strategy: { primary: "neel" },
  brand: { primary: "neel", supporting: ["sam"] },
  pricing: { primary: "tara" },
  landingpages: { primary: "tara", supporting: ["sam"] },
  leadmagnets: { primary: "riya", supporting: ["tara"] },
  campaigns: { primary: "zara", supporting: ["neel"] },
  paid: { primary: "zara", supporting: ["dev"] },
  social: { primary: "kiran", supporting: ["sam"] },
  creative: { primary: "riya", supporting: ["sam"] },
  analytics: { primary: "dev", supporting: ["zara"] },
  seo: { primary: "maya" },
  reporting: { primary: "dev" },
  crm: { primary: "arjun", supporting: ["tara"] },
  customer360: { primary: "tara", supporting: ["arjun"] },
  outreach: { primary: "arjun", supporting: ["sam"] },
  voicebot: { primary: "sam", supporting: ["arjun"] },
  calendar: { primary: "kiran", supporting: ["riya"] },
  content: { primary: "riya", supporting: ["maya", "sam"] },
  experiments: { primary: "tara", supporting: ["dev"] },
  referrals: { primary: "kiran" },
  workflows: { primary: "neel" },
  orchestration: { primary: "neel" },
  evaluations: { primary: "neel", supporting: ["dev"] },
  tasks: { primary: "neel" },
  knowledge: { primary: "veena" },
  files: { primary: "veena" },
  integrations: { primary: "veena" },
  ideas: { primary: "neel" },
  agents: { primary: "neel" },
  chat: { primary: "neel" },
  gtm: { primary: "neel" },
  gtmwizard: { primary: "neel" },
  command: { primary: "dev", supporting: ["neel"] },
  approvals: { primary: "neel" },
};

/** AgentTarget → skill pack (Marqq2 marketingSkillMap subset). */
export const AGENT_TARGET_SKILLS: Record<AgentTarget, SkillPack> = {
  company_intel_icp: {
    agentName: "neel",
    marketingSkills: ["icp-definer", "persona-definer", "product-marketing-context"],
    requiredConnectors: [],
    optionalConnectors: ["hubspot", "apollo", "ga4"],
  },
  company_intel_competitors: {
    agentName: "isha",
    marketingSkills: ["competitor-alternatives"],
    requiredConnectors: [],
    optionalConnectors: ["semrush", "ahrefs", "gsc"],
  },
  company_intel_marketing_strategy: {
    agentName: "neel",
    marketingSkills: [
      "gtm-action-thinker",
      "marketing-ideas",
      "launch-strategy",
      "icp-definer",
      "product-marketing-context",
    ],
    requiredConnectors: [],
    optionalConnectors: ["ga4", "gsc", "hubspot"],
  },
  company_intel_sales_enablement: {
    agentName: "sam",
    marketingSkills: ["copywriting", "cold-email", "product-marketing-context"],
    requiredConnectors: [],
    optionalConnectors: ["hubspot"],
  },
  company_intel_pricing: {
    agentName: "tara",
    marketingSkills: ["pricing-strategy", "offer-definer", "page-cro"],
    requiredConnectors: [],
    optionalConnectors: ["ga4"],
  },
  company_intel_content_strategy: {
    agentName: "riya",
    marketingSkills: ["content-strategy", "copywriting", "seo-audit", "ai-seo"],
    requiredConnectors: [],
    optionalConnectors: ["gsc"],
  },
  company_intel_seo: {
    agentName: "maya",
    marketingSkills: ["ai-seo", "seo-audit", "content-strategy"],
    requiredConnectors: [],
    optionalConnectors: ["gsc", "semrush", "ahrefs"],
  },
  company_intel_channel_strategy: {
    agentName: "zara",
    marketingSkills: ["paid-ads", "marketing-ideas", "launch-strategy"],
    requiredConnectors: [],
    optionalConnectors: ["meta_ads", "google_ads", "ga4"],
  },
  company_intel_social_calendar: {
    agentName: "kiran",
    marketingSkills: ["social-content", "community-marketing"],
    requiredConnectors: [],
    optionalConnectors: ["linkedin", "instagram"],
  },
  company_intel_lead_magnets: {
    agentName: "riya",
    marketingSkills: ["lead-magnets", "copywriting", "page-cro"],
    requiredConnectors: [],
    optionalConnectors: ["ga4"],
  },
  company_intel_marketing_ideas: {
    agentName: "neel",
    marketingSkills: ["marketing-ideas"],
    requiredConnectors: [],
    optionalConnectors: ["ga4", "gsc", "meta_ads", "google_ads"],
  },
  lead_intelligence: {
    agentName: "arjun",
    marketingSkills: ["icp-definer", "cold-email", "revops"],
    requiredConnectors: ["apollo", "hunter"],
    optionalConnectors: ["hubspot", "salesforce"],
  },
  budget_optimization: {
    agentName: "dev",
    marketingSkills: ["paid-ads", "analytics-tracking", "ab-test-setup"],
    requiredConnectors: ["google_ads", "meta_ads", "ga4"],
    optionalConnectors: [],
  },
  performance_scorecard: {
    agentName: "dev",
    marketingSkills: ["analytics-tracking", "revops", "ab-test-setup"],
    requiredConnectors: ["ga4", "gsc"],
    optionalConnectors: ["google_ads", "meta_ads"],
  },
  user_engagement: {
    agentName: "kiran",
    marketingSkills: ["onboarding-cro", "churn-prevention", "email-sequence"],
    requiredConnectors: [],
    optionalConnectors: ["ga4", "klaviyo"],
  },
};

/** Screen / task key → AgentTarget. */
export const SCREEN_TO_AGENT_TARGET: Record<string, AgentTarget> = {
  ideas: "company_intel_marketing_ideas",
  audiences: "company_intel_icp",
  market: "company_intel_competitors",
  strategy: "company_intel_marketing_strategy",
  brand: "company_intel_marketing_strategy",
  pricing: "company_intel_pricing",
  landingpages: "company_intel_pricing",
  leadmagnets: "company_intel_lead_magnets",
  campaigns: "company_intel_channel_strategy",
  paid: "company_intel_channel_strategy",
  social: "company_intel_social_calendar",
  creative: "company_intel_content_strategy",
  content: "company_intel_content_strategy",
  calendar: "company_intel_social_calendar",
  outreach: "lead_intelligence",
  crm: "lead_intelligence",
  customer360: "user_engagement",
  analytics: "performance_scorecard",
  seo: "company_intel_seo",
  reporting: "budget_optimization",
  experiments: "user_engagement",
  voicebot: "lead_intelligence",
};

export function ownershipForSection(sectionId: string): SectionOwnership | null {
  return SECTION_OWNERSHIP_BY_ID.get(sectionId) || null;
}

export function ownershipForScreen(screenId: string) {
  return SCREEN_OWNERSHIP[screenId] || null;
}

export function skillsForAgentTarget(target: AgentTarget): SkillPack {
  return (
    AGENT_TARGET_SKILLS[target] || {
      agentName: "neel",
      marketingSkills: ["marketing-ideas"],
      requiredConnectors: [],
      optionalConnectors: [],
    }
  );
}
