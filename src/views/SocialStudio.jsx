import React, { useEffect, useState } from 'react';
import { Sparkles, CheckCircle, ArrowRight, Send } from 'lucide-react';
import JourneyBar from '../components/JourneyBar.jsx';
import { studioSeed, getCompanyName } from '../lib/liveWorkspace';
import { WORKSPACE_ID } from '../lib/brandContext';

const STEPS = [
  { id: 'brief', label: '1 · Brief' },
  { id: 'compose', label: '2 · Compose' },
  { id: 'approve', label: '3 · Approve & publish' },
];

const NEEDS_MEDIA = new Set(['instagram', 'youtube']);

export default function SocialStudio({ setActiveScreen }) {
  const [seed] = useState(() => studioSeed());
  const [step, setStep] = useState('brief');
  const [runId, setRunId] = useState(null);
  const [run, setRun] = useState(null);
  const [brief, setBrief] = useState(null);
  const [posts, setPosts] = useState([]);
  const [topic, setTopic] = useState(() => seed.topic);
  const [busy, setBusy] = useState(null);
  const [busyPostId, setBusyPostId] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [readiness, setReadiness] = useState([]);
  const [deliveryMode, setDeliveryMode] = useState('draft');

  const applyRun = (next) => {
    setRun(next);
    setRunId(next.id);
    setBrief(next.brief || null);
    setPosts(next.posts || []);
    if (next.step) setStep(next.step === 'approve' ? 'approve' : next.step);
  };

  const loadReadiness = () => {
    fetch(`/api/social/publish-readiness?companyId=${encodeURIComponent(WORKSPACE_ID)}`)
      .then((r) => r.json())
      .then((d) => setReadiness(d.platforms || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadReadiness();
  }, []);

  const platformOk = (channel) => {
    const id = channel === 'x' ? 'twitter' : channel;
    const row = readiness.find((p) => p.id === id);
    return Boolean(row?.connected);
  };

  const ensureRun = async () => {
    if (runId) return runId;
    const res = await fetch('/api/social/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...seed, topic }),
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
          body: JSON.stringify({
            caption: p.caption,
            hook: p.hook,
            cta: p.cta,
            title: p.title,
            image_url: p.image_url,
            video_url: p.video_url,
          }),
        });
      }
      const res = await fetch(`/api/social/runs/${runId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setNotice(`Approved ${data.postCount} posts — use Post Now per channel`);
    } catch (err) {
      setError(err.message || 'Approve failed');
    } finally {
      setBusy(null);
    }
  };

  const goLivePost = async (post) => {
    if (!runId) return;
    setBusyPostId(post.id);
    setError(null);
    try {
      await fetch(`/api/social/runs/${runId}/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: post.caption,
          hook: post.hook,
          cta: post.cta,
          title: post.title,
          image_url: post.image_url,
          video_url: post.video_url,
        }),
      });
      const res = await fetch(`/api/social/runs/${runId}/posts/${post.id}/go-live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery: deliveryMode,
          image_url: post.image_url || undefined,
          video_url: post.video_url || undefined,
          title: post.title || undefined,
          caption: post.caption,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.result?.ok === false) {
        throw new Error(data.error || data.result?.error || `HTTP ${res.status}`);
      }
      if (data.run) applyRun(data.run);
      else if (data.post) {
        setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, ...data.post } : p)));
      }
      setNotice(
        deliveryMode === 'live'
          ? `Live on ${data.kind || post.channel}${data.result?.url ? ` · ${data.result.url}` : ''}`
          : `Prepared ${data.kind || post.channel} draft (not published)`
      );
      loadReadiness();
    } catch (err) {
      setError(err.message || 'Publish failed');
    } finally {
      setBusyPostId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <JourneyBar screenId="social" setActiveScreen={setActiveScreen} title="Social Studio" />
      <p className="text-muted" style={{ margin: 0 }}>
        Kiran drafts captions · you approve · Post Now publishes via Composio (LinkedIn, Instagram, Facebook, X, YouTube).
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
        <span className="tag tag-outline" style={{ marginLeft: 'auto', fontSize: 11 }}>
          {readiness.map((p) => `${p.id === 'twitter' ? 'X' : p.id} ${p.connected ? '●' : '○'}`).join(' · ') || 'Kiran · Social'}
          {' · '}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: 0, fontSize: 11 }}
            onClick={() => setActiveScreen && setActiveScreen('integrations')}
          >
            Integrations
          </button>
        </span>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0 }}>Approve & publish</h3>
              <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
                {posts.length} posts · Instagram needs image URL · YouTube needs video URL + title
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['draft', 'live'].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={deliveryMode === m ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ textTransform: 'capitalize', fontSize: 12 }}
                  onClick={() => setDeliveryMode(m)}
                >
                  {m === 'draft' ? 'Draft (safe)' : 'Live publish'}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={!!busy || !posts.length}
            onClick={() => void doApprove()}
            style={{ alignSelf: 'flex-start' }}
          >
            <CheckCircle size={14} /> {busy === 'approve' ? 'Saving…' : 'Approve all'}
          </button>

          {posts.map((p) => {
            const ready = platformOk(p.channel);
            const needsMedia = NEEDS_MEDIA.has(p.channel);
            const mediaOk =
              p.channel === 'instagram'
                ? Boolean(p.image_url || p.video_url)
                : p.channel === 'youtube'
                  ? Boolean(p.video_url)
                  : true;
            const canPublish = ready && mediaOk && p.caption;
            return (
              <div key={p.id} style={{ padding: 12, border: '1px solid var(--color-divider)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>
                    {p.channel} · {p.angle}
                    {p.status === 'live' ? ' · live' : p.status === 'approved' ? ' · approved' : ''}
                    {' · '}
                    <span className="text-muted" style={{ fontWeight: 500 }}>
                      {ready ? 'connector ●' : 'connect ○'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: 12 }}
                    disabled={!canPublish || busyPostId === p.id}
                    onClick={() => void goLivePost(p)}
                  >
                    <Send size={14} />{' '}
                    {busyPostId === p.id
                      ? 'Working…'
                      : deliveryMode === 'live'
                        ? 'Post Now'
                        : 'Prepare draft'}
                  </button>
                </div>
                <textarea
                  className="input"
                  rows={3}
                  value={p.caption}
                  onChange={(e) => updatePost(p.id, 'caption', e.target.value)}
                />
                {(p.channel === 'youtube' || needsMedia) && (
                  <div className="field">
                    <label>Title {p.channel === 'youtube' ? '(required)' : '(optional)'}</label>
                    <input
                      className="input"
                      value={p.title || ''}
                      onChange={(e) => updatePost(p.id, 'title', e.target.value)}
                      placeholder={p.hook || 'Post title'}
                    />
                  </div>
                )}
                {(p.channel === 'instagram' || p.channel === 'facebook' || p.channel === 'twitter') && (
                  <div className="field">
                    <label>Image URL {p.channel === 'instagram' ? '(required)' : '(optional)'}</label>
                    <input
                      className="input"
                      value={p.image_url || ''}
                      onChange={(e) => updatePost(p.id, 'image_url', e.target.value)}
                      placeholder="https://… (Creative Studio / CDN)"
                    />
                  </div>
                )}
                {(p.channel === 'instagram' || p.channel === 'youtube' || p.channel === 'facebook') && (
                  <div className="field">
                    <label>Video URL {p.channel === 'youtube' ? '(required)' : '(optional)'}</label>
                    <input
                      className="input"
                      value={p.video_url || ''}
                      onChange={(e) => updatePost(p.id, 'video_url', e.target.value)}
                      placeholder="https://…"
                    />
                  </div>
                )}
                {!ready ? (
                  <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                    Connect {p.channel === 'twitter' ? 'X (Twitter)' : p.channel} under Integrations to publish.
                  </p>
                ) : null}
                {p.go_live?.result?.error ? (
                  <p style={{ fontSize: 12, color: '#c44', margin: 0 }}>{p.go_live.result.error}</p>
                ) : null}
                {p.go_live?.result?.url ? (
                  <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                    Published: {p.go_live.result.url}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
