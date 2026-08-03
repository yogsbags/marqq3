import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, PlugZap, RefreshCw, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import JourneyBar from '../components/JourneyBar.jsx';
import { loadStrategyDoc, northStarLabel, stashJourneyHandoff } from '../lib/journeyHandoff';
import { WORKSPACE_ID } from '../lib/brandContext';

function TrendIcon({ trend }) {
  if (trend === 'up') return <TrendingUp size={14} style={{ color: 'var(--color-accent)' }} />;
  if (trend === 'down') return <TrendingDown size={14} style={{ color: 'var(--color-accent-2)' }} />;
  return <Minus size={14} style={{ color: 'var(--color-muted)' }} />;
}

function Sparkline({ points = [], color = 'var(--color-accent)' }) {
  const vals = points.map((p) => Number(p.value) || 0);
  const max = Math.max(...vals, 1);
  const w = 280;
  const h = 64;
  if (!vals.length) {
    return <div style={{ height: h, background: 'var(--color-bg)', border: '1px solid var(--color-divider)' }} />;
  }
  const step = vals.length > 1 ? w / (vals.length - 1) : w;
  const d = vals
    .map((v, i) => {
      const x = i * step;
      const y = h - (v / max) * (h - 8) - 4;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

/**
 * Performance Analytics / Scorecard — live GSC + Meta via /api/analytics/dashboard.
 */
export function AnalyticsView({ setActiveScreen }) {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const doc = loadStrategyDoc();
  const measurement = (doc?.sections || []).find((s) => s.id === 'measurement_optimization');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/analytics/dashboard?period=${encodeURIComponent(period)}&companyId=${encodeURIComponent(WORKSPACE_ID)}`
      );
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const connected = Boolean(data?.connected);
  const sources = data?.connectedSources || [];
  const kpis = data?.kpis || [];
  const traffic = data?.trafficChart || [];
  const clicksSeries = data?.conversionChart || [];
  const topPages = data?.topPages || [];
  const topQueries = data?.topQueries || [];
  const campaigns = data?.topAdCampaigns || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="analytics" setActiveScreen={setActiveScreen} title="Performance Scorecard" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p className="text-muted" style={{ margin: 0 }}>
            Live measurement for <strong>{northStarLabel()}</strong>
            {data?.lastUpdated ? ` · updated ${data.lastUpdated}` : ''}
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {sources.length ? (
              sources.map((s) => (
                <span key={s.id} className="tag tag-accent">
                  {s.name}
                </span>
              ))
            ) : (
              <span className="tag tag-outline">No analytics connectors</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {['7d', '30d', '90d'].map((p) => (
            <button
              key={p}
              type="button"
              className={period === p ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {!connected ? (
        <div className="card" style={{ borderColor: 'rgba(196,92,38,0.35)', background: 'rgba(196,92,38,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div className="card-title" style={{ fontSize: 16 }}>
                Connect analytics to start the scorecard
              </div>
              <p className="card-body" style={{ marginTop: 6 }}>
                {data?.dataNote ||
                  'Link Google Search Console, Meta Ads, and GA4 so Dev can measure the North Star weekly.'}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                stashJourneyHandoff({
                  from: 'analytics',
                  toScreen: 'integrations',
                  summary: 'Connect GA4 / GSC / Meta for the Performance Scorecard',
                  nextScreen: 'analytics',
                });
                setActiveScreen && setActiveScreen('integrations');
              }}
            >
              <PlugZap size={14} /> Open Integrations <ArrowRight size={14} />
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div className="card" style={{ color: 'var(--color-accent-2)' }}>{error}</div> : null}
      {data?.dataNote && connected ? (
        <div className="card text-muted" style={{ fontSize: 13 }}>
          {data.dataNote}
        </div>
      ) : null}

      {measurement ? (
        <div className="card">
          <div className="card-kicker">From GTM · Measurement &amp; optimization</div>
          <div style={{ fontWeight: 700, marginTop: 4 }}>{measurement.title || 'Measurement'}</div>
          <p className="card-body" style={{ marginTop: 6 }}>
            {(measurement.summary || measurement.body || '').slice(0, 220)}
            {(measurement.summary || measurement.body || '').length > 220 ? '…' : ''}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setActiveScreen && setActiveScreen('strategy')}>
              Strategy section
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setActiveScreen && setActiveScreen('orchestration')}
            >
              Weekly control loop
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {kpis.map((k) => (
          <div key={k.label} className="card elev-sm">
            <div className="card-kicker">{k.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <div className="card-title" style={{ fontSize: 22 }}>
                {k.value}
              </div>
              <TrendIcon trend={k.trend} />
            </div>
            <div className="card-meta" style={{ marginTop: 4 }}>
              {k.delta} {k.sub ? `· ${k.sub}` : ''}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Search impressions</h3>
            <span className="text-muted" style={{ fontSize: 12 }}>{data?.period || period}</span>
          </div>
          <Sparkline points={traffic} />
          <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
            Google Search Console daily impressions for nouriva.tech
          </p>
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Organic clicks</h3>
            <span className="text-muted" style={{ fontSize: 12 }}>{data?.period || period}</span>
          </div>
          <Sparkline points={clicksSeries} color="var(--color-accent-2)" />
          <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
            Leading indicator toward paid conversions / trial
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Top pages</h3>
          {!topPages.length ? (
            <p className="card-body">No page rows for this period.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topPages.map((p) => (
                <div key={p.path} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</span>
                  <span className="text-muted" style={{ flex: 'none' }}>
                    {p.sessions} impr · {p.clicks || 0} clicks
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Top queries</h3>
          {!topQueries.length ? (
            <p className="card-body">No query rows yet — keep shipping SEO content.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topQueries.map((q) => (
                <div key={q.query} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                  <span>{q.query}</span>
                  <span className="text-muted" style={{ flex: 'none' }}>
                    {q.clicks} / {q.impressions} · pos {q.position}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: 12 }}
            onClick={() => {
              stashJourneyHandoff({
                from: 'analytics',
                toScreen: 'content',
                sectionId: 'distribution_channels',
                summary: 'Ship SEO posts that lift organic clicks toward North Star',
              });
              setActiveScreen && setActiveScreen('content');
            }}
          >
            Brief Content Studio <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Paid campaigns (Meta)</h3>
          <button type="button" className="btn btn-ghost" onClick={() => setActiveScreen && setActiveScreen('paid')}>
            Open Paid Studio
          </button>
        </div>
        {!campaigns.length ? (
          <p className="card-body" style={{ marginTop: 8 }}>
            Account-level Meta insights loaded when campaigns are empty. Connect Meta under Integrations if missing.
          </p>
        ) : (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {campaigns.map((c, i) => (
              <div key={`${c.name}-${i}`} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, fontSize: 13 }}>
                <strong>{c.name}</strong>
                <span>{c.spendLabel || `$${c.spend}`}</span>
                <span>{c.clicks} clicks</span>
                <span>{Number(c.ctr || 0).toFixed(2)}% CTR</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('orchestration')}>
          Orchestration scorecard loop
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('command')}>
          Back to Command Center
        </button>
      </div>
    </div>
  );
}

export default AnalyticsView;
