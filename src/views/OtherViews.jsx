import React, { useState, useEffect, useRef } from 'react';
import {  Layers, Shield, Sparkles, Plus, Play, CheckCircle, Database, FileCode, Sliders, Lock, ArrowRight, UserPlus, FileText, Calendar, Zap, MessageSquare, Video, HelpCircle, Upload, CheckCircle2, AlertTriangle, RefreshCw, Trash2  } from 'lucide-react';
import {  connectComposioConnector, formatConnectorError  } from '../lib/composio';
import {  CONNECTOR_DISPLAY, isConnectorActive, connectorLabel  } from '../lib/connectormeta';
import {  ResourcePickerModal  } from '../components/common/ResourcePickerModal';
import {  fetchBrandContext, fetchKnowledgeFiles, persistBrandContext, loadLocalBrandContext, getActiveWorkspaceId  } from '../lib/brandContext';
import JourneyBar from '../components/JourneyBar.jsx';
import {  openSectionScreen, loadStrategyDoc, northStarLabel, stashJourneyHandoff  } from '../lib/journeyHandoff';
import {  formatStrategySectionForChat  } from '../lib/askMarqqContext';
import { 
  getAudienceProfile,
  getCompanyName,
  getMarketIntel,
  getStrategySection,
  playsFromSection,
  sectionPlainText,
  wizardAnswerLabel,
 } from '../lib/liveWorkspace';
import {  loadAgentOs  } from '../lib/agents/persist';
import {  planAgentTask  } from '../lib/agents/planTask';
import {  sectionBriefForScreen  } from '../lib/journeyHandoff';

function strategySectionPreview(s) {
  const text =
    (typeof s?.content === 'string' && s.content.trim()) ||
    (typeof s?.summary === 'string' && s.summary.trim()) ||
    (typeof s?.body === 'string' && s.body.trim()) ||
    formatStrategySectionForChat(s || {}) ||
    '';
  return text;
}

