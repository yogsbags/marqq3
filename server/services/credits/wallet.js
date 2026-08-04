/**
 * Workspace credit wallet + usage ledger (JSON DB).
 * Flow: estimate → reserve → settle (actual tokens/USD) → adjust balance.
 */

import { randomUUID } from 'node:crypto';
import { getDb, updateDb } from '../../db.js';
import {
  PLAN_CREDITS,
  creditsToUsd,
  estimateFeatureCredits,
  falUsageToUsd,
  groqUsageToUsd,
  normalizePlan,
  usdToCredits,
} from './pricing.js';
import {
  loadWalletFromSupabase,
  scheduleLedgerPersist,
  scheduleWalletPersist,
} from './creditSupabase.js';

const DEFAULT_WS = 'marqq-ws-1';

function nowIso() {
  return new Date().toISOString();
}

function ensureCreditState(state) {
  return {
    ...state,
    credit_wallets: state.credit_wallets && typeof state.credit_wallets === 'object' ? state.credit_wallets : {},
    credit_ledger: Array.isArray(state.credit_ledger) ? state.credit_ledger : [],
    credit_reservations: state.credit_reservations && typeof state.credit_reservations === 'object'
      ? state.credit_reservations
      : {},
  };
}

function defaultWallet(workspaceId, plan = 'workspace') {
  const p = normalizePlan(plan);
  const total = PLAN_CREDITS[p] ?? PLAN_CREDITS.workspace;
  return {
    workspaceId,
    plan: p,
    credits_total: total,
    credits_remaining: total,
    credits_reserved: 0,
    credits_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    lifetime_spent: 0,
    lifetime_usd: 0,
    updatedAt: nowIso(),
  };
}

function maybeReset(wallet) {
  if (!wallet || wallet.credits_total === -1) return wallet;
  const resetAt = wallet.credits_reset_at ? Date.parse(wallet.credits_reset_at) : NaN;
  if (!Number.isFinite(resetAt) || resetAt > Date.now()) return wallet;
  const total = PLAN_CREDITS[normalizePlan(wallet.plan)] ?? wallet.credits_total;
  return {
    ...wallet,
    credits_total: total,
    credits_remaining: total,
    credits_reserved: 0,
    credits_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: nowIso(),
  };
}

export function getWallet(workspaceId = DEFAULT_WS) {
  const id = String(workspaceId || DEFAULT_WS).trim() || DEFAULT_WS;
  const db = ensureCreditState(getDb());
  let wallet = db.credit_wallets[id] || defaultWallet(id);
  wallet = maybeReset(wallet);
  if (!db.credit_wallets[id] || wallet !== db.credit_wallets[id]) {
    updateDb((state) => {
      const next = ensureCreditState(state);
      return {
        ...next,
        credit_wallets: { ...next.credit_wallets, [id]: wallet },
      };
    });
    scheduleWalletPersist(wallet);
  }
  return { ...wallet };
}

/**
 * Hydrate JSON DB from Supabase when local wallet is missing (UUID workspaces).
 * Call on credits GET / studio entry for durable balance across restarts.
 */
export async function hydrateWalletFromSupabase(workspaceId = DEFAULT_WS) {
  const id = String(workspaceId || DEFAULT_WS).trim() || DEFAULT_WS;
  const db = ensureCreditState(getDb());
  if (db.credit_wallets[id]) return getWallet(id);
  const remote = await loadWalletFromSupabase(id);
  if (!remote) return getWallet(id);
  let saved = null;
  updateDb((state) => {
    const next = ensureCreditState(state);
    saved = maybeReset({ ...remote, workspaceId: id });
    return {
      ...next,
      credit_wallets: { ...next.credit_wallets, [id]: saved },
    };
  });
  return saved ? { ...saved } : getWallet(id);
}

export function setWalletPlan(workspaceId, plan) {
  const id = String(workspaceId || DEFAULT_WS).trim();
  const p = normalizePlan(plan);
  const total = PLAN_CREDITS[p];
  let saved = null;
  updateDb((state) => {
    const next = ensureCreditState(state);
    const prev = next.credit_wallets[id] || defaultWallet(id, p);
    saved = {
      ...prev,
      plan: p,
      credits_total: total,
      credits_remaining: total === -1 ? -1 : total,
      credits_reserved: 0,
      credits_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: nowIso(),
    };
    return { ...next, credit_wallets: { ...next.credit_wallets, [id]: saved } };
  });
  scheduleWalletPersist(saved);
  return saved;
}

