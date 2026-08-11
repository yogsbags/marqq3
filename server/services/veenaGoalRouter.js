/**
 * Veena's user-goal routing layer.
 *
 * This is deliberately deterministic at the boundary: the chat model can
 * answer normally, while long-running/action requests get a stable goal id
 * before entering the durable Agent OS deployment queue.
 */

const GOALS = [
  // Acquire
  { id: 'find-leads', title: 'Find qualified leads', category: 'Acquire', agentName: 'arjun', target: 'lead_intelligence', sectionId: 'sales_strategy', keywords: ['find leads', 'qualified leads', 'prospect list', 'b2b leads', 'lead database', 'prospecting'] },
  { id: 'enrich-leads', title: 'Enrich existing leads', category: 'Acquire', agentName: 'arjun', target: 'lead_intelligence', sectionId: 'sales_strategy', keywords: ['enrich leads', 'lead enrichment', 'add emails', 'missing emails', 'fill in lead data'] },
  { id: 'build-sequences', title: 'Build outreach sequences', category: 'Acquire', agentName: 'sam', target: 'company_intel_sales_enablement', sectionId: 'sales_strategy', keywords: ['outreach sequence', 'outreach email', 'cold outreach', 'drip campaign', 'build sequences'] },
  { id: 'define-audiences', title: 'Define audiences', category: 'Acquire', agentName: 'isha', target: 'company_intel_icp', sectionId: 'target_customer', keywords: ['define audiences', 'audience segments', 'segment customers', 'audience targeting', 'customer segments'] },
  { id: 'create-magnets', title: 'Create lead magnets', category: 'Acquire', agentName: 'riya', target: 'company_intel_lead_magnets', sectionId: 'marketing_strategy', keywords: ['lead magnet', 'lead magnets', 'opt-in asset', 'ebook', 'free resource', 'webinar asset'] },
  { id: 'referral-program', title: 'Launch a referral loop', category: 'Acquire', agentName: 'arjun', target: null, sectionId: 'distribution_channels', keywords: ['referral program', 'referral rewards', 'referral loop', 'word of mouth'] },

  // Advertise
  { id: 'run-paid-ads', title: 'Run paid ads', category: 'Advertise', agentName: 'zara', target: 'company_intel_channel_strategy', sectionId: 'marketing_strategy', keywords: ['run ads', 'paid ads', 'google ads', 'meta ads', 'ad campaign', 'launch campaign'] },
  { id: 'generate-creatives', title: 'Generate ad creatives', category: 'Advertise', agentName: 'riya', target: 'company_intel_content_strategy', sectionId: 'marketing_strategy', keywords: ['ad creative', 'ad creatives', 'ad variations', 'banner copy', 'ppc ad'] },
  { id: 'optimize-roas', title: 'Optimize ROAS', category: 'Advertise', agentName: 'dev', target: 'budget_optimization', sectionId: 'measurement_optimization', keywords: ['optimize roas', 'ad spend', 'wasted spend', 'budget optimization', 'improve return on ad spend'] },

  // Create
  { id: 'produce-content', title: 'Produce brand content', category: 'Create', agentName: 'riya', target: 'company_intel_content_strategy', sectionId: 'marketing_strategy', keywords: ['write blog', 'blog post', 'article', 'produce content', 'content brief', 'create content'] },
  { id: 'run-social', title: 'Run social media', category: 'Create', agentName: 'zara', target: 'company_intel_channel_strategy', sectionId: 'distribution_channels', keywords: ['social media', 'social campaign', 'social strategy', 'instagram', 'linkedin post', 'tweet'] },
  { id: 'social-calendar', title: 'Plan a social calendar', category: 'Create', agentName: 'kiran', target: 'company_intel_social_calendar', sectionId: 'launch_plan', keywords: ['social calendar', 'content calendar', 'posting schedule', 'editorial calendar'] },
  { id: 'email-sequences', title: 'Write email sequences', category: 'Create', agentName: 'sam', target: 'company_intel_sales_enablement', sectionId: 'marketing_strategy', keywords: ['email sequence', 'email flow', 'email automation', 'onboarding email', 'newsletter'] },
  { id: 'seo-visibility', title: 'Improve organic visibility', category: 'Create', agentName: 'maya', target: 'company_intel_seo', sectionId: 'marketing_strategy', keywords: ['seo', 'search rankings', 'organic visibility', 'keyword rankings', 'llmo', 'ai search', 'geo visibility'] },

  // Convert
  { id: 'increase-conversion', title: 'Increase conversion rate', category: 'Convert', agentName: 'tara', target: null, sectionId: 'customer_success', keywords: ['increase conversions', 'conversion rate', 'improve conversions', 'cro', 'cro audit', 'funnel drop-off'] },
  { id: 'ab-testing', title: 'Test new variants', category: 'Convert', agentName: 'tara', target: null, sectionId: 'customer_success', keywords: ['a/b test', 'ab test', 'split test', 'test variants', 'experiment'] },
  { id: 'landing-pages', title: 'Build landing pages', category: 'Convert', agentName: 'riya', target: 'company_intel_content_strategy', sectionId: 'marketing_strategy', keywords: ['landing page', 'sales page', 'squeeze page'] },
  { id: 'strengthen-offer', title: 'Strengthen the offer', category: 'Convert', agentName: 'tara', target: 'company_intel_pricing', sectionId: 'pricing_monetization', keywords: ['strengthen offer', 'improve offer', 'pricing', 'offer refinement', 'packaging'] },
  { id: 'sharpen-messaging', title: 'Sharpen messaging', category: 'Convert', agentName: 'sam', target: 'company_intel_sales_enablement', sectionId: 'positioning_messaging', keywords: ['messaging', 'messaging framework', 'brand voice', 'positioning statement', 'sharpen copy'] },

  // Retain
  { id: 'reduce-churn', title: 'Reduce churn', category: 'Retain', agentName: 'kiran', target: 'user_engagement', sectionId: 'customer_success', keywords: ['reduce churn', 'churn', 'at-risk customers', 'customer retention', 'win back'] },
  { id: 'lifecycle-engagement', title: 'Improve lifecycle engagement', category: 'Retain', agentName: 'kiran', target: 'user_engagement', sectionId: 'customer_success', keywords: ['lifecycle engagement', 'customer engagement', 'engagement automation', 'repeat usage', 'activation'] },
  { id: 'understand-customer', title: 'Understand customer behavior', category: 'Retain', agentName: 'dev', target: null, sectionId: 'customer_success', keywords: ['customer behavior', 'customer analytics', 'customer journey', 'retention drivers'] },

  // Analyze
  { id: 'measure-performance', title: 'Measure marketing performance', category: 'Analyze', agentName: 'dev', target: 'performance_scorecard', sectionId: 'measurement_optimization', keywords: ['measure performance', 'marketing metrics', 'what is working', 'kpis', 'scorecard'] },
  { id: 'marketing-audit', title: 'Audit overall marketing', category: 'Analyze', agentName: 'dev', target: 'performance_scorecard', sectionId: 'measurement_optimization', keywords: ['marketing audit', 'full audit', 'stack review', 'tech stack audit'] },
  { id: 'channel-health', title: 'Check channel health', category: 'Analyze', agentName: 'dev', target: 'performance_scorecard', sectionId: 'measurement_optimization', keywords: ['channel health', 'channel performance', 'are my channels healthy'] },

  // Plan / strategy
  { id: 'market-research', title: 'Research the market', category: 'Plan', agentName: 'isha', target: 'company_intel_competitors', sectionId: 'market_analysis', keywords: ['market research', 'understand market', 'market analysis', 'market opportunities'] },
  { id: 'market-signals', title: 'Track competitive signals', category: 'Plan', agentName: 'priya', target: 'company_intel_competitors', sectionId: 'market_analysis', keywords: ['market signals', 'competitive intelligence', 'track competitors', 'competitor moves', 'competitors are doing'] },
  { id: 'understand-market', title: 'Understand the market', category: 'Plan', agentName: 'isha', target: 'company_intel_competitors', sectionId: 'market_analysis', keywords: ['category research', 'buyer signals', 'market demand'] },
  { id: 'positioning', title: 'Improve positioning', category: 'Plan', agentName: 'neel', target: 'company_intel_marketing_strategy', sectionId: 'positioning_messaging', keywords: ['positioning', 'brand positioning', 'market positioning', 'go-to-market strategy', 'gtm strategy'] },
  { id: 'launch-planning', title: 'Plan a product launch', category: 'Plan', agentName: 'zara', target: 'company_intel_channel_strategy', sectionId: 'launch_plan', keywords: ['product launch', 'launch strategy', 'launch planning', 'go to market launch'] },
  { id: 'sales-enablement', title: 'Create sales enablement', category: 'Plan', agentName: 'sam', target: 'company_intel_sales_enablement', sectionId: 'sales_strategy', keywords: ['sales enablement', 'battlecard', 'sales deck', 'sales resources'] },
  { id: 'revenue-ops', title: 'Improve revenue operations', category: 'Plan', agentName: 'arjun', target: null, sectionId: 'sales_strategy', keywords: ['revenue ops', 'revenue operations', 'lead routing', 'crm hygiene', 'sales handoff'] },
];

