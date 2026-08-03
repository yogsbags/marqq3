import React, { useState } from 'react';
import JourneyBar from '../components/JourneyBar.jsx';
import DeliveryModeToggle from '../components/DeliveryModeToggle.jsx';
import { LandingPageBrowserPreview, InlineBrowserPreview } from '../components/outcome-previews/ChannelPreviews.jsx';
import { getCompanyName, getAudienceProfile, studioSeed } from '../lib/liveWorkspace';
import { getActiveWorkspaceId } from '../lib/brandContext';

const STEPS = [
  { id: 'design', label: '1 · Design', agent: 'Riya' },
  { id: 'generate', label: '2 · Gated page', agent: 'Tara + Sam' },
  { id: 'approve', label: '3 · Approve', agent: 'You' },
  { id: 'publish', label: '4 · Publish', agent: 'GitHub' },
];

export default function LeadMagnetStudio({ setActiveScreen }) {
  const audience = getAudienceProfile();
  const seed = studioSeed?.() || {};
  const [step, setStep] = useState('design');
  const [runId, setRunId] = useState(null);
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deliveryMode, setDeliveryMode] = useState('draft');
  const [form, setForm] = useState({
    magnetType: 'checklist',
    audience: audience.icp || audience.persona || 'Health-conscious adults planning meals around labs and goals',
    goal: 'capture',
    brandContext: seed.brandContext || 'Nouriva AI — personalized nutrition from labs + preferences.',
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
    const data = await api('/api/lead-magnets/runs', {
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

  const doDesign = async () => {
    setBusy('design');
    setError('');
    try {
      const id = await ensureRun();
      const data = await api(`/api/lead-magnets/runs/${id}/design`, { method: 'POST', body: form });
      setRun(data.run);
      setNotice(`Concept via lead-magnets skill · ${data.run.concept?.title || ''}`);
      setStep('generate');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const doGenerate = async () => {
    setBusy('generate');
    setError('');
    try {
      const id = await ensureRun();
      const data = await api(`/api/lead-magnets/runs/${id}/generate`, { method: 'POST', body: form });
      setRun(data.run);
      setNotice('Gated LP with Sheets capture form · page-cro + form-cro');
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
      const data = await api(`/api/lead-magnets/runs/${runId}/approve`, { method: 'POST' });
      setRun(data.run);
      setStep('publish');
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
        await api(`/api/lead-magnets/runs/${runId}/approve`, { method: 'POST' });
      }
      const data = await api(`/api/lead-magnets/runs/${runId}/publish`, {
        method: 'POST',
        body: { publish_live: live === true },
      });
      setRun(data.run);
      setNotice(live ? `Published · ${data.url || ''}` : `Draft package · ${data.url || ''}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const concept = run?.concept;
  const page = run?.page;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <JourneyBar screenId="leadmagnets" setActiveScreen={setActiveScreen} title="Lead Magnets" />
      <p className="text-muted" style={{ margin: 0 }}>
        Riya designs the offer · Tara/Sam build the gated page · capture → Google Sheets CRM
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

      {step === 'design' ? (
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <div className="card-kicker">Magnet brief · lead-magnets skill</div>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            Format
            <select
              value={form.magnetType}
              onChange={(e) => setForm((f) => ({ ...f, magnetType: e.target.value }))}
              style={{ padding: 8, borderRadius: 8 }}
            >
              <option value="checklist">Checklist</option>
              <option value="cheat_sheet">Cheat sheet</option>
              <option value="template">Template</option>
              <option value="guide">Guide</option>
            </select>
          </label>
          {['audience', 'brandContext'].map((key) => (
            <label key={key} style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</span>
              <textarea
                rows={2}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--color-divider)' }}
              />
            </label>
          ))}
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={doDesign}>
            {busy === 'design' ? 'Designing…' : 'Design with Riya'}
          </button>
          {concept ? (
            <div style={{ marginTop: 8 }}>
              <h3 style={{ margin: '0 0 6px' }}>{concept.title}</h3>
              <p className="text-muted" style={{ margin: 0 }}>{concept.hook}</p>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                {(concept.outline || []).slice(0, 6).map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 'generate' ? (
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          {concept ? (
            <p className="card-body" style={{ margin: 0 }}>
              Building gated page for <strong>{concept.title}</strong> with capture → Sheets.
            </p>
          ) : (
            <p className="card-body">Design a concept first, or generate will design one automatically.</p>
          )}
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={doGenerate}>
            {busy === 'generate' ? 'Generating…' : 'Generate gated landing page'}
          </button>
        </div>
      ) : null}

      {step === 'approve' && page ? (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
          <div className="card" style={{ display: 'grid', gap: 8 }}>
            <div className="card-kicker">Approve gated page</div>
            <div style={{ fontWeight: 700 }}>{page.title}</div>
            <div className="text-muted" style={{ fontSize: 13 }}>
              Capture: {page.lead_capture?.endpoint || '/api/leads/capture'}
            </div>
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={doApprove}>
              {busy === 'approve' ? 'Saving…' : 'Approve'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('landingpages')}>
              Landing pages
            </button>
          </div>
          <LandingPageBrowserPreview
            title={page.title}
            html={page.html}
            urlLabel={`nouriva.tech/lp/${page.slug || 'offer'}`}
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
                ? 'Publish live to GitHub'
                : 'Format draft package'}
          </button>
          {run?.publish?.deployment?.public_url || run?.publish?.canonical ? (
            <p className="text-muted" style={{ margin: 0 }}>
              <a href={run.publish.deployment?.public_url || run.publish.canonical} target="_blank" rel="noreferrer">
                {run.publish.deployment?.public_url || run.publish.canonical}
              </a>
            </p>
          ) : null}
          {run?.publish?.html ? (
            <InlineBrowserPreview title={page?.title} html={run.publish.html} urlLabel="package preview" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
