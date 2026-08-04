/**
 * Social Studio — Kiran text posts + Composio go-live (Marqq2 parity)
 * Brief → Generate multi-channel captions → Approve → Post Now (user click)
 * Skills: social-content, copywriting, humanizer, community-marketing
 */

import { randomUUID } from 'node:crypto';
import { buildPlaybookFromPack } from './gtmStrategySkills.js';
import { executeSocialGoLive, getSocialPublishReadiness } from './socialGoLive.js';
import { meteredStudioJson, assertCanAfford } from './credits/index.js';

/** @type {Map<string, object>} */
const runsById = new Map();

const PACK_PACK = {
  primary: ['social-content', 'copywriting'],
  secondary: ['humanizer', 'community-marketing'],
};

const DEFAULT_CHANNELS = ['linkedin', 'instagram', 'twitter', 'facebook'];
const DEFAULT_ANGLES = ['benefit', 'proof', 'curiosity'];
const ALLOWED_CHANNELS = ['linkedin', 'instagram', 'twitter', 'facebook', 'youtube', 'x'];

function channelKind(channel) {
  const c = String(channel || '').toLowerCase();
  if (c === 'x') return 'twitter';
  return c;
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

async function groqJson({ system, user, model, temperature = 0.35, max_tokens = 4000, workspaceId = 'marqq-ws-1' }) {
  return meteredStudioJson({
    workspaceId,
    feature: 'social_studio',
    system,
    user,
    model: model || undefined,
    temperature,
    max_tokens,
    meta: { studio: 'social_studio' },
  });
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
    .map((c) => (c === 'x' ? 'twitter' : c))
    .filter((c) => ALLOWED_CHANNELS.includes(c));
  const run = {
    id: randomUUID(),
    workspaceId: String(input.workspaceId || input.companyId || 'marqq-ws-1').trim(),
    companyId: String(input.companyId || input.workspaceId || 'marqq-ws-1').trim(),
    companyName: String(input.companyName || 'Your company').trim(),
    topic: String(input.topic || input.offer || 'lab-personalized nutrition').trim(),
    audience: String(input.audience || 'target buyers from Brand DNA').trim(),
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
  assertCanAfford(run.workspaceId || run.companyId, 'social_studio');
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
    workspaceId: run.workspaceId || run.companyId || 'marqq-ws-1',
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
  // Stay on brief so the UI can show hook / pillars / CTA before compose.
  run.step = 'brief';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), brief: run.brief };
}

export async function runSocialCompose(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Social run not found');
  assertCanAfford(run.workspaceId || run.companyId, 'social_studio');
  if (!run.brief) throw new Error('Create a brief before composing posts');

  const playbook = await buildPlaybookFromPack(PACK_PACK, { label: 'social_pack' });
  run.skills.compose = { skillIds: playbook.skillIds, loaded: playbook.loaded, warning: playbook.warning || null };

  const parsed = await groqJson({
    workspaceId: run.workspaceId || run.companyId || 'marqq-ws-1',
    temperature: 0.45,
    system: [
      'You are Kiran + Sam writing organic social posts.',
      'Return ONLY JSON: { "posts": [ { "channel", "angle", "hook", "caption", "hashtags": [], "cta", "visual_brief" } ] }',
      `Create one post per channel×angle. Channels: ${run.channels.join(', ')}. Angles: ${DEFAULT_ANGLES.join(', ')}.`,
      'LinkedIn: professional, 80–150 words. Instagram: scannable, emoji sparingly. Twitter/X: under 260 chars. Facebook: conversational. YouTube: title-friendly caption + description tone.',
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
      channel: channelKind(p.channel || 'linkedin'),
      angle: String(p.angle || 'benefit').toLowerCase(),
      hook: String(p.hook || '').trim(),
      caption: String(p.caption || '').trim(),
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.map(String) : [],
      cta: String(p.cta || run.brief.cta || '').trim(),
      visual_brief: String(p.visual_brief || run.brief.visual_direction || '').trim(),
      title: String(p.title || '').trim(),
      image_url: '',
      video_url: '',
      status: 'draft',
      go_live: null,
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
  for (const key of [
    'caption',
    'hook',
    'cta',
    'channel',
    'angle',
    'visual_brief',
    'title',
    'image_url',
    'video_url',
  ]) {
    if (patch[key] !== undefined) post[key] = String(patch[key]);
  }
  if (Array.isArray(patch.hashtags)) post.hashtags = patch.hashtags.map(String);
  if (patch.channel) post.channel = channelKind(patch.channel);
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), post };
}

export function approveSocialRun(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Social run not found');
  if (!run.posts?.length) throw new Error('No posts to approve');
  run.posts = run.posts.map((p) => ({ ...p, status: p.status === 'live' ? 'live' : 'approved' }));
  run.status = 'approved';
  run.step = 'approve';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), status: 'approved', postCount: run.posts.length };
}

/**
 * Publish one approved post via Composio (draft|live).
 */
export async function goLiveSocialPost(runId, postId, opts = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Social run not found');
  const post = run.posts.find((p) => p.id === postId);
  if (!post) throw new Error('Post not found');

  // Persist optional media/title from request onto the post
  if (opts.image_url != null) post.image_url = String(opts.image_url);
  if (opts.video_url != null) post.video_url = String(opts.video_url);
  if (opts.title != null) post.title = String(opts.title);
  if (opts.caption != null) post.caption = String(opts.caption);

  const kind = channelKind(opts.kind || post.channel);
  const delivery = String(opts.delivery || 'live').toLowerCase() === 'draft' ? 'draft' : 'live';
  const payload = {
    post: post.caption,
    caption: post.caption,
    body: post.caption,
    text: post.caption,
    hook: post.hook,
    hashtags: post.hashtags,
    cta: post.cta,
    title: post.title || post.hook || `${run.companyName} · ${run.topic}`.slice(0, 90),
    image_url: post.image_url || opts.image_url || null,
    video_url: post.video_url || opts.video_url || null,
    media_url: post.image_url || opts.image_url || null,
    privacy_status: opts.privacy_status || 'private',
  };

  const result = await executeSocialGoLive({
    kind,
    companyId: run.companyId,
    workspaceId: run.workspaceId,
    preferredConnector: opts.preferredConnector || kind,
    delivery,
    payload,
  });

  post.go_live = {
    at: new Date().toISOString(),
    delivery,
    kind,
    result,
  };
  if (result.ok && delivery === 'live') {
    post.status = 'live';
    run.status = 'publishing';
  } else if (result.ok && delivery === 'draft') {
    if (post.status !== 'live') post.status = 'approved';
  }
  run.updatedAt = new Date().toISOString();

  return { run: publicRun(run), post, result, delivery, kind };
}

export { getSocialPublishReadiness, executeSocialGoLive };
