/**
 * Server-side agent catalog + plan (mirrors src/lib/agents).
 * Full roster/control-loop bootstrap runs client-side into sessionStorage;
 * this API serves catalog shape + planAgentTask for parity.
 */

export const AGENT_CATALOG = [
  { id: 'veena', name: 'Veena', role: 'Company Intel', type: 'Account research', tier: 'core', avatarColor: '#3d8bff', purpose: 'Builds company profiles from market, competitor, and category signals.', tools: ['Web crawler', 'Knowledge graph'], dataAccess: ['Public web', 'Competitor list'], openScreen: 'market', capabilities: ['context', 'account_intelligence'] },
  { id: 'isha', name: 'Isha', role: 'Market Research', type: 'ICP & audience', tier: 'core', avatarColor: '#e0b13a', purpose: 'Maps ICP and audience segments from market and intent signals.', tools: ['Segmentation model'], dataAccess: ['Market data'], openScreen: 'audiences', capabilities: ['icp', 'audience'] },
  { id: 'neel', name: 'Neel', role: 'Strategy', type: 'Positioning & GTM', tier: 'core', avatarColor: '#5a6ee0', purpose: 'Orchestrates GTM toward the North Star; drafts positioning and strategy.', tools: ['Strategy composer'], dataAccess: ['GTM workspace'], openScreen: 'strategy', capabilities: ['gtm_orchestrator', 'north_star'] },
  { id: 'zara', name: 'Zara', role: 'Channels', type: 'Campaign strategy', tier: 'core', avatarColor: '#4aa8a3', purpose: 'Allocates channel effort and monitors campaign pacing against goals.', tools: ['Pacing model'], dataAccess: ['Ad accounts'], openScreen: 'campaigns', capabilities: ['channel_strategy'] },
  { id: 'dev', name: 'Dev', role: 'Performance', type: 'Paid media ROI', tier: 'core', avatarColor: '#ff6a00', purpose: 'Measures North Star and metric-tree leading indicators; optimizes spend.', tools: ['Budget planner'], dataAccess: ['Campaign data'], openScreen: 'analytics', capabilities: ['analytics', 'paid_media'] },
  { id: 'priya', name: 'Priya', role: 'Intel', type: 'Competitive watch', tier: 'core', avatarColor: '#e0575a', purpose: 'Tracks competitor moves and trust/compliance signals.', tools: ['Web crawler'], dataAccess: ['Public web'], openScreen: 'market', capabilities: ['competitive_watch'] },
  { id: 'tara', name: 'Tara', role: 'CRO & Offers', type: 'Conversion design', tier: 'specialist', avatarColor: '#c74d8f', purpose: 'Audits offer and page friction; designs conversion and pricing motions.', tools: ['Funnel analyzer'], dataAccess: ['Analytics'], openScreen: null, capabilities: ['conversion', 'pricing'] },
  { id: 'sam', name: 'Sam', role: 'Copy', type: 'Messaging & voice', tier: 'specialist', avatarColor: '#39a6a3', purpose: 'Owns messaging, outreach copy, and sales enablement voice.', tools: ['Brand voice model'], dataAccess: ['Brand center'], openScreen: 'brand', capabilities: ['messaging'] },
  { id: 'kiran', name: 'Kiran', role: 'Social', type: 'Content calendar', tier: 'specialist', avatarColor: '#8a5ce0', purpose: 'Builds social calendars and demand/lifecycle motions.', tools: ['Calendar planner'], dataAccess: ['Social accounts'], openScreen: 'calendar', capabilities: ['social'] },
  { id: 'maya', name: 'Maya', role: 'SEO', type: 'Search intelligence', tier: 'specialist', avatarColor: '#c74dd1', purpose: 'Tracks search rankings and AI-answer / GEO visibility.', tools: ['Rank tracker', 'GEO citation scanner'], dataAccess: ['Search console', 'Public web'], openScreen: 'seo', capabilities: ['seo', 'llmo', 'geo'] },
  { id: 'riya', name: 'Riya', role: 'Content', type: 'Editorial pipeline', tier: 'specialist', avatarColor: '#38b06b', purpose: 'Runs the editorial pipeline across blog, social, and email.', tools: ['Brand voice model'], dataAccess: ['Brand center'], openScreen: 'content', capabilities: ['editorial'] },
  { id: 'arjun', name: 'Arjun', role: 'Leads', type: 'B2B prospecting', tier: 'specialist', avatarColor: '#d13a5c', purpose: 'Prospects ICP accounts and drafts outbound sequences.', tools: ['Sequencer'], dataAccess: ['CRM'], openScreen: 'outreach', capabilities: ['prospecting', 'abm'] },
];

