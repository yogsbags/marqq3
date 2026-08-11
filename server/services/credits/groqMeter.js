/**
 * Metered Groq chat — tracks prompt/completion tokens and settles workspace credits.
 */

import { isGptOssModel, resolveGroqModel, withGroqReasoning } from '../groqReasoning.js';
import { reserveCredits, settleCredits } from './wallet.js';
import { estimateFeatureCredits } from './pricing.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function groqKey() {
  return process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '';
}

function gptOssBuiltInToolsEnabled() {
  return String(process.env.GROQ_GPT_OSS_BUILTIN_TOOLS || 'true').toLowerCase() !== 'false';
}

/**
 * @param {object} opts
 * @param {string} [opts.workspaceId]
 * @param {string} [opts.feature] credit feature key
 * @param {string|null} [opts.model]
 * @param {Array} opts.messages
 * @param {number} [opts.temperature]
 * @param {number} [opts.max_tokens]
 * @param {boolean} [opts.json]
 * @param {object} [opts.meta]
 * @param {boolean} [opts.skipCredits]
 */
export async function meteredGroqChat(opts = {}) {
  const {
    workspaceId = 'marqq-ws-1',
    feature = 'groq_chat',
    model = null,
    messages = [],
    temperature = 0.3,
    max_tokens = 2000,
    json = false,
    meta = {},
    skipCredits = false,
    estimatedCredits = null,
  } = opts;

  const key = groqKey();
  if (!key) {
    return { ok: false, error: 'GROQ_API_KEY not configured', content: null, usage: null };
  }

  const resolved = resolveGroqModel(model);
  const estimate = estimatedCredits ?? estimateFeatureCredits(feature);
  let reservationId = null;

  if (!skipCredits) {
    const hold = reserveCredits({
      workspaceId,
      feature,
      estimatedCredits: estimate,
      meta: { ...meta, model: resolved },
    });
    if (!hold.ok) {
      return {
        ok: false,
        error: hold.error || 'insufficient_credits',
        insufficientCredits: true,
        estimatedCredits: hold.estimatedCredits,
        wallet: hold.wallet,
        content: null,
        usage: null,
      };
    }
    reservationId = hold.reservationId;
  }

  try {
    const body = withGroqReasoning(
      {
        model: resolved,
        messages,
        temperature,
        max_tokens,
        ...(isGptOssModel(resolved) && gptOssBuiltInToolsEnabled()
          ? {
              tools: [{ type: 'browser_search' }, { type: 'code_interpreter' }],
              tool_choice: 'auto',
            }
          : {}),
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      },
      resolved
    );

    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (reservationId) {
        settleCredits({
          reservationId,
          workspaceId,
          feature,
          provider: 'groq',
          model: resolved,
          status: 'error',
          meta: { ...meta, httpStatus: res.status, error: data?.error },
        });
      }
      return {
        ok: false,
        error: data?.error?.message || data?.error || `Groq ${res.status}`,
        content: null,
        usage: null,
      };
    }

    const content = data?.choices?.[0]?.message?.content || '';
    const usage = data?.usage || {};
    const promptTokens = usage.prompt_tokens || usage.promptTokens || 0;
    const completionTokens = usage.completion_tokens || usage.completionTokens || 0;

    let settle = null;
    if (reservationId) {
      settle = settleCredits({
        reservationId,
        workspaceId,
        feature,
        provider: 'groq',
        model: resolved,
        promptTokens,
        completionTokens,
        status: 'ok',
        meta,
      });
    }

    return {
      ok: true,
      content,
      model: resolved,
      executedTools: data?.choices?.[0]?.message?.executed_tools || data?.executed_tools || [],
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      credits: settle
        ? {
            estimatedCredits: settle.estimatedCredits,
            actualCredits: settle.actualCredits,
            actualUsd: settle.actualUsd,
            wallet: settle.wallet,
          }
        : null,
      raw: data,
    };
  } catch (err) {
    if (reservationId) {
      settleCredits({
        reservationId,
        workspaceId,
        feature,
        provider: 'groq',
        model: resolved,
        status: 'error',
        meta: { ...meta, error: err?.message },
      });
    }
    return { ok: false, error: err?.message || String(err), content: null, usage: null };
  }
}

function parseJsonLoose(raw) {
  const text = String(raw || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
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

/** Convenience: JSON-mode metered Groq. Set looseJson for compound / markdown fences. */
export async function meteredGroqJson(opts = {}) {
  const { looseJson = true, ...rest } = opts;
  const result = await meteredGroqChat({ ...rest, json: true });
  if (!result.ok) {
    if (looseJson && result.content) {
      const loose = parseJsonLoose(result.content);
      if (loose) return { ...result, ok: true, json: loose, error: undefined };
    }
    return result;
  }
  const parsed = looseJson ? parseJsonLoose(result.content) : null;
  if (parsed) return { ...result, json: parsed };
  try {
    const text = String(result.content || '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return { ...result, json: JSON.parse(text) };
  } catch (err) {
    return { ...result, ok: false, error: `JSON parse failed: ${err.message}`, json: null };
  }
}
