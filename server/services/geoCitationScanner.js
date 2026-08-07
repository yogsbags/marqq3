/**
 * GEO / LLMO citation scanner — live AI-answer visibility.
 *
 * Probes Google SERP (organic + AI Overview) and Perplexity for brand/domain citations.
 * Backs Maya's "GEO citation scanner" tool and Content Studio llmo/geo panels.
 *
 * Env:
 *   APIFY_TOKEN                 required for live scans
 *   GEO_SERP_ACTOR_ID           default apify/google-search-scraper
 *   GEO_SCAN_COUNTRY            default in
 *   GEO_SCAN_ENABLE_PERPLEXITY  default true
 */

import { apifyToken } from './apifyKeywords.js';

const APIFY_API = 'https://api.apify.com/v2';
const DEFAULT_SERP_ACTOR = 'apify/google-search-scraper';

/** @type {Map<string, object>} */
const scansById = new Map();
/** @type {Map<string, string>} workspaceId → latest scanId */
const latestByWorkspace = new Map();

function actorPath(actorId) {
  return String(actorId || DEFAULT_SERP_ACTOR).trim().replace('/', '~');
}

function pickStr(...vals) {
  for (const v of vals) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

function hostMatches(url, domain) {
  const d = String(domain || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase();
  if (!d) return false;
  try {
    const h = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    return h === d || h.endsWith(`.${d}`) || h.includes(d);
  } catch {
    return String(url || '')
      .toLowerCase()
      .includes(d);
  }
}

function collectUrls(obj, out = [], depth = 0) {
  if (!obj || depth > 6) return out;
  if (typeof obj === 'string') {
    if (/^https?:\/\//i.test(obj)) out.push(obj);
    return out;
  }
  if (Array.isArray(obj)) {
    for (const x of obj) collectUrls(x, out, depth + 1);
    return out;
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) collectUrls(v, out, depth + 1);
  }
  return out;
}

function textMentionsBrand(text, { domain, companyName }) {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  const d = String(domain || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase();
  const n = String(companyName || '').toLowerCase().trim();
  if (d && t.includes(d)) return true;
  if (n && n.length >= 3 && t.includes(n)) return true;
  return false;
}

async function runSerpActor(input) {
  const token = apifyToken();
  if (!token) {
    const err = new Error('APIFY_TOKEN not configured — cannot run GEO citation scan');
    err.code = 'APIFY_TOKEN_MISSING';
    throw err;
  }
  const actorId = String(process.env.GEO_SERP_ACTOR_ID || DEFAULT_SERP_ACTOR).trim();
  const url = `${APIFY_API}/acts/${encodeURIComponent(actorPath(actorId))}/runs?token=${encodeURIComponent(token)}&waitForFinish=300`;
  const start = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const started = await start.json().catch(() => ({}));
  if (!start.ok) {
    throw new Error(started?.error?.message || started?.error || `Apify start failed (${start.status})`);
  }
  let run = started.data;
  for (let i = 0; i < 90 && !['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run?.status); i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await fetch(`${APIFY_API}/actor-runs/${run.id}?token=${encodeURIComponent(token)}`);
    const sj = await st.json();
    run = sj.data;
  }
  if (run?.status !== 'SUCCEEDED') {
    throw new Error(`GEO SERP run ${run?.status || 'unknown'}: ${run?.id || '?'}`);
  }
  const itemsRes = await fetch(
    `${APIFY_API}/datasets/${run.defaultDatasetId}/items?token=${encodeURIComponent(token)}&clean=true&format=json`
  );
  const items = await itemsRes.json();
  return {
    runId: run.id,
    actorId,
    items: Array.isArray(items) ? items : [],
  };
}

function analyzeItem(item, { domain, companyName }) {
  const query = pickStr(item.searchQuery?.term, item.searchQuery?.query, item.searchQuery, item.query);
  const organic = Array.isArray(item.organicResults) ? item.organicResults : [];
  const ai = item.aiOverview || item.aiOverviewResult || item.fullAiOverview || item.ai_overview || null;
  const perplexity = item.perplexityResult || item.perplexity || item.perplexitySearch || null;

  const organicHits = organic
    .map((o, idx) => ({
      position: o.position ?? o.rank ?? idx + 1,
      title: pickStr(o.title).slice(0, 120),
      url: pickStr(o.url, o.link),
    }))
    .filter((o) => hostMatches(o.url, domain));

  const aiSources = [...new Set(collectUrls(ai))];
  const pxSources = [...new Set(collectUrls(perplexity))];
  const aiText = JSON.stringify(ai || {});
  const pxText = JSON.stringify(perplexity || {});

  const hasAiOverview = Boolean(ai && aiText.length > 40);
  const aiOverviewCitesBrand =
    aiSources.some((u) => hostMatches(u, domain)) || textMentionsBrand(aiText, { domain, companyName });
  const perplexityCitesBrand =
    pxSources.some((u) => hostMatches(u, domain)) || textMentionsBrand(pxText, { domain, companyName });

  return {
    query,
    organicCount: organic.length,
    organicCitesBrand: organicHits.length > 0,
    organicBrandHits: organicHits.slice(0, 5),
    hasAiOverview,
    aiOverviewCitesBrand,
    perplexityCitesBrand,
    aiSourceSample: aiSources.slice(0, 8),
    perplexitySourceSample: pxSources.slice(0, 8),
    topOrganic: organic.slice(0, 5).map((o, idx) => ({
      position: o.position ?? o.rank ?? idx + 1,
      title: pickStr(o.title).slice(0, 90),
      url: pickStr(o.url, o.link),
      citesBrand: hostMatches(pickStr(o.url, o.link), domain),
    })),
  };
}

function scoreScan(perQuery) {
  const n = perQuery.length || 1;
  const organicHits = perQuery.filter((q) => q.organicCitesBrand).length;
  const aiPresent = perQuery.filter((q) => q.hasAiOverview).length;
  const aiHits = perQuery.filter((q) => q.aiOverviewCitesBrand).length;
  const pxHits = perQuery.filter((q) => q.perplexityCitesBrand).length;

  // 0–100 visibility score (content opportunity high when low)
  const visibility = Math.round(
    ((organicHits / n) * 40 + (aiHits / n) * 40 + (pxHits / n) * 20) * 100
  ) / 100;

  let band = 'invisible';
  if (visibility >= 50) band = 'emerging';
  if (visibility >= 75) band = 'cited';
  if (organicHits === 0 && aiHits === 0 && pxHits === 0) band = 'invisible';

  const gaps = [];
  if (organicHits === 0) gaps.push('No organic SERP citations for brand domain — publish citeable FAQ/definition pages.');
  if (aiPresent > 0 && aiHits === 0) {
    gaps.push('AI Overviews appear but do not cite the brand — strengthen answer-first structure, FAQ schema, and third-party mentions.');
  }
  if (pxHits === 0) gaps.push('Perplexity does not cite the brand yet — earn citations via clear entities, comparisons, and authoritative pages.');
  if (!gaps.length) gaps.push('Brand appears in at least one AI/organic surface — expand topical clusters and refresh FAQs.');

  return {
    queries: n,
    organicHits,
    aiOverviewPresent: aiPresent,
    aiOverviewHits: aiHits,
    perplexityHits: pxHits,
    visibilityScore: visibility,
    band,
    gaps,
  };
}

/**
 * Build default GEO probe queries from brand + optional keywords.
 */
export function buildGeoQueries({ companyName, domain, keywords = [], niche = '' } = {}) {
  const brand = String(companyName || '').trim() || 'our brand';
  const d = String(domain || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0];
  const kws = (Array.isArray(keywords) ? keywords : [])
    .map((k) => String(k || '').trim())
    .filter((k) => k.length >= 3)
    .slice(0, 4);
  const nicheBit = String(niche || '').trim();

  const queries = [];
  for (const kw of kws) {
    queries.push(kw);
    queries.push(`best ${kw}`);
  }
  if (nicheBit) queries.push(`best ${nicheBit}`);
  if (brand) queries.push(`${brand} reviews`);
  if (d) queries.push(d);

  // unique, max 6 for cost control
  const uniq = [...new Set(queries.map((q) => q.toLowerCase().replace(/\s+/g, ' ').trim()))]
    .filter(Boolean)
    .slice(0, 6);
  return uniq;
}

/**
 * Run a GEO citation scan.
 * @param {object} opts
 * @param {string} opts.workspaceId
 * @param {string} opts.companyName
 * @param {string} opts.domain
 * @param {string[]} [opts.queries]
 * @param {string[]} [opts.keywords] — used if queries omitted
 * @param {string} [opts.niche]
 * @param {string} [opts.countryCode]
 * @param {boolean} [opts.enablePerplexity]
 */
export async function runGeoCitationScan(opts = {}) {
  const workspaceId = String(opts.workspaceId || opts.companyId || 'marqq-ws-1').trim();
  const companyName = String(opts.companyName || '').trim();
  const domain = String(opts.domain || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .trim();
  if (!domain && !companyName) {
    throw new Error('domain or companyName required for GEO scan');
  }

  const queries =
    Array.isArray(opts.queries) && opts.queries.length
      ? opts.queries.map(String).map((q) => q.trim()).filter(Boolean).slice(0, 8)
      : buildGeoQueries({
          companyName,
          domain,
          keywords: opts.keywords,
          niche: opts.niche,
        });

  if (!queries.length) throw new Error('No GEO queries to scan');

  const countryCode = String(opts.countryCode || process.env.GEO_SCAN_COUNTRY || 'in').toLowerCase();
  const enablePerplexity =
    opts.enablePerplexity !== false &&
    String(process.env.GEO_SCAN_ENABLE_PERPLEXITY || 'true').toLowerCase() !== 'false';

  const input = {
    queries: queries.join('\n'),
    maxPagesPerQuery: 1,
    countryCode,
    languageCode: 'en',
    aiOverview: { scrapeFullAiOverview: true },
    mobileResults: false,
    saveHtml: false,
    saveHtmlToKeyValueStore: false,
  };
  if (enablePerplexity) {
    input.perplexitySearch = { enablePerplexity: true };
  }

  const { runId, actorId, items } = await runSerpActor(input);
  const perQuery = items.map((it) => analyzeItem(it, { domain, companyName })).filter((q) => q.query);
  // If scraper doesn't tag query, zip with input order
  if (perQuery.every((q) => !q.query) || perQuery.length !== queries.length) {
    queries.forEach((q, i) => {
      if (items[i] && !perQuery[i]?.query) {
        const analyzed = analyzeItem(items[i], { domain, companyName });
        analyzed.query = q;
        perQuery[i] = analyzed;
      }
    });
  }
  // ensure query labels
  perQuery.forEach((row, i) => {
    if (!row.query) row.query = queries[i] || `query-${i + 1}`;
  });

  const summary = scoreScan(perQuery);
  const recommendations = [
    ...summary.gaps,
    'Ship answer-first pages with FAQ + key-takeaway (AEO structure already in Content Studio drafts).',
    'Target informational + commercial “what is / best / how” queries where AI Overviews fire.',
  ];

  const scan = {
    id: `geo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    workspaceId,
    companyName,
    domain,
    queries,
    countryCode,
    enablePerplexity,
    actorId,
    apifyRunId: runId,
    perQuery,
    summary,
    recommendations,
    llmo_notes: buildLlmoNotesFromScan({ companyName, domain, summary, perQuery }),
    createdAt: new Date().toISOString(),
  };

  scansById.set(scan.id, scan);
  latestByWorkspace.set(workspaceId, scan.id);
  return scan;
}

function buildLlmoNotesFromScan({ companyName, domain, summary, perQuery }) {
  const brand = companyName || domain || 'brand';
  const notes = [
    `GEO scan: visibility ${summary.visibilityScore}/100 (${summary.band}) for ${brand} on ${domain || 'domain'}.`,
    `Citations — organic ${summary.organicHits}/${summary.queries}, AI Overview ${summary.aiOverviewHits}/${summary.queries}, Perplexity ${summary.perplexityHits}/${summary.queries}.`,
  ];
  for (const g of summary.gaps.slice(0, 3)) notes.push(g);
  const misses = perQuery.filter((q) => q.hasAiOverview && !q.aiOverviewCitesBrand).slice(0, 2);
  for (const m of misses) {
    notes.push(`AI Overview fires for “${m.query}” without citing ${domain || brand} — prioritize a citeable page for this query.`);
  }
  return notes;
}

export function getGeoScan(scanId) {
  return scansById.get(String(scanId || '')) || null;
}

export function getLatestGeoScan(workspaceId) {
  const id = latestByWorkspace.get(String(workspaceId || ''));
  return id ? scansById.get(id) || null : null;
}

/**
 * Soft attach: run GEO for a content research plan (non-throwing wrapper).
 */
export async function attachGeoScanToResearchPlan(run, plan) {
  try {
    const keywords = (plan?.article_queue || []).map((q) => q.keyword).filter(Boolean).slice(0, 4);
    const scan = await runGeoCitationScan({
      workspaceId: run.workspaceId || run.companyId,
      companyName: run.companyName,
      domain: run.domain,
      keywords,
      niche: run.brandContext?.slice?.(0, 80) || '',
    });
    const mergedNotes = [...(Array.isArray(plan.llmo_notes) ? plan.llmo_notes : []), ...(scan.llmo_notes || [])];
    return {
      ...plan,
      llmo_notes: mergedNotes,
      geo_scan: {
        id: scan.id,
        summary: scan.summary,
        recommendations: scan.recommendations,
        perQuery: scan.perQuery,
        apifyRunId: scan.apifyRunId,
        createdAt: scan.createdAt,
      },
    };
  } catch (err) {
    return {
      ...plan,
      geo_scan: {
        error: err.message || 'GEO scan failed',
        skipped: true,
        createdAt: new Date().toISOString(),
      },
    };
  }
}