const TARGET_SKILLS = {
  company_intel_marketing_ideas: { agentName: 'neel', marketingSkills: ['marketing-ideas'], requiredConnectors: [], optionalConnectors: ['ga4', 'gsc'] },
  company_intel_icp: { agentName: 'neel', marketingSkills: ['icp-definer', 'persona-definer'], requiredConnectors: [], optionalConnectors: [] },
  company_intel_competitors: { agentName: 'isha', marketingSkills: ['competitor-alternatives'], requiredConnectors: [], optionalConnectors: [] },
  company_intel_marketing_strategy: { agentName: 'neel', marketingSkills: ['gtm-action-thinker', 'marketing-ideas'], requiredConnectors: [], optionalConnectors: [] },
  company_intel_channel_strategy: { agentName: 'zara', marketingSkills: ['paid-ads', 'marketing-ideas'], requiredConnectors: [], optionalConnectors: [] },
  company_intel_content_strategy: { agentName: 'riya', marketingSkills: ['content-strategy', 'copywriting', 'ai-seo'], requiredConnectors: [], optionalConnectors: [] },
  company_intel_seo: { agentName: 'maya', marketingSkills: ['ai-seo', 'seo-audit', 'content-strategy'], requiredConnectors: [], optionalConnectors: ['gsc'] },
  company_intel_social_calendar: {
    agentName: 'kiran',
    marketingSkills: ['social-content'],
    requiredConnectors: [],
    optionalConnectors: ['linkedin', 'instagram', 'facebook', 'twitter', 'youtube'],
  },
  company_intel_pricing: { agentName: 'tara', marketingSkills: ['pricing-strategy', 'offer-definer'], requiredConnectors: [], optionalConnectors: [] },
  company_intel_sales_enablement: { agentName: 'sam', marketingSkills: ['copywriting', 'cold-email'], requiredConnectors: [], optionalConnectors: [] },
  company_intel_lead_magnets: { agentName: 'riya', marketingSkills: ['lead-magnets'], requiredConnectors: [], optionalConnectors: [] },
  lead_intelligence: { agentName: 'arjun', marketingSkills: ['icp-definer', 'cold-email'], requiredConnectors: ['apollo'], optionalConnectors: [] },
  budget_optimization: { agentName: 'dev', marketingSkills: ['paid-ads', 'analytics-tracking'], requiredConnectors: ['ga4'], optionalConnectors: [] },
  performance_scorecard: { agentName: 'dev', marketingSkills: ['analytics-tracking', 'revops'], requiredConnectors: ['ga4'], optionalConnectors: [] },
  user_engagement: { agentName: 'kiran', marketingSkills: ['onboarding-cro', 'email-sequence'], requiredConnectors: [], optionalConnectors: [] },
};

const SCREEN_TO_TARGET = {
  ideas: 'company_intel_marketing_ideas',
  audiences: 'company_intel_icp',
  market: 'company_intel_competitors',
  strategy: 'company_intel_marketing_strategy',
  brand: 'company_intel_marketing_strategy',
  campaigns: 'company_intel_channel_strategy',
  content: 'company_intel_content_strategy',
  calendar: 'company_intel_social_calendar',
  outreach: 'lead_intelligence',
  crm: 'lead_intelligence',
  analytics: 'performance_scorecard',
  reporting: 'budget_optimization',
  seo: 'company_intel_seo',
};

