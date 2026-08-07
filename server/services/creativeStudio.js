/**
 * Creative Studio — Riya image + video (slice 3)
 * Concept → Image → Video brief → Approve
 * Image: Fal nano-banana-2 (+ /edit watermark from Brand DNA logo / KB refs)
 * Video: Fal Seedance 2.0 Mini (text / image / reference) → LTX fallback
 *
 * @see https://fal.ai/models/fal-ai/nano-banana-2
 * @see https://fal.ai/models/fal-ai/nano-banana-2/edit
 * @see https://fal.ai/models/bytedance/seedance-2.0/mini/text-to-video
 * @see https://fal.ai/models/bytedance/seedance-2.0/mini/image-to-video
 * @see https://fal.ai/models/bytedance/seedance-2.0/mini/reference-to-video
 */

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { withGroqReasoning, resolveGroqModel } from './groqReasoning.js';
import { buildPlaybookFromPack } from './gtmStrategySkills.js';
import { readBrandContext, readBrandDnaManifest } from './brandStore.js';
import { meteredStudioJson, assertCanAfford } from './credits/index.js';
import { getInjectableRulesBlock } from './agentInstructions.js';

/** @type {Map<string, object>} */
const runsById = new Map();

const CONCEPT_PACK = {
  primary: ['ad-creative', 'social-content'],
  secondary: ['copywriting'],
};

/** Channel → organic short-form defaults the agent should bias toward. */
const CHANNEL_VIDEO_DEFAULTS = {
  instagram: {
    channel_label: 'Instagram Reels',
    aspect_ratio: '9:16',
    duration_seconds: 10,
    format: 'organic_reel',
    tips: 'Hook in first 1s. Pattern interrupt or curiosity gap. Native vertical. Soft CTA, not hard sell.',
  },
  tiktok: {
    channel_label: 'TikTok',
    aspect_ratio: '9:16',
    duration_seconds: 12,
    format: 'organic_short',
    tips: 'Native, conversational, trend-aware pacing. Hook instantly. End-loop friendly.',
  },
  youtube: {
    channel_label: 'YouTube Shorts',
    aspect_ratio: '9:16',
    duration_seconds: 12,
    format: 'organic_short',
    tips: 'Clear payoff promise in hook. Educational or story beat. CTA to follow/comment.',
  },
  linkedin: {
    channel_label: 'LinkedIn native video',
    aspect_ratio: '9:16',
    duration_seconds: 15,
    format: 'organic_thought_leadership',
    tips: 'Professional but human. Insight hook, proof beat, soft CTA. Avoid gimmicky TikTok slang.',
  },
  facebook: {
    channel_label: 'Facebook Reels',
    aspect_ratio: '9:16',
    duration_seconds: 10,
    format: 'organic_reel',
    tips: 'Broad audience clarity. Relatable hook. Keep logo subtle.',
  },
  twitter: {
    channel_label: 'X / Twitter video',
    aspect_ratio: '1:1',
    duration_seconds: 8,
    format: 'organic_clip',
    tips: 'Punchy single idea. Captions-friendly pacing. Square or vertical.',
  },
  x: {
    channel_label: 'X / Twitter video',
    aspect_ratio: '1:1',
    duration_seconds: 8,
    format: 'organic_clip',
    tips: 'Punchy single idea. Captions-friendly pacing. Square or vertical.',
  },
};

function channelVideoDefaults(platform) {
  const key = String(platform || 'instagram').toLowerCase().replace(/\s+/g, '');
  return CHANNEL_VIDEO_DEFAULTS[key] || CHANNEL_VIDEO_DEFAULTS.instagram;
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
    feature: 'creative_studio',
    system,
    user,
    model: model || undefined,
    temperature,
    max_tokens,
    meta: { studio: 'creative_studio' },
  });
}


function publicRun(run) {
  const assets = run.brandAssets || null;
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    companyId: run.companyId,
    companyName: run.companyName,
    platform: run.platform,
    aspectRatio: run.aspectRatio,
    status: run.status,
    step: run.step,
    concept: run.concept,
    image: run.image,
    video: run.video,
    skills: run.skills,
    brandAssets: assets
      ? {
          logoUrl: assets.logoUrl || null,
          logoPublicUrl: assets.logoPublicUrl || null,
          referenceCount: Array.isArray(assets.referenceUrls) ? assets.referenceUrls.length : 0,
          references: (assets.references || []).map((r) => ({
            id: r.id,
            name: r.name,
            role: r.role,
          })),
        }
      : null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

async function uploadImgbb(base64) {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey || !base64) return null;
  try {
    const body = new URLSearchParams({ key: apiKey, image: base64 });
    const resp = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body });
    const data = await resp.json().catch(() => ({}));
    return data?.data?.url || null;
  } catch (err) {
    console.warn('[creative/imgbb]', err.message || err);
    return null;
  }
}

/**
 * Make a brand asset reachable by Fal (needs public https).
 * Prefers existing https; otherwise hosts local disk bytes via ImgBB.
 */
