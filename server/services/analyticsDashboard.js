/**
 * Analytics dashboard — Composio-backed GSC + Meta (+ optional GA4/Google Ads).
 * Shape mirrors Marqq2 GET /api/analytics/dashboard.
 */

import { resolveConnectedAccountId } from './composio.js';

const COMPOSIO_V3 = 'https://backend.composio.dev/api/v3';
const SOURCE_NAMES = {
  ga4: 'Google Analytics 4',
  gsc: 'Google Search Console',
  google_ads: 'Google Ads',
  meta_ads: 'Meta Ads',
  linkedin_ads: 'LinkedIn Ads',
};

const TOOLKIT = {
  ga4: 'google_analytics',
  gsc: 'google_search_console',
  google_ads: 'googleads',
  meta_ads: 'metaads',
  linkedin_ads: 'linkedinads',
};

function apiKey() {
  return process.env.COMPOSIO_API_KEY || '';
}

function entityCandidates(companyId) {
  const ids = new Set([String(companyId || '').trim()].filter(Boolean));
  const raw = process.env.COMPOSIO_ENTITY_ALIASES || '';
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (id) ids.add(id);
  }
  if (companyId === 'marqq-ws-1' || companyId === 'default') {
    ids.add('b08d3df3-c1a9-4632-96ec-e6e5b703c2a0');
  }
  return [...ids];
}

function periodToDates(period) {
  const periodDays = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - periodDays);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end), periodDays };
}

function fmtNum(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v * 100) / 100);
}

function calcDelta(curr, prev) {
  if (!prev) return { delta: '—', trend: 'flat' };
  const pct = ((curr - prev) / prev) * 100;
  return {
    delta: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
    trend: pct > 1 ? 'up' : pct < -1 ? 'down' : 'flat',
  };
}

export function buildEmptyDashboard(period = '30d') {
  const today = new Date();
  const trafficChart = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (13 - i));
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: 0,
    };
  });
  return {
    lastUpdated: '',
    period: period === '7d' ? 'Last 7 days' : period === '90d' ? 'Last 90 days' : 'Last 30 days',
    connected: false,
    connectedSources: [],
    kpis: [
      { label: 'Sessions', value: '—', delta: '—', trend: 'flat' },
      { label: 'Organic Clicks', value: '—', delta: '—', trend: 'flat' },
      { label: 'Impressions', value: '—', delta: '—', trend: 'flat' },
      { label: 'Avg. Position', value: '—', delta: '—', trend: 'flat' },
      { label: 'Ad Spend', value: '—', delta: '—', trend: 'flat' },
      { label: 'Ad Clicks', value: '—', delta: '—', trend: 'flat' },
    ],
    trafficChart,
    conversionChart: trafficChart,
    topPages: [],
    topQueries: [],
    channels: [],
    topAdCampaigns: [],
    dataNote: 'Connect GA4, Search Console, or Meta Ads under Integrations to load live performance.',
  };
}

/**
 * Execute a Composio tool.
 * Large toolkits (GA4) need `version: "latest"` — default project toolkit is an older stub.
 */
