/**
 * Creative Studio — Riya image + video (slice 3)
 * Concept → Image → Video brief → Approve
 * Image: Gemini image model → Fal fallback → ImgBB host
 * Video: Groq script/prompt; Fal queue submit + poll (async) when FAL_KEY set
 */

import { randomUUID } from 'node:crypto';
import { withGroqReasoning, resolveGroqModel } from './groqReasoning.js';
import { buildPlaybookFromPack } from './gtmStrategySkills.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
/** @type {Map<string, object>} */
const runsById = new Map();

const CONCEPT_PACK = {
  primary: ['ad-creative', 'social-content'],
  secondary: ['copywriting'],
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

async function groqJson({ system, user, temperature = 0.4 }) {
  const key = groqKey();
  if (!key) throw new Error('GROQ_API_KEY required for creative studio');
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
  if (!parsed) throw new Error('Model returned non-JSON creative output');
  return parsed;
}

function publicRun(run) {
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
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

export function getCreativeRun(runId) {
  return runsById.get(runId) || null;
}

export async function createCreativeRun(input = {}) {
  const run = {
    id: randomUUID(),
    workspaceId: String(input.workspaceId || input.companyId || 'marqq-ws-1').trim(),
    companyId: String(input.companyId || input.workspaceId || 'marqq-ws-1').trim(),
    companyName: String(input.companyName || 'Your company').trim(),
    topic: String(input.topic || 'lab-personalized nutrition').trim(),
    brandContext: String(input.brandContext || input.brand_context || '').trim(),
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
  if (patch.topic) run.topic = String(patch.topic).trim();
  if (patch.platform) run.platform = String(patch.platform).toLowerCase();
  if (patch.aspectRatio || patch.aspect_ratio) {
    run.aspectRatio = String(patch.aspectRatio || patch.aspect_ratio);
  }

  const playbook = await buildPlaybookFromPack(CONCEPT_PACK, { label: 'creative_concept' });
  run.skills.concept = { skillIds: playbook.skillIds, loaded: playbook.loaded, warning: playbook.warning || null };

  const parsed = await groqJson({
    temperature: 0.45,
    system: [
      'You are Riya, Marqq creative agent.',
      'Return ONLY JSON: { "headline", "primary_text", "image_prompt", "style", "video_prompt", "video_script", "duration_seconds" }',
      'image_prompt: detailed visual for ad/social still (no on-image microcopy).',
      'video_prompt: 4–8s faceless motion brief. video_script: VO/on-screen beats.',
      'duration_seconds: integer 4-8.',
      playbook.playbook || '',
    ].join(' '),
    user: JSON.stringify({
      company: run.companyName,
      topic: run.topic,
      platform: run.platform,
      aspect_ratio: run.aspectRatio,
      brand_context: run.brandContext || `${run.companyName} — lab-personalized nutrition`,
    }),
  });

  run.concept = {
    headline: String(parsed.headline || '').trim(),
    primary_text: String(parsed.primary_text || '').trim(),
    image_prompt: String(parsed.image_prompt || '').trim(),
    style: String(parsed.style || 'clean modern brand photography').trim(),
    video_prompt: String(parsed.video_prompt || '').trim(),
    video_script: String(parsed.video_script || '').trim(),
    duration_seconds: Math.min(15, Math.max(4, Number(parsed.duration_seconds) || 6)),
    agent: 'riya',
    createdAt: new Date().toISOString(),
  };
  if (!run.concept.image_prompt) throw new Error('Concept missing image_prompt');
  run.status = 'concepted';
  run.step = 'image';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), concept: run.concept };
}

async function uploadImgbb(base64) {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) return null;
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

async function generateFalImage(prompt) {
  const key = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!key) return { error: 'FAL_KEY not set' };
  try {
    const res = await fetch('https://fal.run/fal-ai/flux/dev', {
      method: 'POST',
      headers: {
        Authorization: `Key ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_size: 'square_hd',
        num_images: 1,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data?.detail || data?.error || `Fal HTTP ${res.status}` };
    const imageUrl = data?.images?.[0]?.url || data?.image?.url || null;
    if (!imageUrl) return { error: 'Fal returned no image url' };
    return { imageUrl, model: 'fal-ai/flux/dev' };
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

export async function runCreativeImage(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Creative run not found');
  if (!run.concept?.image_prompt) throw new Error('Create concept before generating image');

  const fullPrompt = [
    run.concept.image_prompt,
    run.brandContext ? `Brand context: ${run.brandContext}` : null,
    run.concept.headline ? `Headline context (do not render as large text): ${run.concept.headline}` : null,
    `Style: ${run.concept.style}`,
    `Optimised for ${run.platform}, aspect ${run.aspectRatio}. Clean negative space. No watermarks.`,
  ]
    .filter(Boolean)
    .join(' ');

  let imageUrl = null;
  let model = null;
  let host = null;
  let errors = [];

  const gemini = await generateGeminiImage(fullPrompt, run.aspectRatio);
  if (gemini.base64) {
    model = gemini.model;
    const hosted = await uploadImgbb(gemini.base64);
    if (hosted) {
      imageUrl = hosted;
      host = 'imgbb';
    } else {
      imageUrl = `data:${gemini.mimeType};base64,${gemini.base64.slice(0, 80)}…`;
      // Prefer full data URL for UI when imgbb missing
      imageUrl = `data:${gemini.mimeType};base64,${gemini.base64}`;
      host = 'data_uri';
      errors.push('IMGBB_API_KEY missing or upload failed — using inline data URL');
    }
  } else {
    errors.push(gemini.error || 'Gemini image failed');
    const fal = await generateFalImage(fullPrompt);
    if (fal.imageUrl) {
      imageUrl = fal.imageUrl;
      model = fal.model;
      host = 'fal';
    } else {
      errors.push(fal.error || 'Fal image failed');
    }
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
    warnings: errors.length ? errors : null,
    status: 'ready',
    createdAt: new Date().toISOString(),
  };
  run.status = 'image_ready';
  run.step = 'video';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), image: run.image };
}

const FAL_VIDEO_MODEL = 'fal-ai/ltx-video';

function falKey() {
  return process.env.FAL_KEY || process.env.FAL_API_KEY || '';
}

/**
 * Submit Fal queue job (returns immediately). Poll via pollFalVideoJob.
 * @see https://fal.ai/docs/model-apis/model-endpoints/queue
 */
async function submitFalVideoJob(prompt, duration) {
  const key = falKey();
  if (!key) return { error: 'FAL_KEY not set' };
  const res = await fetch(`https://queue.fal.run/${FAL_VIDEO_MODEL}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: String(prompt || '').slice(0, 1200),
      num_frames: Math.min(41, Math.max(9, Math.round((duration || 5) * 8))),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data?.detail || data?.error || `Fal queue HTTP ${res.status}` };
  }
  const requestId = data.request_id || data.requestId;
  if (!requestId) return { error: 'Fal queue returned no request_id' };
  return {
    requestId,
    model: FAL_VIDEO_MODEL,
    statusUrl: data.status_url || `https://queue.fal.run/${FAL_VIDEO_MODEL}/requests/${requestId}/status`,
    responseUrl: data.response_url || `https://queue.fal.run/${FAL_VIDEO_MODEL}/requests/${requestId}`,
  };
}

async function pollFalVideoJob(video) {
  const key = falKey();
  if (!key) return { status: 'failed', error: 'FAL_KEY not set' };
  const requestId = video?.fal_request_id;
  if (!requestId) return { status: 'failed', error: 'No fal_request_id to poll' };

  const statusUrl =
    video.fal_status_url || `https://queue.fal.run/${FAL_VIDEO_MODEL}/requests/${requestId}/status`;
  const statusRes = await fetch(statusUrl, {
    headers: { Authorization: `Key ${key}` },
  });
  const statusData = await statusRes.json().catch(() => ({}));
  if (!statusRes.ok) {
    return { status: 'failed', error: statusData?.detail || statusData?.error || `Fal status HTTP ${statusRes.status}` };
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

  // COMPLETED (or unknown — try response)
  const responseUrl =
    video.fal_response_url || `https://queue.fal.run/${FAL_VIDEO_MODEL}/requests/${requestId}`;
  const resultRes = await fetch(responseUrl, {
    headers: { Authorization: `Key ${key}` },
  });
  const result = await resultRes.json().catch(() => ({}));
  if (!resultRes.ok) {
    return { status: 'failed', error: result?.detail || result?.error || `Fal result HTTP ${resultRes.status}` };
  }
  const videoUrl = result?.video?.url || result?.video_url || result?.output?.url || null;
  if (!videoUrl) return { status: 'failed', error: 'Fal completed but no video URL' };
  return { status: 'ready', videoUrl, model: FAL_VIDEO_MODEL, falStatus };
}

/**
 * Start video step. With generate=true, submits Fal queue and returns status:processing.
 * Client polls POST .../video/poll until ready | failed | prompt_ready.
 */
export async function runCreativeVideo(runId, { generate = true } = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Creative run not found');
  if (!run.concept?.video_prompt && !run.concept?.video_script) {
    throw new Error('Create concept before video step');
  }

  const video = {
    script: run.concept.video_script,
    prompt: run.concept.video_prompt,
    duration_seconds: run.concept.duration_seconds,
    url: null,
    model: null,
    status: 'prompt_ready',
    note: null,
    fal_request_id: null,
    fal_status_url: null,
    fal_response_url: null,
    fal_status: null,
    queue_position: null,
    createdAt: new Date().toISOString(),
  };

  if (generate) {
    const submitted = await submitFalVideoJob(run.concept.video_prompt, run.concept.duration_seconds);
    if (submitted.requestId) {
      video.fal_request_id = submitted.requestId;
      video.fal_status_url = submitted.statusUrl;
      video.fal_response_url = submitted.responseUrl;
      video.model = submitted.model;
      video.status = 'processing';
      video.note = 'Fal queue submitted — polling for render';
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
