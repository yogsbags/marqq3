import React, { useState, useEffect, useRef } from 'react';
import { Layers, Shield, Sparkles, Plus, Play, CheckCircle, Database, FileCode, Sliders, Lock, ArrowRight, UserPlus, FileText, Calendar, Zap, MessageSquare, Video, HelpCircle, Upload, CheckCircle2, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { connectComposioConnector, formatConnectorError } from '../lib/composio';
import { CONNECTOR_DISPLAY, isConnectorActive, connectorLabel } from '../lib/connectormeta';
import { ResourcePickerModal } from '../components/common/ResourcePickerModal';
import {
  fetchBrandContext,
  fetchKnowledgeFiles,
  persistBrandContext,
  loadLocalBrandContext,
  WORKSPACE_ID,
} from '../lib/brandContext';
import JourneyBar from '../components/JourneyBar.jsx';
import { openSectionScreen, loadStrategyDoc, northStarLabel, stashJourneyHandoff } from '../lib/journeyHandoff';
import { loadAgentOs } from '../lib/agents/persist';
import { planAgentTask } from '../lib/agents/planTask';
import { sectionBriefForScreen } from '../lib/journeyHandoff';

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
            return (
              <div key={s.id} className="card" style={{ padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="card-title" style={{ margin: 0 }}>{s.title}</div>
                    {t?.metric ? (
                      <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
                        Leading metric: {t.metric}
                      </div>
                    ) : null}
                    <p className="card-body" style={{ margin: '8px 0 0', fontSize: 13 }}>
                      {(s.content || '').slice(0, 160)}{(s.content || '').length > 160 ? '…' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 'none' }}
                    onClick={() => openSectionScreen(s.id, setActiveScreen, { sectionTitle: s.title, summary: s.content })}
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
  const competitors = [
    { name: 'Vantage Health', sov: '31%', move: 'Launched an AI scheduling feature, added 2 pricing tiers.', threat: 'High' },
    { name: 'Carecue', sov: '18%', move: 'Ran a category-defining LinkedIn campaign this month.', threat: 'Medium' },
    { name: 'Sched.io', sov: '9%', move: 'No notable activity in the last 30 days.', threat: 'Low' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="market" setActiveScreen={setActiveScreen} title="Market & Competitor Intelligence" />
      <p className="text-muted">Track competitor moves, share of voice, and market search trends.</p>

      <div className="card">
        <h3>Competitor Watch</h3>
        <div className="table-container" style={{ marginTop: '12px' }}>
          <table className="data-table">
            <thead>
              <tr><th>Competitor</th><th>Share of Voice</th><th>Recent Move</th><th>Threat Level</th></tr>
            </thead>
            <tbody>
              {competitors.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{c.name}</td>
                  <td>{c.sov}</td>
                  <td>{c.move}</td>
                  <td>
                    <span className={c.threat === 'High' ? 'tag tag-accent-2' : c.threat === 'Medium' ? 'tag tag-outline' : 'tag tag-neutral'}>
                      {c.threat}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsView({ setActiveScreen }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="analytics" setActiveScreen={setActiveScreen} title="Performance Analytics" />
      <p className="text-muted">Cross-channel attribution and pipeline influence metrics.</p>

      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <div style={{ padding: '14px', background: 'var(--color-bg)', borderRadius: '6px' }}>
          <div className="text-muted" style={{ fontSize: '12px' }}>Paid Search Share</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-accent)', marginTop: '4px' }}>34%</div>
        </div>
        <div style={{ padding: '14px', background: 'var(--color-bg)', borderRadius: '6px' }}>
          <div className="text-muted" style={{ fontSize: '12px' }}>LinkedIn ABM Share</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-accent)', marginTop: '4px' }}>26%</div>
        </div>
        <div style={{ padding: '14px', background: 'var(--color-bg)', borderRadius: '6px' }}>
          <div className="text-muted" style={{ fontSize: '12px' }}>Organic Search Share</div>
          <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px' }}>21%</div>
        </div>
      </div>
    </div>
  );
}

export function AudiencesView({ setActiveScreen }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="audiences" setActiveScreen={setActiveScreen} title="Audiences & ICP Segmentation" />
      <p className="text-muted">Target buyer personas and intent-surged account lists.</p>

      <div className="card">
        <h3>Mid-Market Clinic Decision Makers</h3>
        <p className="text-muted" style={{ marginTop: '4px' }}>VP Clinical Operations &amp; Practice Managers at 20-200 staff clinics.</p>
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
          <span className="tag tag-accent">Fit Score 90%+</span>
          <span className="tag tag-outline">1,240 Target Accounts</span>
        </div>
      </div>
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

  const company = ctx?.companyName || 'Elevate';
  const website = ctx?.website || 'https://theelevate.co.in';
  const tagline = ctx?.brandTagline || 'Strategy Meets Execution';
  const tone = ctx?.toneOfVoice || 'Clear, senior, execution-focused';
  const summary = ctx?.brandSummary || 'Brand context will appear here after onboarding Brand DNA synthesis.';
  const colors = Array.isArray(ctx?.colors) && ctx.colors.length ? ctx.colors : ['#ff6a00', '#f2790a', '#191613'];
  const tags = Array.isArray(ctx?.positioningTags) ? ctx.positioningTags : [];
  const voice = ctx?.voiceTranscript || '';

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
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {colors.map((c) => (
                <div key={c} title={c} style={{ width: 36, height: 36, background: c, border: '1px solid var(--color-divider)' }} />
              ))}
            </div>
            <p className="text-muted" style={{ marginTop: 10, fontSize: 13 }}>
              {ctx?.fonts || 'Archivo · headings & body'}
            </p>
            {(ctx?.niche || ctx?.icp) && (
              <p style={{ marginTop: 10, fontSize: 13 }}>
                {ctx.niche ? <><strong>Niche:</strong> {ctx.niche}{' '}</> : null}
                {ctx.icp ? <><strong>ICP:</strong> {ctx.icp}</> : null}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function LandingPagesView() {
  const landingPages = [
    { name: 'Atlas Launch', url: '/atlas', visits: '4,210', conversion: '6.8%', status: 'Live' },
    { name: 'Enterprise ABM Hub', url: '/enterprise', visits: '1,860', conversion: '9.1%', status: 'Live' },
    { name: 'Winter Event Series', url: '/winter-event', visits: '0', conversion: '—', status: 'Draft' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Landing Pages</h1>
      <p className="text-muted">High-converting landing pages built and audited by Tara Agent.</p>

      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>Page Name</th><th>URL</th><th>Visits</th><th>Conversion Rate</th><th>Status</th></tr>
            </thead>
            <tbody>
              {landingPages.map((lp, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{lp.name}</td>
                  <td>{lp.url}</td>
                  <td>{lp.visits}</td>
                  <td><strong style={{ color: 'var(--color-accent)' }}>{lp.conversion}</strong></td>
                  <td><span className={lp.status === 'Live' ? 'tag tag-accent' : 'tag tag-neutral'}>{lp.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function BillingView() {
  const usage = [
    { label: 'Agent runs', value: '4,210 / 6,000', pct: '70%' },
    { label: 'Model tokens', value: '18.2M / 25M', pct: '73%' },
    { label: 'Seats', value: '14 / 20', pct: '70%' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Billing &amp; Usage</h1>
      <p className="text-muted">Credits, token consumption pacing, and billing history.</p>

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="text-muted">Current Balance</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-accent)' }}>1,790 Credits</div>
        </div>
        <button className="btn btn-primary">Top Up Credits</button>
      </div>

      <div className="card">
        <h3>Resource Usage Pacing</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
          {usage.map((u, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span>{u.label}</span>
                <span style={{ fontWeight: 700 }}>{u.value}</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'var(--color-bg)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: u.pct, height: '100%', background: 'var(--color-accent)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WorkflowsView({ setActiveScreen }) {
  const doc = loadStrategyDoc();
  const ops = (doc?.sections || []).find((s) => s.id === 'operations_execution');
  const rules = [
    { name: 'Reallocate underperforming spend', trigger: 'ROAS drops below 2.5x for 3 days', action: 'draft budget reallocation for approval', status: 'Active', screen: 'paid' },
    { name: 'Approval reminder', trigger: 'an approval sits >24h', action: 'notify the assigned approver', status: 'Active', screen: 'approvals' },
    { name: 'Weekly SEO scan', trigger: 'every Monday 6:00a', action: 'run rank + AI-visibility scan and update Content', status: 'Active', screen: 'seo' },
  ];
  if (ops?.content) {
    rules.unshift({
      name: 'Ops runbook from strategy',
      trigger: 'operations_execution section locked',
      action: (ops.content || '').slice(0, 120) + '…',
      status: 'Seeded',
      screen: 'orchestration',
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="workflows" setActiveScreen={setActiveScreen} title="Workflows & Automation" />
      <p className="text-muted" style={{ marginTop: -8 }}>
        Automated hands under Orchestration decisions. Rules seed from operations_execution.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {rules.map((r, i) => (
          <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>{r.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>
                <strong>When:</strong> {r.trigger} → <strong>Then:</strong> {r.action}
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
    </div>
  );
}

export function OrchestrationView({ setActiveScreen }) {
  const os = loadAgentOs();
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="orchestration" setActiveScreen={setActiveScreen} title="Orchestration" />
      <p className="text-muted" style={{ marginTop: -8 }}>
        Control plane for {northStarLabel()}. Status: <strong>{loop?.status || 'pending'}</strong>
      </p>

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

      <div style={{ display: 'flex', gap: 8 }}>
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
      mission: 'Start SEO blog research for Nouriva in Content Studio',
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
      companyName: localStorage.getItem('marqq_ob_companyName') || 'Elevate',
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

export function CalendarView() {
  const calendarDays = [
    { dow: 'Mon', num: 28, items: [{ time: '9:00a', title: 'Q3 Pipeline — LinkedIn ad refresh', channel: 'Paid Social' }] },
    { dow: 'Tue', num: 29, items: [{ time: '7:00a', title: 'Weekly nurture email #14', channel: 'Email' }] },
    { dow: 'Wed', num: 30, items: [{ time: '10:30a', title: '"Reducing no-shows" blog post', channel: 'Content' }] },
    { dow: 'Thu', num: 31, items: [{ time: '9:00a', title: 'Product Launch — Atlas go-live', channel: 'Campaign' }] },
    { dow: 'Fri', num: 1, items: [{ time: '11:00a', title: 'ABM sequence — Healthcare accounts', channel: 'Outbound' }] },
    { dow: 'Sat', num: 2, items: [] },
    { dow: 'Sun', num: 3, items: [] }
  ];

  const upcoming = [
    { date: 'Aug 5', title: 'Winter Event Series — teaser email', channel: 'Email', owner: 'M. Chen', status: 'Scheduled' },
    { date: 'Aug 6', title: 'SEO cluster refresh — 4 pages live', channel: 'Content', owner: 'D. Park', status: 'In review' },
    { date: 'Aug 8', title: 'LinkedIn thought-leadership post', channel: 'Social', owner: 'M. Chen', status: 'Scheduled' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h1>Marketing Calendar</h1>
      <p className="text-muted">7-day schedule &amp; upcoming campaign sends across all channels.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
        {calendarDays.map((day, i) => (
          <div key={i} className="card" style={{ padding: '12px', minHeight: '140px' }}>
            <div style={{ fontWeight: 800, fontSize: '14px', marginBottom: '8px', color: day.dow === 'Thu' ? 'var(--color-accent)' : 'var(--color-text)' }}>
              {day.dow} {day.num}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {day.items.map((it, idx) => (
                <div key={idx} style={{ padding: '6px', background: 'var(--color-bg)', borderRadius: '4px', fontSize: '11px' }}>
                  <div style={{ opacity: 0.6 }}>{it.time} · {it.channel}</div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{it.title}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Upcoming Launches &amp; Sends</h3>
        <div className="table-container" style={{ marginTop: '12px' }}>
          <table className="data-table">
            <thead>
              <tr><th>Date</th><th>Campaign / Asset</th><th>Channel</th><th>Owner</th><th>Status</th></tr>
            </thead>
            <tbody>
              {upcoming.map((u, idx) => (
                <tr key={idx}>
                  <td>{u.date}</td>
                  <td style={{ fontWeight: 700 }}>{u.title}</td>
                  <td>{u.channel}</td>
                  <td>{u.owner}</td>
                  <td><span className="tag tag-accent">{u.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function LeadMagnetsView() {
  const leadMagnets = [
    { name: 'No-Show Reduction Playbook', type: 'PDF guide', downloads: '842', conversion: '18%' },
    { name: 'Patient Intake ROI Calculator', type: 'Interactive tool', downloads: '511', conversion: '24%' },
    { name: 'Q3 Benchmark Report', type: 'PDF report', downloads: '1,204', conversion: '15%' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Lead Magnets &amp; Interactive Tools</h1>
      <p className="text-muted">Gated playbooks, calculators, and reports driving inbound lead capture.</p>
      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Downloads</th><th>Conversion Rate</th></tr>
            </thead>
            <tbody>
              {leadMagnets.map((lm, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{lm.name}</td>
                  <td>{lm.type}</td>
                  <td>{lm.downloads}</td>
                  <td><strong style={{ color: 'var(--color-accent)' }}>{lm.conversion}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function CrmView({ setActiveScreen }) {
  const accounts = [
    { name: 'Summit Ridge Medical Group', fit: '94%', intent: 'High intent (Pricing + Demo visits)', stage: 'Prospect', owner: 'R. Iyer' },
    { name: 'Coastal Family Health', fit: '89%', intent: 'Medium intent', stage: 'Engaged', owner: 'R. Iyer' },
    { name: 'Riverside Outpatient Partners', fit: '91%', intent: 'High intent', stage: 'Prospect', owner: 'S. Cole' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="crm" setActiveScreen={setActiveScreen} title="CRM Sync & Account Priorities" />
      <p className="text-muted">Real-time target account signals synced with Salesforce and HubSpot.</p>
      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>Account Name</th><th>ICP Fit</th><th>Intent Signals</th><th>Stage</th><th>Owner</th></tr>
            </thead>
            <tbody>
              {accounts.map((a, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{a.name}</td>
                  <td><span className="tag tag-accent">{a.fit}</span></td>
                  <td>{a.intent}</td>
                  <td><span className="tag tag-outline">{a.stage}</span></td>
                  <td>{a.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function PaidView({ setActiveScreen }) {
  const [tab, setTab] = useState('dashboard');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="paid" setActiveScreen={setActiveScreen} title="Paid Media Planner & Ad Accounts" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p className="text-muted" style={{ margin: 0 }}>Target CPA $340 · Current $298 · North Star: $2M pipeline in 60 days</p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['research', 'plan', 'launch', 'dashboard'].map((t) => (
            <button
              key={t}
              className={tab === t ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setTab(t)}
              style={{ textTransform: 'capitalize', fontSize: '12px' }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700 }}>Google Ads</span>
                <span className="tag tag-accent-2">Sync error</span>
              </div>
              <div className="card-meta">Spend $61K · ROAS 3.4x</div>
            </div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700 }}>Meta Ads</span>
                <span className="tag tag-accent">Connected</span>
              </div>
              <div className="card-meta">Spend $28K · ROAS 2.9x</div>
            </div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700 }}>LinkedIn Ads</span>
                <span className="tag tag-accent">Connected</span>
              </div>
              <div className="card-meta">Spend $44K · ROAS 4.6x</div>
            </div>
          </div>
        </div>
      )}

      {tab === 'plan' && (
        <div className="card">
          <h3>Channel Allocation Mix</h3>
          <p className="text-muted" style={{ marginTop: '4px' }}>
            LinkedIn Ads (55%), Google Ads (30%), Meta Ads (15%)
          </p>
        </div>
      )}
    </div>
  );
}

export function SocialView() {
  const posts = [
    { date: 'Aug 4', channel: 'LinkedIn', copy: 'Atlas launch announcement variant #1', status: 'Needs approval' },
    { date: 'Aug 8', channel: 'LinkedIn', copy: 'Thought-leadership: Cutting clinic drop-off rates', status: 'Scheduled' },
    { date: 'Aug 10', channel: 'X / Twitter', copy: '5 patient scheduling wins for practice managers', status: 'Draft' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Social Media Publisher</h1>
      <p className="text-muted">Schedule and manage social content across LinkedIn, X, and Instagram.</p>
      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>Date</th><th>Channel</th><th>Copy Snippet</th><th>Status</th></tr>
            </thead>
            <tbody>
              {posts.map((p, i) => (
                <tr key={i}>
                  <td>{p.date}</td>
                  <td>{p.channel}</td>
                  <td>{p.copy}</td>
                  <td><span className="tag tag-accent">{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function VoicebotView() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Voice &amp; Video Bot Manager</h1>
      <p className="text-muted">Autonomous AI agents handling inbound calls and interactive video demos.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        <div className="card">
          <span className="tag tag-accent">Voice Bot</span>
          <h3 style={{ margin: '8px 0 4px' }}>Inbound Qualifier Bot</h3>
          <p className="text-muted" style={{ fontSize: '13px' }}>Qualifies inbound demo requests and books meetings on reps' calendars.</p>
          <div style={{ marginTop: '12px', fontSize: '12px', fontWeight: 700 }}>312 calls handled this month</div>
        </div>

        <div className="card">
          <span className="tag tag-outline">Video Bot</span>
          <h3 style={{ margin: '8px 0 4px' }}>Atlas Explainer Bot</h3>
          <p className="text-muted" style={{ fontSize: '13px' }}>Short AI-presented video explainer answering top objections for the Atlas launch page.</p>
          <div style={{ marginTop: '12px', fontSize: '12px', opacity: 0.6 }}>0 views (Draft)</div>
        </div>
      </div>
    </div>
  );
}

export function ExperimentsView() {
  const experiments = [
    { name: 'Email subject line: benefit vs question', status: 'Completed', confidence: '97%', winner: 'Question framing' },
    { name: 'Landing page: single CTA vs dual CTA', status: 'Completed', confidence: '89%', winner: 'Single CTA' },
    { name: 'Pricing table layout test', status: 'Running', confidence: '74%', winner: 'TBD' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>A/B Experiments &amp; Conversion Tests</h1>
      <p className="text-muted">Conversion tests managed by Tara Agent.</p>
      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>Experiment</th><th>Status</th><th>Confidence</th><th>Leading Variant</th></tr>
            </thead>
            <tbody>
              {experiments.map((e, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{e.name}</td>
                  <td><span className="tag tag-accent">{e.status}</span></td>
                  <td>{e.confidence}</td>
                  <td>{e.winner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ReportingView() {
  const reports = [
    { name: 'July Board Update', type: 'Board report', created: 'Jul 29' },
    { name: 'Q3 Campaign Performance', type: 'Campaign report', created: 'Jul 26' },
    { name: 'GEO Visibility — Monthly', type: 'SEO & GEO report', created: 'Jul 20' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Executive &amp; Board Reporting</h1>
      <p className="text-muted">Export automated executive PDF reports and board updates.</p>
      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>Report Name</th><th>Type</th><th>Created</th></tr>
            </thead>
            <tbody>
              {reports.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{r.name}</td>
                  <td>{r.type}</td>
                  <td>{r.created}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ReferralsView() {
  const referrals = [
    { name: 'Customer Referral Rewards', reward: '$500 credit', referrals: '64', converted: '19', status: 'Active' },
    { name: 'Partner Referral Program', reward: '10% rev share', referrals: '22', converted: '8', status: 'Active' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Referral &amp; Affiliate Programs</h1>
      <p className="text-muted">Customer referral incentives and partner rev-share tracking.</p>
      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>Program Name</th><th>Reward</th><th>Referrals</th><th>Converted</th><th>Status</th></tr>
            </thead>
            <tbody>
              {referrals.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{r.name}</td>
                  <td>{r.reward}</td>
                  <td>{r.referrals}</td>
                  <td>{r.converted}</td>
                  <td><span className="tag tag-accent">{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function EvaluationsView() {
  const evals = [
    { name: 'Brand voice adherence', metric: 'Adherence score', score: '94%', trend: '+2pts' },
    { name: 'Factuality — content drafts', metric: 'Factual accuracy', score: '97%', trend: 'flat' },
    { name: 'Campaign Agent — budget calls', metric: 'Approval rate', score: '89%', trend: '-3pts ⚠' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>AI Agent Evaluations &amp; Accuracy</h1>
      <p className="text-muted">Quality benchmarks and factual adherence tracking across all 12 agents.</p>
      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>Evaluation Metric</th><th>Benchmark</th><th>Score</th><th>Trend</th></tr>
            </thead>
            <tbody>
              {evals.map((e, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{e.name}</td>
                  <td>{e.metric}</td>
                  <td><strong style={{ color: 'var(--color-accent)' }}>{e.score}</strong></td>
                  <td>{e.trend}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
        body: JSON.stringify({ workspaceId: WORKSPACE_ID, files: payload }),
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
        `/api/brand-dna/knowledge-base/${encodeURIComponent(fileId)}?workspaceId=${encodeURIComponent(WORKSPACE_ID)}`,
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

export function FilesView() {
  const files = [
    { name: 'Brand Guidelines 2026.pdf', type: 'PDF', size: '4.2 MB', owner: 'M. Chen', updated: '2d ago' },
    { name: 'Q3 Campaign Brief.docx', type: 'Doc', size: '380 KB', owner: 'S. Cole', updated: '4d ago' },
    { name: 'Atlas Launch Assets', type: 'Folder', size: '18 items', owner: 'D. Park', updated: '1w ago' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Workspace Files &amp; Agent Artifacts</h1>
      <p className="text-muted">Manage campaign briefs, uploaded PDFs, CSV lists, and generated agent artifacts.</p>
      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>File Name</th><th>Type</th><th>Size</th><th>Owner</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{f.name}</td>
                  <td>{f.type}</td>
                  <td>{f.size}</td>
                  <td>{f.owner}</td>
                  <td>{f.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export { IntegrationsView } from './IntegrationsView.jsx';

export function AdminView() {
  const members = [
    { name: 'Sarah Cole', email: 'hello@theelevate.co.in', role: 'CMO (Workspace Owner)' },
    { name: 'Rahul Iyer', email: 'rahul@theelevate.co.in', role: 'Approver' },
    { name: 'Mia Chen', email: 'mia@theelevate.co.in', role: 'Editor' }
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

export function HelpView() {
  const topics = [
    { title: 'Connecting your first integration', desc: 'Step-by-step setup for Google Ads, LinkedIn, Salesforce and more.' },
    { title: 'How agent approvals work', desc: 'What agents can act on automatically vs. what needs your sign-off.' },
    { title: 'Understanding attribution in Analytics', desc: 'How Marqq credits channels and campaigns for pipeline.' },
    { title: 'Managing seats and billing', desc: 'Add teammates, change plans, and read your invoice.' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Help Center &amp; Support</h1>
      <p className="text-muted">Documentation and step-by-step guides for Marqq features.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
        {topics.map((t, i) => (
          <div key={i} className="card">
            <h3 style={{ fontSize: '15px' }}>{t.title}</h3>
            <p className="text-muted" style={{ fontSize: '13px', marginTop: '4px' }}>{t.desc}</p>
          </div>
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
