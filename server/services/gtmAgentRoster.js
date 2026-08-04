/**
 * Adaptive agent roster — bottleneck-aware re-prioritization after control-loop diagnose.
 * Mirrors Marqq2 gtmAgentRoster + Marqq-test src/lib/agents/roster.ts.
 */

import { AGENT_CATALOG } from './agentOs.js';
import { normalizeGoalSystem } from '../lib/gtmNorthStar.js';

const CORE_IDS = new Set(['veena', 'isha', 'neel', 'zara', 'dev', 'priya']);

const ARCHETYPE_CAPABILITY_WEIGHTS = {
  b2b_services: {
    prospecting: 1.2,
    abm: 1.1,
    messaging: 1,
    gtm_orchestrator: 1,
    channel_strategy: 0.9,
    analytics: 0.8,
  },
  consumer_product: {
    conversion: 1.2,
    social: 1.1,
    editorial: 1,
    seo: 0.9,
    paid_media: 1,
    analytics: 1,
  },
  marketplace: {
    audience: 1.1,
    channel_strategy: 1,
    social: 0.9,
    analytics: 1,
    prospecting: 0.8,
  },
  platform_os: {
    gtm_orchestrator: 1.2,
    north_star: 1.1,
    analytics: 1,
    messaging: 0.9,
  },
  other: {
    gtm_orchestrator: 1,
    analytics: 1,
    channel_strategy: 0.9,
    messaging: 0.9,
  },
};

const BOTTLENECK_CAP_MAP = {
  pipeline: ['prospecting', 'abm', 'messaging'],
  outreach: ['prospecting', 'messaging'],
  response: ['messaging', 'prospecting'],
  meeting: ['prospecting', 'abm'],
  proposal: ['messaging', 'gtm_orchestrator'],
  conversion: ['conversion', 'pricing', 'paid_media'],
  signup: ['conversion', 'social', 'paid_media'],
  activation: ['conversion', 'editorial'],
  retention: ['conversion', 'editorial'],
  traffic: ['seo', 'social', 'paid_media', 'editorial'],
  content: ['editorial', 'seo', 'social'],
  spend: ['paid_media', 'analytics', 'channel_strategy'],
  cac: ['paid_media', 'analytics'],
  seo: ['seo', 'editorial'],
  social: ['social', 'editorial'],
  competitive: ['competitive_watch', 'messaging'],
  brand: ['messaging', 'social'],
  north: ['gtm_orchestrator', 'north_star', 'analytics'],
};

function resolveArchetypeKey(g) {
  const a = String(g.business_archetype || '').toLowerCase();
  if (/b2b|service|consult/.test(a)) return 'b2b_services';
  if (/consumer|product_loop|app|b2c/.test(a)) return 'consumer_product';
  if (/marketplace|two.?sided/.test(a)) return 'marketplace';
  if (/platform|os/.test(a)) return 'platform_os';
  return 'other';
}

function bottleneckCapabilities(controlLoop) {
  const stage = String(
    controlLoop?.lastDiagnosis?.bottleneck_stage ||
      controlLoop?.bottleneck_stage ||
      ''
  ).toLowerCase();
  if (!stage) return new Set();
  const caps = new Set();
  for (const [key, list] of Object.entries(BOTTLENECK_CAP_MAP)) {
    if (stage.includes(key)) list.forEach((c) => caps.add(c));
  }
  if (!caps.size) {
    ['gtm_orchestrator', 'analytics', 'channel_strategy'].forEach((c) => caps.add(c));
  }
  return caps;
}

function capabilityScore(agent, weights, bottleneckCaps) {
  let score = 0;
  for (const cap of agent.capabilities || []) {
    score += weights[cap] || 0.2;
    if (bottleneckCaps.has(cap)) score += 0.55;
  }
  return score;
}

export function buildAgentRoster({ goalSystem, controlLoop, previousRoster } = {}) {
  const g = normalizeGoalSystem(goalSystem || {});
  const loop = controlLoop || null;
  const archetypeKey = resolveArchetypeKey(g);
  const weights = {
    ...(ARCHETYPE_CAPABILITY_WEIGHTS[archetypeKey] || ARCHETYPE_CAPABILITY_WEIGHTS.other),
  };
  const bottleneckCaps = bottleneckCapabilities(loop);
  const prevById = new Map(
    (Array.isArray(previousRoster?.agents) ? previousRoster.agents : []).map((a) => [a.id, a])
  );

  const agents = AGENT_CATALOG.map((agent) => {
    const score = capabilityScore(agent, weights, bottleneckCaps);
    const isCore = CORE_IDS.has(agent.id);
    let status = 'dormant';
    let reason = 'Not required for current archetype/bottleneck';

    if (isCore) {
      status = 'activated';
      reason = 'Stable core agent for every GTM module';
      if (bottleneckCaps.size && (agent.capabilities || []).some((c) => bottleneckCaps.has(c))) {
        status = 'high_priority';
        reason = `Elevated: bottleneck touches ${[...bottleneckCaps].slice(0, 3).join(', ')}`;
      }
    } else if (score >= 0.85) {
      status = 'high_priority';
      reason = `High fit for ${archetypeKey}${bottleneckCaps.size ? ' + active bottleneck' : ''}`;
    } else if (score >= 0.45) {
      status = 'activated';
      reason = `Specialist activated for ${archetypeKey}`;
    } else if (score > 0.15) {
      status = 'deprioritized';
      reason = 'Secondary for this archetype; available if bottleneck shifts';
    }

    const prev = prevById.get(agent.id);
    if (prev?.status === 'retired' && prev?.retiredBy === 'human') {
      status = 'retired';
      reason = prev.reason || 'Retired by human';
    }

    const days = status === 'high_priority' ? 7 : status === 'activated' ? 14 : 28;
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      tier: agent.tier,
      capabilities: agent.capabilities,
      status,
      score: Math.round(score * 100) / 100,
      reason,
      mission: agent.purpose,
      metric: g.north_star_metric || null,
      target: g.quantified_target || null,
      review_date: new Date(Date.now() + days * 86400000).toISOString().slice(0, 10),
      specialist_label: null,
      retiredBy: status === 'retired' ? 'human' : null,
    };
  });

  agents.sort((a, b) => {
    const order = { high_priority: 0, activated: 1, deprioritized: 2, dormant: 3, retired: 4 };
    const d = (order[a.status] ?? 9) - (order[b.status] ?? 9);
    if (d !== 0) return d;
    return (b.score || 0) - (a.score || 0);
  });

  const bottleneck =
    loop?.lastDiagnosis?.bottleneck_stage || loop?.bottleneck_stage || null;

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: 'rules',
    archetypeKey,
    bottleneck_stage: bottleneck,
    rationale: bottleneck
      ? `Priorities shifted toward bottleneck: ${bottleneck}`
      : `Priorities for archetype ${archetypeKey}`,
    agents,
    highPriority: agents.filter((a) => a.status === 'high_priority').map((a) => a.id),
    activated: agents
      .filter((a) => a.status === 'activated' || a.status === 'high_priority')
      .map((a) => a.id),
    dormant: agents.filter((a) => a.status === 'dormant').map((a) => a.id),
  };
}

export function reprioritizeAgentRoster(previousRoster, { goalSystem, controlLoop } = {}) {
  return buildAgentRoster({
    goalSystem,
    controlLoop,
    previousRoster: previousRoster || null,
  });
}

export async function reprioritizeAgentRosterAsync(
  _groq,
  previousRoster,
  { goalSystem, controlLoop } = {}
) {
  return reprioritizeAgentRoster(previousRoster, { goalSystem, controlLoop });
}
