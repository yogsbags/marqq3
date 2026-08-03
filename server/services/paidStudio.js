/**
 * Paid Studio (slice 1) — Zara draft Meta campaign
 * Goals/context → Plan → Creative draft → Approve
 * Local draft only — never creates ACTIVE Meta campaigns or spend.
 * Skills: paid-ads, ads-create, ad-creative, copywriting
 */

import { randomUUID } from 'node:crypto';
import { withGroqReasoning, resolveGroqModel } from './groqReasoning.js';
import { buildPlaybookFromPack } from './gtmStrategySkills.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
/** @type {Map<string, object>} */
const runsById = new Map();

const PLAN_PACK = {
  primary: ['paid-ads', 'launch-strategy'],
  secondary: ['marketing-ideas', 'ad-creative'],
};

const CREATIVE_PACK = {
  primary: ['ad-creative', 'copywriting'],
  secondary: ['paid-ads'],
};

const NOURIVA_DEFAULTS = {
  companyName: 'Nouriva AI',
  website: 'https://nouriva.tech',
  northStarMetric: 'Activated Paid Users',
  northStarDefinition:
    'A user who uploads a lab report, subscribes to a paid plan, and logs at least two meals within the first seven days.',
  quantifiedTarget: '500 Activated Paid Users',
  timeline: '90 days',
  audience: 'Health-conscious adults with recent lab reports seeking personalized nutrition',
  selectedChannel: 'Meta Ads',
  metaAccountId: 'act_1721558035534754',
  deliveryMode: 'draft',
};

function groqKey() {
  return process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '';
}