function appendLedger(next, entry) {
  const row = {
    id: `cu_${randomUUID().slice(0, 10)}`,
    at: nowIso(),
    ...entry,
  };
  return {
    ...next,
    credit_ledger: [row, ...(next.credit_ledger || [])].slice(0, 2000),
    lastLedger: row,
  };
}

/**
 * Reserve estimated credits before a provider call.
 * @returns {{ ok: boolean, reservationId?: string, estimatedCredits: number, wallet: object, error?: string }}
 */
export function reserveCredits({
  workspaceId = DEFAULT_WS,
  feature,
  estimatedCredits,
  meta = {},
  allowNegative = false,
} = {}) {
  const id = String(workspaceId || DEFAULT_WS).trim();
  const estimate = estimateFeatureCredits(feature, { estimatedCredits });
  let result = null;

  updateDb((state) => {
    const next = ensureCreditState(state);
    let wallet = maybeReset(next.credit_wallets[id] || defaultWallet(id));

    if (wallet.credits_remaining !== -1) {
      const available = wallet.credits_remaining - (wallet.credits_reserved || 0);
      if (!allowNegative && available < estimate) {
        result = {
          ok: false,
          error: 'insufficient_credits',
          estimatedCredits: estimate,
          wallet,
        };
        return { ...next, credit_wallets: { ...next.credit_wallets, [id]: wallet } };
      }
      wallet = {
        ...wallet,
        credits_reserved: (wallet.credits_reserved || 0) + estimate,
        updatedAt: nowIso(),
      };
    }

    const reservationId = `rsv_${randomUUID().slice(0, 10)}`;
    const reservation = {
      id: reservationId,
      workspaceId: id,
      feature: String(feature || 'unknown'),
      estimatedCredits: estimate,
      status: 'held',
      meta,
      createdAt: nowIso(),
    };

    result = { ok: true, reservationId, estimatedCredits: estimate, wallet };
    return {
      ...next,
      credit_wallets: { ...next.credit_wallets, [id]: wallet },
      credit_reservations: { ...next.credit_reservations, [reservationId]: reservation },
    };
  });

  if (result?.wallet) scheduleWalletPersist(result.wallet);
  return result;
}

/**
 * Settle a reservation with actual provider usage.
 */