async function runComposioAction(connectedAccountId, actionSlug, args, opts = {}) {
  const key = apiKey();
  const body = {
    connected_account_id: connectedAccountId,
    arguments: args || {},
  };
  const needsLatest =
    opts.version ||
    String(actionSlug || '').startsWith('GOOGLE_ANALYTICS_');
  if (needsLatest) {
    body.version = opts.version || process.env.COMPOSIO_TOOLKIT_VERSION || 'latest';
  }
  const res = await fetch(`${COMPOSIO_V3}/tools/execute/${actionSlug}`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.successful === false) {
    const msg =
      json?.error?.message || json?.error || json?.message || json?.data?.message || `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 200));
  }
  return json.data ?? json.result ?? json;
}

async function resolveAccount(companyId, connectorId) {
  const toolkit = TOOLKIT[connectorId] || connectorId;
  let lastErr = null;
  for (const entityId of entityCandidates(companyId)) {
    try {
      const id = await resolveConnectedAccountId(toolkit, entityId);
      return { connectedAccountId: id, entityId };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`No active ${connectorId}`);
}

/** List which analytics connectors are ACTIVE for this company. */
export async function listAnalyticsConnections(companyId) {
  const connected = [];
  for (const id of Object.keys(TOOLKIT)) {
    try {
      const { connectedAccountId } = await resolveAccount(companyId, id);
      connected.push({
        id,
        name: SOURCE_NAMES[id] || id,
        connectedAccountId,
        connectedAt: null,
      });
    } catch {
      /* not connected */
    }
  }
  return connected;
}

async function fetchGscData(companyId, period, gscSiteUrl) {
  try {
    const { connectedAccountId } = await resolveAccount(companyId, 'gsc');
    const siteUrl = gscSiteUrl || process.env.GSC_SITE_URL || '';
    if (!siteUrl) return null;
    const { startDate, endDate, periodDays } = periodToDates(period);

    const prevEnd = new Date(startDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - periodDays);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const query = async (start, end, dimensions, rowLimit = 50) => {
      const raw = await runComposioAction(
        connectedAccountId,
        'GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_QUERY',
        {
          siteUrl,
          startDate: start,
          endDate: end,
          dimensions,
          rowLimit,
        }
      );
      const rd = raw?.response_data || raw?.data?.response_data || raw;
      return rd?.rows || [];
    };

    const [dateRows, prevRows, pageRows, queryRows] = await Promise.all([
      query(startDate, endDate, ['date'], 100),
      query(fmt(prevStart), fmt(prevEnd), ['date'], 100).catch(() => []),
      query(startDate, endDate, ['page'], 10).catch(() => []),
      query(startDate, endDate, ['query'], 10).catch(() => []),
    ]);

    const sum = (rows) =>
      rows.reduce(
        (acc, r) => ({
          clicks: acc.clicks + Number(r.clicks || 0),
          impressions: acc.impressions + Number(r.impressions || 0),
          positionWeighted: acc.positionWeighted + Number(r.position || 0) * Number(r.impressions || 0),
          impressionsForPos: acc.impressionsForPos + Number(r.impressions || 0),
        }),
        { clicks: 0, impressions: 0, positionWeighted: 0, impressionsForPos: 0 }
      );

    const curr = sum(dateRows);
    const prev = sum(prevRows);
    const avgPos =
      curr.impressionsForPos > 0 ? curr.positionWeighted / curr.impressionsForPos : 0;
    const prevPos =
      prev.impressionsForPos > 0 ? prev.positionWeighted / prev.impressionsForPos : 0;

    const dClicks = calcDelta(curr.clicks, prev.clicks);
    const dImpr = calcDelta(curr.impressions, prev.impressions);
    // Lower position is better — invert trend
    const dPosRaw = calcDelta(avgPos, prevPos);
    const dPos = {
      delta: dPosRaw.delta,
      trend: dPosRaw.trend === 'up' ? 'down' : dPosRaw.trend === 'down' ? 'up' : 'flat',
    };

    const trafficChart = dateRows.map((r) => {
      const key = Array.isArray(r.keys) ? r.keys[0] : '';
      const d = key ? new Date(key) : new Date();
      return {
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: Math.round(Number(r.impressions || 0)),
        clicks: Math.round(Number(r.clicks || 0)),
      };
    });

    const topPages = pageRows.slice(0, 8).map((r) => ({
      path: Array.isArray(r.keys) ? r.keys[0] : '/',
      sessions: Math.round(Number(r.impressions || 0)),
      clicks: Math.round(Number(r.clicks || 0)),
      delta: 0,
    }));

    const topQueries = queryRows.slice(0, 8).map((r) => ({
      query: Array.isArray(r.keys) ? r.keys[0] : '',
      clicks: Math.round(Number(r.clicks || 0)),
      impressions: Math.round(Number(r.impressions || 0)),
      position: Math.round(Number(r.position || 0) * 10) / 10,
    }));

    return {
      kpis: [
        {
          label: 'Organic Clicks',
          value: fmtNum(curr.clicks),
          ...dClicks,
          sub: 'Search Console',
        },
        {
          label: 'Impressions',
          value: fmtNum(curr.impressions),
          ...dImpr,
          sub: 'Search Console',
        },
        {
          label: 'Avg. Position',
          value: avgPos ? avgPos.toFixed(1) : '—',
          ...dPos,
          sub: 'lower is better',
        },
      ],
      trafficChart,
      topPages,
      topQueries,
      siteUrl,
    };
  } catch (err) {
    console.warn('[analytics/gsc]', err.message);
    return null;
  }
}

async function fetchMetaAdsData(companyId, period, metaAdsAccount) {
  try {
    const { connectedAccountId } = await resolveAccount(companyId, 'meta_ads');
    const objectId = metaAdsAccount || process.env.META_AD_ACCOUNT_ID || '';
    if (!objectId) return null;
    const datePreset = period === '7d' ? 'last_7d' : period === '90d' ? 'last_90d' : 'last_30d';

    const raw = await runComposioAction(connectedAccountId, 'METAADS_GET_INSIGHTS', {
      object_id: objectId,
      date_preset: datePreset,
      level: 'account',
    });
    const rows = raw?.data || raw?.response_data?.data || (Array.isArray(raw) ? raw : []);
    const row = rows[0] || {};
    const spend = Number(row.spend || 0);
    const clicks = Number(row.clicks || 0);
    const impressions = Number(row.impressions || 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : Number(row.ctr || 0);

    // Campaign-level optional
    let topCampaigns = [];
    try {
      const campRaw = await runComposioAction(connectedAccountId, 'METAADS_GET_INSIGHTS', {
        object_id: objectId,
        date_preset: datePreset,
        level: 'campaign',
      });
      const campRows = campRaw?.data || campRaw?.response_data?.data || [];
      topCampaigns = campRows.slice(0, 8).map((c) => ({
        name: c.campaign_name || c.name || 'Campaign',
        platform: 'Meta Ads',
        spend: Number(c.spend || 0),
        spendLabel: `$${fmtNum(Number(c.spend || 0))}`,
        clicks: Number(c.clicks || 0),
        impressions: Number(c.impressions || 0),
        ctr:
          Number(c.impressions || 0) > 0
            ? (Number(c.clicks || 0) / Number(c.impressions || 0)) * 100
            : 0,
      }));
    } catch {
      /* optional */
    }

    return {
      kpis: [
        {
          label: 'Ad Spend',
          value: `$${fmtNum(spend)}`,
          delta: '—',
          trend: 'flat',
          sub: `Meta Ads · ${objectId}`,
        },
        {
          label: 'Ad Clicks',
          value: fmtNum(clicks),
          delta: '—',
          trend: 'flat',
          sub: 'Meta Ads',
        },
        {
          label: 'Ad Impressions',
          value: fmtNum(impressions),
          delta: '—',
          trend: 'flat',
          sub: `CTR ${ctr.toFixed(2)}%`,
        },
      ],
      topCampaigns,
    };
  } catch (err) {
    console.warn('[analytics/meta]', err.message);
    return null;
  }
}

function ga4Metric(row, idx) {
  return (
    parseFloat(row?.metricValues?.[idx]?.value ?? row?.metrics?.[0]?.values?.[idx] ?? '0') || 0
  );
}

function ga4PickRangeRows(rows = []) {
  let curr = rows[0];
  let prev = rows[1];
  for (const r of rows) {
    const key = String(r?.dimensionValues?.[0]?.value || '');
    if (key === 'date_range_0') curr = r;
    if (key === 'date_range_1') prev = r;
  }
  return { curr, prev };
}

/** Live GA4 KPIs via GOOGLE_ANALYTICS_RUN_REPORT (toolkit version latest). */
async function fetchGa4Data(companyId, period, ga4PropertyId) {
  try {
    const { connectedAccountId } = await resolveAccount(companyId, 'ga4');
    const property =
      ga4PropertyId || process.env.GA4_PROPERTY_ID || 'properties/534425303';
    const propArg = property.startsWith('properties/') ? property : `properties/${property}`;
    const { startDate, endDate, periodDays } = periodToDates(period);

    const prevEnd = new Date(startDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - periodDays);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const run = (args) =>
      runComposioAction(connectedAccountId, 'GOOGLE_ANALYTICS_RUN_REPORT', {
        property: propArg,
        ...args,
      });

    const [summary, daily, pages, channels] = await Promise.all([
      run({
        dateRanges: [
          { startDate, endDate },
          { startDate: fmt(prevStart), endDate: fmt(prevEnd) },
        ],
        metrics: [
          { name: 'sessions' },
          { name: 'bounceRate' },
          { name: 'conversions' },
          { name: 'newUsers' },
        ],
      }),
      run({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }],
      }).catch(() => null),
      run({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'sessions' }],
        limit: 10,
      }).catch(() => null),
      run({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'sessionDefaultChannelGrouping' }],
        metrics: [{ name: 'sessions' }],
        limit: 10,
      }).catch(() => null),
    ]);

    const { curr, prev } = ga4PickRangeRows(summary?.rows || []);
    const sessions = ga4Metric(curr, 0);
    const bounceRate = ga4Metric(curr, 1);
    const conversions = ga4Metric(curr, 2);
    const newUsers = ga4Metric(curr, 3);
    const dS = calcDelta(sessions, ga4Metric(prev, 0));
    const dBr = calcDelta(bounceRate, ga4Metric(prev, 1));
    const dC = calcDelta(conversions, ga4Metric(prev, 2));

    const trafficChart = [];
    for (const r of daily?.rows || []) {
      const dateStr = r.dimensionValues?.[0]?.value || '';
      const val = ga4Metric(r, 0);
      const d =
        dateStr.length === 8
          ? new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`)
          : new Date(dateStr);
      trafficChart.push({
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: Math.round(val),
      });
    }

    const topPages = (pages?.rows || []).slice(0, 8).map((r) => ({
      path: r.dimensionValues?.[0]?.value || '/',
      sessions: Math.round(ga4Metric(r, 0)),
      clicks: 0,
      delta: 0,
    }));

    const channelRows = (channels?.rows || []).map((r) => ({
      channel: r.dimensionValues?.[0]?.value || 'Other',
      sessions: Math.round(ga4Metric(r, 0)),
      delta: 0,
    }));
    const totalCh = channelRows.reduce((s, r) => s + r.sessions, 0) || 1;
    const channelData = channelRows.map((r) => ({
      ...r,
      pct: Math.round((r.sessions / totalCh) * 100),
    }));

    return {
      kpis: [
        { label: 'Sessions', value: fmtNum(sessions), ...dS, sub: 'Google Analytics 4' },
        {
          label: 'Bounce Rate',
          value: `${(bounceRate * (bounceRate <= 1 ? 100 : 1)).toFixed(1)}%`,
          ...dBr,
          sub: 'Google Analytics 4',
        },
        {
          label: 'Conversions',
          value: fmtNum(conversions),
          ...dC,
          sub: `GA4 · ${fmtNum(newUsers)} new users`,
        },
      ],
      trafficChart,
      topPages,
      channels: channelData,
      property: propArg,
    };
  } catch (err) {
    console.warn('[analytics/ga4]', err.message);
    return null;
  }
}

