/**
 * Fal AI credit metering helpers.
 */

import { reserveCredits, settleCredits } from './wallet.js';
import { estimateFeatureCredits, falUsageToUsd } from './pricing.js';

/**
 * Wrap a Fal call with reserve → settle.
 * @param {object} opts
 * @param {() => Promise<{ ok: boolean, error?: string, [k: string]: any }>} opts.run
 */
export async function withFalCredits({
  workspaceId = 'marqq-ws-1',
  feature = 'fal_image',
  falKind = 'image',
  model = null,
  meta = {},
  skipCredits = false,
  estimatedCredits = null,
  run,
} = {}) {
  if (typeof run !== 'function') throw new Error('withFalCredits requires run()');

  const estimate =
    estimatedCredits ??
    estimateFeatureCredits(feature.includes('video') ? 'fal_video' : feature);

  let reservationId = null;
  if (!skipCredits) {
    const hold = reserveCredits({
      workspaceId,
      feature,
      estimatedCredits: estimate,
      meta: { ...meta, model, falKind },
    });
    if (!hold.ok) {
      return {
        ok: false,
        error: hold.error || 'insufficient_credits',
        insufficientCredits: true,
        estimatedCredits: hold.estimatedCredits,
        wallet: hold.wallet,
      };
    }
    reservationId = hold.reservationId;
  }

  try {
    const result = await run();
    const failed = !result || result.ok === false || result.error;
    const usd = falUsageToUsd(falKind);

    if (reservationId) {
      settleCredits({
        reservationId,
        workspaceId,
        feature,
        provider: 'fal',
        model,
        falKind,
        actualUsd: failed ? 0 : usd,
        status: failed ? 'error' : 'ok',
        meta: { ...meta, ...(result?.meta || {}) },
      });
    }

    if (failed) {
      return {
        ok: false,
        error: result?.error || 'Fal call failed',
        ...(result || {}),
      };
    }
    return { ok: true, ...result };
  } catch (err) {
    if (reservationId) {
      settleCredits({
        reservationId,
        workspaceId,
        feature,
        provider: 'fal',
        model,
        falKind,
        status: 'error',
        meta: { ...meta, error: err?.message },
      });
    }
    return { ok: false, error: err?.message || String(err) };
  }
}
