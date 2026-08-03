import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, FileText, RefreshCw, Sparkles, AlertTriangle, TrendingUp, Info } from 'lucide-react';
import { loadAgentOs } from '../lib/agents/persist';
import { getNextBestAction, loadStrategyDoc, northStarLabel } from '../lib/journeyHandoff';
import { WORKSPACE_ID } from '../lib/brandContext';

function SeverityIcon({ severity }) {
  if (severity === 'critical' || severity === 'warn') {
    return <AlertTriangle size={14} style={{ color: 'var(--color-accent-2)' }} />;
  }
  if (severity === 'positive') {
    return <TrendingUp size={14} style={{ color: 'var(--color-accent)' }} />;
  }
  return <Info size={14} style={{ color: 'var(--color-muted)' }} />;
}

/**
 * Command Center — AI insights home.
 * Live KPIs + rule/LLM briefing from /api/command-center, merged with local strategy/OS.
 */
export default function CommandCenter({ agents = [], setActiveScreen }) {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const os = loadAgentOs();
  const loop = os?.control_loop;
  const doc = loadStrategyDoc();
  const nba = getNextBestAction();
  const checkpoints = loop?.checkpointPlan?.checkpoints || [];
  const current = loop?.currentPeriod;
  const highAgents = (os?.agent_roster?.agents || []).filter(
    (a) => a.status === 'high_priority' || a.status === 'activated'
  );
  const diagnosis = loop?.lastDiagnosis || null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/command-center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: WORKSPACE_ID,
          period,
          withLlm: true,
          northStar: northStarLabel(),
          quantifiedTarget: doc?.goalAlignment?.quantified_target || null,
          loopStatus: loop?.status || null,
          bottleneck: diagnosis?.bottleneck_stage || null,
          diagnosisSummary: diagnosis?.summary || null,
          periodLabel: current?.label || null,
          highPriorityAgents: highAgents.map((a) => ({ id: a.id, name: a.name, mission: a.mission })),
          nextBestAction: nba
            ? { label: nba.label, detail: nba.detail, screen: nba.screen, agentName: nba.agentName }
            : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Command center failed');
      setData(json);
    } catch (err) {
      setError(err?.message || 'Failed to load Command Center');
    } finally {
      setLoading(false);
    }
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps -- refresh from latest OS on button

  useEffect(() => {
    load();
  }, [load]);

  const briefing = data?.briefing;
  const insights = data?.insights || [];
  const nextActions = data?.nextActions || [];
  const kpis = data?.kpis || [];
  const channels = data?.channels || [];
  const sources = data?.connectedSources || [];

  const agentSnapshot = (agents?.length ? agents : highAgents)
    .slice(0, 4)
    .map((a) => ({
      name: a.name,
      role: a.role || a.mission || '',
      avatarColor: a.avatarColor || 'var(--color-accent)',
      avatarLetter: (a.name || '?')[0],
      status: a.rosterStatus || a.status,
      statusClass:
        a.rosterStatus === 'high_priority' || a.status === 'high_priority' || a.status === 'Running'
          ? 'tag tag-accent'
          : 'tag tag-accent-2',
    }));

  const attainment =
    current?.attainmentPct != null
      ? `${Math.round(Number(current.attainmentPct))}%`
      : current?.actual != null && current?.target != null
        ? `${current.actual} / ${current.target}`
        : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="card-kicker" style={{ marginBottom: 4 }}>Command Center</div>
          <h1 style={{ marginBottom: 4 }}>AI insights for today</h1>
          <p className="text-muted" style={{ margin: 0 }}>
            North Star · {northStarLabel()}
            {data?.lastUpdated ? ` · updated ${data.lastUpdated}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen(nba?.screen || 'chat')}>
            {nba?.label || 'Ask Marqq'} <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Hero briefing */}
      <div
        className="card"
        style={{
          padding: 20,
          background: 'linear-gradient(135deg, rgba(196,92,38,0.08), transparent 60%)',
          borderColor: 'rgba(196,92,38,0.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Sparkles size={16} style={{ color: 'var(--color-accent)' }} />
              <span className="card-kicker">
                {briefing?.source === 'llm' ? 'AI briefing' : 'Briefing'}
              </span>
              {sources.map((s) => (
                <span key={s.id} className="tag tag-outline" style={{ fontSize: 10 }}>
                  {s.name || s.id}
                </span>
              ))}
            </div>
            <div className="card-title" style={{ fontSize: 20, marginBottom: 8 }}>
              {loading && !briefing ? 'Gathering live signals…' : briefing?.headline || 'Lock strategy or connect analytics'}
            </div>
            <p className="card-body" style={{ margin: 0, maxWidth: 640 }}>
              {error || briefing?.summary || data?.dataNote || 'Live GA4, Search Console, and Meta feed this view.'}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
            <div className="card elev-sm" style={{ padding: 12 }}>
              <div className="card-kicker">Loop</div>
              <div style={{ fontWeight: 700 }}>{loop?.status || 'pending'}</div>
              <div className="card-meta">
                {current?.label || 'No checkpoint'}
                {attainment ? ` · ${attainment}` : ''}
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('orchestration')}>
              Orchestration
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setActiveScreen && setActiveScreen('analytics')}>
              Full Scorecard
            </button>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
        {(kpis.length
          ? kpis
          : [
              { label: 'North Star', value: (doc?.goalAlignment?.north_star_metric || '—').toString().slice(0, 24), delta: northStarLabel().slice(0, 36), screen: 'analytics' },
              { label: 'Checkpoints', value: String(checkpoints.length), delta: 'Generate strategy first', screen: 'orchestration' },
            ]
        ).map((k, i) => (
          <button
            key={`${k.label}-${i}`}
            type="button"
            className="card elev-sm"
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              border: '1px solid var(--color-divider)',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
            onClick={() => setActiveScreen && setActiveScreen(k.screen || 'analytics')}
          >
            <div className="card-kicker">{k.label}</div>
            <div className="card-title" style={{ fontSize: 18, color: 'var(--color-text)' }}>{k.value}</div>
            <div
              className="card-meta"
              style={{ color: k.trend === 'down' ? 'var(--color-accent-2)' : 'var(--color-accent)' }}
            >
              {[k.delta, k.sub].filter(Boolean).join(' · ')}
            </div>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 28 }}>
        {/* Insights */}
        <div>
          <h4 style={{ marginBottom: 4 }}>Insights</h4>
          <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
            From live connectors + North Star · ranked by urgency
          </p>
          {!insights.length && !loading ? (
            <div className="card">
              <p className="card-body" style={{ margin: 0 }}>
                No insights yet. Lock GTM strategy or connect GA4 / GSC / Meta.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('gtmwizard')}>
                  GTM Wizard
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('integrations')}>
                  Integrations
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {insights.map((ins) => (
                <div
                  key={ins.id}
                  className="card"
                  style={{
                    padding: 14,
                    borderLeft:
                      ins.severity === 'critical'
                        ? '3px solid var(--color-accent-2)'
                        : ins.severity === 'positive'
                          ? '3px solid var(--color-accent)'
                          : '3px solid var(--color-divider)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <SeverityIcon severity={ins.severity} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                        <span className="tag tag-outline">{ins.tag}</span>
                        <span className="card-meta">{ins.agent}</span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{ins.title}</div>
                      <p className="card-body" style={{ margin: '6px 0 0', fontSize: 13 }}>{ins.body}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ flex: 'none' }}
                      onClick={() => setActiveScreen && setActiveScreen(ins.screen)}
                    >
                      {ins.cta || 'Open'} <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h4 style={{ margin: '28px 0 12px' }}>What to do next</h4>
          <div>
            {nextActions.map((c, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 14,
                  padding: '14px 0',
                  borderBottom: '1px solid var(--color-divider)',
                  alignItems: 'flex-start',
                }}
              >
                <span className={c.tagClass || 'tag tag-accent'} style={{ flex: 'none' }}>{c.tag}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14 }}>{c.text}</div>
                  <div className="card-meta" style={{ marginTop: 4 }}>{c.source}</div>
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => setActiveScreen && setActiveScreen(c.screen)}>
                  {c.action}
                </button>
              </div>
            ))}
            {!nextActions.length ? (
              <p className="text-muted" style={{ fontSize: 13 }}>Finish GTM Wizard to unlock next-best-action handoffs.</p>
            ) : null}
          </div>
        </div>

        {/* Right rail */}
        <div>
          <h4 style={{ marginBottom: 12 }}>Channels (GA4)</h4>
          {!channels.length ? (
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>No channel mix yet.</p>
          ) : (
            <div className="card" style={{ marginBottom: 20, padding: 12 }}>
              {channels.map((ch) => (
                <div key={ch.channel} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--color-divider)' }}>
                  <span>{ch.channel}</span>
                  <span className="text-muted">{ch.sessions} · {ch.pct}%</span>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" style={{ marginTop: 8, paddingLeft: 0 }} onClick={() => setActiveScreen && setActiveScreen('analytics')}>
                Scorecard →
              </button>
            </div>
          )}

          <h4 style={{ marginBottom: 12 }}>Agents</h4>
          {agentSnapshot.length ? (
            agentSnapshot.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <div style={{ width: 28, height: 28, background: a.avatarColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>
                  {a.avatarLetter}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{a.name}</div>
                  <div className="card-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.role}</div>
                </div>
                <span className={a.statusClass}>{a.status}</span>
              </div>
            ))
          ) : (
            <p className="text-muted" style={{ fontSize: 13 }}>Lock strategy to elevate agents.</p>
          )}
          <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={() => setActiveScreen && setActiveScreen('agents')}>
            Agents Hub <FileText size={14} />
          </button>

          <div className="card" style={{ marginTop: 20, padding: 14 }}>
            <div className="card-kicker">Quick doors</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {[
                ['strategy', 'Strategy home'],
                ['approvals', 'Approvals'],
                ['paid', 'Paid Studio'],
                ['content', 'Content Studio'],
                ['integrations', 'Integrations'],
              ].map(([id, label]) => (
                <button key={id} type="button" className="btn btn-ghost" style={{ justifyContent: 'space-between' }} onClick={() => setActiveScreen && setActiveScreen(id)}>
                  {label} <ArrowRight size={12} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