/**
 * Build live analytics dashboard for companyId.
 */
export async function getAnalyticsDashboard({
  companyId = 'marqq-ws-1',
  period = '30d',
  ga4PropertyId = null,
  gscSiteUrl = null,
  metaAdsAccount = null,
  googleAdsCustomer = null,
  preferences = {},
} = {}) {
  const empty = buildEmptyDashboard(period);
  if (!apiKey()) return empty;

  const prefs = preferences || {};
  const site =
    gscSiteUrl || prefs.gsc_site_url || process.env.GSC_SITE_URL || '';
  const metaAcct =
    metaAdsAccount ||
    prefs.meta_ads_account_id ||
    process.env.META_AD_ACCOUNT_ID ||
    '';
  const ga4Prop =
    ga4PropertyId || prefs.ga4_property_id || process.env.GA4_PROPERTY_ID || '';

  const connectedSources = await listAnalyticsConnections(companyId);
  if (!connectedSources.length) return empty;

  const hasGsc = connectedSources.some((s) => s.id === 'gsc');
  const hasMeta = connectedSources.some((s) => s.id === 'meta_ads');
  const hasGa4 = connectedSources.some((s) => s.id === 'ga4');

  const [gscData, metaData, ga4Data] = await Promise.all([
    hasGsc ? fetchGscData(companyId, period, site) : Promise.resolve(null),
    hasMeta ? fetchMetaAdsData(companyId, period, metaAcct) : Promise.resolve(null),
    hasGa4 ? fetchGa4Data(companyId, period, ga4Prop) : Promise.resolve(null),
  ]);

  const kpis = [
    ...(ga4Data?.kpis || []),
    ...(gscData?.kpis || []),
    ...(metaData?.kpis || []),
  ];

  const notes = [];
  if (hasGa4 && !ga4Data) {
    notes.push('GA4 is connected but RUN_REPORT failed — check property ID and toolkit version.');
  }
  if (hasGsc && gscData && !(gscData.topQueries || []).length) {
    notes.push('Search Console has impressions but few/no query rows yet for this period.');
  }
  if (!gscData && !metaData && !ga4Data) {
    notes.push('Connected sources returned no live data for this period.');
  }

  const trafficChart = ga4Data?.trafficChart?.length
    ? ga4Data.trafficChart
    : gscData?.trafficChart?.length
      ? gscData.trafficChart
      : empty.trafficChart;

  const conversionChart = gscData?.trafficChart?.length
    ? gscData.trafficChart.map((p) => ({ date: p.date, value: p.clicks ?? 0 }))
    : trafficChart.map((p) => ({ date: p.date, value: p.value ?? 0 }));

  return {
    lastUpdated: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    period: empty.period,
    connected: true,
    connectedSources: connectedSources.map((s) => ({
      id: s.id,
      name: s.name,
      connectedAt: s.connectedAt,
    })),
    kpis: kpis.length ? kpis : empty.kpis,
    trafficChart,
    conversionChart,
    topPages: ga4Data?.topPages?.length ? ga4Data.topPages : gscData?.topPages || [],
    topQueries: gscData?.topQueries || [],
    channels: ga4Data?.channels?.length
      ? ga4Data.channels
      : (gscData?.topPages || []).slice(0, 5).map((p) => ({
          channel: p.path?.replace(/^https?:\/\//, '').slice(0, 40) || 'page',
          sessions: p.sessions,
          pct: 0,
          delta: 0,
        })),
    topAdCampaigns: metaData?.topCampaigns || [],
    dataNote: notes.join(' ') || null,
    prefsUsed: {
      gscSiteUrl: site,
      metaAdsAccount: metaAcct,
      ga4PropertyId: ga4Prop,
      googleAdsCustomer: googleAdsCustomer || prefs.google_ads_customer_id || null,
    },
  };
}