const GOAL_BY_ID = new Map(GOALS.map((goal) => [goal.id, Object.freeze({ ...goal, keywords: [...goal.keywords] })]));

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9+/#.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreGoal(text, goal) {
  let score = 0;
  for (const keyword of goal.keywords) {
    const normalizedKeyword = normalize(keyword);
    if (!normalizedKeyword) continue;
    if (text.includes(normalizedKeyword)) score += normalizedKeyword.includes(' ') ? 4 : 2;
  }
  return score;
}

export function listVeenaGoals() {
  return GOALS.map((goal) => ({ ...goal, keywords: [...goal.keywords] }));
}

export function getVeenaGoal(goalId) {
  return GOAL_BY_ID.get(String(goalId || '').trim()) || null;
}

/**
 * Route an action-oriented request. A low-confidence result is returned as
 * null so ordinary explanatory chat continues through the normal chat model.
 */
export function routeVeenaGoal(message, { channel = '' } = {}) {
  const text = normalize(message);
  if (!text) return { matched: false, goal: null, confidence: 0, reason: 'empty_request' };

  const ranked = GOALS
    .map((goal) => ({ goal, score: scoreGoal(text, goal) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < 2) {
    return { matched: false, goal: null, confidence: 0, reason: 'no_goal_match', channel };
  }

  const confidence = Math.min(0.99, 0.58 + best.score * 0.08 + (best.score > (second?.score || 0) ? 0.08 : 0));
  if (confidence < 0.7) {
    return { matched: false, goal: null, confidence, reason: 'ambiguous_goal', channel };
  }
  return {
    matched: true,
    goal: { ...best.goal, keywords: [...best.goal.keywords] },
    confidence: Number(confidence.toFixed(2)),
    reason: 'keyword_match',
    channel,
  };
}
