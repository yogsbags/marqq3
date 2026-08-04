/**
 * Marqq credit pricing — 1 credit = $0.001 USD (1 millicredit dollar).
 *
 * Rates are approximations of Groq / Fal public pricing; override via env:
 *   GROQ_PRICE_IN_PER_MTOK / GROQ_PRICE_OUT_PER_MTOK (default model)
 *   FAL_IMAGE_USD / FAL_VIDEO_USD
 */

/** @typedef {'workspace'|'growth'|'scale'|'agency'} PlanId */

export const CREDIT_USD = 0.001; // $0.001 per credit

/** Monthly allotment (−1 = unlimited). */
export const PLAN_CREDITS = Object.freeze({
  workspace: 99_999, // default allotment
  growth: 5_000,
  scale: 20_000,
  agency: -1,
});

export const PLAN_LABELS = Object.freeze({
  workspace: 'Workspace',
  growth: 'Growth',
  scale: 'Scale',
  agency: 'Agency',
});

/** Feature → estimated credits before the call (hold / hard gate). */
export const FEATURE_ESTIMATES = Object.freeze({
  groq_chat_small: 2, // compound-mini / flash style
  groq_chat: 8, // standard agent / content JSON
  groq_chat_large: 25, // long GTM / strategy
  fal_image: 40, // ~$0.04
  fal_image_edit: 45,
  fal_video: 250, // seedance / LTX approx
  apify_crawl: 15,
  apify_ads: 30,
  apify_keywords: 10,
  apollo_signals: 20,
  agent_run: 5,
  ask_marqq: 6,
  brand_dna: 12,
  market_research: 15,
  control_loop: 10,
  command_center: 8,
  marketing_ideas: 10,
  // Studios
  content_studio: 12,
  social_studio: 10,
  outreach_copy: 8,
  outreach_sequences: 15,
  landing_studio: 20,
  lead_magnet_studio: 15,
  paid_studio: 12,
  creative_studio: 10,
  // GTM
  gtm_strategy: 30,
  gtm_interview: 8,
  gtm_auto_section: 18,
});

/** Groq USD per 1M tokens by model family (input / output). */
export const GROQ_MODEL_RATES = Object.freeze({
  default: { inPerM: 0.59, outPerM: 0.79 },
  'llama-3.3-70b': { inPerM: 0.59, outPerM: 0.79 },
  'llama-3.1-8b': { inPerM: 0.05, outPerM: 0.08 },
  'llama-3.1-70b': { inPerM: 0.59, outPerM: 0.79 },
  compound: { inPerM: 0.2, outPerM: 0.2 },
  'compound-mini': { inPerM: 0.1, outPerM: 0.1 },
  'openai/gpt-oss': { inPerM: 0.15, outPerM: 0.6 },
  'qwen': { inPerM: 0.3, outPerM: 0.3 },
});

/** Fal flat USD estimates by kind (actual may refine later from response headers). */
export const FAL_USD = Object.freeze({
  image: Number(process.env.FAL_IMAGE_USD || 0.039),
  image_edit: Number(process.env.FAL_IMAGE_EDIT_USD || 0.045),
  video: Number(process.env.FAL_VIDEO_USD || 0.25),
  video_mini: Number(process.env.FAL_VIDEO_MINI_USD || 0.12),
});

export function usdToCredits(usd) {
  const n = Number(usd) || 0;
  if (n <= 0) return 0;
  return Math.max(1, Math.ceil(n / CREDIT_USD));
}

export function creditsToUsd(credits) {
  return Number(((Number(credits) || 0) * CREDIT_USD).toFixed(6));
}

export function resolveGroqRates(model) {
  const m = String(model || '').toLowerCase();
  const envIn = Number(process.env.GROQ_PRICE_IN_PER_MTOK);
  const envOut = Number(process.env.GROQ_PRICE_OUT_PER_MTOK);
  if (Number.isFinite(envIn) && Number.isFinite(envOut) && envIn > 0) {
    return { inPerM: envIn, outPerM: envOut };
  }
  for (const [key, rates] of Object.entries(GROQ_MODEL_RATES)) {
    if (key !== 'default' && m.includes(key)) return rates;
  }
  return GROQ_MODEL_RATES.default;
}

/**
 * @param {{ model?: string, promptTokens?: number, completionTokens?: number }} usage
 */
export function groqUsageToUsd({ model, promptTokens = 0, completionTokens = 0 } = {}) {
  const rates = resolveGroqRates(model);
  const inUsd = ((Number(promptTokens) || 0) / 1_000_000) * rates.inPerM;
  const outUsd = ((Number(completionTokens) || 0) / 1_000_000) * rates.outPerM;
  return {
    usd: inUsd + outUsd,
    rates,
    promptTokens: Number(promptTokens) || 0,
    completionTokens: Number(completionTokens) || 0,
  };
}

export function falUsageToUsd(kind = 'image') {
  const key = String(kind || 'image').toLowerCase();
  if (key.includes('video') && key.includes('mini')) return FAL_USD.video_mini;
  if (key.includes('video')) return FAL_USD.video;
  if (key.includes('edit')) return FAL_USD.image_edit;
  return FAL_USD.image;
}

export function estimateFeatureCredits(feature, overrides = {}) {
  if (overrides.estimatedCredits != null) return Math.max(0, Math.ceil(Number(overrides.estimatedCredits)));
  const key = String(feature || 'groq_chat');
  return FEATURE_ESTIMATES[key] ?? FEATURE_ESTIMATES.groq_chat;
}

export function normalizePlan(plan) {
  const p = String(plan || 'workspace').toLowerCase();
  if (p in PLAN_CREDITS) return p;
  return 'workspace';
}
