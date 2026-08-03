/**
 * Lightweight Apollo Signals — poll org enrich + news + job postings for ICP accounts.
 * Tools: APOLLO_ORGANIZATION_ENRICHMENT / SEARCH, APOLLO_SEARCH_NEWS_ARTICLES,
 *        APOLLO_GET_ORGANIZATION_JOB_POSTINGS
 */
import { executeComposioAction, executeComposioProxy } from './composio.js';
import { buildCustomer360 } from './customer360.js';
import { listOutreachRuns } from './outreach.js';
import { listWorkspaceOutreachRuns } from './outreachPersist.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 15;

/** @type {Map<string, { at: number, payload: object }>} */
const cacheByWorkspace = new Map();

const CONSUMER_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'mail.com',
  'yandex.com',
  'zoho.com',
]);

export function normalizeDomain(raw) {
  let d = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/@.*/, '')
    .replace(/^\.+/, '');
  if (d.includes('@')) d = d.split('@').pop();
  return d || '';
}

function domainFromEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@')) return '';
  return normalizeDomain(e.split('@').pop());
}

function isUsefulDomain(domain) {
  const d = normalizeDomain(domain);
  if (!d || !d.includes('.')) return false;
  if (CONSUMER_DOMAINS.has(d)) return false;
  return true;
}

function unwrapResult(res) {
  if (!res || res.error) return null;
  const r = res.result;
  if (!r) return null;
  if (r.data && typeof r.data === 'object') return r.data;
  if (r.organization || r.organizations || r.news_articles || r.job_postings) return r;
  return r;
}

function orgFromEnrich(data) {
  if (!data) return null;
  return data.organization || data.company || data;
}

function orgListFromSearch(data) {
  if (!data) return [];
  const list =
    data.organizations ||
    data.accounts ||
    data.organization ||
    (Array.isArray(data) ? data : null);
  if (Array.isArray(list)) return list;
  if (list && typeof list === 'object') return [list];
  return [];
}

function newsList(data) {
  if (!data) return [];
  const list = data.news_articles || data.articles || data.news || data.items;
  return Array.isArray(list) ? list : [];
}

function jobsList(data) {
  if (!data) return [];
  const list = data.job_postings || data.organization_job_postings || data.jobs || data.items;
  return Array.isArray(list) ? list : [];
}

export function deriveAccountSignals({ organization = null, news = [], jobs = [] } = {}) {
  const signals = [];
  const c = organization || {};

  if (c.funding || c.latest_funding_amount || c.latest_funding_stage || c.total_funding) {
    signals.push({
      type: 'funding',
      strength: 'high',
      text: `Funding: ${[c.funding, c.latest_funding_amount, c.latest_funding_stage, c.total_funding]
        .filter(Boolean)
        .join(' · ')}`,
    });
  }

  if (c.employee_count || c.estimated_num_employees || c.employee_range) {
    signals.push({
      type: 'company_scale',
      strength: 'medium',
      text: `Scale: ${c.employee_count || c.estimated_num_employees || c.employee_range} employees`,
    });
  }

  if (Array.isArray(c.technologies) && c.technologies.length) {
    const tech = c.technologies
      .map((t) => (typeof t === 'string' ? t : t?.name || t?.uid))
      .filter(Boolean)
      .slice(0, 6);
    if (tech.length) {
      signals.push({
        type: 'tech_stack',
        strength: 'medium',
        text: `Tech: ${tech.join(', ')}`,
      });
    }
  }

  for (const article of news.slice(0, 3)) {
    const title = article.title || article.headline || article.name;
    if (!title) continue;
    signals.push({
      type: 'news',
      strength: /fund|acqui|launch|partner|series|raise/i.test(title) ? 'high' : 'medium',
      text: title,
      url: article.url || article.link || article.source_url || null,
      published_at: article.published_at || article.date || null,
    });
  }

  if (jobs.length) {
    const titles = jobs
      .map((j) => j.title || j.job_title || j.name)
      .filter(Boolean)
      .slice(0, 4);
    signals.push({
      type: 'hiring',
      strength: jobs.length >= 5 ? 'high' : 'medium',
      text:
        titles.length > 0
          ? `Hiring (${jobs.length}): ${titles.join(' · ')}`
          : `${jobs.length} open role${jobs.length === 1 ? '' : 's'}`,
    });
  }

  return signals.slice(0, 8);
}

/**
 * Deduped ICP-ish accounts from Customer 360 + outreach runs.
 */
