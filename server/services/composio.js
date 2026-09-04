import { resolveComposioEntityIds } from '../lib/composioEntities.js';
import { actionModeFromAgentOs } from './executionMode.js';
import { loadAgentOsProfile, loadAgentOsProfileAsync } from './agentOsStore.js';

const COMPOSIO_V3 = 'https://backend.composio.dev/api/v3';
const COMPOSIO_V3_1 = 'https://backend.composio.dev/api/v3.1';

const TOOLKIT = {
  apollo: 'apollo',
  hunter: 'hunter',
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
  google_docs: 'googledocs',
  googledocs: 'googledocs',
  google_drive: 'googledrive',
  googledrive: 'googledrive',
  hubspot: 'hubspot',
  salesforce: 'salesforce',
  klaviyo: 'klaviyo',
  ga4: 'google_analytics',
  google_analytics: 'google_analytics',
  gsc: 'google_search_console',
  google_search_console: 'google_search_console',
  meta_ads: 'metaads',
  metaads: 'metaads',
  google_ads: 'googleads',
  googleads: 'googleads',
  github: 'github',
  linkedin_ads: 'linkedinads',
  wordpress: 'wordpress',
  webflow: 'webflow',
  shopify: 'shopify',
  wix: 'wix',
  mailchimp: 'mailchimp',
  sendgrid: 'sendgrid',
  mixpanel: 'mixpanel',
  amplitude: 'amplitude',
  semrush: 'semrush',
  ahrefs: 'ahrefs',
  slack: 'slack',
  appstore_connect: 'custom_appstore_connect',
  revenuecat: 'custom_revenuecat',
  firebase: 'custom_firebase',
  google_play_console: 'custom_google_play_console',
  play_console: 'custom_google_play_console',
  supabase: 'supabase',
};

function apiKey() {
  return process.env.COMPOSIO_API_KEY || '';
}

