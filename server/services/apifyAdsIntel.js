/**
 * Competitor ads intel via Apify (Marqq2 automations/handlers/ads.js).
 * Actors:
 *   silva95gustavo/linkedin-ad-library-scraper
 *   dz_omar/facebook-ads-scraper-pro
 *   ivanvs/google-ads-scraper
 */

import { apifyToken, runApifyActor, MARQQ_APIFY_ACTORS } from './apifyClient.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scrapeLinkedIn(competitorName, linkedinCompany, country, limit) {
  const companySlug = String(linkedinCompany || '')
    .replace(/^https?:\/\/[^/]+\/company\//, '')
    .replace(/\/$/, '');
  const searchUrl = `https://www.linkedin.com/ad-library/search?accountOwner=${encodeURIComponent(companySlug)}&countries=${country}&dateOption=last-30-days`;

  const items = await runApifyActor(
    process.env.APIFY_LINKEDIN_ADS_ACTOR_ID || MARQQ_APIFY_ACTORS.linkedin_ad_library,
    {
      startUrls: [{ url: searchUrl }],
      resultsLimit: limit,
      skipDetails: false,
    },
    { limit: Math.max(limit, 20), timeoutMs: 240_000 }
  );

  return (items || []).map((item) => ({
    competitor_name: competitorName,
    platform: 'linkedin',
    ad_id: String(item.adId || item.id || Math.random().toString(36).slice(2)),
    advertiser: item.advertiserName || item.companyName || competitorName,
    headline: item.headline || item.title || null,
    body: item.body || item.description || item.text || null,
    cta_text: item.callToAction || item.cta || null,
    destination_url: item.landingPageUrl || item.url || null,
    media_type: item.type || item.adType || null,
    media_url: item.mediaUrl || item.imageUrl || item.videoUrl || null,
    is_active: item.isActive ?? true,
    start_date: item.startDate || item.startedAt || null,
    end_date: item.endDate || item.endedAt || null,
  }));
}

async function scrapeFacebook(competitorName, facebookPage, country, limit) {
  const items = await runApifyActor(
    process.env.APIFY_FACEBOOK_ADS_ACTOR_ID || MARQQ_APIFY_ACTORS.facebook_ads,
    {
      searchAdvertisers: [facebookPage],
      maxResultsPerQuery: Math.max(limit, 10),
      countries: country,
      contentLanguages: ['en'],
      activeStatus: 'ALL',
      adType: 'ALL',
      mediaType: 'ALL',
      sortBy: 'SORT_BY_TOTAL_IMPRESSIONS',
    },
    { limit: Math.max(limit, 20), timeoutMs: 240_000 }
  );

  return (items || []).map((item) => ({
    competitor_name: competitorName,
    platform: 'facebook',
    ad_id: String(item.id || item.adId || item.adArchiveID || Math.random().toString(36).slice(2)),
    advertiser: item.pageName || item.advertiserName || competitorName,
    headline: item.title || item.headline || null,
    body: item.body || item.adCreativeBody || item.description || null,
    cta_text: item.ctaText || item.callToAction?.type || null,
    destination_url: item.landingPageUrls?.[0] || item.linkUrl || null,
    media_type: item.adCreativeMediaType || item.mediaType || null,
    media_url: item.videoUrl || item.imageUrls?.[0] || null,
    impressions_min: item.impressionsWith?.lowerBound || null,
    impressions_max: item.impressionsWith?.upperBound || null,
    is_active: item.isActive ?? null,
    start_date: item.startDate || item.adDeliveryStartTime || null,
    end_date: item.endDate || item.adDeliveryStopTime || null,
  }));
}

