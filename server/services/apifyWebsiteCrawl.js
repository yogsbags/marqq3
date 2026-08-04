/**
 * Apify website-content-crawler — homepage / domain signals (Marqq2 lead-data-providers).
 */

import { apifyToken, runApifyActor, MARQQ_APIFY_ACTORS } from './apifyClient.js';

function normalizeDomain(raw) {
  let s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');
  s = s.split('/')[0].split('?')[0];
  return s;
}

/**
 * Crawl one start URL (homepage) and return compact brand/company signals.
 */
export async function fetchWebsiteSignals({ website, domain, companyName } = {}) {
  if (!apifyToken()) {
    return { ok: false, error: 'APIFY_TOKEN missing', actorId: MARQQ_APIFY_ACTORS.website_content_crawler };
  }

  const host = normalizeDomain(domain || website);
  if (!host) {
    return { ok: false, error: 'website or domain required', actorId: MARQQ_APIFY_ACTORS.website_content_crawler };
  }
  const startUrl = `https://${host}`;
  const actorId = process.env.APIFY_WEBSITE_ACTOR_ID || MARQQ_APIFY_ACTORS.website_content_crawler;

  try {
    const items = await runApifyActor(
      actorId,
      {
        startUrls: [{ url: startUrl }],
        maxCrawlPages: 1,
        maxCrawlDepth: 0,
        crawlerType: 'cheerio',
      },
      { timeoutMs: Number(process.env.APIFY_WEBSITE_TIMEOUT_MS || 90_000), limit: 3 }
    );
    const page = items[0] || null;
    if (!page) {
      return { ok: false, error: 'Apify returned no page content', actorId, website: startUrl };
    }
    if (page.error) {
      return { ok: false, error: String(page.error), actorId, website: startUrl };
    }

    const text = String(page.text || page.markdown || page.description || '')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      ok: true,
      actorId,
      source: 'apify_website_content_crawler',
      name: companyName || host,
      domain: host,
      website: startUrl,
      title: page.metadata?.title || page.title || null,
      description: String(page.metadata?.description || page.description || text).slice(0, 400) || null,
      signal_text: text.slice(0, 800) || null,
      scrapedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || String(err),
      actorId,
      website: startUrl,
    };
  }
}