async function ensurePublicImageUrl(source) {
  if (!source) return null;
  if (typeof source === 'string') {
    const s = source.trim();
    if (/^https?:\/\//i.test(s) && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(s)) return s;
    if (s.startsWith('data:image/') && s.includes('base64,')) {
      const b64 = s.split('base64,').pop();
      return (await uploadImgbb(b64)) || null;
    }
    return null;
  }
  if (source.path) {
    try {
      const buf = await readFile(source.path);
      const hosted = await uploadImgbb(buf.toString('base64'));
      if (hosted) return hosted;
    } catch (err) {
      console.warn('[creative/asset]', err.message || err);
    }
  }
  if (source.url) return ensurePublicImageUrl(source.url);
  return null;
}

/**
 * Load logo + uploaded image knowledge-base assets for watermark / reference compositing.
 */
async function loadBrandAssetsForCreative(workspaceId, input = {}) {
  const ctx = (await readBrandContext(workspaceId)) || {};
  const files = await readBrandDnaManifest(workspaceId);
  const logoFile = files.find((f) => f?.category === 'logo') || null;
  const kbImages = files.filter(
    (f) => f?.category !== 'logo' && String(f?.mime || '').startsWith('image/')
  );

  const inputLogo = String(input.logoUrl || input.logo_url || '').trim();
  const ctxLogo = String(ctx.logoUrl || '').trim();

  let logoPublicUrl = null;
  let logoSource = null;

  // Prefer a real uploaded logo file; skip degenerate placeholders (e.g. 1×1 test PNG).
  const logoFileUsable = Boolean(logoFile?.path) && Number(logoFile?.size || 0) >= 2048;
  if (logoFileUsable) {
    logoSource = logoFile;
    logoPublicUrl = await ensurePublicImageUrl(logoFile);
  }

  const httpsCandidates = [inputLogo, ctxLogo].filter(
    (u) => /^https?:\/\//i.test(u) && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(u)
  );
  for (const candidate of httpsCandidates) {
    if (logoPublicUrl) break;
    logoSource = { url: candidate, name: 'logo' };
    logoPublicUrl = await ensurePublicImageUrl(candidate);
  }

  // Last resort: tiny local logo file (better than nothing for smoke)
  if (!logoPublicUrl && logoFile) {
    logoSource = logoFile;
    logoPublicUrl = await ensurePublicImageUrl(logoFile);
  }

  const references = [];
  const referenceUrls = [];
  const maxRefs = Math.min(6, Number(process.env.CREATIVE_MAX_REF_IMAGES) || 4);
  for (const file of kbImages.slice(0, maxRefs)) {
    const url = await ensurePublicImageUrl(file);
    if (!url) continue;
    references.push({
      id: file.id,
      name: file.name,
      role: 'knowledge_image',
      url,
    });
    referenceUrls.push(url);
  }

  // Optional client-provided absolute image URLs
  const extra = []
    .concat(input.referenceImageUrls || [])
    .concat(input.reference_image_urls || [])
    .map((u) => String(u || '').trim())
    .filter(Boolean);
  for (const url of extra) {
    const pub = await ensurePublicImageUrl(url);
    if (!pub || referenceUrls.includes(pub)) continue;
    if (referenceUrls.length >= maxRefs) break;
    references.push({ id: null, name: 'client_ref', role: 'client_image', url: pub });
    referenceUrls.push(pub);
  }

  return {
    logoUrl: logoFile?.url || inputLogo || ctxLogo || null,
    logoPublicUrl,
    logoName: logoFile?.name || logoSource?.name || null,
    references,
    referenceUrls,
    brandSummary: String(ctx.brandSummary || ctx.brandTagline || '').trim() || null,
    colors: Array.isArray(ctx.colors) ? ctx.colors : [],
  };
}

export function getCreativeRun(runId) {
  return runsById.get(runId) || null;
}

export async function createCreativeRun(input = {}) {
  const workspaceId = String(input.workspaceId || input.companyId || 'marqq-ws-1').trim();
  const brandAssets = await loadBrandAssetsForCreative(workspaceId, input);
  const brandContext =
    String(input.brandContext || input.brand_context || '').trim() ||
    brandAssets.brandSummary ||
    '';

  const run = {
    id: randomUUID(),
    workspaceId,
    companyId: String(input.companyId || input.workspaceId || workspaceId).trim(),
    companyName: String(input.companyName || 'Your company').trim(),
    topic: String(input.topic || 'lab-personalized nutrition').trim(),
    brandContext,
    brandAssets,
    platform: String(input.platform || 'instagram').toLowerCase(),
    aspectRatio: String(input.aspectRatio || input.aspect_ratio || '1:1'),
    status: 'created',
    step: 'concept',
    concept: null,
    image: null,
    video: null,
    skills: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  runsById.set(run.id, run);
  return publicRun(run);
}

export async function runCreativeConcept(runId, patch = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Creative run not found');
  assertCanAfford(run.workspaceId || run.companyId, 'creative_studio');
  if (patch.topic) run.topic = String(patch.topic).trim();
  if (patch.platform) run.platform = String(patch.platform).toLowerCase();
  if (patch.aspectRatio || patch.aspect_ratio) {
    run.aspectRatio = String(patch.aspectRatio || patch.aspect_ratio);
  }

  const playbook = await buildPlaybookFromPack(CONCEPT_PACK, { label: 'creative_concept' });
  run.skills.concept = { skillIds: playbook.skillIds, loaded: playbook.loaded, warning: playbook.warning || null };

  // Refresh assets in case logo/KB uploaded after run create
  run.brandAssets = await loadBrandAssetsForCreative(run.workspaceId, {
    logoUrl: run.brandAssets?.logoUrl,
    referenceImageUrls: run.brandAssets?.referenceUrls,
  });

  const channelDefaults = channelVideoDefaults(run.platform);
  const hasLogo = Boolean(run.brandAssets?.logoPublicUrl);
  const refCount = run.brandAssets?.referenceUrls?.length || 0;
  const creativeRiyaRules = await getInjectableRulesBlock(run.workspaceId || run.companyId, 'riya');

  const parsed = await groqJson({
    workspaceId: run.workspaceId || run.companyId || 'marqq-ws-1',
    temperature: 0.5,
    system: [
      'You are Riya, Marqq creative agent for organic social growth.',
      'Decide and return ONLY JSON with keys:',
      '{ "headline", "primary_text", "image_prompt", "style", "use_reference_assets", "video_plan" }',
      'image_prompt: square/feed still (or channel-native cover frame). No invented microcopy/badges/fake UI.',
      hasLogo
        ? 'A real brand logo will be composited later as a small corner watermark on the still — do NOT invent or redraw a logo.'
        : 'Do not invent logos or watermarks.',
      refCount
        ? `Brand uploaded ${refCount} reference image(s). Set use_reference_assets true when product/lifestyle refs should appear.`
        : 'use_reference_assets: false',
      'video_plan MUST be a channel-native organic short with viral potential. Object shape:',
      '{ "channel_label", "format", "aspect_ratio", "duration_seconds", "hook_type", "hook", "viral_angle",',
      '  "beats": ["0-2s: ...", "..."], "cta", "render_mode", "audio_note", "seedance_prompt", "why_this_format" }',
      'render_mode (Seedance 2.0 Mini):',
      '- "viral_text_to_video" — pure text→video multi-beat organic reel (default when no brand refs needed)',
      '- "brand_reference_to_video" — prefer when logo and/or uploaded brand images exist; refs guide identity (@Image1=logo, @Image2+=assets)',
      '- "product_image_to_video" — only when the generated still must be the opening frame',
      'seedance_prompt: production-ready motion brief for Seedance Mini — camera, subject, pacing, transitions; NO tiny unreadable text.',
      'If using brand_reference_to_video, mention @Image1 / @Image2 roles inside seedance_prompt.',
      'Prefer vertical 9:16 for Reels/TikTok/Shorts/LinkedIn video unless channel defaults say otherwise.',
      `Channel defaults to bias toward: ${JSON.stringify(channelDefaults)}`,
      'Optimize for organic reach: scroll-stopping hook, retention beats, share/save motive, soft CTA — not a paid ad hard sell.',
      playbook.playbook || '',
      creativeRiyaRules,
    ].join(' '),
    user: JSON.stringify({
      company: run.companyName,
      topic: run.topic,
      platform: run.platform,
      requested_aspect_ratio: run.aspectRatio,
      brand_context: run.brandContext || `${run.companyName}`,
      brand_colors: run.brandAssets?.colors || [],
      has_logo: hasLogo,
      reference_assets: (run.brandAssets?.references || []).map((r) => ({
        name: r.name,
        role: r.role,
      })),
      goal: 'organic_viral_short_video',
    }),
  });

  const planRaw = parsed.video_plan && typeof parsed.video_plan === 'object' ? parsed.video_plan : {};
  const requestedMode = String(planRaw.render_mode || '').trim();
  let renderMode = 'viral_text_to_video';
  if (requestedMode === 'product_image_to_video') renderMode = 'product_image_to_video';
  else if (requestedMode === 'brand_reference_to_video') renderMode = 'brand_reference_to_video';
  else if (hasLogo || refCount > 0) renderMode = 'brand_reference_to_video';
  else renderMode = 'viral_text_to_video';
  const videoAspect =
    String(planRaw.aspect_ratio || channelDefaults.aspect_ratio || '9:16').trim() || '9:16';
  const durationSeconds = Math.min(
    15,
    Math.max(4, Number(planRaw.duration_seconds) || channelDefaults.duration_seconds || 10)
  );
  const beats = Array.isArray(planRaw.beats)
    ? planRaw.beats.map((b) => String(b || '').trim()).filter(Boolean).slice(0, 8)
    : [];
  const seedancePrompt = String(planRaw.seedance_prompt || parsed.video_prompt || '').trim();
  const videoScript = [
    planRaw.hook ? `HOOK: ${planRaw.hook}` : null,
    beats.length ? `BEATS:\n- ${beats.join('\n- ')}` : null,
    planRaw.cta ? `CTA: ${planRaw.cta}` : null,
    String(parsed.video_script || '').trim() || null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const videoPlan = {
    channel_label: String(planRaw.channel_label || channelDefaults.channel_label).trim(),
    format: String(planRaw.format || channelDefaults.format).trim(),
    aspect_ratio: videoAspect,
    duration_seconds: durationSeconds,
    hook_type: String(planRaw.hook_type || 'curiosity').trim(),
    hook: String(planRaw.hook || '').trim(),
    viral_angle: String(planRaw.viral_angle || '').trim(),
    beats,
    cta: String(planRaw.cta || '').trim(),
    render_mode: renderMode,
    audio_note: String(planRaw.audio_note || 'native ambient + light SFX; generate_audio true').trim(),
    seedance_prompt: seedancePrompt,
    why_this_format: String(planRaw.why_this_format || '').trim(),
  };

  // Lock run aspect to the video decision for Seedance / still cover alignment on vertical channels
  if (videoPlan.aspect_ratio === '9:16' || videoPlan.aspect_ratio === '16:9' || videoPlan.aspect_ratio === '1:1') {
    run.aspectRatio = videoPlan.aspect_ratio;
  }

  run.concept = {
    headline: String(parsed.headline || '').trim(),
    primary_text: String(parsed.primary_text || '').trim(),
    image_prompt: String(parsed.image_prompt || '').trim(),
    style: String(parsed.style || 'clean modern brand photography').trim(),
    video_prompt: videoPlan.seedance_prompt,
    video_script: videoScript,
    duration_seconds: videoPlan.duration_seconds,
    video_plan: videoPlan,
    use_reference_assets: Boolean(parsed.use_reference_assets) && refCount > 0,
    agent: 'riya',
    createdAt: new Date().toISOString(),
  };
  if (!run.concept.image_prompt) throw new Error('Concept missing image_prompt');
  if (!run.concept.video_prompt) {
    run.concept.video_prompt = [
      `${videoPlan.hook || run.concept.headline}.`,
      `Organic ${videoPlan.channel_label} ${videoPlan.format}, ${videoPlan.aspect_ratio}, ${videoPlan.duration_seconds}s.`,
      videoPlan.viral_angle ? `Viral angle: ${videoPlan.viral_angle}.` : null,
      beats.length ? `Beats: ${beats.join(' → ')}.` : null,
      'Faceless or lifestyle motion, cinematic lighting, no tiny unreadable text overlays.',
    ]
      .filter(Boolean)
      .join(' ');
    run.concept.video_plan.seedance_prompt = run.concept.video_prompt;
  }
  run.status = 'concepted';
  run.step = 'image';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), concept: run.concept };
}

async function generateGeminiImage(prompt, aspectRatio) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: 'GEMINI_API_KEY not set' };
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data?.error?.message || `Gemini HTTP ${res.status}` };
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) return { error: 'Gemini returned no image data' };
    return {
      base64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || 'image/png',
      model,
      aspectRatio,
    };
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