export function settleCredits({
  reservationId,
  workspaceId,
  feature,
  provider,
  model = null,
  promptTokens = 0,
  completionTokens = 0,
  falKind = null,
  actualUsd = null,
  actualCredits = null,
  meta = {},
  status = 'ok',
} = {}) {
  let out = null;

  updateDb((state) => {
    const next = ensureCreditState(state);
    const rsv = reservationId ? next.credit_reservations[reservationId] : null;
    const id = String(workspaceId || rsv?.workspaceId || DEFAULT_WS).trim();
    let wallet = maybeReset(next.credit_wallets[id] || defaultWallet(id));
    const featureKey = feature || rsv?.feature || 'unknown';
    const estimated = rsv?.estimatedCredits ?? estimateFeatureCredits(featureKey);

    let usd = actualUsd;
    let tokens = {
      prompt: Number(promptTokens) || 0,
      completion: Number(completionTokens) || 0,
      total: (Number(promptTokens) || 0) + (Number(completionTokens) || 0),
    };

    if (usd == null && provider === 'groq') {
      const g = groqUsageToUsd({
        model,
        promptTokens: tokens.prompt,
        completionTokens: tokens.completion,
      });
      usd = g.usd;
    } else if (usd == null && provider === 'fal') {
      usd = falUsageToUsd(falKind || 'image');
    } else if (usd == null) {
      usd = creditsToUsd(estimated);
    }

    let actual = actualCredits != null ? Math.ceil(Number(actualCredits)) : usdToCredits(usd);
    if (!Number.isFinite(actual) || actual < 0) actual = estimated;
    // Failed calls: release hold without charge
    if (status === 'error' || status === 'cancelled') actual = 0;

    const delta = actual - estimated; // positive = extra charge

    if (wallet.credits_remaining !== -1) {
      // Release reservation hold
      wallet = {
        ...wallet,
        credits_reserved: Math.max(0, (wallet.credits_reserved || 0) - estimated),
      };
      // Deduct actual
      if (actual > 0) {
        wallet = {
          ...wallet,
          credits_remaining: Math.max(0, wallet.credits_remaining - actual),
          lifetime_spent: (wallet.lifetime_spent || 0) + actual,
          lifetime_usd: Number(((wallet.lifetime_usd || 0) + (usd || 0)).toFixed(6)),
          updatedAt: nowIso(),
        };
      } else {
        wallet = { ...wallet, updatedAt: nowIso() };
      }
    } else {
      wallet = {
        ...wallet,
        lifetime_spent: (wallet.lifetime_spent || 0) + actual,
        lifetime_usd: Number(((wallet.lifetime_usd || 0) + (usd || 0)).toFixed(6)),
        updatedAt: nowIso(),
      };
    }

    const reservations = { ...next.credit_reservations };
    if (rsv) {
      reservations[reservationId] = {
        ...rsv,
        status: status === 'ok' ? 'settled' : status,
        actualCredits: actual,
        actualUsd: usd,
        settledAt: nowIso(),
      };
    }

    const withLedger = appendLedger(
      {
        ...next,
        credit_wallets: { ...next.credit_wallets, [id]: wallet },
        credit_reservations: reservations,
      },
      {
        workspaceId: id,
        feature: featureKey,
        provider: provider || 'unknown',
        model,
        status,
        estimatedCredits: estimated,
        actualCredits: actual,
        deltaCredits: delta,
        actualUsd: usd,
        tokens,
        reservationId: reservationId || null,
        meta,
      }
    );

    out = {
      ok: true,
      wallet,
      estimatedCredits: estimated,
      actualCredits: actual,
      actualUsd: usd,
      tokens,
      ledgerEntry: withLedger.lastLedger,
    };
    const { lastLedger, ...rest } = withLedger;
    return rest;
  });

  if (out?.wallet) scheduleWalletPersist(out.wallet);
  if (out?.ledgerEntry) scheduleLedgerPersist(out.ledgerEntry);
  return out;
}

/** One-shot: no prior reserve (logs + deducts actual). */
export function chargeCredits(opts) {
  const hold = reserveCredits({
    workspaceId: opts.workspaceId,
    feature: opts.feature,
    estimatedCredits: opts.estimatedCredits ?? opts.actualCredits ?? 1,
    meta: opts.meta,
    allowNegative: opts.allowNegative,
  });
  if (!hold.ok) return hold;
  return settleCredits({
    ...opts,
    reservationId: hold.reservationId,
    estimatedCredits: hold.estimatedCredits,
  });
}

export function listLedger(workspaceId = DEFAULT_WS, { limit = 50 } = {}) {
  const id = String(workspaceId || DEFAULT_WS).trim();
  const db = ensureCreditState(getDb());
  return (db.credit_ledger || [])
    .filter((e) => !id || e.workspaceId === id)
    .slice(0, Math.min(200, Math.max(1, Number(limit) || 50)));
}

export function getUsageSummary(workspaceId = DEFAULT_WS) {
  const wallet = getWallet(workspaceId);
  const ledger = listLedger(workspaceId, { limit: 500 });
  const byProvider = {};
  const byFeature = {};
  let tokensIn = 0;
  let tokensOut = 0;
  for (const e of ledger) {
    if (e.status !== 'ok') continue;
    byProvider[e.provider] = (byProvider[e.provider] || 0) + (e.actualCredits || 0);
    byFeature[e.feature] = (byFeature[e.feature] || 0) + (e.actualCredits || 0);
    tokensIn += e.tokens?.prompt || 0;
    tokensOut += e.tokens?.completion || 0;
  }
  return {
    wallet,
    byProvider,
    byFeature,
    tokens: { prompt: tokensIn, completion: tokensOut, total: tokensIn + tokensOut },
    recent: ledger.slice(0, 20),
  };
}