async function scrapeGoogle(competitorName, googleDomain, country, limit) {
  const domain = String(googleDomain || '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
  const searchUrl = `https://adstransparency.google.com/?region=${String(country).toUpperCase()}&domain=${encodeURIComponent(domain)}`;

  const items = await runApifyActor(
    process.env.APIFY_GOOGLE_ADS_ACTOR_ID || MARQQ_APIFY_ACTORS.google_ads,
    {
      urls: [{ url: searchUrl }],
      maxRecords: limit,
    },
    { limit: Math.max(limit, 20), timeoutMs: 240_000 }
  );

  return (items || [])
    .filter((item) => item.creativeId || item.type !== 'NO_ADS')
    .map((item) => {
      const byRegion = item.stats?.byRegion?.[0] || {};
      return {
        competitor_name: competitorName,
        platform: 'google',
        ad_id: item.creativeId || String(Math.random().toString(36).slice(2)),
        advertiser: item.advertiser?.name || item.advertiserName || competitorName,
        headline: item.variants?.[0]?.headline || null,
        body: item.variants?.[0]?.description || null,
        cta_text: null,
        destination_url: item.url || null,
        media_type: item.type || null,
        media_url: null,
        impressions_min: byRegion.impression?.min ?? null,
        impressions_max: byRegion.impression?.max ?? null,
        is_active: item.lastShown ? true : null,
        start_date: byRegion.firstShown || null,
        end_date: byRegion.lastShown || item.lastShown?.split?.('T')?.[0] || null,
      };
    });
}

/**
 * Scrape competitor ads across platforms. Soft-fails per platform.
 * @param {{
 *   competitors: Array<{ name: string, linkedin_company?: string, facebook_page?: string, google_domain?: string }>,
 *   platforms?: string[],
 *   country?: string,
 *   limit?: number,
 * }} params
 */
export async function scrapeCompetitorAds(params = {}) {
  if (!apifyToken()) {
    return { ok: false, error: 'APIFY_TOKEN missing', results: [], ads: [] };
  }

  const competitors = Array.isArray(params.competitors) ? params.competitors : [];
  const platforms = new Set(
    (params.platforms || ['linkedin', 'facebook', 'google']).map((p) => String(p).toLowerCase())
  );
  const country = String(params.country || process.env.APIFY_ADS_COUNTRY || 'IN').toUpperCase();
  const limit = Math.min(50, Math.max(1, Number(params.limit || 10)));

  if (!competitors.length) {
    return { ok: false, error: 'No competitors provided', results: [], ads: [] };
  }

  const results = [];
  const ads = [];

  for (const competitor of competitors) {
    const name = String(competitor.name || competitor.company || 'Competitor').trim() || 'Competitor';
    const linkedin_company = competitor.linkedin_company || competitor.linkedin || null;
    const facebook_page = competitor.facebook_page || competitor.facebook || null;
    const google_domain = competitor.google_domain || competitor.domain || competitor.website || null;
    const platformResults = [];

    if (platforms.has('linkedin') && linkedin_company) {
      try {
        const scraped = await scrapeLinkedIn(name, linkedin_company, country, limit);
        ads.push(...scraped);
        platformResults.push({ platform: 'linkedin', scraped: scraped.length });
      } catch (err) {
        platformResults.push({ platform: 'linkedin', error: err.message });
      }
      await sleep(1500);
    } else if (platforms.has('linkedin')) {
      platformResults.push({ platform: 'linkedin', skipped: true, reason: 'linkedin_company missing' });
    }

    if (platforms.has('facebook') && facebook_page) {
      try {
        const scraped = await scrapeFacebook(name, facebook_page, country, limit);
        ads.push(...scraped);
        platformResults.push({ platform: 'facebook', scraped: scraped.length });
      } catch (err) {
        platformResults.push({ platform: 'facebook', error: err.message });
      }
      await sleep(1500);
    } else if (platforms.has('facebook')) {
      platformResults.push({ platform: 'facebook', skipped: true, reason: 'facebook_page missing' });
    }

    if (platforms.has('google') && google_domain) {
      try {
        const scraped = await scrapeGoogle(name, google_domain, country, limit);
        ads.push(...scraped);
        platformResults.push({ platform: 'google', scraped: scraped.length });
      } catch (err) {
        platformResults.push({ platform: 'google', error: err.message });
      }
    } else if (platforms.has('google')) {
      platformResults.push({ platform: 'google', skipped: true, reason: 'google_domain missing' });
    }

    results.push({ competitor: name, platforms: platformResults });
  }

  const anyOk = results.some((r) => (r.platforms || []).some((p) => p.scraped > 0));
  const anyErr = results.some((r) => (r.platforms || []).some((p) => p.error));

  return {
    ok: anyOk || !anyErr,
    actors: {
      linkedin: MARQQ_APIFY_ACTORS.linkedin_ad_library,
      facebook: MARQQ_APIFY_ACTORS.facebook_ads,
      google: MARQQ_APIFY_ACTORS.google_ads,
    },
    country,
    limit,
    results,
    ads,
    total: ads.length,
    scrapedAt: new Date().toISOString(),
  };
}
