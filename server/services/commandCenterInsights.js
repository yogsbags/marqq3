/**
 * Command Center — AI insights home for the user.
 * Merges live analytics (GA4/GSC/Meta) with optional North Star / control-loop
 * context from the client into actionable insight cards + a short briefing.
 */

import { getAnalyticsDashboard, buildEmptyDashboard } from './analyticsDashboard.js';
import { resolveGroqModel, withGroqReasoning } from './groqReasoning.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function groqKey() {
  return process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '';
}

function parseDeltaPct(delta) {
  if (delta == null || delta === '—') return null;
  const m = String(delta).replace(/,/g, '').match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
}

function kpiByLabel(kpis, re) {
  return (kpis || []).find((k) => re.test(String(k.label || '')));
}

function numFromValue(value) {
  if (value == null || value === '—') return null;
  const s = String(value).replace(/[$,%\s]/g, '').replace(/,/g, '');
  if (/k$/i.test(s)) return Number(s.slice(0, -1)) * 1000;
  if (/m$/i.test(s)) return Number(s.slice(0, -1)) * 1_000_000;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Deterministic insights from live KPIs + strategy context.
 */
export function buildRuleInsights({ dashboard, context = {} } = {}) {
  const insights = [];
  const kpis = dashboard?.kpis || [];
  const sources = dashboard?.connectedSources || [];
  const northStar = context.northStar || context.quantifiedTarget || null;
  const loopStatus = context.loopStatus || null;
  const bottleneck = context.bottleneck || null;
  const highAgents = Array.isArray(context.highPriorityAgents) ? context.highPriorityAgents : [];

  const sessions = kpiByLabel(kpis, /session/i);
  const organic = kpiByLabel(kpis, /organic\s*click/i);
  const impressions = kpiByLabel(kpis, /impression/i);
  const adSpend = kpiByLabel(kpis, /ad\s*spend/i);
  const adClicks = kpiByLabel(kpis, /ad\s*click/i);
  const conversions = kpiByLabel(kpis, /conversion/i);
  const bounce = kpiByLabel(kpis, /bounce/i);

  const sessDelta = parseDeltaPct(sessions?.delta);
  const orgDelta = parseDeltaPct(organic?.delta);
  const spendN = numFromValue(adSpend?.value);
  const adClickN = numFromValue(adClicks?.value);
  const sessN = numFromValue(sessions?.value);
  const orgN = numFromValue(organic?.value);
  const imprN = numFromValue(impressions?.value);
  const bounceN = numFromValue(bounce?.value);

  if (northStar) {
    insights.push({
      id: 'north-star',
      severity: 'info',
      tag: 'North Star',
      title: 'Measure everything against your locked goal',
      body: `Target: ${northStar}. Live connectors ${sources.map((s) => s.name || s.id).join(', ') || 'none'} feed the scorecard.`,
      agent: 'Dev',
      screen: 'analytics',
      cta: 'Open Scorecard',
    });
  }

  if (sessDelta != null && sessDelta <= -20) {
    insights.push({
      id: 'sessions-down',
      severity: 'critical',
      tag: 'Traffic',
      title: `Sessions ${sessions?.delta} — demand or tracking slipped`,
      body: `GA4 shows ${sessions?.value || '—'} sessions this period. Ship SEO content and check paid creative before the next checkpoint.`,
      agent: 'Maya',
      screen: 'content',
      cta: 'Brief Content Studio',
    });
  } else if (sessDelta != null && sessDelta >= 15) {
    insights.push({
      id: 'sessions-up',
      severity: 'positive',
      tag: 'Traffic',
      title: `Sessions ${sessions?.delta} — protect the winning motion`,
      body: `${sessions?.value || '—'} sessions this period. Double down on top channels and freeze losing experiments.`,
      agent: 'Zara',
      screen: 'orchestration',
      cta: 'Control loop',
    });
  } else if (sessN != null) {
    insights.push({
      id: 'sessions-steady',
      severity: 'info',
      tag: 'Traffic',
      title: `${sessions?.value} sessions · ${sessions?.delta || 'flat'} vs prior`,
      body: 'Use channel mix and top pages on the scorecard to decide the next weekly experiment.',
      agent: 'Dev',
      screen: 'analytics',
      cta: 'Inspect channels',
    });
  }

  if (imprN != null && imprN > 0 && (orgN === 0 || orgN == null)) {
    insights.push({
      id: 'gsc-zero-clicks',
      severity: 'warn',
      tag: 'SEO',
      title: 'Search impressions without clicks',
      body: `${impressions?.value} impressions, ${organic?.value ?? 0} organic clicks. Titles/meta and intent match need work.`,
      agent: 'Riya',
      screen: 'seo',
      cta: 'Open SEO',
    });
  }

  if (spendN != null && spendN > 100 && (adClickN == null || adClickN < 20)) {
    insights.push({
      id: 'paid-efficiency',
      severity: 'warn',
      tag: 'Paid',
      title: 'Ad spend is live but click volume is thin',
      body: `${adSpend?.value} spend → ${adClicks?.value ?? 0} clicks. Pause weak creatives; refresh draft campaigns in Paid Studio.`,
      agent: 'Zara',
      screen: 'paid',
      cta: 'Paid Studio',
    });
  }

  if (bounceN != null && bounceN >= 60) {
    insights.push({
      id: 'bounce-high',
      severity: 'warn',
      tag: 'Activation',
      title: `Bounce rate ${bounce?.value} — first-value path is leaking`,
      body: 'Tighten landing claim and onboarding to first lab scan / aha moment.',
      agent: 'Tara',
      screen: 'landingpages',
      cta: 'Landing pages',
    });
  }

  if (conversions && parseDeltaPct(conversions.delta) != null && parseDeltaPct(conversions.delta) <= -30) {
    insights.push({
      id: 'conversions-down',
      severity: 'critical',
      tag: 'Conversion',
      title: `Conversions ${conversions.delta}`,
      body: `${conversions.value} conversions this period. Diagnose funnel bottleneck before scaling spend.`,
      agent: 'Neel',
      screen: 'orchestration',
      cta: 'Diagnose in Orchestration',
    });
  }

  if (bottleneck) {
    insights.push({
      id: 'bottleneck',
      severity: 'critical',
      tag: 'Diagnosis',
      title: `Bottleneck: ${String(bottleneck).replace(/_/g, ' ')}`,
      body: context.diagnosisSummary || 'Control loop flagged this stage — approve a quantified intervention before the next checkpoint.',
      agent: 'Neel',
      screen: 'orchestration',
      cta: 'Open Orchestration',
    });
  } else if (loopStatus && /behind|red|critical|amber/i.test(String(loopStatus))) {
    insights.push({
      id: 'loop-behind',
      severity: 'warn',
      tag: 'Control loop',
      title: `Loop status: ${loopStatus}`,
      body: context.periodLabel
        ? `${context.periodLabel} needs course-correction against North Star.`
        : 'Record actuals and re-prioritize high-priority agents.',
      agent: 'Neel',
      screen: 'orchestration',
      cta: 'Course-correct',
    });
  }

  if (highAgents.length) {
    insights.push({
      id: 'agents-hot',
      severity: 'info',
      tag: 'Agents',
      title: `${highAgents.length} high-priority agent${highAgents.length > 1 ? 's' : ''} ready`,
      body: highAgents
        .slice(0, 3)
        .map((a) => (typeof a === 'string' ? a : a.name || a.id))
        .join(', '),
      agent: highAgents[0]?.name || 'Neel',
      screen: 'agents',
      cta: 'Agents Hub',
    });
  }

  const hasGa4 = sources.some((s) => s.id === 'ga4');
  const hasGsc = sources.some((s) => s.id === 'gsc');
  const hasMeta = sources.some((s) => s.id === 'meta_ads');
  if (!hasGa4 || !hasGsc || !hasMeta) {
    const missing = [
      !hasGa4 && 'GA4',
      !hasGsc && 'Search Console',
      !hasMeta && 'Meta Ads',
    ].filter(Boolean);
    insights.push({
      id: 'connectors',
      severity: 'warn',
      tag: 'Integrations',
      title: `Connect ${missing.join(' + ')} for a complete picture`,
      body: 'Scorecard insights improve as connectors come online.',
      agent: 'Dev',
      screen: 'integrations',
      cta: 'Integrations',
    });
  }

  // Deduplicate by id, prefer critical first
  const rank = { critical: 0, warn: 1, positive: 2, info: 3 };
  const seen = new Set();
  return insights
    .filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    })
    .sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))
    .slice(0, 8);
}

