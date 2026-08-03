import React, { useState } from 'react';
import { Sparkles, CheckCircle, ArrowRight, Target } from 'lucide-react';
import JourneyBar from '../components/JourneyBar.jsx';
import { stashJourneyHandoff, loadStrategyDoc, northStarLabel } from '../lib/journeyHandoff';
import { loadLocalBrandContext, getActiveWorkspaceId } from '../lib/brandContext';
import { getAudienceProfile, getCompanyName, getWebsite, wizardAnswerLabel } from '../lib/liveWorkspace';
import { SocialPostPreview } from '../components/outcome-previews/ChannelPreviews.jsx';

const STEPS = [
  { id: 'goals', label: '1 · Goals' },
  { id: 'plan', label: '2 · Plan' },
  { id: 'creative', label: '3 · Creative draft' },
  { id: 'approve', label: '4 · Approve' },
];

function livePaidDefaults() {
  const brand = loadLocalBrandContext() || {};
  const audience = getAudienceProfile();
  const company = getCompanyName();
  const website = getWebsite() || brand.website || '';
  const doc = loadStrategyDoc();
  const ga = doc?.goalAlignment || {};
  const channel = wizardAnswerLabel('channel_bet') || ga.channel_bet || '';
  return {
    companyName: company,
    companyId: getActiveWorkspaceId(),
    workspaceId: getActiveWorkspaceId(),
    deliveryMode: 'draft',
    northStarMetric: ga.north_star_metric || northStarLabel() || 'Primary outcome',
    northStarDefinition: ga.metric_definition || brand.outcome || '',
    quantifiedTarget: ga.quantified_target || localStorage.getItem('marqq_ob_target') || '',
    timeline: ga.timeline_target || localStorage.getItem('marqq_ob_timeWindow') || '90 days',
    audience: audience.icp || brand.icp || localStorage.getItem('marqq_ob_icp') || '',
    website,
    metaAccountId: import.meta.env.VITE_META_AD_ACCOUNT_ID || '',
    topic: [
      'paid acquisition',
      company !== 'Your workspace' ? `for ${company}` : '',
      channel ? `via ${channel}` : '',
      audience.niche || brand.niche || '',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function seedFromStrategy() {
  try {
    return livePaidDefaults();
  } catch {
    return livePaidDefaults();
  }
}

export default function PaidStudio({ setActiveScreen }) {
  const seeded = seedFromStrategy();
  const [step, setStep] = useState('goals');
  const [runId, setRunId] = useState(null);
  const [run, setRun] = useState(null);
  const [goals, setGoals] = useState(() => ({ ...livePaidDefaults(), ...seeded }));
  const [plan, setPlan] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const applyRun = (next) => {
    setRun(next);
    setRunId(next.id);
    if (next.goals) setGoals((g) => ({ ...g, ...next.goals }));
    setPlan(next.plan || null);
    setDraft(next.creativeDraft || null);
    if (next.step) setStep(next.step);
  };

  const ensureRun = async () => {
    if (runId) return runId;
    const payload = { ...livePaidDefaults(), ...goals, deliveryMode: 'draft' };
    const res = await fetch('/api/paid/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    applyRun(data.run);
    return data.run.id;
  };

  const saveGoals = async () => {
    setBusy('goals');
    setError(null);
    try {
      const id = await ensureRun();
      const res = await fetch(`/api/paid/runs/${id}/goals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goals),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setStep('plan');
      setNotice('Goals locked for Zara plan (draft / PAUSED only)');
    } catch (err) {
      setError(err.message || 'Save goals failed');
    } finally {
      setBusy(null);
    }
  };

  const doPlan = async () => {
    setBusy('plan');
    setError(null);
    try {
      const id = await ensureRun();
      await fetch(`/api/paid/runs/${id}/goals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goals),
      });
      const res = await fetch(`/api/paid/runs/${id}/plan`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setPlan(data.plan);
      setStep('creative');
      setNotice('Zara drafted Meta paid strategy');
    } catch (err) {
      setError(err.message || 'Plan failed');
    } finally {
      setBusy(null);
    }
  };

  const doCreative = async () => {
    if (!runId) return;
    setBusy('creative');
    setError(null);
    try {
      const res = await fetch(`/api/paid/runs/${runId}/creative-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generateImage: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setDraft(data.creativeDraft);
      setStep('approve');
      setNotice(
        data.creativeDraft?.image_url
          ? `Creative draft ${data.creativeDraft.creative_draft_id}`
          : `Creative draft ready${data.creativeDraft?.image_note ? ` · ${data.creativeDraft.image_note}` : ''}`
      );
    } catch (err) {
      setError(err.message || 'Creative draft failed');
    } finally {
      setBusy(null);
    }
  };

  const doApprove = async () => {
    if (!runId) return;
    setBusy('approve');
    setError(null);
    try {
      const res = await fetch(`/api/paid/runs/${runId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setDraft(data.run?.creativeDraft || draft);
      setNotice('Draft approved locally — no Meta spend. Continue to Approvals when ready.');
      stashJourneyHandoff({
        from: 'paid',
        toScreen: 'approvals',
        agentId: 'zara',
        mission: `Approved Meta draft: ${data.run?.creativeDraft?.campaign_name || 'campaign'}`,
      });
    } catch (err) {
      setError(err.message || 'Approve failed');
    } finally {
      setBusy(null);
    }
  };

  const setGoal = (key, value) => setGoals((g) => ({ ...g, [key]: value }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <JourneyBar screenId="paid" setActiveScreen={setActiveScreen} title="Paid Media · Draft Campaign" />
      <p className="text-muted" style={{ margin: 0 }}>
        Zara plans a Meta draft against your North Star. Creative Studio is for assets only — this room creates the campaign draft (PAUSED / local). No live spend in this slice.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={step === s.id ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ fontSize: 12 }}
            onClick={() => setStep(s.id)}
          >
            {s.label}
          </button>
        ))}
        <span className="tag tag-outline" style={{ marginLeft: 'auto' }}>
          Zara · Channels · draft only
        </span>
      </div>

      {error ? <div className="card" style={{ borderLeft: '3px solid #c44', fontSize: 13 }}>{error}</div> : null}
      {notice ? <div className="card" style={{ borderLeft: '3px solid var(--color-accent)', fontSize: 13 }}>{notice}</div> : null}

      {step === 'goals' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Target size={16} />
            <h3 style={{ margin: 0 }}>Goals &amp; context</h3>
          </div>
          <div className="field">
            <label>North Star metric</label>
            <input className="input" value={goals.northStarMetric || ''} onChange={(e) => setGoal('northStarMetric', e.target.value)} />
          </div>
          <div className="field">
            <label>Quantified target</label>
            <input className="input" value={goals.quantifiedTarget || ''} onChange={(e) => setGoal('quantifiedTarget', e.target.value)} />
          </div>
          <div className="field">
            <label>Timeline</label>
            <input className="input" value={goals.timeline || ''} onChange={(e) => setGoal('timeline', e.target.value)} />
          </div>
          <div className="field">
            <label>Audience</label>
            <textarea className="input" rows={2} value={goals.audience || ''} onChange={(e) => setGoal('audience', e.target.value)} />
          </div>
          <div className="field">
            <label>Definition</label>
            <textarea className="input" rows={3} value={goals.northStarDefinition || ''} onChange={(e) => setGoal('northStarDefinition', e.target.value)} />
          </div>
          <div className="field">
            <label>Meta account (context only)</label>
            <input className="input" value={goals.metaAccountId || ''} onChange={(e) => setGoal('metaAccountId', e.target.value)} />
          </div>
          <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>
            Channel: Meta Ads · Delivery: draft / PAUSED · Website: {goals.website}
          </p>
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void saveGoals()}>
            Continue to Zara plan <ArrowRight size={14} />
          </button>
        </div>
      )}

      {step === 'plan' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Zara · Paid strategy</h3>
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void doPlan()}>
              <Sparkles size={14} /> {busy === 'plan' ? 'Planning…' : plan ? 'Re-run plan' : 'Generate plan'}
            </button>
          </div>
          {plan ? (
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0 }}>{plan.summary}</p>
              <div className="text-muted" style={{ fontSize: 12 }}>
                Objective {plan.objective} · ${plan.daily_budget_usd}/day · {plan.conversion_event}
              </div>
              <div className="card-kicker">Creative angles</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(plan.creative_angles || []).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
              <div className="card-kicker">Guardrails</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(plan.guardrails || []).map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
              <button type="button" className="btn btn-primary" onClick={() => setStep('creative')}>
                Continue to creative draft <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: 13 }}>Generate Zara’s Meta plan against the locked goals.</p>
          )}
        </div>
      )}

      {step === 'creative' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Creative draft (local)</h3>
            <button type="button" className="btn btn-primary" disabled={!!busy || !plan} onClick={() => void doCreative()}>
              <Sparkles size={14} /> {busy === 'creative' ? 'Drafting…' : draft ? 'Redraft' : 'Build creative draft'}
            </button>
          </div>
          {!plan ? <p className="text-muted" style={{ fontSize: 13 }}>Run the plan first.</p> : null}
          {draft ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13 }}>
                <div style={{ fontWeight: 700 }}>{draft.campaign_name}</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                  {draft.creative_draft_id} · intended Meta status {draft.meta_status_intended}
                </div>
                <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
                  CTA {draft.cta} · {draft.link_url}
                </p>
              </div>
              <div className="card-kicker">Meta / Facebook feed preview · feels published</div>
              <SocialPostPreview
                platform="facebook"
                authorName={goals.companyName || getCompanyName() || 'Your Brand'}
                post={draft.primary_text || ''}
                hook={draft.headline}
                imageUrl={draft.image_url || undefined}
                cta={draft.cta}
              />
            </div>
          ) : null}
          {draft ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep('approve')}>
              Continue to approve <ArrowRight size={14} />
            </button>
          ) : null}
        </div>
      )}

      {step === 'approve' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Approve draft</h3>
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
            Approves the local draft only. Does not create Meta campaigns or start spend.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!!busy || !draft || run?.status === 'approved'}
            onClick={() => void doApprove()}
          >
            <CheckCircle size={14} />{' '}
            {run?.status === 'approved' ? 'Approved' : busy === 'approve' ? 'Saving…' : 'Approve draft'}
          </button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('approvals')}>
              Open Approvals
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('analytics')}>
              Performance Scorecard
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('creative')}>
              Creative Studio (assets)
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('campaigns')}>
              Campaigns portfolio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