function parseJsonLoose(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function groqJson({ system, user, temperature = 0.35 }) {
  const key = groqKey();
  if (!key) throw new Error('GROQ_API_KEY required for paid studio');
  const body = withGroqReasoning({
    model: resolveGroqModel(),
    temperature,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Groq HTTP ${res.status}`);
  const parsed = parseJsonLoose(data?.choices?.[0]?.message?.content || '{}');
  if (!parsed) throw new Error('Model returned non-JSON paid plan');
  return parsed;
}

function publicRun(run) {
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    companyId: run.companyId,
    companyName: run.companyName,
    channel: run.channel,
    deliveryMode: run.deliveryMode,
    goals: run.goals,
    plan: run.plan,
    creativeDraft: run.creativeDraft,
    status: run.status,
    step: run.step,
    skills: run.skills,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

export function getPaidRun(runId) {
  return runsById.get(runId) || null;
}

export async function createPaidRun(input = {}) {
  const goals = {
    northStarMetric: String(input.northStarMetric || input.north_star_metric || NOURIVA_DEFAULTS.northStarMetric),
    northStarDefinition: String(
      input.northStarDefinition || input.north_star_definition || NOURIVA_DEFAULTS.northStarDefinition
    ),
    quantifiedTarget: String(input.quantifiedTarget || input.quantified_target || NOURIVA_DEFAULTS.quantifiedTarget),
    timeline: String(input.timeline || input.timeline_target || NOURIVA_DEFAULTS.timeline),
    audience: String(input.audience || NOURIVA_DEFAULTS.audience),
    website: String(input.website || NOURIVA_DEFAULTS.website),
    selectedChannel: String(input.selectedChannel || NOURIVA_DEFAULTS.selectedChannel),
    metaAccountId: String(input.metaAccountId || input.meta_ads_account_id || NOURIVA_DEFAULTS.metaAccountId),
    topic: String(input.topic || 'paid acquisition for lab-personalized nutrition').trim(),
  };

  const run = {
    id: randomUUID(),
    workspaceId: String(input.workspaceId || input.companyId || 'marqq-ws-1').trim(),
    companyId: String(input.companyId || input.workspaceId || 'marqq-ws-1').trim(),
    companyName: String(input.companyName || NOURIVA_DEFAULTS.companyName).trim(),
    channel: 'meta',
    deliveryMode: String(input.deliveryMode || 'draft').toLowerCase() === 'live' ? 'draft' : 'draft', // force draft in slice 1
    goals,
    plan: null,
    creativeDraft: null,
    status: 'created',
    step: 'goals',
    skills: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  runsById.set(run.id, run);
  return publicRun(run);
}

export function patchPaidGoals(runId, patch = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Paid run not found');
  for (const key of [
    'northStarMetric',
    'northStarDefinition',
    'quantifiedTarget',
    'timeline',
    'audience',
    'website',
    'selectedChannel',
    'metaAccountId',
    'topic',
  ]) {
    if (patch[key] !== undefined) run.goals[key] = String(patch[key]);
  }
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), goals: run.goals };
}

/**
 * Zara — paid_ads_strategy plan (simplified from Marqq2 /api/agents/zara/plan).
 */
export async function runPaidPlan(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Paid run not found');

  const playbook = await buildPlaybookFromPack(PLAN_PACK, { label: 'paid_ads_strategy' });
  run.skills.plan = { skillIds: playbook.skillIds, loaded: playbook.loaded, warning: playbook.warning || null };

  const parsed = await groqJson({
    temperature: 0.35,
    system: [
      'You are Zara, Marqq channel / paid strategist.',
      'Create a Meta paid acquisition strategy. Do NOT publish or activate anything — deliveryMode is draft/PAUSED only.',
      'Return ONLY JSON with keys:',
      'summary (string),',
      'objective (OUTCOME_SALES|OUTCOME_TRAFFIC|OUTCOME_LEADS|OUTCOME_AWARENESS),',
      'audience (string),',
      'funnel (string),',
      'daily_budget_usd (number),',
      'budget_rationale (string),',
      'creative_angles (array of strings),',
      'conversion_event (string),',
      'measurement_plan (array of strings),',
      'guardrails (array of strings),',
      'course_correction (array of strings),',
      'subtasks (array of { title, owner, why }),',
      'campaign_name (string),',
      'headline (string, <=40 chars preferred),',
      'primary_text (string),',
      'link_url (string),',
      'targeting_notes (string).',
      playbook.playbook || '',
    ].join(' '),
    user: JSON.stringify(
      {
        taskType: 'paid_ads_strategy',
        moduleId: 'paid-ads',
        companyName: run.companyName,
        goals: run.goals,
        deliveryMode: 'draft',
        instruction:
          'Align every recommendation to the locked North Star. Use Meta as the first channel. Define objective, audience, funnel, budget, creative angles, conversion event, measurement, guardrails, and course-correction. Do not publish.',
      },
      null,
      2
    ),
  });

  run.plan = {
    summary: String(parsed.summary || '').trim(),
    objective: String(parsed.objective || 'OUTCOME_SALES').trim(),
    audience: String(parsed.audience || run.goals.audience).trim(),
    funnel: String(parsed.funnel || '').trim(),
    daily_budget_usd: Number(parsed.daily_budget_usd) || 50,
    budget_rationale: String(parsed.budget_rationale || '').trim(),
    creative_angles: Array.isArray(parsed.creative_angles) ? parsed.creative_angles.map(String) : [],
    conversion_event: String(parsed.conversion_event || 'Subscribe').trim(),
    measurement_plan: Array.isArray(parsed.measurement_plan) ? parsed.measurement_plan.map(String) : [],
    guardrails: Array.isArray(parsed.guardrails) ? parsed.guardrails.map(String) : [],
    course_correction: Array.isArray(parsed.course_correction) ? parsed.course_correction.map(String) : [],
    subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : [],
    campaign_name: String(parsed.campaign_name || `${run.companyName} Meta Draft`).trim(),
    headline: String(parsed.headline || '').trim().slice(0, 60),
    primary_text: String(parsed.primary_text || '').trim(),
    link_url: String(parsed.link_url || run.goals.website).trim(),
    targeting_notes: String(parsed.targeting_notes || '').trim(),
    agent: 'zara',
    createdAt: new Date().toISOString(),
  };

  if (!run.plan.summary && !run.plan.headline) {
    throw new Error('Zara returned no usable paid-ads strategy plan');
  }

  run.status = 'planned';
  run.step = 'creative';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), plan: run.plan };
}

async function tryFalImage(prompt) {
  const key = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!key) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    const res = await fetch('https://fal.run/fal-ai/flux/dev', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Key ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: String(prompt).slice(0, 1500), image_size: 'square_hd', num_images: 1 }),
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return data?.images?.[0]?.url || data?.image?.url || null;
  } catch {
    return null;
  }
}

/**
 * Local creative draft (Marqq2 paid_ad_creative_draft shape) — no Meta write.
 */
export async function runPaidCreativeDraft(runId, { generateImage = true } = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Paid run not found');
  if (!run.plan) throw new Error('Run Zara plan before creative draft');

  const playbook = await buildPlaybookFromPack(CREATIVE_PACK, { label: 'paid_creative_draft' });
  run.skills.creative = { skillIds: playbook.skillIds, loaded: playbook.loaded, warning: playbook.warning || null };

  const parsed = await groqJson({
    temperature: 0.4,
    system: [
      'You are Zara + Sam drafting Meta ad creative for a PAUSED/draft campaign.',
      'Return ONLY JSON: { "headline", "primary_text", "description", "cta", "image_prompt", "angle" }',
      'headline <= 40 chars. primary_text peer tone. No inventing medical claims.',
      playbook.playbook || '',
    ].join(' '),
    user: JSON.stringify({
      company: run.companyName,
      goals: run.goals,
      plan: {
        campaign_name: run.plan.campaign_name,
        objective: run.plan.objective,
        creative_angles: run.plan.creative_angles,
        headline: run.plan.headline,
        primary_text: run.plan.primary_text,
        audience: run.plan.audience,
      },
    }),
  });

  const headline = String(parsed.headline || run.plan.headline || '').trim().slice(0, 40);
  const primaryText = String(parsed.primary_text || run.plan.primary_text || '').trim();
  const imagePrompt = String(parsed.image_prompt || '').trim();

  let imageUrl = null;
  let imageNote = null;
  if (generateImage && imagePrompt) {
    imageUrl = await tryFalImage(
      `${imagePrompt}. Brand: ${run.companyName}. Clean modern nutrition lifestyle. Aspect 1:1. No watermarks.`
    );
    if (!imageUrl) imageNote = 'Image gen skipped/failed — copy draft still valid';
  }

  const draftId = `pcd_${randomUUID().slice(0, 12)}`;
  run.creativeDraft = {
    id: draftId,
    creative_draft_id: draftId,
    status: 'draft',
    channel: 'meta',
    deliveryMode: 'draft',
    meta_status_intended: 'PAUSED',
    campaign_name: run.plan.campaign_name,
    objective: run.plan.objective,
    daily_budget_usd: run.plan.daily_budget_usd,
    headline,
    primary_text: primaryText,
    description: String(parsed.description || '').trim(),
    cta: String(parsed.cta || 'LEARN_MORE').trim(),
    link_url: run.plan.link_url || run.goals.website,
    angle: String(parsed.angle || run.plan.creative_angles?.[0] || '').trim(),
    image_prompt: imagePrompt,
    image_url: imageUrl,
    image_note: imageNote,
    targeting_notes: run.plan.targeting_notes,
    meta_account_id: run.goals.metaAccountId,
    // Explicitly empty — slice 1 never writes to Meta
    meta_campaign_id: null,
    meta_adset_id: null,
    meta_ad_id: null,
    agent: 'zara',
    createdAt: new Date().toISOString(),
  };

  run.status = 'ready_for_approval';
  run.step = 'approve';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), creativeDraft: run.creativeDraft };
}

export function approvePaidRun(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Paid run not found');
  if (!run.creativeDraft) throw new Error('No creative draft to approve');
  if (run.creativeDraft.meta_campaign_id || run.creativeDraft.meta_ad_id) {
    throw new Error('Unexpected Meta IDs on draft — abort approve');
  }
  run.creativeDraft.status = 'approved';
  run.creativeDraft.approvedAt = new Date().toISOString();
  run.status = 'approved';
  run.step = 'approve';
  run.updatedAt = new Date().toISOString();
  return {
    run: publicRun(run),
    status: 'approved',
    creative_draft_id: run.creativeDraft.creative_draft_id,
    meta: { spend: false, note: 'Local draft only — no Meta create in slice 1' },
  };
}