function buildNextActions({ insights, context = {}, dashboard }) {
  const actions = [];
  const nba = context.nextBestAction;
  if (nba?.label) {
    actions.push({
      tag: 'Next best',
      text: `${nba.label}: ${nba.detail || ''}`.trim(),
      source: nba.agentName ? `${nba.agentName} · Journey` : 'Journey',
      action: 'Go',
      screen: nba.screen || 'gtmwizard',
      tagClass: 'tag tag-accent',
    });
  }

  for (const i of (insights || []).slice(0, 4)) {
    actions.push({
      tag: i.tag,
      text: i.title,
      source: `${i.agent} · AI insight`,
      action: i.cta || 'Open',
      screen: i.screen || 'analytics',
      tagClass:
        i.severity === 'critical'
          ? 'tag tag-accent-2'
          : i.severity === 'positive'
            ? 'tag tag-accent'
            : 'tag tag-outline',
    });
  }

  if (!(dashboard?.connectedSources || []).length) {
    actions.push({
      tag: 'Setup',
      text: 'Connect GA4, GSC, or Meta so Command Center can brief you from live data',
      source: 'Integrations',
      action: 'Connect',
      screen: 'integrations',
      tagClass: 'tag tag-outline',
    });
  }

  // Unique by screen+text
  const seen = new Set();
  return actions.filter((a) => {
    const key = `${a.screen}|${a.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

async function generateBriefing({ dashboard, insights, context }) {
  const key = groqKey();
  if (!key) {
    const top = insights[0];
    return {
      headline: top?.title || 'Live performance briefing',
      summary:
        top?.body ||
        'Connect analytics and lock North Star to get a daily AI briefing here.',
      source: 'rules',
    };
  }

  const kpis = (dashboard?.kpis || [])
    .slice(0, 8)
    .map((k) => `${k.label}: ${k.value} (${k.delta || '—'})`)
    .join('; ');
  const insightLines = insights
    .slice(0, 5)
    .map((i) => `[${i.severity}] ${i.title}`)
    .join('\n');

  const prompt = `You are Marqq Command Center for this workspace.
North Star: ${context.northStar || context.quantifiedTarget || 'not locked'}
Loop: ${context.loopStatus || 'n/a'} · Bottleneck: ${context.bottleneck || 'none'}
KPIs: ${kpis || 'none'}
Insights:
${insightLines || 'none'}

Write a JSON object with:
- "headline": max 12 words, urgent but calm
- "summary": 2 short sentences — what matters today and the single best next move
No markdown.`;

  try {
    const body = withGroqReasoning({
      model: resolveGroqModel(),
      temperature: 0.3,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
    });
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || `Groq HTTP ${res.status}`);
    const text = json?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(text);
    return {
      headline: String(parsed.headline || 'Today\'s briefing').slice(0, 120),
      summary: String(parsed.summary || '').slice(0, 400),
      source: 'llm',
    };
  } catch (err) {
    console.warn('[command-center/briefing]', err.message);
    const top = insights[0];
    return {
      headline: top?.title || 'Live performance briefing',
      summary: top?.body || err.message,
      source: 'rules_fallback',
    };
  }
}

/**
 * Full Command Center payload.
 * @param {object} opts
 * @param {string} opts.companyId
 * @param {string} opts.period
 * @param {object} opts.preferences
 * @param {object} opts.context — northStar, loopStatus, bottleneck, highPriorityAgents, nextBestAction
 * @param {boolean} opts.withLlm — generate LLM briefing (default true if key present)
 */
export async function getCommandCenter({
  companyId = 'marqq-ws-1',
  period = '30d',
  preferences = {},
  context = {},
  withLlm = true,
} = {}) {
  let dashboard;
  try {
    dashboard = await getAnalyticsDashboard({
      companyId,
      period,
      preferences,
    });
  } catch (err) {
    console.warn('[command-center] analytics failed', err.message);
    dashboard = buildEmptyDashboard(period);
  }

  const insights = buildRuleInsights({ dashboard, context });
  const nextActions = buildNextActions({ insights, context, dashboard });
  const briefing = withLlm
    ? await generateBriefing({ dashboard, insights, context })
    : {
        headline: insights[0]?.title || 'Command Center',
        summary: insights[0]?.body || '',
        source: 'rules',
      };

  const heroKpis = (dashboard?.kpis || []).slice(0, 4).map((k) => ({
    label: k.label,
    value: k.value,
    delta: k.delta,
    trend: k.trend,
    sub: k.sub,
    screen: /ad|spend|ctr/i.test(k.label) ? 'paid' : 'analytics',
  }));

  return {
    lastUpdated: dashboard?.lastUpdated || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    period: dashboard?.period || period,
    connected: Boolean(dashboard?.connected),
    connectedSources: dashboard?.connectedSources || [],
    dataNote: dashboard?.dataNote || null,
    briefing,
    insights,
    nextActions,
    kpis: heroKpis,
    channels: (dashboard?.channels || []).slice(0, 5),
    topPages: (dashboard?.topPages || []).slice(0, 5),
    prefsUsed: dashboard?.prefsUsed || null,
  };
}
