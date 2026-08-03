import React from 'react';
import { ArrowRight, FileText } from 'lucide-react';
import { loadAgentOs } from '../lib/agents/persist';
import { getNextBestAction, loadStrategyDoc, northStarLabel } from '../lib/journeyHandoff';

export default function CommandCenter({ kpis = [], changes = [], priorities = [], agents = [], setActiveScreen }) {
  const os = loadAgentOs();
  const loop = os?.control_loop;
  const doc = loadStrategyDoc();
  const nba = getNextBestAction();
  const checkpoints = loop?.checkpointPlan?.checkpoints || [];
  const current = loop?.currentPeriod;

  const defaultKpis = [
    {
      label: 'North Star',
      value: (doc?.goalAlignment?.north_star_metric || '—').toString().slice(0, 28),
      delta: northStarLabel().slice(0, 40),
      deltaColor: 'var(--color-accent)',
    },
    {
      label: 'Loop status',
      value: (loop?.status || 'pending').toString(),
      delta: current?.label ? `${current.label}: target ${current.target ?? '—'}` : 'No checkpoints yet',
      deltaColor: 'var(--color-accent)',
    },
    {
      label: 'High priority agents',
      value: String((os?.agent_roster?.highPriority || []).length),
      delta: (os?.agent_roster?.highPriority || []).join(', ') || 'None elevated',
      deltaColor: 'var(--color-accent-2)',
    },
    {
      label: 'Checkpoints',
      value: String(checkpoints.length),
      delta: checkpoints.length ? `End target ${loop?.checkpointPlan?.endTarget ?? '—'}` : 'Generate strategy first',
      deltaColor: 'var(--color-accent)',
    },
  ];

  const defaultChanges = changes.length > 0 ? changes : [
    { tag: 'Journey', tagClass: 'tag tag-accent', text: nba ? `${nba.label}: ${nba.detail}` : 'Finish GTM Wizard', source: 'Next Best Action', action: 'Go', screen: nba?.screen || 'gtmwizard' },
    { tag: 'Strategy', tagClass: 'tag tag-outline', text: doc ? `Locked: ${doc.title || 'GTM strategy'}` : 'No strategy locked', source: 'GTM', action: 'Open', screen: doc ? 'strategy' : 'gtmwizard' },
    { tag: 'Orchestration', tagClass: 'tag tag-accent-2', text: 'Control loop course-correction hub', source: 'Neel', action: 'Open', screen: 'orchestration' },
  ];

  const defaultPriorities = priorities.length > 0 ? priorities : [
    { type: 'Action', label: nba?.label || 'Finish GTM Wizard' },
    { type: 'Integrations', label: 'Connect required connectors for agent plans' },
    { type: 'Approvals', label: 'Review pending go-live gates' },
  ];

  const agentSnapshot = (agents || []).slice(0, 3).map((a) => ({
    name: a.name,
    role: a.role,
    avatarColor: a.avatarColor,
    avatarLetter: (a.name || '?')[0],
    status: a.rosterStatus || a.status,
    statusClass: a.rosterStatus === 'high_priority' || a.status === 'Running' ? 'tag tag-accent' : 'tag tag-accent-2',
  }));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>Command Center</h1>
          <p className="text-muted" style={{ margin: 0 }}>Today from your North Star · {northStarLabel()}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('orchestration')}>
            Orchestration
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen(nba?.screen || 'chat')}>
            {nba?.label || 'Ask Marqq'} <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
        {defaultKpis.map((k, i) => (
          <div key={i} className="card elev-sm">
            <div className="card-kicker">{k.label}</div>
            <div className="card-title" style={{ fontSize: '18px' }}>{k.value}</div>
            <div className="card-meta" style={{ color: k.deltaColor || 'var(--color-accent)' }}>{k.delta}</div>
          </div>
        ))}
      </div>

      <div className="hr" style={{ marginBottom: '28px' }} />

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '36px' }}>
        <div style={{ borderRight: '2px solid var(--color-divider)', paddingRight: '36px' }}>
          <h4 style={{ marginBottom: '4px' }}>What to do next</h4>
          <p className="text-muted" style={{ fontSize: '12px', marginBottom: '12px' }}>Journey-driven · from strategy + agent OS</p>
          <div>
            {defaultChanges.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: '14px', padding: '14px 0', borderBottom: '1px solid var(--color-divider)', alignItems: 'flex-start' }}>
                <span className={c.tagClass || 'tag tag-accent'} style={{ flex: 'none' }}>{c.tag}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px' }}>{c.text}</div>
                  <div className="card-meta" style={{ marginTop: 4 }}>{c.source}</div>
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => setActiveScreen && setActiveScreen(c.screen)}>
                  {c.action}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 style={{ marginBottom: 12 }}>Priorities</h4>
          {defaultPriorities.map((p, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 13 }}>
              <span className="tag tag-outline" style={{ marginRight: 8 }}>{p.type}</span>
              {p.label}
            </div>
          ))}
          <h4 style={{ margin: '20px 0 12px' }}>Agents</h4>
          {agentSnapshot.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, background: a.avatarColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{a.avatarLetter}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{a.name}</div>
                <div className="card-meta">{a.role}</div>
              </div>
              <span className={a.statusClass}>{a.status}</span>
            </div>
          ))}
          <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={() => setActiveScreen && setActiveScreen('agents')}>
            Agents Hub <FileText size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