export async function collectTargetAccounts(companyId, { limit = DEFAULT_LIMIT } = {}) {
  const id = String(companyId || '').trim();
  const cap = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));
  /** @type {Map<string, { name: string, domain: string, sources: string[] }>} */
  const map = new Map();

  const upsert = (name, domain, source) => {
    const d = normalizeDomain(domain);
    const n = String(name || '').trim();
    if (!isUsefulDomain(d) && !n) return;
    const key = isUsefulDomain(d) ? `d:${d}` : `n:${n.toLowerCase()}`;
    const prev = map.get(key);
    if (prev) {
      if (!prev.domain && isUsefulDomain(d)) prev.domain = d;
      if ((!prev.name || prev.name.length < 2) && n) prev.name = n;
      if (source && !prev.sources.includes(source)) prev.sources.push(source);
      return;
    }
    map.set(key, {
      name: n || d,
      domain: isUsefulDomain(d) ? d : '',
      sources: source ? [source] : [],
    });
  };

  try {
    const c360 = await buildCustomer360(id, { limit: 100 });
    for (const acc of c360?.accounts || []) {
      const company = acc.company || acc.name || '';
      const domain = domainFromEmail(acc.email) || normalizeDomain(acc.domain || acc.website || '');
      upsert(company, domain, 'customer360');
    }
  } catch (err) {
    console.warn('[apollo-signals] customer360:', err.message);
  }

  try {
    let runs = listOutreachRuns(id);
    if (!runs?.length) {
      const persisted = await listWorkspaceOutreachRuns(id).catch(() => []);
      runs = Array.isArray(persisted) ? persisted : [];
    }
    for (const run of runs || []) {
      for (const p of run.prospects || []) {
        upsert(p.company || '', domainFromEmail(p.email) || normalizeDomain(p.domain || ''), 'outreach');
      }
    }
  } catch (err) {
    console.warn('[apollo-signals] outreach:', err.message);
  }

  // Prefer accounts with domains first
  const ranked = [...map.values()].sort((a, b) => {
    const ad = a.domain ? 1 : 0;
    const bd = b.domain ? 1 : 0;
    if (bd !== ad) return bd - ad;
    return String(a.name).localeCompare(String(b.name));
  });

  return ranked.slice(0, cap);
}

async function resolveOrganization(entityId, { name, domain } = {}) {
  const d = normalizeDomain(domain);
  if (d) {
    const enrich = await executeComposioAction(
      'APOLLO_ORGANIZATION_ENRICHMENT',
      { domain: d },
      entityId,
      'apollo'
    );
    if (!enrich.error) {
      const org = orgFromEnrich(unwrapResult(enrich));
      if (org && (org.id || org.organization_id || org.name)) {
        return { organization: org, via: 'organization_enrichment', error: null };
      }
    }
  }

  const q = name || d;
  if (!q) return { organization: null, via: null, error: 'name or domain required' };

  const search = await executeComposioAction(
    'APOLLO_ORGANIZATION_SEARCH',
    {
      page: 1,
      per_page: 1,
      q_organization_name: q,
      ...(d ? { q_organization_domains_list: [d] } : {}),
    },
    entityId,
    'apollo'
  );
  if (search.error) {
    return { organization: null, via: 'organization_search', error: search.error };
  }
  const org = orgListFromSearch(unwrapResult(search))[0] || null;
  return { organization: org, via: 'organization_search', error: org ? null : 'org_not_found' };
}

async function fetchNews(entityId, organizationId) {
  if (!organizationId) return { items: [], error: 'organization_id required' };
  const res = await executeComposioAction(
    'APOLLO_SEARCH_NEWS_ARTICLES',
    {
      organization_ids: [organizationId],
      page: 1,
      per_page: 5,
    },
    entityId,
    'apollo'
  );
  if (!res.error) {
    return { items: newsList(unwrapResult(res)).slice(0, 5), error: null, via: 'composio_tool' };
  }

  // Composio toolkit may not expose the news slug — fall back to Apollo REST via proxy
  const qs = new URLSearchParams({
    page: '1',
    per_page: '5',
  });
  qs.append('organization_ids[]', organizationId);
  const proxy = await executeComposioProxy({
    toolkit: 'apollo',
    userId: entityId,
    method: 'POST',
    endpoint: `https://api.apollo.io/api/v1/news_articles/search?${qs.toString()}`,
    body: {
      organization_ids: [organizationId],
      page: 1,
      per_page: 5,
    },
  });
  if (proxy.error) {
    return { items: [], error: res.error || proxy.error, via: 'proxy_failed' };
  }
  return { items: newsList(unwrapResult(proxy)).slice(0, 5), error: null, via: 'apollo_proxy' };
}

