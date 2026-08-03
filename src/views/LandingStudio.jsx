import React, { useState } from 'react';
import JourneyBar from '../components/JourneyBar.jsx';
import DeliveryModeToggle from '../components/DeliveryModeToggle.jsx';
import { LandingPageBrowserPreview, InlineBrowserPreview } from '../components/outcome-previews/ChannelPreviews.jsx';
import { getCompanyName, getAudienceProfile, studioSeed } from '../lib/liveWorkspace';
import { getActiveWorkspaceId } from '../lib/brandContext';

const STEPS = [
  { id: 'setup', label: '1 · Brief', agent: 'You' },
  { id: 'generate', label: '2 · Generate', agent: 'Tara + Sam' },
  { id: 'approve', label: '3 · Approve', agent: 'You' },
  { id: 'publish', label: '4 · Publish', agent: 'GitHub' },
];

export default function LandingStudio({ setActiveScreen }) {
  const audience = getAudienceProfile();
  const seed = studioSeed?.() || {};
  const [step, setStep] = useState('setup');
  const [runId, setRunId] = useState(null);
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deliveryMode, setDeliveryMode] = useState('draft');
  const [form, setForm] = useState({
    product: getCompanyName() || 'Nouriva AI',
    offer: seed.offer || 'Lab-personalized nutrition you can actually follow',
    audience: audience.icp || audience.persona || 'Health-conscious adults who want food that fits their labs and lifestyle',
    goal: 'lead_gen',
    cta: 'Start free scan',
    brandContext: seed.brandContext || 'Nouriva AI — scan labs / preferences, get a plan tailored to you.',
  });

  const api = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };

  const ensureRun = async () => {
    if (runId) return runId;
    const data = await api('/api/landing/runs', {
      method: 'POST',
      body: {
        companyId: getActiveWorkspaceId(),
        companyName: getCompanyName(),
        ...form,
      },
    });
    setRunId(data.runId);
    setRun(data.run);
    return data.runId;
  };

  const doGenerate = async () => {
    setBusy('generate');
    setError('');
    try {
      const id = await ensureRun();
      const data = await api(`/api/landing/runs/${id}/generate`, { method: 'POST', body: form });
      setRun(data.run);
      setNotice(`Generated with ${(data.run.skill_alignment?.skills || []).join(', ')}`);
      setStep('approve');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const doApprove = async () => {
    setBusy('approve');
    setError('');
    try {
      const data = await api(`/api/landing/runs/${runId}/approve`, { method: 'POST' });
      setRun(data.run);
      setStep('publish');
      setNotice('Approved — ready to package or publish live');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const doPublish = async (live) => {
    setBusy('publish');
    setError('');
    try {
      if (run?.status !== 'approved' && run?.status !== 'packaged' && run?.status !== 'published') {
        await api(`/api/landing/runs/${runId}/approve`, { method: 'POST' });
      }
      const data = await api(`/api/landing/runs/${runId}/publish`, {
        method: 'POST',
        body: { publish_live: live === true },
      });
      setRun(data.run);
      setNotice(live ? `Published live · ${data.url || ''}` : `Draft package ready · ${data.url || ''}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const page = run?.page;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <JourneyBar screenId="landingpages" setActiveScreen={setActiveScreen} title="Landing Pages" />
      <p className="text-muted" style={{ margin: 0 }}>
        Tara structures · Sam writes · skills: page-cro, copywriting, form-cro · publish to nouriva.tech/lp
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={step === s.id ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ padding: '6px 12px', fontSize: 12 }}
            onClick={() => setStep(s.id)}
          >
            {s.label} · {s.agent}
          </button>
        ))}
      </div>

      {error ? <div className="card" style={{ color: '#b91c1c' }}>{error}</div> : null}
      {notice ? <div className="card text-muted">{notice}</div> : null}

      {step === 'setup' ? (
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <div className="card-kicker">Page brief</div>
          {['product', 'offer', 'audience', 'cta', 'brandContext'].map((key) => (
            <label key={key} style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</span>
              <textarea
                rows={key === 'brandContext' || key === 'audience' || key === 'offer' ? 2 : 1}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--color-divider)' }}
              />
            </label>
          ))}
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            Goal
            <select
              value={form.goal}
              onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
              style={{ padding: 8, borderRadius: 8 }}
            >
              <option value="lead_gen">Lead gen</option>
              <option value="saas_trial">Trial / signup</option>
              <option value="webinar">Webinar</option>
              <option value="ecommerce">Purchase</option>
            </select>
          </label>
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => { setStep('generate'); doGenerate(); }}>
            {busy === 'generate' ? 'Generating…' : 'Generate with Tara + Sam'}
          </button>
        </div>
      ) : null}

      {step === 'generate' ? (
        <div className="card">
          <p className="card-body">Running page-cro + copywriting + form-cro…</p>
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={doGenerate}>
            {busy === 'generate' ? 'Generating…' : page ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      ) : null}

      {step === 'approve' && page ? (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
          <div className="card" style={{ display: 'grid', gap: 8 }}>
            <div className="card-kicker">Edit before approve</div>
            <input
              value={page.title || ''}
              onChange={(e) => setRun((r) => ({ ...r, page: { ...r.page, title: e.target.value } }))}
              onBlur={() => api(`/api/landing/runs/${runId}/page`, { method: 'PATCH', body: { title: page.title } }).then((d) => setRun(d.run)).catch(() => {})}
              style={{ padding: 8, borderRadius: 8, border: '1px solid var(--color-divider)' }}
            />
            <input
              value={page.slug || ''}
              onChange={(e) => setRun((r) => ({ ...r, page: { ...r.page, slug: e.target.value } }))}
              style={{ padding: 8, borderRadius: 8, border: '1px solid var(--color-divider)' }}
            />
            <textarea
              rows={3}
              value={page.meta_description || ''}
              onChange={(e) => setRun((r) => ({ ...r, page: { ...r.page, meta_description: e.target.value } }))}
              style={{ padding: 8, borderRadius: 8, border: '1px solid var(--color-divider)' }}
            />
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={doApprove}>
              {busy === 'approve' ? 'Saving…' : 'Approve page'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('leadmagnets')}>
              Lead magnets
            </button>
          </div>
          <LandingPageBrowserPreview
            title={page.title}
            html={page.html}
            urlLabel={`nouriva.tech/lp/${page.slug || 'page'}`}
            sections={page.page_structure || []}
          />
        </div>
      ) : null}

      {step === 'publish' ? (
        <div className="card" style={{ display: 'grid', gap: 12 }}>
          <DeliveryModeToggle value={deliveryMode} onChange={setDeliveryMode} />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!!busy || !runId}
            onClick={() => doPublish(deliveryMode === 'live')}
          >
            {busy === 'publish'
              ? 'Publishing…'
              : deliveryMode === 'live'
                ? 'Approve & publish live to GitHub'
                : 'Format draft package (no live push)'}
          </button>
          {run?.publish?.deployment?.public_url || run?.publish?.canonical ? (
            <p className="text-muted" style={{ margin: 0 }}>
              URL:{' '}
              <a href={run.publish.deployment?.public_url || run.publish.canonical} target="_blank" rel="noreferrer">
                {run.publish.deployment?.public_url || run.publish.canonical}
              </a>
              {run.publish.file_path ? ` · ${run.publish.file_path}` : ''}
            </p>
          ) : null}
          {run?.publish?.html ? (
            <InlineBrowserPreview
              title={page?.title}
              html={run.publish.html}
              urlLabel={run.publish.deployment?.public_url || 'draft package'}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