export function StrategyView({ setActiveModal, setActiveScreen }) {
  const [doc, setDoc] = useState(() => {
    try {
      const raw = sessionStorage.getItem('marqq_gtm_strategy');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('marqq_gtm_strategy');
      setDoc(raw ? JSON.parse(raw) : null);
    } catch {
      setDoc(null);
    }
  }, []);

  if (!doc?.sections?.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <JourneyBar screenId="strategy" setActiveScreen={setActiveScreen} title="Strategy" />
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No locked GTM strategy yet</h3>
          <p className="card-body">
            Finish the GTM Wizard to lock North Star and 16 strategy sections. This screen is the journey home —
            not a separate mock brief library.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('gtmwizard')}>
            Open GTM Wizard
          </button>
        </div>
      </div>
    );
  }

  const ga = doc.goalAlignment || {};
  const sections = Array.isArray(doc.sections) ? doc.sections : [];
  const targets = Array.isArray(ga.sectionTargets) ? ga.sectionTargets : [];
  const targetById = Object.fromEntries(targets.map((t) => [t.sectionId, t]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="strategy" setActiveScreen={setActiveScreen} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 4px' }}>{doc.title || 'GTM Strategy'}</h1>
          <p className="text-muted" style={{ margin: 0, maxWidth: 640 }}>
            {doc.executiveSummary || 'Locked strategy document'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('gtmwizard')}>
            Open wizard
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('analytics')}>
            Performance Scorecard
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('chat')}>
            Ask Marqq
          </button>
          <button type="button" className="btn btn-primary" onClick={() => {
            try { sessionStorage.setItem('marqq_marketing_ideas_autogen', '1'); } catch { /* ignore */ }
            setActiveScreen && setActiveScreen('ideas');
          }}>
            Generate Ideas
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-kicker">North Star</div>
        <div className="card-title" style={{ fontSize: 18 }}>{ga.north_star_metric || '—'}</div>
        <p className="card-body" style={{ margin: '6px 0 0' }}>{ga.quantified_target || ga.metric_definition || ''}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h4 style={{ margin: 0 }}>Strategy sections</h4>
          {sections.map((s) => {
            const t = targetById[s.id];
            const preview = strategySectionPreview(s);
            return (
              <div key={s.id} className="card" style={{ padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="card-title" style={{ margin: 0, color: 'var(--color-text)' }}>{s.title}</div>
                    {t?.metric ? (
                      <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
                        Leading metric: {t.metric}
                      </div>
                    ) : null}
                    <p className="card-body" style={{ margin: '8px 0 0', fontSize: 13 }}>
                      {preview ? `${preview.slice(0, 160)}${preview.length > 160 ? '…' : ''}` : 'No section body yet.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 'none', color: 'var(--color-text)' }}
                    onClick={() =>
                      openSectionScreen(s.id, setActiveScreen, {
                        sectionTitle: s.title,
                        summary: preview,
                      })
                    }
                  >
                    Open →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <h4 style={{ marginBottom: 12 }}>Next steps</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(doc.nextSteps || ['Generate marketing ideas', 'Activate high-priority agents', 'Open orchestration']).map((step, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 13 }}>
                {step}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 16, width: '100%' }}
            onClick={() => {
              const measurement = sections.find((s) => s.id === 'measurement_optimization');
              if (measurement) {
                openSectionScreen('measurement_optimization', setActiveScreen, {
                  sectionTitle: measurement.title,
                  summary: strategySectionPreview(measurement),
                });
                return;
              }
              setActiveScreen && setActiveScreen('analytics');
            }}
          >
            Open Performance Scorecard
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 8, width: '100%' }}
            onClick={() => setActiveScreen && setActiveScreen('orchestration')}
          >
            Open orchestration
          </button>
          {setActiveModal ? (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 8, width: '100%' }}
              onClick={() => setActiveModal('strategy')}
            >
              Legacy brief modal
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}


export function MarketView({ setActiveScreen }) {
  const intel = getMarketIntel();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="market" setActiveScreen={setActiveScreen} title="Market & Competitor Intelligence" />
      <p className="text-muted" style={{ margin: 0 }}>
        Live from GTM <strong>Market analysis</strong> + <strong>Risks</strong> for {intel.companyName}
        {intel.niche ? ` · ${intel.niche}` : ''}.
      </p>

      {!intel.hasStrategy ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No market brief yet</h3>
          <p className="card-body">
            Finish the GTM Wizard so Isha can work from your locked market analysis — not demo competitors.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('gtmwizard')}>
            Open GTM Wizard
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card-kicker">North Star</div>
            <div className="card-title" style={{ fontSize: 16, color: 'var(--color-text)' }}>{intel.northStar}</div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>{intel.marketTitle}</h3>
            {intel.marketBody ? (
              <p className="card-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                {intel.marketBody.slice(0, 1200)}
                {intel.marketBody.length > 1200 ? '…' : ''}
              </p>
            ) : null}
            {intel.marketBullets.length ? (
              <ul style={{ margin: '12px 0 0', paddingLeft: 18 }}>
                {intel.marketBullets.map((b, i) => (
                  <li key={i} style={{ fontSize: 13, marginBottom: 6 }}>{b}</li>
                ))}
              </ul>
            ) : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('audiences')}>
                Audiences
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  openSectionScreen('market_analysis', setActiveScreen, {
                    sectionTitle: intel.marketTitle,
                    summary: intel.marketBody,
                  })
                }
              >
                Open in Ask Marqq
              </button>
            </div>
          </div>

          {(intel.risksBody || intel.risksBullets.length) ? (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>{intel.risksTitle}</h3>
              {intel.risksBody ? (
                <p className="card-body" style={{ whiteSpace: 'pre-wrap' }}>
                  {intel.risksBody.slice(0, 800)}
                  {intel.risksBody.length > 800 ? '…' : ''}
                </p>
              ) : null}
              {intel.risksBullets.length ? (
                <ul style={{ margin: '12px 0 0', paddingLeft: 18 }}>
                  {intel.risksBullets.map((b, i) => (
                    <li key={i} style={{ fontSize: 13, marginBottom: 6 }}>{b}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export { AnalyticsView } from './AnalyticsScorecard.jsx';

export function AudiencesView({ setActiveScreen }) {
  const a = getAudienceProfile();
  const segments = [];
  if (a.icp) {
    segments.push({
      title: a.icp,
      detail: [a.persona && `Champion: ${a.persona}`, a.jtbd && `Jobs: ${a.jtbd}`, a.triggers && `Triggers: ${a.triggers}`]
        .filter(Boolean)
        .join(' · ') || a.sectionBody.slice(0, 200),
      tags: ['ICP', a.niche].filter(Boolean),
    });
  }
  if (a.persona && a.persona !== a.icp) {
    segments.push({
      title: a.persona,
      detail: a.jtbd || 'Primary champion / buyer persona from interview',
      tags: ['Persona'],
    });
  }
  if (a.notAFit) {
    segments.push({
      title: 'Not a fit',
      detail: a.notAFit,
      tags: ['Exclude'],
    });
  }
  // Extra segments from strategy bullets when distinct
  for (const b of a.bullets.slice(0, 4)) {
    if (segments.some((s) => s.title === b || s.detail === b)) continue;
    segments.push({ title: b.length > 80 ? `${b.slice(0, 80)}…` : b, detail: b, tags: ['From strategy'] });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="audiences" setActiveScreen={setActiveScreen} title="Audiences & ICP Segmentation" />
      <p className="text-muted" style={{ margin: 0 }}>
        Live ICP from onboarding + GTM Audience interview + <strong>Target customer</strong> strategy for {a.companyName}.
      </p>

      {!a.hasStrategy && !a.icp ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No ICP locked yet</h3>
          <p className="card-body">
            Complete Brand DNA and the Audience step in GTM Wizard. Demo clinic lists have been removed.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('gtmwizard')}>
            Open GTM Wizard
          </button>
        </div>
      ) : (
        <>
          {a.northStar ? (
            <div className="card">
              <div className="card-kicker">North Star</div>
              <div className="card-title" style={{ fontSize: 16, color: 'var(--color-text)' }}>{a.northStar}</div>
            </div>
          ) : null}

          {segments.length ? (
            segments.map((seg, i) => (
              <div key={i} className="card">
                <h3 style={{ marginTop: 0, color: 'var(--color-text)' }}>{seg.title}</h3>
                {seg.detail ? (
                  <p className="text-muted" style={{ marginTop: 4, lineHeight: 1.5 }}>{seg.detail}</p>
                ) : null}
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {seg.tags.map((t) => (
                    <span key={t} className={t === 'Exclude' ? 'tag tag-outline' : 'tag tag-accent'}>{t}</span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="card">
              <p className="card-body" style={{ margin: 0 }}>
                {a.sectionBody || 'Target customer section is empty — regenerate strategy or refine Audience answers.'}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('market')}>
              Market
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('brand')}>
              Brand
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                openSectionScreen('target_customer', setActiveScreen, {
                  sectionTitle: a.sectionTitle,
                  summary: a.sectionBody || a.icp,
                })
              }
            >
              Open in Ask Marqq
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function BrandView({ setActiveScreen }) {
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchBrandContext();
      if (!cancelled) {
        setCtx(data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const company = ctx?.companyName || getCompanyName();
  const website = ctx?.website || localStorage.getItem('marqq_ob_website') || '';
  const tagline = ctx?.brandTagline || localStorage.getItem('marqq_ob_tagline') || '';
  const tone = ctx?.toneOfVoice || localStorage.getItem('marqq_ob_tone') || '';
  const summary = ctx?.brandSummary || 'Brand context will appear here after onboarding Brand DNA synthesis.';
  const colors = Array.isArray(ctx?.colors) && ctx.colors.length ? ctx.colors : [];
  const tags = Array.isArray(ctx?.positioningTags) ? ctx.positioningTags : [];
  const voice = ctx?.voiceTranscript || '';
  const positioning = getStrategySection('positioning_messaging');
  const positioningText = sectionPlainText(positioning);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="brand" setActiveScreen={setActiveScreen} title="Brand Center" />
      <p className="text-muted" style={{ marginTop: 0 }}>
        Live brand guidelines, voice notes, and positioning pulled from onboarding.
      </p>

      {loading ? (
        <div className="card text-muted">Loading brand context…</div>
      ) : (
        <>
          <div className="card" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            {ctx?.logoUrl ? (
              <img
                src={ctx.logoUrl}
                alt={`${company} logo`}
                style={{ width: 64, height: 64, objectFit: 'contain', background: 'var(--color-bg)', border: '1px solid var(--color-divider)' }}
              />
            ) : (
              <div style={{
                width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-accent)', color: '#fff', fontWeight: 800, fontSize: 22,
              }}>
                {(company || 'E').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{company}</div>
              <div className="text-muted" style={{ fontSize: 13, marginTop: 2 }}>{website}</div>
              <div style={{ marginTop: 8, fontWeight: 600 }}>{tagline}</div>
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {tags.map((t) => (
                    <span key={t} className="tag tag-accent">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h3>Brand summary</h3>
            <p style={{ color: 'var(--color-neutral-300)', marginTop: '6px', lineHeight: 1.55 }}>{summary}</p>
          </div>

          <div className="card">
            <h3>Voice &amp; Tone Guidelines</h3>
            <p style={{ color: 'var(--color-neutral-300)', marginTop: '6px' }}>
              Tone: {tone}
            </p>
            {voice ? (
              <div style={{
                marginTop: 12, padding: 12, background: 'var(--color-bg)',
                border: '1px solid var(--color-divider)', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5,
              }}>
                <div className="text-muted" style={{ fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Voice notes from onboarding
                </div>
                {voice}
              </div>
            ) : null}
          </div>

          <div className="card">
            <h3>Palette &amp; type</h3>
            {colors.length ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {colors.map((c) => (
                  <div key={c} title={c} style={{ width: 36, height: 36, background: c, border: '1px solid var(--color-divider)' }} />
                ))}
              </div>
            ) : (
              <p className="text-muted" style={{ marginTop: 10, fontSize: 13 }}>No palette extracted yet — re-run Brand DNA.</p>
            )}
            <p className="text-muted" style={{ marginTop: 10, fontSize: 13 }}>
              {ctx?.fonts || 'Set fonts in Brand DNA'}
            </p>
            {(ctx?.niche || ctx?.icp) && (
              <p style={{ marginTop: 10, fontSize: 13 }}>
                {ctx.niche ? <><strong>Niche:</strong> {ctx.niche}{' '}</> : null}
                {ctx.icp ? <><strong>ICP:</strong> {ctx.icp}</> : null}
              </p>
            )}
          </div>

          {positioningText ? (
            <div className="card">
              <h3>Positioning (from strategy)</h3>
              <p className="card-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                {positioningText.slice(0, 900)}
                {positioningText.length > 900 ? '…' : ''}
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 10 }}
                onClick={() =>
                  openSectionScreen('positioning_messaging', setActiveScreen, {
                    sectionTitle: positioning?.title,
                    summary: positioningText,
                  })
                }
              >
                Open in Ask Marqq
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function LandingPagesView({ setActiveScreen }) {
  const company = getCompanyName();
  const plays = [
    ...playsFromSection('marketing_strategy', 'Campaign page'),
    ...playsFromSection('positioning_messaging', 'Message page'),
  ].slice(0, 8);
  const website = localStorage.getItem('marqq_ob_website') || '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="landingpages" setActiveScreen={setActiveScreen} title="Landing Pages" />
      <p className="text-muted" style={{ margin: 0 }}>
        Planned pages from locked strategy for {company} — not demo Atlas / clinic URLs.
      </p>
      {!plays.length ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No landing plays yet</h3>
          <p className="card-body">Lock marketing / positioning sections in GTM Wizard, then return here.</p>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('gtmwizard')}>
            Open GTM Wizard
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Planned page / offer</th><th>Source</th><th>Status</th></tr>
              </thead>
              <tbody>
                {plays.map((lp, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: 'var(--color-text)' }}>{lp.name}</td>
                    <td className="text-muted">{website || 'Strategy'}</td>
                    <td><span className="tag tag-outline">{lp.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setActiveScreen && setActiveScreen('leadmagnets')}>
            Lead magnets
          </button>
        </div>
      )}
    </div>
  );
}

export function BillingView({ setActiveScreen }) {
  const company = getCompanyName();
  const [stats, setStats] = useState({ agents: 0, deployments: 0, files: 0, connectors: 0, loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dep, files, intRes] = await Promise.all([
          fetch('/api/agents/deployments').then((r) => r.json()).catch(() => ({})),
          fetchKnowledgeFiles().catch(() => []),
          fetch(`/api/integrations?companyId=${encodeURIComponent(getActiveWorkspaceId())}`).then((r) => r.json()).catch(() => ({})),
        ]);
        if (cancelled) return;
        const connectors = Array.isArray(intRes?.connectors) ? intRes.connectors : Array.isArray(intRes) ? intRes : [];
        const os = loadAgentOs();
        setStats({
          agents: os?.agent_roster?.agents?.length || 0,
          deployments: Array.isArray(dep.deployments) ? dep.deployments.length : 0,
          files: Array.isArray(files) ? files.length : 0,
          connectors: connectors.filter((c) => c.connected || c.status === 'ACTIVE').length,
          loading: false,
        });
      } catch {
        if (!cancelled) setStats((s) => ({ ...s, loading: false }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = [
    { label: 'Agents in roster', value: String(stats.agents), pct: Math.min(100, stats.agents * 8) },
    { label: 'Section deployments', value: String(stats.deployments), pct: Math.min(100, stats.deployments * 10) },
    { label: 'Knowledge files', value: String(stats.files), pct: Math.min(100, stats.files * 12) },
    { label: 'Live connectors', value: String(stats.connectors), pct: Math.min(100, stats.connectors * 15) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Billing &amp; Usage</h1>
      <p className="text-muted" style={{ margin: 0 }}>
        Live workspace usage for {company}. Credit metering is not enabled yet — numbers below are real activity counts, not demo quotas.
      </p>

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="text-muted">Plan</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)' }}>Workspace · usage-based (unmetered)</div>
          <div className="card-meta" style={{ marginTop: 4 }}>North Star: {northStarLabel()}</div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('integrations')}>
          Manage connectors
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Activity pacing</h3>
        {stats.loading ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
            {rows.map((u, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                  <span>{u.label}</span>
                  <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{u.value}</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'var(--color-bg)', overflow: 'hidden' }}>
                  <div style={{ width: `${u.pct}%`, height: '100%', background: 'var(--color-accent)' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkflowsView({ setActiveScreen }) {
  const doc = loadStrategyDoc();
  const ops = (doc?.sections || []).find((s) => s.id === 'operations_execution');
  const [deployments, setDeployments] = useState([]);
  const [automations, setAutomations] = useState([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/agents/deployments').then((r) => r.json()).catch(() => ({})),
      fetch('/api/automations/scheduled').then((r) => r.json()).catch(() => ({})),
    ]).then(([dep, auto]) => {
      if (cancelled) return;
      setDeployments(Array.isArray(dep.deployments) ? dep.deployments : []);
      setAutomations(Array.isArray(auto.automations) ? auto.automations : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rules = [
    ...automations.map((a) => ({
      name: a.automation_id,
      trigger: a.cron || 'scheduled',
      action: `Agent ${a.params?.agent || 'neel'} · section ${a.params?.sectionId || '—'}`,
      status: a.active ? 'Active' : 'Paused',
      screen: a.params?.sectionId === 'distribution_channels' ? 'social' : 'orchestration',
      next: a.next_run,
    })),
    { name: 'Approval reminder', trigger: 'an approval sits >24h', action: 'notify the assigned approver', status: 'Active', screen: 'approvals' },
  ];
  if (ops?.content || ops?.summary) {
    rules.unshift({
      name: 'Ops runbook from strategy',
      trigger: 'operations_execution section locked',
      action: String(ops.summary || ops.content || '').slice(0, 120) + '…',
      status: 'Seeded',
      screen: 'orchestration',
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="workflows" setActiveScreen={setActiveScreen} title="Workflows & Automation" />
      <p className="text-muted" style={{ marginTop: -8 }}>
        Scheduled automations + agent deployments from locked strategy. Draft-gated until you approve.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {rules.map((r, i) => (
          <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>{r.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>
                <strong>When:</strong> {r.trigger} → <strong>Then:</strong> {r.action}
                {r.next ? ` · next ${new Date(r.next).toLocaleString()}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 'none' }}>
              <span className="tag tag-accent">{r.status}</span>
              {setActiveScreen && r.screen && (
                <button type="button" className="btn btn-ghost" onClick={() => setActiveScreen(r.screen)}>Open</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Agent deployments ({deployments.length})</h3>
        {!deployments.length ? (
          <p className="card-body">Lock a GTM strategy to seed recurring section deployments.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {deployments.slice(0, 12).map((d) => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                <div>
                  <strong>{d.agentDisplayName || d.agentName}</strong> · {d.sectionTitle}
                  <div style={{ color: 'var(--color-muted)' }}>
                    {d.status} · runs {d.runCount || 0}
                    {d.scheduledFor ? ` · next ${new Date(d.scheduledFor).toLocaleString()}` : ''}
                  </div>
                </div>
                {setActiveScreen && d.openScreen && (
                  <button type="button" className="btn btn-ghost" onClick={() => setActiveScreen(d.openScreen)}>
                    Studio
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function OrchestrationView({ setActiveScreen }) {
  const osLocal = loadAgentOs();
  const [os, setOs] = useState(osLocal);
  const [deployments, setDeployments] = useState([]);
  const [ticking, setTicking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/agent-os').then((r) => r.json()).catch(() => ({})),
      fetch('/api/agents/deployments').then((r) => r.json()).catch(() => ({})),
    ]).then(([osRes, dep]) => {
      if (cancelled) return;
      if (osRes?.agentOs) setOs(osRes.agentOs);
      setDeployments(Array.isArray(dep.deployments) ? dep.deployments : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loop = os?.control_loop;
  const roster = os?.agent_roster;
  const checkpoints = loop?.checkpointPlan?.checkpoints || [];
  const high = (roster?.agents || []).filter((a) => a.status === 'high_priority' || a.status === 'activated').slice(0, 6);
  const cadence = Array.isArray(loop?.weeklyCycle) ? loop.weeklyCycle : [
    { day: 'Mon', focus: 'Measure' },
    { day: 'Tue', focus: 'Diagnose' },
    { day: 'Wed', focus: 'Propose' },
    { day: 'Thu', focus: 'Approve' },
    { day: 'Fri', focus: 'Execute' },
  ];
  const due = deployments.filter((d) => d.status === 'pending' || d.status === 'active' || d.status === 'running');
  const last = os?.last_executed_task;

  const runTick = async () => {
    setTicking(true);
    try {
      await fetch('/api/agents/scheduler/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const dep = await fetch('/api/agents/deployments').then((r) => r.json());
      setDeployments(Array.isArray(dep.deployments) ? dep.deployments : []);
      const osRes = await fetch('/api/agent-os').then((r) => r.json()).catch(() => ({}));
      if (osRes?.agentOs) setOs(osRes.agentOs);
    } finally {
      setTicking(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="orchestration" setActiveScreen={setActiveScreen} title="Orchestration" />
      <p className="text-muted" style={{ marginTop: -8 }}>
        Control plane for {northStarLabel()}. Status: <strong>{loop?.status || 'pending'}</strong>
        {last?.at ? ` · last run ${new Date(last.at).toLocaleString()} (${last.agentName})` : ''}
      </p>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Scheduler</h3>
          <button type="button" className="btn btn-primary" disabled={ticking} onClick={runTick}>
            {ticking ? 'Running…' : 'Run due deployments now'}
          </button>
        </div>
        <p className="card-body" style={{ marginTop: 8 }}>
          {due.length} active/pending deployments · drafts land in Approvals (no live spend).
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Weekly cycle</h3>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {cadence.map((c, i) => (
            <div key={i} style={{ padding: '10px 14px', background: 'var(--color-bg)', border: '1px solid var(--color-divider)', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600 }}>
              {c.day}: {c.focus}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>North Star checkpoints</h3>
        {!checkpoints.length ? (
          <p className="card-body">Lock a GTM strategy to bootstrap checkpoints from the control loop.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
            {checkpoints.map((c) => (
              <div key={c.period} style={{ padding: 10, background: 'var(--color-bg)', border: '1px solid var(--color-divider)' }}>
                <div className="card-kicker">{c.label}</div>
                <div style={{ fontWeight: 700 }}>{c.target ?? '—'}</div>
                <span className="tag tag-outline">{c.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Active agents</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {high.length ? high.map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
              <div>
                <strong>{a.name}</strong> · {a.status}
                <div style={{ color: 'var(--color-muted)' }}>{a.mission}</div>
              </div>
              {setActiveScreen && (
                <button type="button" className="btn btn-ghost" onClick={() => setActiveScreen('agents')}>Hub</button>
              )}
            </div>
          )) : (
            <p className="card-body">No agent OS yet — generate strategy first.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Section deployments</h3>
        {!deployments.length ? (
          <p className="card-body">No deployments yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {deployments.slice(0, 10).map((d) => (
              <div key={d.id} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>
                  <strong>{d.agentName}</strong> · {d.sectionTitle} · <span className="tag tag-outline">{d.status}</span>
                </span>
                {setActiveScreen && d.openScreen && (
                  <button type="button" className="btn btn-ghost" onClick={() => setActiveScreen(d.openScreen)}>Open</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('analytics')}>
          Performance Scorecard
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('approvals')}>
          Approvals
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('workflows')}>
          Workflows
        </button>
      </div>
    </div>
  );
}

/** Shared strategy-aware room for newly added / revived screens */
function StrategyRoom({ screenId, title, setActiveScreen, children, planTarget }) {
  const brief = sectionBriefForScreen(screenId);
  const plan = planAgentTask({ screenId, target: planTarget });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <JourneyBar screenId={screenId} setActiveScreen={setActiveScreen} title={title} />
      <div className="card">
        <div className="card-kicker">Agent plan</div>
        <div style={{ fontWeight: 700 }}>{plan.agentDisplayName} · {plan.mission || 'Stand by'}</div>
        <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
          Skills: {(plan.skills || []).join(', ') || '—'}
          {plan.metric ? ` · Metric: ${plan.metric}` : ''}
        </div>
        {brief.content ? (
          <p className="card-body" style={{ marginTop: 10 }}>{brief.content.slice(0, 400)}{brief.content.length > 400 ? '…' : ''}</p>
        ) : (
          <p className="card-body" style={{ marginTop: 10 }}>
            No strategy section mapped yet. Finish GTM Wizard or open Strategy home.
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

export function PricingView({ setActiveScreen }) {
  return (
    <StrategyRoom screenId="pricing" title="Pricing & Offers" setActiveScreen={setActiveScreen} planTarget="company_intel_pricing">
      <div className="card">
        <h4 style={{ marginTop: 0 }}>Packages (from pricing_monetization)</h4>
        <p className="card-body">Tara owns packaging, trials, and pilots. Continue to Landing Pages / Lead Magnets to publish the offer.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('landingpages')}>Landing Pages</button>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('leadmagnets')}>Lead Magnets</button>
        </div>
      </div>
    </StrategyRoom>
  );
}

export function SeoView({ setActiveScreen }) {
  const startSeoBlog = () => {
    try {
      sessionStorage.removeItem('marqq_content_run_id');
    } catch {
      /* ignore */
    }
    stashJourneyHandoff({
      from: 'seo',
      toScreen: 'content',
      agentId: 'maya',
      mission: `Start SEO blog research for ${getCompanyName()} in Content Studio`,
    });
    setActiveScreen && setActiveScreen('content');
  };

  return (
    <StrategyRoom screenId="seo" title="SEO & Search Intelligence" setActiveScreen={setActiveScreen}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h4 style={{ marginTop: 0 }}>Maya · Organic / LLMO</h4>
        <p className="card-body" style={{ margin: 0 }}>
          Rank + AI-answer visibility. SEO blogs run in Content Studio (Maya research → Riya draft) — this screen does not duplicate drafting.
        </p>
        <button type="button" className="btn btn-primary" onClick={startSeoBlog}>
          Start SEO blog in Content
        </button>
      </div>
    </StrategyRoom>
  );
}

export function CreativeView({ setActiveScreen }) {
  // Legacy stub — App.jsx routes to CreativeStudio. Keep handoff helper for older links.
  return (
    <StrategyRoom screenId="creative" title="Creative Studio" setActiveScreen={setActiveScreen} planTarget="company_intel_content_strategy">
      <div className="card">
        <h4 style={{ marginTop: 0 }}>Moved</h4>
        <p className="card-body">Creative Studio is the linear image/video room.</p>
        <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('creative')}>
          Open Creative Studio
        </button>
      </div>
    </StrategyRoom>
  );
}

export function Customer360View({ setActiveScreen }) {
  return (
    <StrategyRoom screenId="customer360" title="Customer 360" setActiveScreen={setActiveScreen} planTarget="user_engagement">
      <div className="card">
        <h4 style={{ marginTop: 0 }}>Account deep-dive</h4>
        <p className="card-body">Retention and expansion view for accounts from CRM / customer_success section.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('crm')}>CRM</button>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('outreach')}>Outreach</button>
        </div>
      </div>
    </StrategyRoom>
  );
}

export function IdeasView({ setActiveScreen }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(() => {
    try {
      const raw = sessionStorage.getItem('marqq_marketing_ideas');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const loadStrategyPayload = () => {
    let strategy = null;
    try {
      const raw = sessionStorage.getItem('marqq_gtm_strategy');
      if (raw) strategy = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return {
      strategy,
      companyName: localStorage.getItem('marqq_ob_companyName') || getCompanyName(),
      website: localStorage.getItem('marqq_ob_website') || '',
      niche: localStorage.getItem('marqq_ob_niche') || '',
      icp: localStorage.getItem('marqq_ob_icp') || '',
    };
  };

  const generate = async ({ force = false } = {}) => {
    if (loading) return;
    if (!force && result?.ideas?.length) return;
    setLoading(true);
    setError('');
    try {
      const payload = loadStrategyPayload();
      const res = await fetch('/api/gtm/marketing-ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Generation failed (${res.status})`);
      setResult(json);
      try {
        sessionStorage.setItem('marqq_marketing_ideas', JSON.stringify(json));
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError(err.message || 'Could not generate marketing ideas');
    } finally {
      setLoading(false);
      try {
        sessionStorage.removeItem('marqq_marketing_ideas_autogen');
      } catch {
        /* ignore */
      }
    }
  };

  useEffect(() => {
    let shouldAutogen = false;
    try {
      shouldAutogen = sessionStorage.getItem('marqq_marketing_ideas_autogen') === '1';
    } catch {
      /* ignore */
    }
    if (shouldAutogen || !result?.ideas?.length) {
      generate({ force: shouldAutogen });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moduleScreen = (mod) => {
    const map = {
      paid: 'paid',
      outreach: 'outreach',
      content: 'content',
      leadmagnets: 'leadmagnets',
      campaigns: 'campaigns',
      social: 'social',
      experiments: 'experiments',
      calendar: 'calendar',
      gtmwizard: 'gtmwizard',
      landingpages: 'landingpages',
      creative: 'creative',
      seo: 'seo',
      pricing: 'pricing',
      crm: 'crm',
      analytics: 'analytics',
    };
    return map[String(mod || '').toLowerCase()] || 'campaigns';
  };

  const ideas = Array.isArray(result?.ideas) ? result.ideas : [];
  const northStar = result?.northStar || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Marketing Ideas</h1>
          <p className="text-muted" style={{ marginTop: 6 }}>
            Generated with the <strong>marketing-ideas</strong> skill (139-idea catalog) against your locked GTM strategy.
          </p>
          {(northStar.quantified_target || northStar.timeline_target) ? (
            <p style={{ fontSize: 13, marginTop: 8 }}>
              North Star: {northStar.quantified_target || '—'}
              {northStar.timeline_target ? ` · by ${northStar.timeline_target}` : ''}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={loading}
          onClick={() => generate({ force: true })}
        >
          {loading ? 'Generating…' : result?.ideas?.length ? 'Regenerate ideas' : 'Generate ideas'}
        </button>
      </div>

      {error ? <div className="card" style={{ color: 'var(--color-accent)' }}>{error}</div> : null}
      {result?.warning ? <div className="card text-muted" style={{ fontSize: 13 }}>{result.warning}</div> : null}
      {result?.summary ? (
        <div className="card">
          <div className="card-kicker">Skill summary</div>
          <p className="card-body" style={{ marginTop: 6 }}>{result.summary}</p>
          <div className="card-meta" style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {result.stageFit ? <span className="tag tag-outline">Stage: {result.stageFit}</span> : null}
            {result.budgetBand ? <span className="tag tag-outline">Budget: {result.budgetBand}</span> : null}
            {result.scores?.fitScore != null ? <span className="tag tag-accent">Fit {result.scores.fitScore}</span> : null}
            {result.skillLoaded ? <span className="tag tag-accent">Skill loaded</span> : <span className="tag tag-neutral">Skill fallback</span>}
            {result.usedSearch ? <span className="tag tag-accent">Web search</span> : null}
          </div>
        </div>
      ) : null}

      {loading && !ideas.length ? (
        <div className="card text-muted">Running marketing-ideas skill against your GTM strategy…</div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        {ideas.map((item, i) => (
          <div key={`${item.ideaNumber || i}-${item.name}`} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="tag tag-accent">
                {item.category || 'Catalog'}
              </span>
              <span className="tag tag-outline">{String(item.priority || 'medium')} priority</span>
            </div>
            <h3 style={{ fontSize: '16px', margin: 0 }}>{item.name}</h3>
            <p className="text-muted" style={{ fontSize: '13px', margin: 0 }}>{item.whyItFits}</p>
            {item.contributionToGoal ? (
              <p style={{ fontSize: 12, margin: 0 }}>
                <strong>Contribution:</strong> {item.contributionToGoal}
              </p>
            ) : null}
            {Array.isArray(item.howToStart) && item.howToStart.length ? (
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.45 }}>
                {item.howToStart.slice(0, 3).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            ) : null}
            {item.expectedOutcome ? (
              <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>Outcome: {item.expectedOutcome}</p>
            ) : null}
            {Array.isArray(item.hooks) && item.hooks.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {item.hooks.slice(0, 3).map((h) => (
                  <span key={h} className="tag tag-neutral" style={{ fontSize: 10 }}>{h}</span>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setActiveScreen && setActiveScreen(moduleScreen(item.outcomeModule))}
              style={{ width: 'fit-content', marginTop: 'auto' }}
            >
              Open {item.outcomeModule || 'campaigns'} <ArrowRight size={14} />
            </button>
          </div>
        ))}
      </div>

      {(result?.hooksToTest?.length || result?.anglesToTest?.length) ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {result?.hooksToTest?.length ? (
            <div className="card">
              <h3 style={{ marginBottom: 12 }}>Hooks to test</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {result.hooksToTest.map((h) => {
                  const hookText = h.hook || h;
                  return (
                    <div
                      key={hookText}
                      style={{
                        paddingBottom: 12,
                        borderBottom: '1px solid var(--color-divider)',
                      }}
                    >
                      <strong style={{ fontSize: 13 }}>{hookText}</strong>
                      {h.why ? <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>{h.why}</div> : null}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ fontSize: 12 }}
                          onClick={() => {
                            try {
                              sessionStorage.setItem(
                                'marqq_ask_context',
                                JSON.stringify({
                                  channel: 'marketing-strategy',
                                  sectionId: 'marketing_strategy',
                                  title: 'Hook to test',
                                  text: `## Hook to test\n\n**${hookText}**\n\n${h.why || ''}\n\nDraft 3 ad/email variants of this hook for the locked GTM North Star.`,
                                  seededAt: new Date().toISOString(),
                                })
                              );
                            } catch { /* ignore */ }
                            setActiveScreen && setActiveScreen('chat');
                          }}
                        >
                          Draft in Ask Marqq <ArrowRight size={12} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: 12 }}
                          onClick={() => setActiveScreen && setActiveScreen('content')}
                        >
                          Open Content
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {result?.anglesToTest?.length ? (
            <div className="card">
              <h3 style={{ marginBottom: 12 }}>Angles to test</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {result.anglesToTest.map((a) => {
                  const angleText = a.angle || a;
                  return (
                    <div
                      key={angleText}
                      style={{
                        paddingBottom: 12,
                        borderBottom: '1px solid var(--color-divider)',
                      }}
                    >
                      <strong style={{ fontSize: 13 }}>{angleText}</strong>
                      {a.framework ? (
                        <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{a.framework}</div>
                      ) : null}
                      {a.hypothesis ? (
                        <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>{a.hypothesis}</div>
                      ) : null}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ fontSize: 12 }}
                          onClick={() => setActiveScreen && setActiveScreen('experiments')}
                        >
                          Launch experiment <ArrowRight size={12} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: 12 }}
                          onClick={() => {
                            try {
                              sessionStorage.setItem(
                                'marqq_ask_context',
                                JSON.stringify({
                                  channel: 'marketing-strategy',
                                  sectionId: 'marketing_strategy',
                                  title: 'Angle to test',
                                  text: `## Angle to test\n\n**${angleText}**\n\n${a.hypothesis || ''}\n\nDesign a simple A/B test plan for this angle against the locked GTM strategy.`,
                                  seededAt: new Date().toISOString(),
                                })
                              );
                            } catch { /* ignore */ }
                            setActiveScreen && setActiveScreen('chat');
                          }}
                        >
                          Draft in Ask Marqq
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CalendarView({ setActiveScreen }) {
  const company = getCompanyName();
  const launchPlays = playsFromSection('launch_plan', 'Launch milestone');
  const timelinePlays = playsFromSection('timeline_roadmap', 'Roadmap item');
  const plays = [...launchPlays, ...timelinePlays].slice(0, 12);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <JourneyBar screenId="calendar" setActiveScreen={setActiveScreen} title="Marketing Calendar" />
      <p className="text-muted" style={{ margin: 0 }}>
        Milestones from <strong>Launch plan</strong> + <strong>Timeline</strong> for {company}. Demo clinic calendars removed.
      </p>

      {!plays.length ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No launch milestones yet</h3>
          <p className="card-body">Generate strategy with launch / timeline sections, then schedule from here.</p>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('gtmwizard')}>
            Open GTM Wizard
          </button>
        </div>
      ) : (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Upcoming from strategy</h3>
          <div className="table-container" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>Milestone / send</th><th>Status</th></tr>
              </thead>
              <tbody>
                {plays.map((u, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 700, color: 'var(--color-text)' }}>{u.detail || u.name}</td>
                    <td><span className="tag tag-accent">{u.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setActiveScreen && setActiveScreen('campaigns')}>
            Campaigns
          </button>
        </div>
      )}
    </div>
  );
}

export function LeadMagnetsView({ setActiveScreen }) {
  const company = getCompanyName();
  const plays = playsFromSection('marketing_strategy', 'Lead magnet').slice(0, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="leadmagnets" setActiveScreen={setActiveScreen} title="Lead Magnets" />
      <p className="text-muted" style={{ margin: 0 }}>
        Gated offers derived from marketing strategy for {company}.
      </p>
      {!plays.length ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No magnets planned</h3>
          <p className="card-body">Lock marketing strategy in the wizard — clinic playbook stubs are gone.</p>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('gtmwizard')}>
            Open GTM Wizard
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Offer / asset</th><th>Status</th></tr>
              </thead>
              <tbody>
                {plays.map((lm, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: 'var(--color-text)' }}>{lm.detail || lm.name}</td>
                    <td><span className="tag tag-outline">{lm.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function CrmView({ setActiveScreen }) {
  const audience = getAudienceProfile();
  const salesBullets = playsFromSection('sales_strategy', 'Sales play');
  const [crmDest, setCrmDest] = useState(null);
  const segments = [];
  if (audience.icp) {
    segments.push({
      name: audience.icp,
      fit: 'ICP',
      intent: audience.triggers || audience.jtbd || 'From Audience interview',
      stage: 'Priority segment',
      owner: 'Arjun',
    });
  }
  if (audience.persona) {
    segments.push({
      name: audience.persona,
      fit: 'Persona',
      intent: audience.jtbd || 'Champion',
      stage: 'Buyer',
      owner: 'Arjun',
    });
  }
  for (const p of salesBullets.slice(0, 4)) {
    segments.push({
      name: p.name,
      fit: 'Play',
      intent: p.detail,
      stage: 'From sales strategy',
      owner: 'Arjun',
    });
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/destination?companyId=${encodeURIComponent(getActiveWorkspaceId())}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setCrmDest(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const destLabel =
    crmDest?.destination === 'hubspot'
      ? 'HubSpot'
      : crmDest?.destination === 'salesforce'
        ? 'Salesforce'
        : crmDest?.destination === 'google_sheets'
          ? 'Google Sheets (CRM fallback)'
          : 'None — connect HubSpot, Salesforce, or Google Sheets';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="crm" setActiveScreen={setActiveScreen} title="CRM Sync & Account Priorities" />
      <p className="text-muted" style={{ margin: 0 }}>
        Priority segments from ICP + sales strategy for {audience.companyName}. Fake clinic accounts removed.
      </p>

      <div className="card" style={{ borderLeft: '3px solid var(--color-accent)' }}>
        <div className="card-kicker">Lead destination</div>
        <h3 style={{ margin: '4px 0 0' }}>{destLabel}</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
          {crmDest?.fallback
            ? 'No HubSpot/Salesforce connected — outreach leads are created and updated in Google Sheets by default.'
            : crmDest?.destination
              ? 'Outreach fetch / send / reply syncs leads to this CRM.'
              : 'Connect Google Sheets under Integrations to use it as the default CRM when HubSpot/Salesforce are offline.'}
        </p>
        {crmDest?.sheets?.url ? (
          <p style={{ fontSize: 13, margin: '8px 0 0' }}>
            Sheet:{' '}
            <a href={crmDest.sheets.url} target="_blank" rel="noreferrer">
              {crmDest.sheets.worksheet || 'Outreach Leads'}
            </a>
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('integrations')}>
            Integrations
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('outreach')}>
            Outreach Studio
          </button>
        </div>
      </div>

      {!segments.length ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No segments yet</h3>
          <p className="card-body">Complete Audience + Sales strategy, then sync CRM connectors.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('audiences')}>
              Audiences
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('integrations')}>
              Connectors
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Segment / play</th><th>Type</th><th>Signal</th><th>Stage</th><th>Owner</th></tr>
              </thead>
              <tbody>
                {segments.map((a, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: 'var(--color-text)' }}>{a.name}</td>
                    <td><span className="tag tag-accent">{a.fit}</span></td>
                    <td>{a.intent}</td>
                    <td><span className="tag tag-outline">{a.stage}</span></td>
                    <td>{a.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setActiveScreen && setActiveScreen('outreach')}>
            Outreach Studio
          </button>
        </div>
      )}
    </div>
  );
}

export function PaidView({ setActiveScreen }) {
  const company = getCompanyName();
  const plays = playsFromSection('distribution_channels', 'Paid channel').concat(
    playsFromSection('marketing_strategy', 'Demand play')
  ).slice(0, 8);
  const [connectors, setConnectors] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/integrations?companyId=${encodeURIComponent(getActiveWorkspaceId())}`)
      .then((r) => r.json())
      .then((intRes) => {
        if (cancelled) return;
        const list = Array.isArray(intRes?.connectors) ? intRes.connectors : Array.isArray(intRes) ? intRes : [];
        setConnectors(
          list
            .filter((c) => /meta|facebook|google.?ads|linkedin/i.test(String(c.id || c.name || '')))
            .map((c) => ({
              id: c.id || c.connectorId,
              name: c.name || c.label || c.id,
              connected: Boolean(c.connected || c.status === 'ACTIVE'),
            }))
        );
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="paid" setActiveScreen={setActiveScreen} title="Paid Media" />
      <p className="text-muted" style={{ margin: 0 }}>
        North Star: {northStarLabel()} · {company}. Fake ROAS cards removed — use Paid Studio for live Meta drafts.
      </p>

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div className="card-kicker">Execute</div>
          <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>Paid Studio (Zara)</div>
          <p className="card-body" style={{ margin: '4px 0 0' }}>Goals → plan → creative draft → approve (draft / PAUSED only).</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('paid')}>
          Open Paid Studio
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ad connectors</h3>
        {!connectors.length ? (
          <p className="card-body">No Meta / Google / LinkedIn connectors detected — connect in Integrations.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {connectors.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{c.name}</span>
                <span className={c.connected ? 'tag tag-accent' : 'tag tag-outline'}>{c.connected ? 'Connected' : 'Not connected'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Plays from strategy</h3>
        {!plays.length ? (
          <p className="card-body">Lock distribution / marketing strategy to seed paid plays.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {plays.map((p, i) => (
              <li key={i} style={{ fontSize: 13, marginBottom: 6, color: 'var(--color-text)' }}>{p.detail || p.name}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SocialView({ setActiveScreen }) {
  const plays = playsFromSection('distribution_channels', 'Social play').slice(0, 8);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="social" setActiveScreen={setActiveScreen} title="Social Media" />
      <p className="text-muted" style={{ margin: 0 }}>
        Use Social Studio for live publish. Strategy distribution plays for {getCompanyName()}:
      </p>
      <div className="card">
        {!plays.length ? (
          <p className="card-body">No distribution plays yet — finish GTM Wizard.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {plays.map((p, i) => (
              <li key={i} style={{ fontSize: 13, marginBottom: 6 }}>{p.detail || p.name}</li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setActiveScreen && setActiveScreen('social')}>
          Open Social Studio
        </button>
      </div>
    </div>
  );
}

export function VoicebotView() {
  const company = getCompanyName();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Voice &amp; Video Bot Manager</h1>
      <p className="text-muted">AI agents for inbound qualification and product explainers — tied to {company}.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        <div className="card">
          <span className="tag tag-accent">Voice Bot</span>
          <h3 style={{ margin: '8px 0 4px', color: 'var(--color-text)' }}>Inbound Qualifier</h3>
          <p className="text-muted" style={{ fontSize: '13px' }}>
            Qualifies inbound demos against your ICP ({wizardAnswerLabel('icp') || 'set in Audience interview'}) and books meetings.
          </p>
          <div style={{ marginTop: '12px', fontSize: '12px', fontWeight: 700 }}>Connect voice providers in Integrations to go live</div>
        </div>

        <div className="card">
          <span className="tag tag-outline">Video Bot</span>
          <h3 style={{ margin: '8px 0 4px', color: 'var(--color-text)' }}>{company} Explainer</h3>
          <p className="text-muted" style={{ fontSize: '13px' }}>
            Draft video explainer from positioning / offer strategy — not a demo product launch.
          </p>
          <div style={{ marginTop: '12px', fontSize: '12px', opacity: 0.6 }}>Draft · wire HeyGen in Creative / Social</div>
        </div>
      </div>
    </div>
  );
}

export function ExperimentsView({ setActiveScreen }) {
  const company = getCompanyName();
  const plays = [
    ...playsFromSection('marketing_strategy', 'Marketing test'),
    ...playsFromSection('pricing_monetization', 'Pricing test'),
    ...playsFromSection('positioning_messaging', 'Messaging test'),
  ].slice(0, 10);
  const experiments = plays.map((p, i) => ({
    name: p.detail || p.name,
    status: i === 0 ? 'Proposed' : 'Backlog',
    confidence: '—',
    winner: 'Not run yet',
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>A/B Experiments &amp; Conversion Tests</h1>
      <p className="text-muted" style={{ margin: 0 }}>
        Hypotheses from locked strategy for {company}. Demo “completed” tests removed — nothing is marked won until you run it.
      </p>
      {!experiments.length ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No experiment backlog</h3>
          <p className="card-body">Lock marketing / pricing / positioning sections first.</p>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('gtmwizard')}>
            Open GTM Wizard
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Experiment</th><th>Status</th><th>Confidence</th><th>Leading Variant</th></tr>
              </thead>
              <tbody>
                {experiments.map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: 'var(--color-text)' }}>{e.name}</td>
                    <td><span className="tag tag-outline">{e.status}</span></td>
                    <td>{e.confidence}</td>
                    <td>{e.winner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setActiveScreen && setActiveScreen('landingpages')}>
            Landing pages
          </button>
        </div>
      )}
    </div>
  );
}

export function ReportingView({ setActiveScreen }) {
  const company = getCompanyName();
  const financial = getStrategySection('financial_plan');
  const measurement = getStrategySection('measurement_optimization');
  const reports = [
    financial && { name: `${company} financial plan`, type: 'Strategy · financial_plan', body: sectionPlainText(financial) },
    measurement && { name: `${company} measurement`, type: 'Strategy · measurement', body: sectionPlainText(measurement) },
    { name: 'North Star scorecard', type: 'Live analytics', body: northStarLabel() },
  ].filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Executive &amp; Board Reporting</h1>
          <p className="text-muted" style={{ margin: 0 }}>
            Reports seeded from strategy + live scorecard for {company} — not July board stubs.
          </p>
        </div>
        {setActiveScreen ? (
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen('analytics')}>
            Open live Scorecard
          </button>
        ) : null}
      </div>
      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>Report</th><th>Source</th><th>Preview</th></tr>
            </thead>
            <tbody>
              {reports.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700, color: 'var(--color-text)' }}>{r.name}</td>
                  <td>{r.type}</td>
                  <td className="text-muted">{String(r.body || '').slice(0, 100)}{String(r.body || '').length > 100 ? '…' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ReferralsView({ setActiveScreen }) {
  const company = getCompanyName();
  const allPlays = [
    ...playsFromSection('customer_success', 'Referral / retention'),
    ...playsFromSection('marketing_strategy', 'Referral play'),
  ].slice(0, 10);
  const referralPlays = allPlays.filter((p) =>
    /refer|partner|advocate|affiliate|word.of.mouth|incentive|invite/i.test(`${p.detail || ''} ${p.name || ''}`)
  );
  const rows = referralPlays.length ? referralPlays : allPlays.slice(0, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Referral &amp; Affiliate Programs</h1>
      <p className="text-muted" style={{ margin: 0 }}>
        Programs proposed from customer success / marketing strategy for {company}. Fake “64 referrals” removed.
      </p>
      {!rows.length ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No referral plays yet</h3>
          <p className="card-body">Add referral mechanics in customer success or marketing strategy, then return.</p>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('strategy')}>
            Strategy
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Proposed program / play</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: 'var(--color-text)' }}>{r.detail || r.name}</td>
                    <td><span className="tag tag-outline">{r.status || 'Proposed'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function EvaluationsView({ setActiveScreen }) {
  const os = loadAgentOs();
  const agents = os?.agent_roster?.agents || [];
  const evals = agents.length
    ? agents.map((a) => ({
        name: a.name || a.id,
        metric: a.mission || a.reason || a.role || 'Mission',
        score: a.status || 'standby',
        trend: a.priority != null ? `priority ${a.priority}` : '—',
      }))
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>AI Agent Evaluations &amp; Accuracy</h1>
      <p className="text-muted" style={{ margin: 0 }}>
        Live agent OS roster for {getCompanyName()} after strategy lock — not fake 94% scores.
      </p>
      {!evals.length ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No agent OS yet</h3>
          <p className="card-body">Generate GTM strategy to bootstrap the 12-agent roster, then evaluate from real runs.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('gtmwizard')}>
              GTM Wizard
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('agents')}>
              Agents Hub
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Agent</th><th>Mission / brief</th><th>Status</th><th>Note</th></tr>
              </thead>
              <tbody>
                {evals.map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: 'var(--color-text)' }}>{e.name}</td>
                    <td>{e.metric}</td>
                    <td><span className="tag tag-outline">{e.score}</span></td>
                    <td>{e.trend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function KnowledgeView() {
  const [sources, setSources] = useState([]);
  const [voiceNotes, setVoiceNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function refresh() {
    const [files, ctx] = await Promise.all([fetchKnowledgeFiles(), fetchBrandContext()]);
    const list = Array.isArray(files) ? files : [];
    const voiceFiles = list.filter((f) => f.category === 'voice_note');
    setSources(list.filter((f) => f.category !== 'voice_note'));
    if (voiceFiles.length) {
      setVoiceNotes(voiceFiles);
    } else if (ctx?.voiceTranscript) {
      setVoiceNotes([{ id: 'voice-text', name: 'Onboarding voice transcript', category: 'voice_note', transcript: ctx.voiceTranscript }]);
    } else {
      setVoiceNotes([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  async function fileToBase64(file) {
    const ab = await file.arrayBuffer();
    let binary = '';
    new Uint8Array(ab).forEach((b) => { binary += String.fromCharCode(b); });
    return window.btoa(binary);
  }

  async function handleUpload(fileList) {
    if (!fileList?.length) return;
    setUploading(true);
    setError('');
    try {
      const payload = await Promise.all(
        Array.from(fileList).map(async (f) => ({
          name: f.name,
          mime: f.type || 'application/octet-stream',
          size: f.size,
          base64: await fileToBase64(f),
        }))
      );
      const res = await fetch('/api/brand-dna/knowledge-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: getActiveWorkspaceId(), files: payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      const created = Array.isArray(json.files) ? json.files : [];
      const local = loadLocalBrandContext() || {};
      await persistBrandContext({
        ...local,
        knowledgeFiles: [...created, ...(local.knowledgeFiles || [])],
      });
      await refresh();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(fileId) {
    if (!fileId || fileId === 'voice-text') return;
    setError('');
    const prevSources = sources;
    const prevVoice = voiceNotes;
    setSources((list) => list.filter((f) => f.id !== fileId));
    setVoiceNotes((list) => list.filter((f) => f.id !== fileId));
    try {
      const res = await fetch(
        `/api/brand-dna/knowledge-base/${encodeURIComponent(fileId)}?workspaceId=${encodeURIComponent(getActiveWorkspaceId())}`,
        { method: 'DELETE' }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Delete failed (${res.status})`);
      const local = loadLocalBrandContext() || {};
      const nextKb = (local.knowledgeFiles || []).filter((f) => f.id !== fileId);
      await persistBrandContext({ ...local, knowledgeFiles: nextKb });
      await refresh();
    } catch (err) {
      setSources(prevSources);
      setVoiceNotes(prevVoice);
      setError(err.message || 'Could not delete file');
    }
  }

  function typeLabel(file) {
    if (file.category === 'logo') return 'Logo';
    if (file.category === 'voice_note') return 'Voice';
    const n = String(file.name || '').toLowerCase();
    if (n.endsWith('.pdf')) return 'PDF';
    if (n.endsWith('.doc') || n.endsWith('.docx')) return 'Doc';
    if (/\.(png|jpe?g|webp|gif)$/.test(n)) return 'Image';
    return 'File';
  }

  function formatBytes(size) {
    if (!size) return '—';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Knowledge Base &amp; Vector Sources</h1>
          <p className="text-muted" style={{ marginTop: '6px' }}>
            Files and voice notes captured in onboarding — available to Brand Center and GTM.
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleUpload(e.target.files)}
          />
          <button className="btn btn-primary" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? 'Uploading…' : 'Upload files'}
          </button>
        </div>
      </div>

      {error ? <div className="card" style={{ color: 'var(--color-accent)' }}>{error}</div> : null}

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Documents</h3>
        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : sources.length === 0 ? (
          <p className="text-muted">No documents yet. Upload brand guidelines, decks, or briefs.</p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Source Name</th><th>Type</th><th>Size</th><th>Status</th><th style={{ width: 48 }}></th></tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id || s.name}>
                    <td style={{ fontWeight: 700 }}>
                      {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> : s.name}
                    </td>
                    <td>{typeLabel(s)}</td>
                    <td>{formatBytes(s.size)}</td>
                    <td><span className="tag tag-accent">Indexed</span></td>
                    <td>
                      {s.id ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          title={`Delete ${s.name}`}
                          aria-label={`Delete ${s.name}`}
                          onClick={() => handleDelete(s.id)}
                          style={{ padding: 6, color: 'var(--color-muted)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Voice notes</h3>
        {voiceNotes.length === 0 ? (
          <p className="text-muted">No voice notes yet. Record them in onboarding Brand DNA.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {voiceNotes.map((v) => (
              <div key={v.id || v.name} style={{ padding: 12, border: '1px solid var(--color-divider)', background: 'var(--color-bg)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{v.name}</div>
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5, color: 'var(--color-neutral-300)' }}>
                    {v.transcript || 'Audio stored — open from Documents if needed.'}
                  </div>
                </div>
                {v.id && v.id !== 'voice-text' ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    title={`Delete ${v.name}`}
                    aria-label={`Delete ${v.name}`}
                    onClick={() => handleDelete(v.id)}
                    style={{ padding: 6, color: 'var(--color-muted)', flexShrink: 0 }}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function FilesView({ setActiveScreen }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchKnowledgeFiles();
        if (cancelled) return;
        setFiles(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setFiles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fmtSize = (n) => {
    const num = Number(n) || 0;
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Workspace Files &amp; Agent Artifacts</h1>
      <p className="text-muted" style={{ margin: 0 }}>
        Knowledge-base uploads for {getCompanyName()} — Atlas / clinic demo files removed.
      </p>
      <div className="card">
        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : !files.length ? (
          <>
            <p className="card-body">No files yet. Upload in Knowledge Base during onboarding or Brand DNA.</p>
            <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('knowledge')}>
              Knowledge Base
            </button>
          </>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>File Name</th><th>Type</th><th>Size</th><th>Category</th></tr>
              </thead>
              <tbody>
                {files.map((f, i) => (
                  <tr key={f.id || i}>
                    <td style={{ fontWeight: 700, color: 'var(--color-text)' }}>{f.name || f.id}</td>
                    <td>{f.mime || f.type || '—'}</td>
                    <td>{fmtSize(f.size)}</td>
                    <td><span className="tag tag-outline">{f.category || 'kb'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export { IntegrationsView } from './IntegrationsView.jsx';

export function AdminView() {
  const members = [
    {
      name: 'Workspace owner',
      email: (() => {
        const site = localStorage.getItem('marqq_ob_website') || '';
        const host = String(site).replace(/^https?:\/\//, '').split('/')[0];
        return host ? `hello@${host}` : 'owner@workspace';
      })(),
      role: 'Owner',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Workspace Administration</h1>
      <p className="text-muted">Workspace security, member permissions, and seat management.</p>
      <div className="card">
        <h3>Workspace Team Members</h3>
        <div className="table-container" style={{ marginTop: '12px' }}>
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th></tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{m.name}</td>
                  <td>{m.email}</td>
                  <td><span className="tag tag-accent">{m.role}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function HelpView({ setActiveScreen }) {
  const company = getCompanyName();
  const topics = [
    { title: 'Connect integrations', desc: 'Google, Meta, CRM, WhatsApp — live connectors for this workspace.', screen: 'integrations' },
    { title: 'Finish GTM Wizard', desc: `Lock North Star and strategy sections for ${company}.`, screen: 'gtmwizard' },
    { title: 'Agent approvals', desc: 'What agents can draft vs what needs your sign-off.', screen: 'approvals' },
    { title: 'Performance Scorecard', desc: 'Live GSC + Meta against your North Star.', screen: 'analytics' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Help Center &amp; Support</h1>
      <p className="text-muted" style={{ margin: 0 }}>Guides linked to live screens for {company}.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
        {topics.map((t, i) => (
          <button
            key={i}
            type="button"
            className="card"
            style={{ textAlign: 'left', cursor: 'pointer', color: 'var(--color-text)' }}
            onClick={() => setActiveScreen && setActiveScreen(t.screen)}
          >
            <h3 style={{ fontSize: '15px', marginTop: 0, color: 'var(--color-text)' }}>{t.title}</h3>
            <p className="text-muted" style={{ fontSize: '13px', marginTop: '4px' }}>{t.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SimpleView({ title, desc }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>{title}</h1>
      <p className="text-muted">{desc}</p>
      <div className="card">
        <p style={{ color: 'var(--color-neutral-300)' }}>
          This module is fully active in your Marqq workspace. Connect data feeds or configure custom rules to expand automation.
        </p>
      </div>
    </div>
  );
}