async function fetchJobs(entityId, organizationId, domain) {
  if (!organizationId) return { items: [], error: 'organization_id required' };
  const args = {
    organization_id: organizationId,
    page: 1,
    per_page: 10,
  };
  if (domain) args.q_organization_domains = normalizeDomain(domain);
  const res = await executeComposioAction(
    'APOLLO_GET_ORGANIZATION_JOB_POSTINGS',
    args,
    entityId,
    'apollo'
  );
  if (res.error) return { items: [], error: res.error };
  return { items: jobsList(unwrapResult(res)).slice(0, 10), error: null };
}

async function pollAccount(entityId, account) {
  const started = Date.now();
  const { organization, via, error: resolveError } = await resolveOrganization(entityId, account);
  const orgId = organization?.id || organization?.organization_id || null;
  const domain =
    normalizeDomain(account.domain) ||
    normalizeDomain(organization?.primary_domain || organization?.domain || organization?.website_url);

  let news = { items: [], error: null };
  let jobs = { items: [], error: null };
  if (orgId) {
    // Sequential to stay gentle on Apollo rate limits
    news = await fetchNews(entityId, orgId);
    jobs = await fetchJobs(entityId, orgId, domain);
  }

  const signals = deriveAccountSignals({
    organization,
    news: news.items,
    jobs: jobs.items,
  });

  return {
    name: account.name || organization?.name || domain || 'Account',
    domain: domain || '',
    sources: account.sources || [],
    organization_id: orgId,
    organization: organization
      ? {
          name: organization.name || null,
          industry: organization.industry || organization.industries?.[0] || null,
          employee_count:
            organization.estimated_num_employees ||
            organization.employee_count ||
            organization.employee_range ||
            null,
          linkedin_url: organization.linkedin_url || null,
          website_url: organization.website_url || (domain ? `https://${domain}` : null),
        }
      : null,
    resolve_via: via,
    resolve_error: resolveError,
    news: news.items.map((a) => ({
      title: a.title || a.headline || a.name || 'News',
      url: a.url || a.link || a.source_url || null,
      published_at: a.published_at || a.date || null,
      category: a.category || a.categories?.[0] || null,
    })),
    news_error: news.error,
    job_postings: jobs.items.map((j) => ({
      title: j.title || j.job_title || j.name || 'Role',
      url: j.url || j.job_url || j.linkedin_url || null,
      location: j.location || j.city || null,
      posted_at: j.posted_at || j.last_seen_at || j.created_at || null,
    })),
    jobs_error: jobs.error,
    signals,
    duration_ms: Date.now() - started,
  };
}

/**
 * Poll Apollo for ICP account signals.
 */
export async function runApolloSignals({
  companyId,
  accounts: overrideAccounts = null,
  limit = DEFAULT_LIMIT,
  refresh = false,
  signalTypes = ['news', 'jobs', 'org_enrich'],
} = {}) {
  const id = String(companyId || '').trim();
  if (!id) {
    const err = new Error('companyId required');
    err.status = 400;
    throw err;
  }

  const cacheKey = `${id}:${Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT)}`;
  if (!refresh) {
    const hit = cacheByWorkspace.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return { ...hit.payload, cached: true };
    }
  }

  const accounts =
    Array.isArray(overrideAccounts) && overrideAccounts.length
      ? overrideAccounts
          .map((a) => ({
            name: String(a.name || a.company || '').trim(),
            domain: normalizeDomain(a.domain || a.website || domainFromEmail(a.email)),
            sources: Array.isArray(a.sources) ? a.sources : ['request'],
          }))
          .filter((a) => a.name || a.domain)
          .slice(0, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT))
      : await collectTargetAccounts(id, { limit });

  if (!accounts.length) {
    const payload = {
      ok: true,
      source: 'apollo',
      cached: false,
      updatedAt: new Date().toISOString(),
      companyId: id,
      accounts: [],
      note: 'No ICP accounts with company/domain yet — fetch leads in Outreach or sync CRM.',
      signalTypes,
    };
    cacheByWorkspace.set(cacheKey, { at: Date.now(), payload });
    return payload;
  }

  const results = [];
  for (const account of accounts) {
    try {
      // eslint-disable-next-line no-await-in-loop
      results.push(await pollAccount(id, account));
    } catch (err) {
      results.push({
        name: account.name,
        domain: account.domain,
        sources: account.sources,
        error: err.message || String(err),
        signals: [],
        news: [],
        job_postings: [],
      });
    }
  }

  const payload = {
    ok: true,
    source: 'apollo',
    cached: false,
    updatedAt: new Date().toISOString(),
    companyId: id,
    accounts: results,
    signalTypes,
    polled: results.length,
  };
  cacheByWorkspace.set(cacheKey, { at: Date.now(), payload });
  return payload;
}
