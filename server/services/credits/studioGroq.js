/**
 * Drop-in metered Groq helpers for studios / GTM / agents.
 * Hard-gates on insufficient balance before the provider call.
 */

import { getWallet } from './wallet.js';
import { estimateFeatureCredits } from './pricing.js';
import { meteredGroqChat, meteredGroqJson } from './groqMeter.js';
import { InsufficientCreditsError } from './errors.js';

const DEFAULT_WS = 'marqq-ws-1';

export function canAfford(workspaceId, feature, estimatedCredits = null) {
  const id = String(workspaceId || DEFAULT_WS).trim() || DEFAULT_WS;
  const estimate = estimateFeatureCredits(feature, { estimatedCredits });
  const wallet = getWallet(id);
  if (wallet.credits_remaining === -1) {
    return { ok: true, estimatedCredits: estimate, wallet, available: -1 };
  }
  const available = wallet.credits_remaining - (wallet.credits_reserved || 0);
  return {
    ok: available >= estimate,
    estimatedCredits: estimate,
    wallet,
    available,
  };
}

/** Throws InsufficientCreditsError when balance cannot cover the feature estimate. */
export function assertCanAfford(workspaceId, feature, estimatedCredits = null) {
  const check = canAfford(workspaceId, feature, estimatedCredits);
  if (!check.ok) {
    throw new InsufficientCreditsError({
      wallet: check.wallet,
      estimatedCredits: check.estimatedCredits,
      feature,
    });
  }
  return check;
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

/**
 * Metered JSON completion — throws on insufficient credits or provider failure.
 * Compatible replacement for local studio `groqJson` helpers.
 *
 * @returns {Promise<object>} parsed JSON
 */
export async function meteredStudioJson({
  workspaceId = DEFAULT_WS,
  feature = 'groq_chat',
  system,
  user,
  messages,
  model = null,
  temperature = 0.35,
  max_tokens = 4000,
  estimatedCredits = null,
  meta = {},
  skipCredits = false,
  hardGate = true,
} = {}) {
  if (hardGate && !skipCredits) {
    assertCanAfford(workspaceId, feature, estimatedCredits);
  }

  const payloadMessages =
    Array.isArray(messages) && messages.length
      ? messages
      : [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...(user ? [{ role: 'user', content: user }] : []),
        ];

  const result = await meteredGroqJson({
    workspaceId,
    feature,
    model,
    messages: payloadMessages,
    temperature,
    max_tokens,
    estimatedCredits,
    meta,
    skipCredits,
    looseJson: true,
  });

  if (result.insufficientCredits) {
    throw new InsufficientCreditsError({
      wallet: result.wallet,
      estimatedCredits: result.estimatedCredits,
      feature,
    });
  }
  if (!result.ok) {
    // Try loose parse on raw content before failing (compound models)
    const loose = parseJsonLoose(result.content);
    if (loose) return loose;
    throw new Error(result.error || 'Groq JSON call failed');
  }
  if (result.json) return result.json;
  const loose = parseJsonLoose(result.content);
  if (!loose) throw new Error('Model returned non-JSON content');
  return loose;
}

/**
 * Metered text completion — throws on insufficient credits.
 * @returns {Promise<{ content: string, model?: string, usage?: object, credits?: object }>}
 */
export async function meteredStudioChat({
  workspaceId = DEFAULT_WS,
  feature = 'groq_chat',
  system,
  user,
  messages,
  model = null,
  temperature = 0.4,
  max_tokens = 2048,
  json = false,
  estimatedCredits = null,
  meta = {},
  skipCredits = false,
  hardGate = true,
} = {}) {
  if (hardGate && !skipCredits) {
    assertCanAfford(workspaceId, feature, estimatedCredits);
  }

  const payloadMessages =
    Array.isArray(messages) && messages.length
      ? messages
      : [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...(user ? [{ role: 'user', content: user }] : []),
        ];

  const result = await meteredGroqChat({
    workspaceId,
    feature,
    model,
    messages: payloadMessages,
    temperature,
    max_tokens,
    json,
    estimatedCredits,
    meta,
    skipCredits,
  });

  if (result.insufficientCredits) {
    throw new InsufficientCreditsError({
      wallet: result.wallet,
      estimatedCredits: result.estimatedCredits,
      feature,
    });
  }
  if (!result.ok) throw new Error(result.error || 'Groq chat failed');
  return result;
}
