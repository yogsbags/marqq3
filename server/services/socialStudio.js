/**
 * Social Studio — Kiran text posts (slice 2)
 * Brief → Generate multi-channel captions → Approve (no live publish)
 * Skills: social-content, copywriting, humanizer, community-marketing
 */

import { randomUUID } from 'node:crypto';
import { withGroqReasoning, resolveGroqModel } from './groqReasoning.js';
import { buildPlaybookFromPack } from './gtmStrategySkills.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
/** @type {Map<string, object>} */
const runsById = new Map();

const PACK_PACK = {
  primary: ['social-content', 'copywriting'],
  secondary: ['humanizer', 'community-marketing'],
};

const DEFAULT_CHANNELS = ['linkedin', 'instagram', 'twitter'];
const DEFAULT_ANGLES = ['benefit', 'proof', 'curiosity'];

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

async function groqJson({ system, user, temperature = 0.4 }) {
  const key = groqKey();
  if (!key) throw new Error('GROQ_API_KEY required for social studio');
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
  if (!parsed) throw new Error('Model returned non-JSON social copy');
  return parsed;
}

function publicRun(run) {
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    companyId: run.companyId,
    companyName: run.companyName,
    topic: run.topic,
    audience: run.audience,
    channels: run.channels,
    status: run.status,
    step: run.step,
    brief: run.brief,
    posts: run.posts,
    skills: run.skills,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

export function getSocialRun(runId) {
  return runsById.get(runId) || null;
}

export async function createSocialRun(input = {}) {
  const channels = (Array.isArray(input.channels) ? input.channels : DEFAULT_CHANNELS)
    .map((c) => String(c).toLowerCase())
    .filter((c) => ['linkedin', 'instagram', 'twitter', 'facebook', 'reddit'].includes(c));
  const run = {
    id: randomUUID(),
    workspaceId: String(input.workspaceId || input.companyId || 'marqq-ws-1').trim(),
    companyId: String(input.companyId || input.workspaceId || 'marqq-ws-1').trim(),
    companyName: String(input.companyName || 'Nouriva AI').trim(),
    topic: String(input.topic || input.offer || 'lab-personalized nutrition').trim(),
    audience: String(input.audience || 'health-conscious consumers and clinic partners').trim(),
    brandContext: String(input.brandContext || input.brand_context || '').trim(),
    channels: channels.length ? channels : [...DEFAULT_CHANNELS],
    status: 'created',
    step: 'brief',
    brief: null,
    posts: [],
    skills: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  runsById.set(run.id, run);
  return publicRun(run);
}

export async function runSocialBrief(runId, patch = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Social run not found');
  if (patch.topic) run.topic = String(patch.topic).trim();
  if (patch.audience) run.audience = String(patch.audience).trim();
  if (Array.isArray(patch.channels) && patch.channels.length) {
    run.channels = patch.channels.map((c) => String(c).toLowerCase());
  }

  const playbook = await buildPlaybookFromPack(
    { primary: ['social-content', 'content-strategy'], secondary: [] },
    { label: 'social_brief' }
  );
  run.skills.brief = { skillIds: playbook.skillIds, loaded: playbook.loaded, warning: playbook.warning || null };

  const parsed = await groqJson({
    temperature: 0.35,
    system: [
      'You are Kiran, Marqq social agent.',
      'Write a short social campaign brief. Return ONLY JSON:',
      '{ "hook": "...", "message_pillars": ["..."], "cta": "...", "tone": "...", "visual_direction": "..." }',
      playbook.playbook || '',
    ].join(' '),
    user: JSON.stringify({
      company: run.companyName,
      topic: run.topic,
      audience: run.audience,
      channels: run.channels,
      brand_context: run.brandContext,
    }),
  });

  run.brief = {
    hook: String(parsed.hook || '').trim(),
    message_pillars: Array.isArray(parsed.message_pillars) ? parsed.message_pillars.map(String) : [],
    cta: String(parsed.cta || 'Learn more').trim(),
    tone: String(parsed.tone || 'peer, clear').trim(),
    visual_direction: String(parsed.visual_direction || '').trim(),
    agent: 'kiran',
    createdAt: new Date().toISOString(),
  };
  run.status = 'briefed';
  run.step = 'compose';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), brief: run.brief };
}

export async function runSocialCompose(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Social run not found');
  if (!run.brief) throw new Error('Create a brief before composing posts');

  const playbook = await buildPlaybookFromPack(PACK_PACK, { label: 'social_pack' });
  run.skills.compose = { skillIds: playbook.skillIds, loaded: playbook.loaded, warning: playbook.warning || null };

  const parsed = await groqJson({
    temperature: 0.45,
    system: [
      'You are Kiran + Sam writing organic social posts.',
      'Return ONLY JSON: { "posts": [ { "channel", "angle", "hook", "caption", "hashtags": [], "cta", "visual_brief" } ] }',
      `Create one post per channel×angle. Channels: ${run.channels.join(', ')}. Angles: ${DEFAULT_ANGLES.join(', ')}.`,
      'LinkedIn: professional, 80–150 words. Instagram: scannable, emoji sparingly. Twitter/X: under 260 chars.',
      'No placeholders. Hashtags: 3–6 relevant. Peer tone, not salesy.',
      playbook.playbook || '',
    ].join(' '),
    user: JSON.stringify({
      company: run.companyName,
      topic: run.topic,
      audience: run.audience,
      brief: run.brief,
      brand_context: run.brandContext,
    }),
  });

  const posts = (Array.isArray(parsed.posts) ? parsed.posts : [])
    .map((p, i) => ({
      id: `sp-${i + 1}`,
      channel: String(p.channel || 'linkedin').toLowerCase(),
      angle: String(p.angle || 'benefit').toLowerCase(),
      hook: String(p.hook || '').trim(),
      caption: String(p.caption || '').trim(),
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.map(String) : [],
      cta: String(p.cta || run.brief.cta || '').trim(),
      visual_brief: String(p.visual_brief || run.brief.visual_direction || '').trim(),
      status: 'draft',
    }))
    .filter((p) => p.caption);

  if (!posts.length) throw new Error('Compose returned no posts');

  run.posts = posts;
  run.status = 'composed';
  run.step = 'approve';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), posts };
}

export function patchSocialPost(runId, postId, patch = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Social run not found');
  const post = run.posts.find((p) => p.id === postId);
  if (!post) throw new Error('Post not found');
  for (const key of ['caption', 'hook', 'cta', 'channel', 'angle', 'visual_brief']) {
    if (patch[key] !== undefined) post[key] = String(patch[key]);
  }
  if (Array.isArray(patch.hashtags)) post.hashtags = patch.hashtags.map(String);
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), post };
}

export function approveSocialRun(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Social run not found');
  if (!run.posts?.length) throw new Error('No posts to approve');
  run.posts = run.posts.map((p) => ({ ...p, status: 'approved' }));
  run.status = 'approved';
  run.step = 'approve';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), status: 'approved', postCount: run.posts.length };
}