/** Only this workspace's Composio user_id unless demo sharing is enabled. */
function entityLookupIds(userId) {
  return resolveComposioEntityIds(userId);
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

const READ_ACTION_PREFIXES = [
  'GET_', 'LIST_', 'SEARCH_', 'FIND_', 'FETCH_', 'LOOKUP_', 'QUERY_', 'CHECK_', 'IS_', 'RUN_',
  'RETRIEVE_', 'DESCRIBE_', 'VERIFY_', 'VALIDATE_', 'COUNT_', 'DOWNLOAD_', 'EXPORT_',
];

export function isReadOnlyComposioAction(actionSlug = '') {
  const slug = String(actionSlug || '').toUpperCase();
  const last = slug.split('_').slice(1).join('_');
  return READ_ACTION_PREFIXES.some((prefix) => last.startsWith(prefix)) ||
    /_(GET|LIST|SEARCH|FIND|FETCH|LOOKUP|QUERY|CHECK|RUN|RETRIEVE|DESCRIBE|VERIFY|VALIDATE|COUNT|DOWNLOAD|EXPORT)(_|$)/.test(slug);
}

const PROXY_WRITE_PATH = /(reveal|create|update|delete|send|push|publish|insert|bulk_match|sequence|campaign|contact\/)/i;
const PROXY_READ_PATH = /(search|enrich|lookup|find|fetch|list|query|job_postings|news_articles|api_search|mixed_people|mixed_companies|organization)/i;

/** Apollo and similar REST APIs use POST for search/enrich — those are reads, not writes. */
export function isReadOnlyProxyRequest(method = 'GET', endpoint = '') {
  const m = String(method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  if (m !== 'POST') return false;
  const path = String(endpoint || '').split('?')[0];
  if (PROXY_WRITE_PATH.test(path)) return false;
  return PROXY_READ_PATH.test(path);
}

export function composioProxyPermission(method, endpoint, mode = 'draft_safe') {
  const proxyAction = `${String(method || 'POST').toUpperCase()}_${String(endpoint || '').split('?')[0]}`;
  const isRead = isReadOnlyProxyRequest(method, endpoint);
  const isDraftEndpoint = /draft/i.test(String(endpoint || ''));
  if (isRead) return { allowed: true, mode, kind: 'read' };
  if (mode === 'live_publish') return { allowed: true, mode, kind: 'write' };
  if (mode === 'live_drafts' && isDraftEndpoint) return { allowed: true, mode, kind: 'provider_draft' };
  return {
    allowed: false,
    mode,
    kind: 'write',
    error: mode === 'live_drafts'
      ? `Connector proxy is not a draft endpoint: ${proxyAction}`
      : `Connector proxy blocked by Draft-safe mode: ${proxyAction}`,
  };
}

function isProviderDraftAction(actionSlug = '') {
  const slug = String(actionSlug || '').toUpperCase();
  return /DRAFT|SAVE.*DRAFT|CREATE.*DRAFT|UPDATE.*DRAFT/.test(slug);
}

const ACTION_TOOLKIT_PREFIXES = [
  ['LINKEDINADS_', 'linkedinads'],
  ['GOOGLE_ANALYTICS_', 'google_analytics'],
  ['GOOGLE_SEARCH_CONSOLE_', 'google_search_console'],
  ['GOOGLESHEETS_', 'googlesheets'],
  ['GOOGLEDOCS_', 'googledocs'],
  ['GOOGLEDRIVE_', 'googledrive'],
  ['METAADS_', 'metaads'],
  ['GOOGLEADS_', 'googleads'],
  ['GMAIL_', 'gmail'],
  ['APOLLO_', 'apollo'],
  ['HUNTER_', 'hunter'],
  ['KLAVIYO_', 'klaviyo'],
  ['WHATSAPP_', 'whatsapp'],
  ['INSTANTLY_', 'instantly'],
  ['HEYREACH_', 'heyreach'],
  ['LINKEDIN_', 'linkedin'],
  ['FACEBOOK_', 'facebook'],
  ['INSTAGRAM_', 'instagram'],
  ['TWITTER_', 'twitter'],
  ['X_', 'twitter'],
  ['YOUTUBE_', 'youtube'],
  ['GITHUB_', 'github'],
  ['WORDPRESS_', 'wordpress'],
  ['WEBFLOW_', 'webflow'],
  ['SHOPIFY_', 'shopify'],
  ['WIX_', 'wix'],
  ['MAILCHIMP_', 'mailchimp'],
  ['SENDGRID_', 'sendgrid'],
  ['MIXPANEL_', 'mixpanel'],
  ['AMPLITUDE_', 'amplitude'],
  ['SEMRUSH_', 'semrush'],
  ['AHREFS_', 'ahrefs'],
  ['SLACK_', 'slack'],
  ['CUSTOM_APPSTORE_CONNECT_', 'custom_appstore_connect'],
  ['CUSTOM_REVENUECAT_', 'custom_revenuecat'],
  ['CUSTOM_FIREBASE_', 'custom_firebase'],
  ['CUSTOM_GOOGLE_PLAY_CONSOLE_', 'custom_google_play_console'],
  ['SUPABASE_', 'supabase'],
  ['RAILWAY_', 'railway'],
];

export function resolveToolkitForAction(actionSlug = '', toolkitHint = null) {
  if (toolkitHint) return TOOLKIT[String(toolkitHint).toLowerCase()] || String(toolkitHint).toLowerCase();
  const slug = String(actionSlug || '').toUpperCase();
  return ACTION_TOOLKIT_PREFIXES.find(([prefix]) => slug.startsWith(prefix))?.[1] || null;
}

export async function composioActionPermission(actionSlug, userId) {
  const profile = (await loadAgentOsProfileAsync(userId)) || loadAgentOsProfile(userId);
  const mode = actionModeFromAgentOs(profile);
  if (isReadOnlyComposioAction(actionSlug)) {
    return { allowed: true, mode, kind: 'read' };
  }
  if (mode === 'live_publish') {
    return { allowed: true, mode, kind: 'write' };
  }
  if (mode === 'live_drafts' && isProviderDraftAction(actionSlug)) {
    return { allowed: true, mode, kind: 'provider_draft' };
  }
  return {
    allowed: false,
    mode,
    kind: 'write',
    error: mode === 'live_drafts'
      ? `Connector action ${actionSlug} is not a provider-draft action. Switch to Live publish or use a draft-specific tool.`
      : `Connector write ${actionSlug} blocked by Draft-safe mode. Switch to Live drafts or Live publish in Orchestration.`,
  };
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
  const allowed = new Set(entityLookupIds(userId).map(String));
  const items = [];
  for (const entityId of allowed) {
    const res = await fetch(
      `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(entityId)}&limit=100`,
      { headers: { 'x-api-key': key } }
    );
    if (!res.ok) continue;
    const data = await res.json();
    for (const a of data.items || []) {
      const owner = String(a.user_id || a.userId || '').trim();
      // Composio list often ignores user_id — keep only this workspace's accounts.
      if (owner && !allowed.has(owner)) continue;
      if (!owner) continue;
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
  const permission = await composioActionPermission(actionSlug, userId);
  if (!permission.allowed) {
    return { error: permission.error, code: 'action_mode_blocked', actionMode: permission.mode, action: actionSlug };
  }
  const key = apiKey();
  if (!key) return { error: 'COMPOSIO_API_KEY not configured' };
  const toolkit = resolveToolkitForAction(actionSlug, toolkitHint);
  try {
    const noAuthCustomMcp = ['custom_appstore_connect', 'custom_firebase', 'custom_google_play_console'].includes(toolkit);
    const connectedAccountId = noAuthCustomMcp ? null : await resolveConnectedAccountId(toolkit || 'gmail', userId);
    const payload = {
      user_id: userId,
      arguments: args || {},
    };
    if (connectedAccountId) payload.connected_account_id = connectedAccountId;
    if (['google_analytics', 'metaads', 'googleads', 'google_search_console', 'googlesheets', 'googledocs', 'googledrive'].includes(toolkit)) {
      payload.version = process.env.COMPOSIO_TOOLKIT_VERSION || 'latest';
    }
    // Supabase's read-only database actions are exposed on Composio v3.1.
    // Keep account resolution on v3, but route Supabase execution through the
    // endpoint that honors the database:read OAuth scope.
    const executionBase = toolkit === 'supabase' ? COMPOSIO_V3_1 : COMPOSIO_V3;
    const res = await fetch(`${executionBase}/tools/execute/${actionSlug}`, {
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

export async function executeComposioProxy({ toolkit, userId, method = 'POST', endpoint, body = null }) {
  const profile = (await loadAgentOsProfileAsync(userId)) || loadAgentOsProfile(userId);
  const mode = actionModeFromAgentOs(profile);
  const permission = composioProxyPermission(method, endpoint, mode);
  if (!permission.allowed) {
    return { error: permission.error, code: 'action_mode_blocked', actionMode: mode };
  }
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
