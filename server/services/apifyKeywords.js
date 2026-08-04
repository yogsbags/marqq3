/**
 * Apify pay-per-event keyword research — default Actor: s-r/google-keywords
 * Pricing: ~$0.002 per keyword analyzed (PPE; no platform compute charge).
 *
 * Env:
 *   APIFY_TOKEN              required
 *   APIFY_KEYWORD_ACTOR_ID   optional override (default s-r/google-keywords)
 *   APIFY_KEYWORD_COUNTRY    default in (India) — ISO-2
 *   APIFY_KEYWORD_LANGUAGE   default en
 *   APIFY_KEYWORD_LIMIT      default 40 (1–500)
 *   APIFY_KEYWORD_MIN_VOLUME default 10
 */

const APIFY_API = 'https://api.apify.com/v2';
const DEFAULT_ACTOR = 's-r/google-keywords';

export function apifyToken() {
  return String(process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || '').trim();
}

export function resolveKeywordActorId() {
  return String(process.env.APIFY_KEYWORD_ACTOR_ID || DEFAULT_ACTOR).trim();
}

function actorRunPath(actorId) {
  // username/name → username~name for Apify REST
  const id = String(actorId || '').trim().replace('/', '~');
  return `${APIFY_API}/acts/${encodeURIComponent(id)}/run-sync-get-dataset-items`;
}

function pickStr(...vals) {
  for (const v of vals) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

function pickNum(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Classify buyer-fit for B2B/B2C content planning.
 * commercial/transactional > informational > career/job noise.
 */
export function classifyKeywordIntent(keyword, hintedIntent = null) {
  const k = String(keyword || '').toLowerCase();
  const hint = String(hintedIntent || '').toLowerCase();

  if (
    /\b(salary|salaries|wage|wages|job|jobs|hiring|recruit|career|careers|internship|resume|cv|glassdoor|indeed)\b/i.test(
      k
    )
  ) {
    return 'career';
  }
  if (/\b(near me|in [a-z]+$)\b/i.test(k) && /\b(consultant|agency|company|firm|services?)\b/i.test(k)) {
    return 'commercial';
  }
  if (
    /\b(hire|hiring|agency|consultant|consulting|services?|company|firm|pricing|cost|quote|proposal|vendor|partner|roadmap|framework|implementation|execution)\b/i.test(
      k
    ) ||
    hint.includes('commercial') ||
    hint.includes('transaction')
  ) {
    if (/\b(how to|what is|what are|meaning of|definition)\b/i.test(k)) return 'informational';
    return 'commercial';
  }
  if (/\b(buy|purchase|software|tool|platform|demo|trial)\b/i.test(k) || hint.includes('transaction')) {
    return 'transactional';
  }
  if (/\b(how to|what is|what are|why|guide|examples?|vs|versus|difference)\b/i.test(k) || hint.includes('info')) {
    return 'informational';
  }
  return hint || 'informational';
}

/** Higher = better lead-gen / service-content pick. Volume alone must not win over salary terms. */
export function scoreKeywordForContent(row = {}, { marketType = 'b2b' } = {}) {
  const intent = classifyKeywordIntent(row.keyword, row.intent);
  const volume = Number(row.volume) || 0;
  const cpc = Number(row.cpc) || 0;
  const difficulty = row.difficulty == null ? 50 : Number(row.difficulty);

  let score = Math.log10(volume + 1) * 12;
  if (intent === 'commercial') score += 40;
  else if (intent === 'transactional') score += marketType === 'b2c' ? 45 : 30;
  else if (intent === 'informational') score += 18;
  else if (intent === 'career') score -= 50;

  if (cpc > 0) score += Math.min(15, cpc * 2);
  // Mild preference for achievable KD
  if (difficulty > 0 && difficulty < 45) score += 6;
  if (difficulty >= 75) score -= 4;

  // Service-y modifiers for B2B
  if (marketType !== 'b2c') {
    if (/\b(consulting|consultant|services?|strategy|roadmap|transformation|implementation)\b/i.test(row.keyword || '')) {
      score += 10;
    }
    if (/\bindia\b/i.test(row.keyword || '')) score += 4;
  }

  return { intent, score: Math.round(score * 10) / 10 };
}

/** Normalize heterogeneous Actor dataset rows into a stable keyword shape. */
export function normalizeKeywordRows(items = [], { marketType = 'b2b' } = {}) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  const seen = new Set();

  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const keyword = pickStr(
      row.keyword,
      row.query,
      row.term,
      row.seed_keyword,
      row.seedKeyword,
      row.keyword_text,
      row.text,
      row.suggestion
    );
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const base = {
      keyword,
      volume: pickNum(row.volume, row.search_volume, row.searchVolume, row.avg_monthly_searches, row.monthlySearches) ?? 0,
      cpc: pickNum(row.cpc, row.CPC, row.avg_cpc, row.averageCpc),
      difficulty: pickNum(
        row.difficulty,
        row.seo_difficulty,
        row.seoDifficulty,
        row.kd,
        row.keyword_difficulty,
        row.keywordDifficulty
      ),
      paid_difficulty: pickNum(row.paid_difficulty, row.paidDifficulty, row.competition_index, row.competition),
      intent: pickStr(row.intent, row.search_intent, row.searchIntent) || null,
      country: pickStr(row.country, row.geo) || null,
      source: pickStr(row.source) || 'apify',
    };
    const scored = scoreKeywordForContent(base, { marketType });
    out.push({
      ...base,
      intent: scored.intent,
      content_score: scored.score,
    });
  }

  return out.sort((a, b) => (b.content_score || 0) - (a.content_score || 0) || (b.volume || 0) - (a.volume || 0));
}

