/**
 * Credits public API surface.
 */
export {
  PLAN_CREDITS,
  PLAN_LABELS,
  FEATURE_ESTIMATES,
  CREDIT_USD,
  usdToCredits,
  creditsToUsd,
  groqUsageToUsd,
  falUsageToUsd,
  estimateFeatureCredits,
  normalizePlan,
} from './pricing.js';

export {
  getWallet,
  setWalletPlan,
  reserveCredits,
  settleCredits,
  chargeCredits,
  listLedger,
  getUsageSummary,
  hydrateWalletFromSupabase,
} from './wallet.js';

export { meteredGroqChat, meteredGroqJson } from './groqMeter.js';
export { withFalCredits } from './falMeter.js';
export {
  canAfford,
  assertCanAfford,
  meteredStudioJson,
  meteredStudioChat,
} from './studioGroq.js';
export {
  InsufficientCreditsError,
  isInsufficientCredits,
  sendCreditsError,
} from './errors.js';
