import React, { useState } from 'react';
import { Sparkles, CheckCircle, ArrowRight } from 'lucide-react';
import JourneyBar from '../components/JourneyBar.jsx';

const STEPS = [
  { id: 'brief', label: '1 · Brief' },
  { id: 'compose', label: '2 · Compose' },
  { id: 'approve', label: '3 · Approve' },
];

const DEFAULTS = {
  companyName: 'Nouriva AI',
  companyId: 'marqq-ws-1',
  workspaceId: 'marqq-ws-1',
  topic: 'lab-personalized nutrition for everyday health',
  audience: 'health-conscious consumers and clinic partners in India',
  brandContext: 'Nouriva AI — scan meals & labs for personalized nutrition guidance.',
  channels: ['linkedin', 'instagram', 'twitter'],
};

export default function SocialStudio({ setActiveScreen }) {
  const [step, setStep] = useState('brief');
  const [runId, setRunId] = useState(null);
  const [run, setRun] = useState(null);
  const [brief, setBrief] = useState(null);
  const [posts, setPosts] = useState([]);
  const [topic, setTopic] = useState(DEFAULTS.topic);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const applyRun = (next) => {
    setRun(next);
    setRunId(next.id);
    setBrief(next.brief || null);
    setPosts(next.posts || []);
    if (next.step) setStep(next.step);
  };

  const ensureRun = async () => {
    if (runId) return runId;
    const res = await fetch('/api/social/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...DEFAULTS, topic }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    applyRun(data.run);
    return data.run.id;
  };

  const doBrief = async () => {
    setBusy('brief');
    setError(null);
    try {
      const id = await ensureRun();
      const res = await fetch(`/api/social/runs/${id}/brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setBrief(data.brief);
      setStep('compose');
      setNotice('Kiran wrote the social brief');
    } catch (err) {
      setError(err.message || 'Brief failed');
    } finally {
      setBusy(null);
    }
  };

  const doCompose = async () => {
    if (!runId) return;
    setBusy('compose');
    setError(null);
    try {
      const res = await fetch(`/api/social/runs/${runId}/compose`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setPosts(data.posts || []);
      setStep('approve');
      setNotice(`Composed ${(data.posts || []).length} posts`);
    } catch (err) {
      setError(err.message || 'Compose failed');
    } finally {
      setBusy(null);
    }
  };

  const updatePost = (postId, field, value) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, [field]: value } : p)));
  };

  const doApprove = async () => {
    if (!runId) return;
    setBusy('approve');
    setError(null);
    try {
      for (const p of posts) {
        await fetch(`/api/social/runs/${runId}/posts/${p.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caption: p.caption, hook: p.hook, cta: p.cta }),
        });
      }
      const res = await fetch(`/api/social/runs/${runId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setNotice(`Approved ${data.postCount} posts (schedule/publish later)`);
    } catch (err) {
      setError(err.message || 'Approve failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <JourneyBar screenId="social" setActiveScreen={setActiveScreen} title="Social Studio" />
      <p className="text-muted" style={{ margin: 0 }}>
        Kiran owns text social. Image/video assets live in Creative Studio — not here.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
        <span className="tag tag-outline" style={{ marginLeft: 'auto' }}>Kiran · Social</span>
      </div>

      {error ? <div className="card" style={{ borderLeft: '3px solid #c44', fontSize: 13 }}>{error}</div> : null}
      {notice ? <div className="card" style={{ borderLeft: '3px solid var(--color-accent)', fontSize: 13 }}>{notice}</div> : null}

      {step === 'brief' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Campaign brief</h3>
          <div className="field">
            <label>Topic / offer</label>
            <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void doBrief()}>
            <Sparkles size={14} /> {busy === 'brief' ? 'Kiran briefing…' : 'Generate brief'}
          </button>
          {brief ? (
            <div style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 700 }}>{brief.hook}</div>
              <p className="text-muted" style={{ margin: '6px 0' }}>CTA: {brief.cta} · Tone: {brief.tone}</p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(brief.message_pillars || []).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
              <button type="button" className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => setStep('compose')}>
                Continue to compose <ArrowRight size={14} />
              </button>
            </div>
          ) : null}
        </div>
      )}

      {step === 'compose' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Compose posts</h3>
            <button type="button" className="btn btn-primary" disabled={!!busy || !brief} onClick={() => void doCompose()}>
              <Sparkles size={14} /> {busy === 'compose' ? 'Writing…' : posts.length ? 'Regenerate' : 'Generate posts'}
            </button>
          </div>
          {!brief ? <p className="text-muted" style={{ fontSize: 13 }}>Generate a brief first.</p> : null}
          {posts.map((p) => (
            <div key={p.id} style={{ padding: 12, border: '1px solid var(--color-divider)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>
                {p.channel} · {p.angle}
              </div>
              <textarea
                className="input"
                rows={4}
                style={{ marginTop: 8 }}
                value={p.caption}
                onChange={(e) => updatePost(p.id, 'caption', e.target.value)}
              />
              <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                {(p.hashtags || []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
              </div>
            </div>
          ))}
          {posts.length ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep('approve')}>
              Continue to approve <ArrowRight size={14} />
            </button>
          ) : null}
        </div>
      )}

      {step === 'approve' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Approve pack</h3>
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
            {posts.length} posts · live scheduling is a later slice
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!!busy || !posts.length || run?.status === 'approved'}
            onClick={() => void doApprove()}
          >
            <CheckCircle size={14} /> {run?.status === 'approved' ? 'Approved' : busy === 'approve' ? 'Saving…' : 'Approve all'}
          </button>
        </div>
      )}
    </div>
  );
}
