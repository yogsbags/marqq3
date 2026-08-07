/**
 * Social Studio — Kiran text posts + Composio go-live (Marqq2 parity)
 * Brief → Generate multi-channel captions → Approve → Post Now (user click)
 * Skills: social-content, copywriting, humanizer, community-marketing
 */

import { randomUUID } from 'node:crypto';
import { buildPlaybookFromPack } from './gtmStrategySkills.js';
import { executeSocialGoLive, getSocialPublishReadiness } from './socialGoLive.js';
import { meteredStudioJson, assertCanAfford } from './credits/index.js';
import { getInjectableRulesBlock } from './agentInstructions.js';

/** @type {Map<string, object>} */
const runsById = new Map();

const PACK_PACK = {
  primary: ['social-content', 'copywriting'],
  secondary: ['humanizer', 'community-marketing'],
};

const DEFAULT_CHANNELS = ['linkedin', 'instagram', 'twitter', 'facebook'];
const DEFAULT_ANGLES = ['benefit', 'proof', 'curiosity'];
const ALLOWED_CHANNELS = ['linkedin', 'instagram', 'twitter', 'facebook', 'youtube', 'x'];

/** Patterns that usually mean hallucinated case-study numbers */
const UNVERIFIED_METRIC_RE =
  /(\b\d{1,3}\s*%|\b\d+\s*[x×]\b|\b\d{1,4}\s*(?:\+?\s*)?(?:clients?|customers?|firms?|companies|mid[- ]market|brands?|pilots?|users|employees)\b|\b(?:lift|uplift|ROI|CAC|ROAS|conversion|repeat[- ]purchase)\b.{0,40}\b\d|\b\d.{0,40}\b(?:lift|uplift|ROI|CAC|ROAS)\b|\b(?:in our (?:recent )?work with|we (?:helped|worked with)|across)\s+\d+)/gi;

function channelKind(channel) {
  const c = String(channel || '').toLowerCase();
  if (c === 'x') return 'twitter';
  return c;
}

function groundedSourceText(run) {
  return [
    run?.brandContext,
    run?.topic,
    run?.brief?.hook,
    ...(Array.isArray(run?.brief?.message_pillars) ? run.brief.message_pillars : []),
    run?.brief?.cta,
  ]
    .filter(Boolean)
    .join('\n');
}

/** True when caption cites % / counts / case claims not present in brand/topic brief context. */
function findUnverifiedMetrics(caption, groundedText) {
  const text = String(caption || '');
  const grounded = String(groundedText || '');
  const hits = [];
  for (const match of text.matchAll(UNVERIFIED_METRIC_RE)) {
    const raw = String(match[0] || '').trim();
    if (!raw) continue;
    // Allow numbers that already appear verbatim in grounded brand/topic context
    const compact = raw.replace(/\s+/g, ' ').toLowerCase();
    if (grounded.toLowerCase().includes(compact)) continue;
    // Allow bare small integers used as list counts (1, 2, 3) when not %/clients
    if (/^\d{1,2}$/.test(raw) && Number(raw) <= 10) continue;
    hits.push(raw);
  }
  return [...new Set(hits)];
}

const TRUTH_RULES = [
  'TRUTHFULNESS (hard rules — never break):',
  '1) NEVER invent metrics, percentages, ROI, lift, timelines-as-stats, client counts, sample sizes, survey results, or named case studies.',
  '2) NEVER write "in our work with N firms", "70% stall", "9% lift", "X customers" unless that EXACT figure appears in brand_context / topic.',
  '3) Proof angle ≠ fake case study. Proof = observed operator pattern, mechanism, before/after workflow, or a specific failure mode — framed as pattern ("what we keep seeing"), not fabricated n=.',
  '4) If no real numbers are in brand_context, use qualitative proof only: frameworks, decision criteria, tradeoffs, named industry tension (no fake stats).',
  '5) Prefer "often", "usually", "the pattern we see" over any number. When unsure, omit the number.',
].join(' ');

