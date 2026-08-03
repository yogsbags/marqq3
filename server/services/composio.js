/**
 * Minimal Composio helpers for Marqq-test outreach (Apollo + Gmail + Instantly/HeyReach/WhatsApp).
 */

const COMPOSIO_V3 = 'https://backend.composio.dev/api/v3';

const TOOLKIT = {
  apollo: 'apollo',
  gmail: 'gmail',
  whatsapp: 'whatsapp',
  linkedin: 'linkedin',
  heyreach: 'heyreach',
  instantly: 'instantly',
  facebook: 'facebook',
  instagram: 'instagram',
  twitter: 'twitter',
  youtube: 'youtube',
  google_sheets: 'googlesheets',
  googlesheets: 'googlesheets',
  hubspot: 'hubspot',
  salesforce: 'salesforce',
  ga4: 'google_analytics',
  google_analytics: 'google_analytics',
  gsc: 'google_search_console',
  google_search_console: 'google_search_console',
  meta_ads: 'metaads',
  metaads: 'metaads',
  google_ads: 'googleads',
  googleads: 'googleads',
  github: 'github',
};

function apiKey() {
  return process.env.COMPOSIO_API_KEY || '';
}

/** Marqq2 company UUID + optional COMPOSIO_ENTITY_ALIASES — share active connections. */
function entityLookupIds(userId) {
  const ids = new Set([String(userId || '').trim()].filter(Boolean));
  const raw = process.env.COMPOSIO_ENTITY_ALIASES || '';
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (id) ids.add(id);
  }
  if (userId === 'marqq-ws-1' || userId === 'default') {
    ids.add('b08d3df3-c1a9-4632-96ec-e6e5b703c2a0');
  }
  return [...ids];
}

function errText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message || String(value);
  if (typeof value === 'object') {
    const nested = value.message || value.error || value.detail || value.description;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
    try {
      return JSON.stringify(value).slice(0, 400);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function readGenericApiKey(detail) {
  return (
    detail?.data?.generic_api_key ||
    detail?.state?.val?.generic_api_key ||
    detail?.params?.generic_api_key ||
    detail?.data?.api_key ||
    detail?.state?.val?.api_key ||
    detail?.params?.api_key ||
    null
  );
}

export async function resolveConnectedAccountId(toolkit, userId) {
  const key = apiKey();
  if (!key) throw new Error('COMPOSIO_API_KEY not configured');
  const raw = String(toolkit || '').toLowerCase();
  const slug = TOOLKIT[raw] || raw;
  const items = [];
  for (const entityId of entityLookupIds(userId)) {
    const res = await fetch(
      `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(entityId)}&limit=100`,
      { headers: { 'x-api-key': key } }
    );
    if (!res.ok) continue;
    const data = await res.json();
    for (const a of data.items || []) {
      const t = String(a.toolkit?.slug || a.toolkit_slug || a.appName || '').toLowerCase();
      const status = String(a.status || '').toUpperCase();
      const active = status === 'ACTIVE' || status === 'CONNECTED' || status === 'SUCCESS';
      // Prefer exact toolkit match (googleads ≠ google_analytics)
      const exact = t === slug || t === raw;
      const loose =
        !exact &&
        (t.includes(slug) || t.includes(raw)) &&
        !(slug === 'google' && t.includes('analytics')) &&
        !(raw === 'linkedin' && t.includes('ads'));
      if (active && (exact || loose)) items.push(a);
    }
  }
  items.sort((a, b) => {
    const ta = new Date(a.updated_at || a.created_at || 0).getTime();
    const tb = new Date(b.updated_at || b.created_at || 0).getTime();
    return tb - ta;
  });
  if (!items[0]?.id) {
    throw new Error(`No active ${toolkit} connection for ${userId}. Connect it under Integrations.`);
  }
  return items[0].id;
}

/** Resolve API key from Composio connected account (HeyReach etc.). */
export async function getConnectedAccountApiKey(connectorId, userId) {
  const key = apiKey();
  if (!key) return { error: 'COMPOSIO_API_KEY not configured' };
  const toolkit = TOOLKIT[connectorId] || connectorId;
  try {
    const accountId = await resolveConnectedAccountId(toolkit, userId);
    const detailRes = await fetch(`${COMPOSIO_V3}/connected_accounts/${accountId}`, {
      headers: { 'x-api-key': key },
    });
    if (!detailRes.ok) return { error: `Failed to fetch account details: ${detailRes.status}` };
    const detail = await detailRes.json();
    const genericApiKey = readGenericApiKey(detail);
    if (!genericApiKey) {
      return {
        error: `No API key found for ${connectorId} — reconnect under Integrations`,
        account_id: accountId,
      };
    }
    return { api_key: genericApiKey, account_id: accountId };
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

export async function executeComposioAction(actionSlug, args, userId, toolkitHint = null) {
  const key = apiKey();
  if (!key) return { error: 'COMPOSIO_API_KEY not configured' };
  const toolkit =
    toolkitHint ||
    (actionSlug.startsWith('GMAIL_')
      ? 'gmail'
      : actionSlug.startsWith('APOLLO_')
        ? 'apollo'
        : actionSlug.startsWith('WHATSAPP_')
          ? 'whatsapp'
          : actionSlug.startsWith('INSTANTLY_')
            ? 'instantly'
            : actionSlug.startsWith('HEYREACH_')
              ? 'heyreach'
              : actionSlug.startsWith('LINKEDIN_')
                ? 'linkedin'
                : actionSlug.startsWith('FACEBOOK_')
                  ? 'facebook'
                  : actionSlug.startsWith('INSTAGRAM_')
                    ? 'instagram'
                    : actionSlug.startsWith('TWITTER_') || actionSlug.startsWith('X_')
                      ? 'twitter'
                      : actionSlug.startsWith('YOUTUBE_')
                        ? 'youtube'
                        : actionSlug.startsWith('GITHUB_')
                          ? 'github'
                          : actionSlug.startsWith('RAILWAY_')
                            ? 'railway'
                            : null);
  try {
    const connectedAccountId = await resolveConnectedAccountId(toolkit || 'gmail', userId);
    const res = await fetch(`${COMPOSIO_V3}/tools/execute/${actionSlug}`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connected_account_id: connectedAccountId,
        user_id: userId,
        arguments: args || {},
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.successful === false) {
      return {
        error: errText(data?.error?.message || data?.error || data?.message || data) || `HTTP ${res.status}`,
        raw: data,
        connectedAccountId,
      };
    }
    return { ok: true, result: data.data ?? data.result ?? data, connectedAccountId, raw: data };
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

export async function executeComposioProxy({ toolkit, userId, method = 'POST', endpoint, body = null }) {
  const key = apiKey();
  if (!key) return { error: 'COMPOSIO_API_KEY not configured' };
  try {
    const connectedAccountId = await resolveConnectedAccountId(toolkit, userId);
    const payload = {
      connected_account_id: connectedAccountId,
      endpoint: String(endpoint),
      method: String(method || 'GET').toUpperCase(),
      parameters: [],
    };
    if (body != null && payload.method !== 'GET' && payload.method !== 'HEAD') {
      payload.body = body;
    }
    const res = await fetch(`${COMPOSIO_V3}/tools/execute/proxy`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.successful === false) {
      return {
        error: errText(data?.error?.message || data?.error || data?.message || data) || `HTTP ${res.status}`,
        raw: data,
        connectedAccountId,
      };
    }
    return { ok: true, result: data.data ?? data.result ?? data, connectedAccountId, raw: data };
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

export { TOOLKIT, errText };