const FAL_IMAGE_MODEL = process.env.FAL_IMAGE_MODEL || 'fal-ai/nano-banana-2';
const FAL_IMAGE_EDIT_MODEL = process.env.FAL_IMAGE_EDIT_MODEL || 'fal-ai/nano-banana-2/edit';

const FAL_ASPECT_RATIOS = new Set([
  'auto',
  '21:9',
  '16:9',
  '3:2',
  '4:3',
  '5:4',
  '1:1',
  '4:5',
  '3:4',
  '2:3',
  '9:16',
  '4:1',
  '1:4',
  '8:1',
  '1:8',
]);

function mapFalAspectRatio(aspectRatio) {
  const raw = String(aspectRatio || '1:1').trim();
  if (FAL_ASPECT_RATIOS.has(raw)) return raw;
  const lower = raw.toLowerCase();
  if (lower.includes('9') && lower.includes('16') && lower.indexOf('9') < lower.indexOf('16')) return '9:16';
  if (lower.includes('16') && lower.includes('9')) return '16:9';
  if (lower.includes('square') || lower === '1x1') return '1:1';
  return '1:1';
}

async function generateFalImage(prompt, aspectRatio, { imageUrls = [], workspaceId = null } = {}) {
  const key = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!key) return { error: 'FAL_KEY not set' };
  const refs = (imageUrls || []).filter((u) => /^https?:\/\//i.test(String(u || '')));
  const model = refs.length ? FAL_IMAGE_EDIT_MODEL : FAL_IMAGE_MODEL;
  const falKind = refs.length ? 'image_edit' : 'image';

  const { withFalCredits } = await import('./credits/falMeter.js');
  return withFalCredits({
    workspaceId: workspaceId || 'marqq-ws-1',
    feature: refs.length ? 'fal_image_edit' : 'fal_image',
    falKind,
    model,
    meta: { aspectRatio },
    skipCredits: !workspaceId && process.env.CREDITS_REQUIRE_WORKSPACE === '1',
    run: async () => {
      try {
        const body = {
          prompt,
          num_images: 1,
          aspect_ratio: mapFalAspectRatio(aspectRatio),
          output_format: 'png',
          resolution: process.env.FAL_IMAGE_RESOLUTION || '1K',
        };
        if (refs.length) body.image_urls = refs.slice(0, 14);

        const res = await fetch(`https://fal.run/${model}`, {
          method: 'POST',
          headers: {
            Authorization: `Key ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail = data?.detail || data?.error || `Fal HTTP ${res.status}`;
          return { ok: false, error: typeof detail === 'string' ? detail : JSON.stringify(detail) };
        }
        const imageUrl = data?.images?.[0]?.url || data?.image?.url || null;
        if (!imageUrl) return { ok: false, error: 'Fal returned no image url' };
        return { ok: true, imageUrl, model, referenceCount: refs.length };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  }).then((r) => {
    if (r.ok === false || r.error) return { error: r.error || 'Fal failed', insufficientCredits: r.insufficientCredits };
    return { imageUrl: r.imageUrl, model: r.model, referenceCount: r.referenceCount };
  });
}

/**
 * Composite brand logo as a corner watermark (and optional KB refs) onto a base still.
 */
async function applyBrandWatermark(baseImageUrl, brandAssets, aspectRatio) {
  const logoUrl = brandAssets?.logoPublicUrl;
  if (!logoUrl || !baseImageUrl) return { imageUrl: baseImageUrl, skipped: true };

  const imageUrls = [baseImageUrl, logoUrl];
  const extraRefs = (brandAssets.referenceUrls || []).filter((u) => u && u !== logoUrl).slice(0, 2);
  // Extra refs only for watermark pass if concept asked — kept minimal to protect logo fidelity

  const prompt = [
    'Edit image 1 only.',
    'Add the exact brand logo from image 2 as a small, sharp watermark in the bottom-right corner only.',
    'Reproduce the logo faithfully from image 2 — do not redraw, recolor, or invent a different mark.',
    'Keep the logo fully legible, correctly proportioned, with slight padding from the edges.',
    'Do NOT add any watermark labels, captions, the words "logo" or "watermark", badges, scores, charts, or UI chrome.',
    'Preserve the original scene, lighting, and composition of image 1.',
    extraRefs.length
      ? 'Additional reference images are brand assets for color/style consistency only — do not collage them over the scene.'
      : null,
  ]
    .filter(Boolean)
    .join(' ');

  const edited = await generateFalImage(prompt, aspectRatio, {
    imageUrls: [...imageUrls, ...extraRefs],
  });
  if (edited.imageUrl) {
    return {
      imageUrl: edited.imageUrl,
      model: edited.model,
      logoWatermark: true,
      skipped: false,
    };
  }
  return {
    imageUrl: baseImageUrl,
    skipped: true,
    error: edited.error || 'Watermark edit failed',
  };
}

/**
 * Optional first pass: build scene using uploaded product/lifestyle reference images.
 */
async function generateWithReferenceAssets(prompt, aspectRatio, brandAssets) {
  const refs = (brandAssets?.referenceUrls || []).filter(Boolean);
  if (!refs.length) return null;
  const composePrompt = [
    prompt,
    'Use the attached brand reference photo(s) as visual anchors for product, packaging, or lifestyle authenticity.',
    'Do not invent logos or fake UI. Brand logo will be added as a watermark in a later step.',
  ].join(' ');
  return generateFalImage(composePrompt, aspectRatio, { imageUrls: refs.slice(0, 6) });
}

export async function runCreativeImage(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Creative run not found');
  if (!run.concept?.image_prompt) throw new Error('Create concept before generating image');

  run.brandAssets = await loadBrandAssetsForCreative(run.workspaceId, {
    logoUrl: run.brandAssets?.logoUrl,
    referenceImageUrls: run.brandAssets?.referenceUrls,
  });

  const hasLogo = Boolean(run.brandAssets?.logoPublicUrl);
  const fullPrompt = [
    run.concept.image_prompt,
    run.brandContext ? `Brand mood/context only (do not render as text): ${run.brandContext}` : null,
    run.concept.headline
      ? `Campaign idea for photographer brief only — DO NOT render this text in the image: ${run.concept.headline}`
      : null,
    `Style: ${run.concept.style}`,
    `Optimised for ${run.platform}, aspect ${run.aspectRatio}.`,
    hasLogo
      ? 'Leave clean negative space in a corner for a real brand logo watermark (composited later). No invented logos, badges, scores, or UI.'
      : 'CRITICAL: photoreal product/lifestyle still with ZERO on-image text, numbers, badges, scores, invented logos, UI, or captions.',
  ]
    .filter(Boolean)
    .join(' ');

  let imageUrl = null;
  let model = null;
  let host = null;
  let errors = [];
  let watermark = null;
  let usedReferences = false;

  // 1) Optional reference-asset compose, else plain text-to-image
  if (run.concept.use_reference_assets && run.brandAssets?.referenceUrls?.length) {
    const composed = await generateWithReferenceAssets(fullPrompt, run.aspectRatio, run.brandAssets);
    if (composed?.imageUrl) {
      imageUrl = composed.imageUrl;
      model = composed.model;
      host = 'fal';
      usedReferences = true;
    } else if (composed?.error) {
      errors.push(`ref compose: ${composed.error}`);
    }
  }

  if (!imageUrl) {
    const fal = await generateFalImage(fullPrompt, run.aspectRatio);
    if (fal.imageUrl) {
      imageUrl = fal.imageUrl;
      model = fal.model;
      host = 'fal';
    } else {
      errors.push(fal.error || 'Fal image failed');
      const gemini = await generateGeminiImage(fullPrompt, run.aspectRatio);
      if (gemini.base64) {
        model = gemini.model;
        const hosted = await uploadImgbb(gemini.base64);
        if (hosted) {
          imageUrl = hosted;
          host = 'imgbb';
        } else {
          imageUrl = `data:${gemini.mimeType};base64,${gemini.base64}`;
          host = 'data_uri';
          errors.push('IMGBB_API_KEY missing or upload failed — using inline data URL');
        }
      } else {
        errors.push(gemini.error || 'Gemini image failed');
      }
    }
  }

  // 2) Brand logo watermark + keep refs available
  if (imageUrl && hasLogo && publicHttpUrl(imageUrl)) {
    const wm = await applyBrandWatermark(imageUrl, run.brandAssets, run.aspectRatio);
    if (wm.imageUrl && !wm.skipped) {
      imageUrl = wm.imageUrl;
      model = `${model || 'base'}→${wm.model}`;
      watermark = { applied: true, logoUrl: run.brandAssets.logoPublicUrl };
    } else if (wm.error) {
      errors.push(`watermark: ${wm.error}`);
      watermark = { applied: false, error: wm.error };
    }
  } else if (hasLogo && imageUrl && !publicHttpUrl(imageUrl)) {
    errors.push('watermark skipped — base image is not a public URL');
    watermark = { applied: false, error: 'base image not public' };
  }

  if (!imageUrl) {
    throw new Error(`Image generation failed: ${errors.join('; ')}`);
  }

  run.image = {
    url: imageUrl,
    prompt_used: fullPrompt,
    model,
    host,
    aspect_ratio: run.aspectRatio,
    platform: run.platform,
    watermark,
    used_reference_assets: usedReferences,
    brand_logo_url: run.brandAssets?.logoPublicUrl || null,
    warnings: errors.length ? errors : null,
    status: 'ready',
    createdAt: new Date().toISOString(),
  };
  run.status = 'image_ready';
  run.step = 'video';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), image: run.image };
}

/** Seedance 2.0 Mini endpoints. */
const SEEDANCE_TEXT_TO_VIDEO = 'bytedance/seedance-2.0/mini/text-to-video';
const SEEDANCE_IMAGE_TO_VIDEO = 'bytedance/seedance-2.0/mini/image-to-video';
const SEEDANCE_REFERENCE_TO_VIDEO = 'bytedance/seedance-2.0/mini/reference-to-video';
const FAL_VIDEO_FALLBACK_MODEL = 'fal-ai/ltx-video';
const FAL_VIDEO_ASPECT = new Set(['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16']);

function falKey() {
  return process.env.FAL_KEY || process.env.FAL_API_KEY || '';
}

function resolveFalVideoModel({ imageUrl, renderMode, referenceUrls } = {}) {
  const configured = String(process.env.FAL_VIDEO_MODEL || '').trim();
  if (configured) return configured;
  if (renderMode === 'product_image_to_video' && imageUrl) return SEEDANCE_IMAGE_TO_VIDEO;
  if (renderMode === 'brand_reference_to_video' || (referenceUrls && referenceUrls.length)) {
    return SEEDANCE_REFERENCE_TO_VIDEO;
  }
  if (renderMode === 'viral_text_to_video') return SEEDANCE_TEXT_TO_VIDEO;
  return imageUrl ? SEEDANCE_IMAGE_TO_VIDEO : SEEDANCE_TEXT_TO_VIDEO;
}

function mapVideoAspectRatio(aspectRatio) {
  const raw = String(aspectRatio || 'auto').trim();
  if (FAL_VIDEO_ASPECT.has(raw)) return raw;
  if (raw === '4:5' || raw === '2:3') return '3:4';
  if (raw === '5:4' || raw === '3:2') return '4:3';
  return '16:9';
}

function mapSeedanceDuration(seconds) {
  const n = Math.min(15, Math.max(4, Math.round(Number(seconds) || 8)));
  return String(n);
}

function publicHttpUrl(url) {
  const s = String(url || '').trim();
  return /^https?:\/\//i.test(s) ? s : null;
}

function falErrorDetail(data, status) {
  const detail = data?.detail || data?.error || `Fal queue HTTP ${status}`;
  return typeof detail === 'string' ? detail : JSON.stringify(detail);
}

/**
 * Submit Fal queue job (returns immediately). Poll via pollFalVideoJob.
 * Default: Seedance 2.0 Fast (image-to-video when still URL present).
 * @see https://fal.ai/docs/model-apis/model-endpoints/queue
 */
async function submitFalQueueJob(model, input) {
  const key = falKey();
  if (!key) return { error: 'FAL_KEY not set' };
  const res = await fetch(`https://queue.fal.run/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: falErrorDetail(data, res.status), status: res.status };
  const requestId = data.request_id || data.requestId;
  if (!requestId) return { error: 'Fal queue returned no request_id' };
  return {
    requestId,
    model,
    statusUrl: data.status_url || `https://queue.fal.run/${model}/requests/${requestId}/status`,
    responseUrl: data.response_url || `https://queue.fal.run/${model}/requests/${requestId}`,
  };
}

async function submitFalVideoJob({
  prompt,
  duration,
  aspectRatio,
  imageUrl = null,
  endImageUrl = null,
  referenceUrls = [],
  generateAudio = true,
  renderMode = null,
} = {}) {
  const key = falKey();
  if (!key) return { error: 'FAL_KEY not set' };

  const refs = (referenceUrls || [])
    .map((u) => publicHttpUrl(u))
    .filter(Boolean)
    .slice(0, 9);

  let stillUrl = publicHttpUrl(imageUrl);
  if (renderMode === 'viral_text_to_video') stillUrl = null;
  if (renderMode === 'brand_reference_to_video') stillUrl = null;

  const endUrl = publicHttpUrl(endImageUrl);
  const model = resolveFalVideoModel({
    imageUrl: stillUrl,
    renderMode,
    referenceUrls: refs,
  });
  const isSeedance = model.includes('seedance');

  let input;
  if (isSeedance) {
    input = {
      prompt: String(prompt || '').trim().slice(0, 2000),
      aspect_ratio: mapVideoAspectRatio(aspectRatio),
      resolution: process.env.FAL_VIDEO_RESOLUTION === '480p' ? '480p' : '720p',
      duration: mapSeedanceDuration(duration),
      generate_audio: generateAudio !== false,
    };
    if (model === SEEDANCE_IMAGE_TO_VIDEO) {
      if (!stillUrl) return { error: 'Seedance image-to-video requires image_url' };
      input.image_url = stillUrl;
      if (endUrl) input.end_image_url = endUrl;
    } else if (model === SEEDANCE_REFERENCE_TO_VIDEO) {
      if (!refs.length) return { error: 'Seedance reference-to-video requires image_urls' };
      input.image_urls = refs;
    }
  } else {
    // Legacy LTX-style payload (fallback / override)
    input = {
      prompt: String(prompt || '').slice(0, 1200),
      num_frames: Math.min(41, Math.max(9, Math.round((duration || 5) * 8))),
    };
  }

  const submitted = await submitFalQueueJob(model, input);
  if (submitted.requestId) {
    return {
      ...submitted,
      image_url: stillUrl,
      end_image_url: endUrl,
      reference_urls: refs,
      render_mode:
        renderMode ||
        (model === SEEDANCE_REFERENCE_TO_VIDEO
          ? 'brand_reference_to_video'
          : stillUrl
            ? 'product_image_to_video'
            : 'viral_text_to_video'),
    };
  }

  // Seedance entitlement / API failure → LTX fallback
  if (isSeedance && model !== FAL_VIDEO_FALLBACK_MODEL) {
    const fallback = await submitFalQueueJob(FAL_VIDEO_FALLBACK_MODEL, {
      prompt: String(prompt || '').slice(0, 1200),
      num_frames: Math.min(41, Math.max(9, Math.round((duration || 5) * 8))),
    });
    if (fallback.requestId) {
      return {
        ...fallback,
        note: `Seedance Mini unavailable (${submitted.error}); fell back to ${FAL_VIDEO_FALLBACK_MODEL}`,
        seedance_error: submitted.error,
        render_mode: renderMode,
      };
    }
    return { error: submitted.error || fallback.error || 'Fal video submit failed' };
  }

  return { error: submitted.error || 'Fal video submit failed' };
}

async function pollFalVideoJob(video) {
  const key = falKey();
  if (!key) return { status: 'failed', error: 'FAL_KEY not set' };
  const requestId = video?.fal_request_id;
  if (!requestId) return { status: 'failed', error: 'No fal_request_id to poll' };
  const model = video?.model || resolveFalVideoModel({ imageUrl: video?.image_url });

  const statusUrl =
    video.fal_status_url || `https://queue.fal.run/${model}/requests/${requestId}/status`;
  const statusRes = await fetch(statusUrl, {
    headers: { Authorization: `Key ${key}` },
  });
  const statusData = await statusRes.json().catch(() => ({}));
  if (!statusRes.ok) {
    return { status: 'failed', error: falErrorDetail(statusData, statusRes.status) };
  }

  const falStatus = String(statusData.status || '').toUpperCase();
  if (falStatus === 'IN_QUEUE' || falStatus === 'IN_PROGRESS') {
    return {
      status: 'processing',
      falStatus,
      queuePosition: statusData.queue_position ?? null,
    };
  }
  if (falStatus === 'FAILED' || falStatus === 'CANCELLED') {
    return { status: 'failed', error: statusData.error || `Fal job ${falStatus}` };
  }

  const responseUrl =
    video.fal_response_url || `https://queue.fal.run/${model}/requests/${requestId}`;
  const resultRes = await fetch(responseUrl, {
    headers: { Authorization: `Key ${key}` },
  });
  const result = await resultRes.json().catch(() => ({}));
  if (!resultRes.ok) {
    return { status: 'failed', error: falErrorDetail(result, resultRes.status) };
  }
  const videoUrl =
    result?.video?.url ||
    result?.video_url ||
    result?.output?.video?.url ||
    result?.output?.url ||
    null;
  if (!videoUrl) return { status: 'failed', error: 'Fal completed but no video URL' };
  return { status: 'ready', videoUrl, model, falStatus };
}

/**
 * Start video step. With generate=true, submits Fal queue and returns status:processing.
 * Client polls POST .../video/poll until ready | failed | prompt_ready.
 */
export async function runCreativeVideo(runId, { generate = true } = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Creative run not found');
  if (!run.concept?.video_prompt && !run.concept?.video_script && !run.concept?.video_plan) {
    throw new Error('Create concept before video step');
  }

  const plan = run.concept.video_plan || {};
  const stillUrl = publicHttpUrl(run.image?.url);
  const logoUrl = run.brandAssets?.logoPublicUrl || run.image?.brand_logo_url || null;
  const kbRefs = (run.brandAssets?.referenceUrls || []).filter((u) => publicHttpUrl(u));

  // Build reference set: logo first (@Image1), then KB images, optionally watermarked still
  const referenceUrls = [];
  if (logoUrl) referenceUrls.push(logoUrl);
  for (const u of kbRefs) {
    if (!referenceUrls.includes(u)) referenceUrls.push(u);
  }

  let renderMode = plan.render_mode || 'viral_text_to_video';
  if (
    renderMode !== 'product_image_to_video' &&
    renderMode !== 'brand_reference_to_video' &&
    renderMode !== 'viral_text_to_video'
  ) {
    renderMode = referenceUrls.length ? 'brand_reference_to_video' : 'viral_text_to_video';
  }
  // Soft upgrade: agent chose text-to-video but brand refs exist → reference-to-video
  if (renderMode === 'viral_text_to_video' && referenceUrls.length) {
    renderMode = 'brand_reference_to_video';
  }
  // Soft downgrade: reference mode without usable refs
  if (renderMode === 'brand_reference_to_video' && !referenceUrls.length) {
    renderMode = stillUrl ? 'product_image_to_video' : 'viral_text_to_video';
  }
  if (renderMode === 'product_image_to_video' && !stillUrl) {
    renderMode = referenceUrls.length ? 'brand_reference_to_video' : 'viral_text_to_video';
  }

  const videoAspect = plan.aspect_ratio || run.aspectRatio || channelVideoDefaults(run.platform).aspect_ratio;
  const durationSeconds = plan.duration_seconds || run.concept.duration_seconds || 10;

  const refRoles = [];
  if (logoUrl) refRoles.push('@Image1 = brand logo (keep as small corner watermark / identity mark)');
  kbRefs.forEach((u, i) => {
    refRoles.push(`@Image${logoUrl ? i + 2 : i + 1} = brand reference asset`);
  });

  const productionPrompt = [
    plan.seedance_prompt || run.concept.video_prompt,
    `Channel: ${plan.channel_label || run.platform} · format ${plan.format || 'organic_short'} · ${videoAspect} · ${durationSeconds}s`,
    plan.hook ? `Open on hook: ${plan.hook}` : null,
    plan.viral_angle ? `Viral angle: ${plan.viral_angle}` : null,
    Array.isArray(plan.beats) && plan.beats.length ? `Retention beats: ${plan.beats.join(' → ')}` : null,
    plan.cta ? `Close with soft CTA energy: ${plan.cta}` : null,
    'Organic social video — scroll-stopping, high retention, native feel. No tiny unreadable text, no fake UI chrome, no invented logos.',
    renderMode === 'brand_reference_to_video' && refRoles.length
      ? `Reference images: ${refRoles.join('; ')}. Match logo colors/identity from @Image1.`
      : null,
    renderMode === 'product_image_to_video' && stillUrl && run.image?.watermark?.applied
      ? 'Animate from the product still; preserve the brand logo watermark in the corner throughout.'
      : null,
    plan.audio_note || 'Generate native ambient sound and light SFX synced to motion.',
  ]
    .filter(Boolean)
    .join('\n');

  const video = {
    script: run.concept.video_script,
    prompt: productionPrompt,
    duration_seconds: durationSeconds,
    aspect_ratio: videoAspect,
    plan: {
      channel_label: plan.channel_label || null,
      format: plan.format || null,
      hook_type: plan.hook_type || null,
      hook: plan.hook || null,
      viral_angle: plan.viral_angle || null,
      beats: plan.beats || [],
      cta: plan.cta || null,
      render_mode: renderMode,
      why_this_format: plan.why_this_format || null,
    },
    url: null,
    model: null,
    status: 'prompt_ready',
    note: null,
    image_url: renderMode === 'product_image_to_video' ? stillUrl : null,
    end_image_url: null,
    reference_urls: renderMode === 'brand_reference_to_video' ? referenceUrls : [],
    brand_logo_url: logoUrl,
    watermark_preserved: Boolean(
      renderMode === 'product_image_to_video' && stillUrl && run.image?.watermark?.applied
    ),
    fal_request_id: null,
    fal_status_url: null,
    fal_response_url: null,
    fal_status: null,
    queue_position: null,
    createdAt: new Date().toISOString(),
  };

  if (generate) {
    const submitted = await submitFalVideoJob({
      prompt: productionPrompt,
      duration: durationSeconds,
      aspectRatio: videoAspect,
      imageUrl: stillUrl,
      referenceUrls,
      generateAudio: process.env.FAL_VIDEO_GENERATE_AUDIO !== '0',
      renderMode,
    });
    if (submitted.requestId) {
      video.fal_request_id = submitted.requestId;
      video.fal_status_url = submitted.statusUrl;
      video.fal_response_url = submitted.responseUrl;
      video.model = submitted.model;
      video.image_url = submitted.image_url || video.image_url;
      video.end_image_url = submitted.end_image_url || null;
      video.reference_urls = submitted.reference_urls || video.reference_urls;
      video.status = 'processing';
      video.note =
        submitted.note ||
        `Seedance Mini ${submitted.model} queued for ${plan.channel_label || run.platform} (${videoAspect}, ${durationSeconds}s)`;
      run.video = video;
      run.status = 'video_processing';
      run.step = 'video';
      run.updatedAt = new Date().toISOString();
      return { run: publicRun(run), video: run.video, poll: true };
    }
    video.note = submitted.error || 'Video render skipped — script/prompt ready';
    video.status = 'prompt_ready';
  }

  run.video = video;
  run.status = 'video_prompt_ready';
  run.step = 'approve';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), video: run.video, poll: false };
}

/**
 * Poll Fal queue for an in-flight creative video job.
 */
export async function pollCreativeVideo(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Creative run not found');
  if (!run.video) throw new Error('No video job on this run');
  if (run.video.status === 'ready' && run.video.url) {
    return { run: publicRun(run), video: run.video, done: true };
  }
  if (run.video.status !== 'processing' || !run.video.fal_request_id) {
    return {
      run: publicRun(run),
      video: run.video,
      done: true,
      note: 'Nothing to poll — use prompt_ready or re-submit video',
    };
  }

  const polled = await pollFalVideoJob(run.video);
  run.video.fal_status = polled.falStatus || polled.status;
  if (polled.queuePosition != null) run.video.queue_position = polled.queuePosition;

  if (polled.status === 'processing') {
    run.video.note = `Rendering… (${polled.falStatus || 'IN_PROGRESS'}${
      polled.queuePosition != null ? ` · queue #${polled.queuePosition}` : ''
    })`;
    run.updatedAt = new Date().toISOString();
    return { run: publicRun(run), video: run.video, done: false };
  }

  if (polled.status === 'ready' && polled.videoUrl) {
    run.video.url = polled.videoUrl;
    run.video.model = polled.model || run.video.model;
    run.video.status = 'ready';
    run.video.note = null;
    run.status = 'video_ready';
    run.step = 'approve';
    run.updatedAt = new Date().toISOString();
    return { run: publicRun(run), video: run.video, done: true };
  }

  run.video.status = 'prompt_ready';
  run.video.note = polled.error || 'Render failed — script/prompt still usable';
  run.status = 'video_prompt_ready';
  run.step = 'approve';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), video: run.video, done: true };
}

export function approveCreativeRun(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Creative run not found');
  if (!run.concept) throw new Error('Nothing to approve');
  run.status = 'approved';
  run.step = 'approve';
  if (run.image) run.image.status = 'approved';
  if (run.video) run.video.status = run.video.url ? 'approved' : 'approved_prompt';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), status: 'approved' };
}
