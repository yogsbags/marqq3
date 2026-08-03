/**
 * Minimal Composio helpers for Marqq-test outreach (Apollo + Gmail).
 */

const COMPOSIO_V3 = 'https://backend.composio.dev/api/v3';

const TOOLKIT = {
  apollo: 'apollo',
  gmail: 'gmail',
  whatsapp: 'whatsapp',
  linkedin: 'linkedin',
  heyreach: 'heyreach',
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

export async function resolveConnectedAccountId(toolkit, userId) {
  const key = apiKey();
  if (!key) throw new Error('COMPOSIO_API_KEY not configured');
  const slug = String(toolkit || '').toLowerCase();
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
      const exact = t === slug;
      const loose = !exact && t.includes(slug) && !(slug === 'google' && t.includes('analytics'));
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