export const SECTION_PRIMARY = {
  executive_summary: 'neel',
  market_analysis: 'isha',
  target_customer: 'isha',
  product_strategy: 'neel',
  positioning_messaging: 'neel',
  pricing_monetization: 'tara',
  distribution_channels: 'zara',
  marketing_strategy: 'zara',
  sales_strategy: 'arjun',
  customer_success: 'tara',
  launch_plan: 'kiran',
  operations_execution: 'neel',
  financial_plan: 'dev',
  measurement_optimization: 'dev',
  risks_contingencies: 'priya',
  timeline_roadmap: 'neel',
};

function displayStatus(tier) {
  return tier === 'core' ? 'Running' : 'Waiting';
}

/** Default UI agents (core activated, specialists waiting) until client OS exists. */
export function defaultUiAgents() {
  return AGENT_CATALOG.map((cat) => ({
    id: cat.id,
    name: cat.name,
    role: cat.role,
    type: cat.type,
    avatarColor: cat.avatarColor,
    status: displayStatus(cat.tier),
    lastAction: cat.purpose,
    successRate: '—',
    owner: 'Marqq',
    purpose: cat.purpose,
    tools: cat.tools,
    dataAccess: cat.dataAccess,
    openScreen: cat.openScreen,
    tier: cat.tier,
    rosterStatus: cat.tier === 'core' ? 'activated' : 'dormant',
    mission: cat.purpose,
    metric: null,
    target: null,
    review_date: null,
    capabilities: cat.capabilities,
  }));
}

export function planAgentTask({ target, sectionId, screenId, goalSystem, roster } = {}) {
  let resolvedTarget = target || null;
  let agentId = 'neel';

  if (!resolvedTarget && screenId && SCREEN_TO_TARGET[screenId]) {
    resolvedTarget = SCREEN_TO_TARGET[screenId];
  }
  if (!resolvedTarget && sectionId && SECTION_PRIMARY[sectionId]) {
    agentId = SECTION_PRIMARY[sectionId];
  }

  const pack = resolvedTarget
    ? TARGET_SKILLS[resolvedTarget] || TARGET_SKILLS.company_intel_marketing_ideas
    : { agentName: agentId, marketingSkills: [], requiredConnectors: [], optionalConnectors: [] };

  agentId = pack.agentName || agentId;
  const catalog = AGENT_CATALOG.find((a) => a.id === agentId) || AGENT_CATALOG.find((a) => a.id === 'neel');
  const rosterRow = Array.isArray(roster?.agents)
    ? roster.agents.find((a) => a.id === agentId)
    : null;

  const nsm = goalSystem?.north_star_metric || null;
  const quantified = goalSystem?.quantified_target || null;
  const goalBrief = [
    nsm ? `North Star: ${nsm}` : null,
    quantified ? `Target: ${quantified}` : null,
    rosterRow?.mission ? `Mission: ${rosterRow.mission}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  // Honest, deterministic confidence proxy — no fabricated self-grading.
  // 'low' when the task fell back to a generic agent guess (no skill pack
  // matched) or genuinely needs a connector this flow can't verify is live;
  // 'high' only when a specific skill pack matched with nothing missing.
  // This is what threads through to draft_corrections.confidence and drives
  // the report card's escalation rate — see agentScheduler.js#executeAgentRun.
  const confidence = !resolvedTarget
    ? 'low'
    : (pack.requiredConnectors || []).length > 0
      ? 'low'
      : (pack.marketingSkills || []).length > 0
        ? 'high'
        : 'medium';

  return {
    agentName: agentId,
    agentDisplayName: catalog?.name || agentId,
    mission: rosterRow?.mission || catalog?.purpose || null,
    metric: rosterRow?.metric || nsm || null,
    status: rosterRow?.status || (catalog?.tier === 'core' ? 'activated' : 'dormant'),
    skills: pack.marketingSkills || [],
    requiredConnectors: pack.requiredConnectors || [],
    optionalConnectors: pack.optionalConnectors || [],
    goalBrief,
    sectionTargetsRelevant: Array.isArray(goalSystem?.sectionTargets)
      ? goalSystem.sectionTargets.filter((t) => !sectionId || t.sectionId === sectionId)
      : [],
    requiresHumanApproval: Boolean((pack.requiredConnectors || []).length),
    confidence,
    target: resolvedTarget,
    sectionId: sectionId || null,
    screenId: screenId || null,
  };
}