/**
 * Run PPE keyword Actor for one seed.
 * @returns {{ ok: boolean, keywords: object[], actorId: string, error?: string, rawCount?: number }}
 */
export async function runApifyKeywordResearch({
  seed,
  country,
  language,
  limit,
  minVolume,
  actorId,
} = {}) {
  const token = apifyToken();
  if (!token) {
    return { ok: false, keywords: [], actorId: resolveKeywordActorId(), error: 'APIFY_TOKEN missing' };
  }
  const kw = String(seed || '').trim();
  if (!kw) {
    return { ok: false, keywords: [], actorId: resolveKeywordActorId(), error: 'seed keyword required' };
  }

  const resolvedActor = actorId || resolveKeywordActorId();
  const body = {
    keyword: kw,
    country: String(country || process.env.APIFY_KEYWORD_COUNTRY || 'in').toLowerCase(),
    language: String(language || process.env.APIFY_KEYWORD_LANGUAGE || 'en').toLowerCase(),
    limit: Math.min(500, Math.max(1, Number(limit || process.env.APIFY_KEYWORD_LIMIT || 40))),
    min_volume: Math.max(0, Number(minVolume ?? process.env.APIFY_KEYWORD_MIN_VOLUME ?? 10)),
  };

  const url = `${actorRunPath(resolvedActor)}?token=${encodeURIComponent(token)}`;
  const controller = new AbortController();
  const timeoutMs = Number(process.env.APIFY_KEYWORD_TIMEOUT_MS || 180_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        data?.error?.message ||
        data?.error ||
        (typeof data === 'string' ? data : null) ||
        `Apify HTTP ${res.status}`;
      return { ok: false, keywords: [], actorId: resolvedActor, error: String(msg), input: body };
    }

    const items = Array.isArray(data) ? data : data?.items || data?.data || [];
    const keywords = normalizeKeywordRows(items);
    return {
      ok: keywords.length > 0,
      keywords,
      actorId: resolvedActor,
      rawCount: Array.isArray(items) ? items.length : 0,
      input: body,
      error: keywords.length ? undefined : 'Actor returned no keyword rows',
    };
  } catch (err) {
    return {
      ok: false,
      keywords: [],
      actorId: resolvedActor,
      error: err.name === 'AbortError' ? `Apify timeout after ${timeoutMs}ms` : err.message || 'Apify fetch failed',
      input: body,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Research several seeds (sequential to control PPE spend). Dedupes + ranks by content_score.
 */
export async function researchKeywordsFromSeeds(seeds = [], opts = {}) {
  const uniqueSeeds = [...new Set(seeds.map((s) => String(s || '').trim()).filter(Boolean))].slice(
    0,
    Number(opts.maxSeeds || process.env.APIFY_KEYWORD_MAX_SEEDS || 4)
  );
  const merged = [];
  const runs = [];
  const marketType = opts.marketType || 'b2b';

  for (const seed of uniqueSeeds) {
    const result = await runApifyKeywordResearch({ ...opts, seed });
    runs.push({ seed, ok: result.ok, count: result.keywords.length, error: result.error || null, actorId: result.actorId });
    if (result.ok) merged.push(...result.keywords);
  }

  const keywords = normalizeKeywordRows(merged, { marketType });
  return {
    ok: keywords.length > 0,
    keywords,
    seeds: uniqueSeeds,
    runs,
    actorId: resolveKeywordActorId(),
  };
}