const ICP_ENGAGEMENT_RULES = [
  'ICP / BUYER PERSONA LOCK (hard rules — never break):',
  '1) The ONLY people this post is written for — and the ONLY people asked to Like / Comment / Connect / Share — are the ICP people described in `audience` (plus brand_context ICP).',
  '2) If audience names B2B job titles (CDO, Head of DX, CMO…), speak to those titles. If audience is B2C / consumer (e.g. health-conscious Indian adults 25–55), speak to those people — not to marketers selling to them, not to CPG brands, not to corporate wellness buyers unless the ICP says so.',
  '3) Hook, body tension, tips, free asset name, hashtags, and the Like+Comment+Connect closer must all be useful specifically to that same ICP. The value gift must be something THAT person would want (checklist, meal scorecard, lab-meal guide, KPI sheet — match the ICP).',
  '4) Do not invite engagement from the wrong side of the market (e.g. student generalists, vendors, or B2B brand marketers when ICP is consumers — or vice versa).',
  '5) If audience is thin, infer from brand_context niche/ICP wording. Keep marketType consistent (consumer vs buyer titles).',
].join(' ');

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
    composeMeta: run.composeMeta || null,
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

  const briefKiranRules = await getInjectableRulesBlock(run.workspaceId || run.companyId, 'kiran');
  const parsed = await groqJson({
    workspaceId: run.workspaceId || run.companyId || 'marqq-ws-1',
    temperature: 0.35,
    system: [
      'You are Kiran, Marqq social agent.',
      'Write a short social campaign brief optimized for viral LinkedIn reach. Return ONLY JSON:',
      '{ "hook": "...", "message_pillars": ["..."], "cta": "...", "tone": "...", "visual_direction": "..." }',
      'hook must be a scroll-stopping first line (curiosity/contrarian/story/value), ≤180 chars — not a topic label.',
      'hook must NOT invent statistics or client counts. Value hooks naming a named asset are good (e.g. "50 KPIs mid-market DX leaders track before an AI pilot").',
      'message_pillars: 3 concrete tensions/insights buyers debate (include at least one non-obvious thesis), not generic benefits, and not fabricated proof numbers.',
      'cta MUST be a value-exchange instruction aimed at the SAME ICP in audience: Like this post + Comment a one-word keyword + Connect with me — and I\'ll send [named PDF / checklist / spreadsheet / Excel / framework]. Name the asset and the keyword. Optionally one short line naming who should engage (match audience — B2B titles or consumer description).',
      'tone: peer speaking to those ICP people, opinionated, specific, generous with useful frameworks — thesis-led, not dry tip dumps.',
      'visual_direction may note carousel vs single image; copy itself must still carry thesis + insights.',
      ICP_ENGAGEMENT_RULES,
      TRUTH_RULES,
      playbook.playbook || '',
      briefKiranRules,
    ].join(' '),
    user: JSON.stringify({
      company: run.companyName,
      topic: run.topic,
      audience: run.audience,
      engagement_targets:
        'Like / Comment / Connect / Share invites are ONLY for the ICP people in audience — not a broader or wrong-side-of-market LinkedIn crowd.',
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

  const composeKiranRules = await getInjectableRulesBlock(run.workspaceId || run.companyId, 'kiran');
  const composeSystem = [
    'You are Kiran + Sam writing organic social posts optimized for reach, comments, and lead capture.',
    'Return ONLY JSON: { "posts": [ { "channel", "angle", "hook", "caption", "hashtags": [], "cta", "visual_brief" } ] }',
    `Create one post per channel×angle. Channels: ${run.channels.join(', ')}. Angles: ${DEFAULT_ANGLES.join(', ')}.`,
    // LinkedIn virality + value magnet (social-content skill adapted for B2B lead gen)
    'LINKEDIN VIRAL + VALUE RULES (mandatory when channel=linkedin):',
    '1) Hook = first line ONLY, ≤180 chars, before fold. Prefer VALUE hooks that name a concrete asset the reader wants (checklist, KPI list, scorecard, spreadsheet, PDF playbook, Excel template, 1-pager). Curiosity/contrarian/story also OK if the body delivers value.',
    '2) caption = full post including the hook as line 1, then blank line, then short lines with \\n\\n whitespace. Target 1500–2200 characters (LinkedIn longform — NOT a thin checklist blurb). Under 1200 chars is too dry; rewrite longer.',
    '3) RICH BODY PATTERN (mandatory — do not ship dry tip-lists alone):',
    '   Hook → THESIS (2–4 lines of opinionated take on why the problem exists) → INSIGHTS (2–3 deeper observations with “why it matters” for the ICP — mechanisms, tradeoffs, second-order effects — not just commands) → then 3 sharp beats OR a short story that illustrates the thesis → what most teams get wrong → name the free gift → VALUE EXCHANGE CLOSER.',
    '   Tips may support the thesis; they must not be the whole post. Each beat should teach a reason, not only an action.',
    '   Write like a peer who has lived the pattern: concrete industry language, a little narrative heat, zero corporate filler.',
    '   Do NOT use meta section labels in the caption (no "**Thesis**", "**Insights**", "**Value-exchange closer**", "Thesis:", "Insights:"). Flow as natural LinkedIn prose with blank-line beats.',
    '4) VALUE EXCHANGE CLOSER (required on LinkedIn — replace open-ended "what do you think?" closers):',
    '   - First, one short line naming who this is for using the ICP from audience (B2B titles OR consumer description, matching audience — e.g. "For Heads of DX / CDOs…" OR "For health-conscious Indians 25–55 who check labs…").',
    '   - Offer a specific deliverable that THAT audience would use.',
    '   - Exactly this action pattern (adapt keyword + asset name): Like this post. Comment "[ONE_WORD]" (one word only). Connect with me — I\'ll send it over.',
    '   - ONE_WORD should be short and on-topic for that ICP. Same keyword in caption and posts[].cta field.',
    '   - Do NOT invite a different market than audience describes.',
    '   - Do NOT put PDF/Drive/external URLs in the body (algorithm). The "send over" happens via DM/connection.',
    '5) Algorithm: NO external URLs in caption body. Comments + keywords from ICP peers > vanity reach from wrong titles.',
    '6) Banned: "Excited to announce", "I\'m humbled", generic motivation, corporate fluff, invented metrics/case studies, links in body, emoji spam, vague "DM me for more info" without naming the asset, CTAs aimed at students/job-seekers/vendors, dry posts that are only a hook + 3 bullets + CTA.',
    '7) Voice: peer founder/operator speaking to the ICP in audience — specific, opinionated, industry-concrete. Soft brand only near the closer if at all.',
    'ANGLE GUIDE:',
    '- benefit: lead with the free asset + how it helps THAT ICP win.',
    '- proof: operator pattern / failure mode those ICP people recognize — still end with asset + like/comment/connect for the same ICP.',
    '- curiosity: open a loop that the free asset resolves for those ICP people — still end with like/comment/connect for the same ICP.',
    'TOPIC DIVERSITY (LinkedIn packs — mandatory when brand/topic is DX / digital / AI consulting or similar):',
    '- Across the 3 angles (benefit/proof/curiosity), at least ONE caption must be NON-AI primary: focus on strategy-to-execution, operating model, change management, data/process handoffs, vendor governance, budget/ROI governance, or mid-market transformation stalls WITHOUT making "AI" the hero word in hook + body.',
    '- The other angles may stay on the AI / topic angle if the brief is AI-led. Do not make all three posts AI-themed.',
    '- Non-AI post still uses the same ICP + value-exchange closer (named checklist/spreadsheet/PDF + like/comment/connect).',
    'Vary structure across angles (do not clone the same 3 bullets thrice). Asset name may stay related across angles but change angle framing; keywords may differ.',
    'Naming a free asset size (e.g. "50 KPIs", "12-point checklist") is allowed as content inventory — that is NOT a fabricated case-study metric.',
    ICP_ENGAGEMENT_RULES,
    TRUTH_RULES,
    'Instagram: scannable + save-worthy tip; softer CTA OK. Twitter/X: under 260 chars with a punchy take. Facebook: conversational. YouTube: title-friendly caption + description tone.',
    'No placeholders. Hashtags: 3–5 niche (LinkedIn: end of post or empty array). Peer tone, generous teacher — not salesy pitch deck.',
    playbook.playbook || '',
    composeKiranRules,
  ].join(' ');

  const composeUser = {
    company: run.companyName,
    topic: run.topic,
    audience: run.audience,
    buyer_personas_icp: run.audience,
    engagement_targets:
      'The people asked to like, comment the keyword, share, and connect MUST be the same ICP people in audience — write for them only (B2B titles or consumers as specified).',
    brief: run.brief,
    brand_context: run.brandContext,
    allowed_metrics_note:
      'Only use numeric case-study claims that appear verbatim in brand_context or topic. Asset inventory names like "50 KPIs" are OK. Otherwise use qualitative pattern language only.',
  };

  let parsed = await groqJson({
    workspaceId: run.workspaceId || run.companyId || 'marqq-ws-1',
    temperature: 0.55,
    system: composeSystem,
    user: JSON.stringify(composeUser),
  });

  let posts = normalizePosts(parsed, run);
  const grounded = groundedSourceText(run);
  const suspects = posts.flatMap((p) =>
    findUnverifiedMetrics(`${p.hook}\n${p.caption}\n${p.cta}`, grounded).map((hit) => ({
      postId: p.id,
      angle: p.angle,
      hit,
    }))
  );

  if (suspects.length) {
    const repaired = await groqJson({
      workspaceId: run.workspaceId || run.companyId || 'marqq-ws-1',
      temperature: 0.25,
      system: [
        'Rewrite social posts to remove ALL unverified numeric case-study claims while keeping LinkedIn viral craft AND the value-exchange closer.',
        'Return ONLY JSON: { "posts": [ { "channel", "angle", "hook", "caption", "hashtags": [], "cta", "visual_brief" } ] }',
        'Keep whitespace, strong hooks, thesis + insights (1500–2200 chars where LinkedIn), and KEEP Like + Comment one-word + Connect + I will send [named PDF/checklist/spreadsheet] closers aimed at the SAME ICP people in audience.',
        'Do not collapse the post into a dry tip-list. Preserve opinionated thesis and deeper insights.',
        'Do not broaden or switch the call-to-engage to a different market than audience describes.',
        'Asset inventory numbers like "50 KPIs" or "12-point checklist" are allowed. Fake ROI / client counts / % lifts are not.',
        'Replace invented % / client counts / ROI with qualitative operator patterns.',
        'Do not add any new case-study numbers unless they appear in brand_context or topic.',
        ICP_ENGAGEMENT_RULES,
        TRUTH_RULES,
      ].join(' '),
      user: JSON.stringify({
        ...composeUser,
        flagged_claims: suspects,
        posts_to_fix: posts.map((p) => ({
          channel: p.channel,
          angle: p.angle,
          hook: p.hook,
          caption: p.caption,
          hashtags: p.hashtags,
          cta: p.cta,
          visual_brief: p.visual_brief,
        })),
      }),
    });
    const fixed = normalizePosts(repaired, run);
    if (fixed.length) posts = fixed;
  }

  if (!posts.length) throw new Error('Compose returned no posts');

  run.posts = posts;
  run.status = 'composed';
  run.step = 'approve';
  run.updatedAt = new Date().toISOString();
  run.composeMeta = {
    unverifiedClaimsFound: suspects.length,
    unverifiedClaims: suspects.slice(0, 20),
    repaired: suspects.length > 0,
  };
  return { run: publicRun(run), posts };
}

function normalizePosts(parsed, run) {
  return (Array.isArray(parsed?.posts) ? parsed.posts : [])
    .map((p, i) => ({
      id: `sp-${i + 1}`,
      channel: channelKind(p.channel || 'linkedin'),
      angle: String(p.angle || 'benefit').toLowerCase(),
      hook: String(p.hook || '').trim(),
      caption: String(p.caption || '').trim(),
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.map(String) : [],
      cta: String(p.cta || run.brief?.cta || '').trim(),
      visual_brief: String(p.visual_brief || run.brief?.visual_direction || '').trim(),
      title: String(p.title || '').trim(),
      image_url: '',
      video_url: '',
      status: 'draft',
      go_live: null,
    }))
    .filter((p) => p.caption);
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
