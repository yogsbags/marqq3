/**
 * Shared Apify REST helpers (Marqq2 parity).
 * Token: APIFY_TOKEN or APIFY_API_TOKEN
 */

const APIFY_API = 'https://api.apify.com/v2';

export function apifyToken() {
  return String(process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || '').trim();
}

export function toApifyActorId(actorId) {
  return String(actorId || '')
    .trim()
    .replace('/', '~');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Start actor run, poll until done, return dataset items.
 * @param {string} actorId username/name or username~name
 * @param {object} input
 * @param {{ timeoutMs?: number, pollMs?: number, limit?: number }} opts
 */
export async function runApifyActor(actorId, input, opts = {}) {
  const token = apifyToken();
  if (!token) throw new Error('APIFY_TOKEN not set');

  const safeId = toApifyActorId(actorId);
  if (!safeId) throw new Error('actorId required');

  const timeoutMs = Number(opts.timeoutMs || process.env.APIFY_RUN_TIMEOUT_MS || 300_000);
  const pollMs = Number(opts.pollMs || 5_000);
  const limit = Math.min(500, Math.max(1, Number(opts.limit || 200)));

  const startResp = await fetch(
    `${APIFY_API}/acts/${encodeURIComponent(safeId)}/runs?token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input || {}),
    }
  );
  const startData = await startResp.json().catch(() => ({}));
  if (!startResp.ok || startData.error) {
    throw new Error(
      startData?.error?.message || `Apify start failed ${startResp.status}: ${JSON.stringify(startData).slice(0, 240)}`
    );
  }

  const run = startData.data || {};
  const runId = run.id;
  let datasetId = run.defaultDatasetId;
  if (!runId) throw new Error('Apify run missing id');

  const deadline = Date.now() + timeoutMs;
  let status = run.status || 'RUNNING';
  while (Date.now() < deadline) {
    if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) break;
    await sleep(pollMs);
    const statusResp = await fetch(
      `${APIFY_API}/actor-runs/${runId}?token=${encodeURIComponent(token)}`
    );
    const statusData = await statusResp.json().catch(() => ({}));
    status = statusData?.data?.status || status;
    datasetId = statusData?.data?.defaultDatasetId || datasetId;
  }

  if (status !== 'SUCCEEDED') {
    throw new Error(`Apify run ${status} for actor ${actorId}`);
  }
  if (!datasetId) throw new Error(`Apify run succeeded but no dataset for ${actorId}`);

  const dataResp = await fetch(
    `${APIFY_API}/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&clean=true&limit=${limit}`
  );
  const items = await dataResp.json().catch(() => []);
  return Array.isArray(items) ? items : items?.items || [];
}

/** Sync convenience for small PPE actors (keywords). */
export async function runApifyActorSync(actorId, input, opts = {}) {
  const token = apifyToken();
  if (!token) throw new Error('APIFY_TOKEN not set');
  const safeId = toApifyActorId(actorId);
  const timeoutMs = Number(opts.timeoutMs || 180_000);
  const url = `${APIFY_API}/acts/${encodeURIComponent(safeId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${Math.ceil(timeoutMs / 1000)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input || {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data && (data.error?.message || data.error)) ||
      `Apify sync failed ${res.status}`;
    throw new Error(String(msg));
  }
  return Array.isArray(data) ? data : [];
}

export const MARQQ_APIFY_ACTORS = {
  website_content_crawler: 'apify/website-content-crawler',
  linkedin_ad_library: 'silva95gustavo/linkedin-ad-library-scraper',
  facebook_ads: 'dz_omar/facebook-ads-scraper-pro',
  google_ads: 'ivanvs/google-ads-scraper',
  google_keywords: String(process.env.APIFY_KEYWORD_ACTOR_ID || 's-r/google-keywords').trim(),
};
