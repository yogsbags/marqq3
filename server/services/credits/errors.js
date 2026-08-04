/**
 * Credit / metering errors (HTTP 402 Payment Required).
 */

export class InsufficientCreditsError extends Error {
  constructor({ wallet = null, estimatedCredits = 0, feature = 'unknown' } = {}) {
    super('insufficient_credits');
    this.name = 'InsufficientCreditsError';
    this.code = 'insufficient_credits';
    this.status = 402;
    this.wallet = wallet;
    this.estimatedCredits = estimatedCredits;
    this.feature = feature;
  }

  toJSON() {
    return {
      ok: false,
      error: 'insufficient_credits',
      code: this.code,
      feature: this.feature,
      estimatedCredits: this.estimatedCredits,
      wallet: this.wallet,
    };
  }
}

export function isInsufficientCredits(err) {
  return (
    err instanceof InsufficientCreditsError ||
    err?.code === 'insufficient_credits' ||
    err?.error === 'insufficient_credits' ||
    String(err?.message || '') === 'insufficient_credits'
  );
}

/** Express-friendly 402 response. */
export function sendCreditsError(res, err) {
  const payload =
    err instanceof InsufficientCreditsError
      ? err.toJSON()
      : {
          ok: false,
          error: 'insufficient_credits',
          code: 'insufficient_credits',
          estimatedCredits: err?.estimatedCredits,
          wallet: err?.wallet,
          feature: err?.feature,
        };
  return res.status(402).json(payload);
}
