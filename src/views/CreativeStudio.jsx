import React, { useState } from 'react';
import { Sparkles, CheckCircle, ArrowRight, Image as ImageIcon, Video } from 'lucide-react';
import JourneyBar from '../components/JourneyBar.jsx';
import { studioSeed } from '../lib/liveWorkspace';

const STEPS = [
  { id: 'concept', label: '1 · Concept' },
  { id: 'image', label: '2 · Image' },
  { id: 'video', label: '3 · Video' },
  { id: 'approve', label: '4 · Approve' },
];

export default function CreativeStudio({ setActiveScreen }) {
  const [seed] = useState(() => studioSeed());
  const [step, setStep] = useState('concept');
  const [runId, setRunId] = useState(null);
  const [run, setRun] = useState(null);
  const [concept, setConcept] = useState(null);
  const [image, setImage] = useState(null);
  const [video, setVideo] = useState(null);
  const [topic, setTopic] = useState(() => seed.topic);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const applyRun = (next) => {
    setRun(next);
    setRunId(next.id);
    setConcept(next.concept || null);
    setImage(next.image || null);
    setVideo(next.video || null);
    if (next.step) setStep(next.step);
  };

  const ensureRun = async () => {
    if (runId) return runId;
    const res = await fetch('/api/creative/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...seed, topic }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    applyRun(data.run);
    return data.run.id;
  };

  const doConcept = async () => {
    setBusy('concept');
    setError(null);
    try {
      const id = await ensureRun();
      const res = await fetch(`/api/creative/runs/${id}/concept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setConcept(data.concept);
      setStep('image');
      setNotice('Riya locked creative concept');
    } catch (err) {
      setError(err.message || 'Concept failed');
    } finally {
      setBusy(null);
    }
  };

  const doImage = async () => {
    if (!runId) return;
    setBusy('image');
    setError(null);
    try {
      const res = await fetch(`/api/creative/runs/${runId}/image`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setImage(data.image);
      setStep('video');
      setNotice(`Image ready via ${data.image?.host || data.image?.model || 'generator'}`);
    } catch (err) {
      setError(err.message || 'Image failed');
    } finally {
      setBusy(null);
    }
  };

  const doVideo = async () => {
    if (!runId) return;
    setBusy('video');
    setError(null);
    try {
      const res = await fetch(`/api/creative/runs/${runId}/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generate: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setVideo(data.video);

      let latest = data.video;
      if (data.poll && data.video?.status === 'processing') {
        setNotice(data.video.note || 'Video queued — polling Fal…');
        const started = Date.now();
        while (Date.now() - started < 180000) {
          await new Promise((r) => setTimeout(r, 3000));
          const pollRes = await fetch(`/api/creative/runs/${runId}/video/poll`, { method: 'POST' });
          const pollData = await pollRes.json();
          if (!pollRes.ok || !pollData.ok) throw new Error(pollData.error || `Poll HTTP ${pollRes.status}`);
          applyRun(pollData.run);
          latest = pollData.video;
          setVideo(pollData.video);
          setNotice(pollData.video?.note || `Status: ${pollData.video?.status}`);
          if (pollData.done) break;
        }
        if (latest?.status === 'processing') {
          latest = { ...latest, status: 'prompt_ready', note: 'Poll timed out — script/prompt still usable' };
          setVideo(latest);
        }
      }

      setStep('approve');
      setNotice(
        latest?.url
          ? 'Video rendered'
          : latest?.note || 'Video prompt ready (render optional)'
      );
    } catch (err) {
      setError(err.message || 'Video failed');
    } finally {
      setBusy(null);
    }
  };

  const doApprove = async () => {
    if (!runId) return;
    setBusy('approve');
    setError(null);
    try {
      const res = await fetch(`/api/creative/runs/${runId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setNotice('Creative pack approved');
    } catch (err) {
      setError(err.message || 'Approve failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <JourneyBar screenId="creative" setActiveScreen={setActiveScreen} title="Creative Studio" />
      <p className="text-muted" style={{ margin: 0 }}>
        Riya + Sam for image/video assets. Hand finished stills to Social or Paid — text posts stay on Social Studio.
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
        <span className="tag tag-outline" style={{ marginLeft: 'auto' }}>Riya · Creative</span>
      </div>

      {error ? <div className="card" style={{ borderLeft: '3px solid #c44', fontSize: 13 }}>{error}</div> : null}
      {notice ? <div className="card" style={{ borderLeft: '3px solid var(--color-accent)', fontSize: 13 }}>{notice}</div> : null}

      {step === 'concept' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Concept</h3>
          <div className="field">
            <label>Topic</label>
            <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void doConcept()}>
            <Sparkles size={14} /> {busy === 'concept' ? 'Riya thinking…' : 'Generate concept'}
          </button>
          {concept ? (
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 700 }}>{concept.headline}</div>
              <p style={{ margin: 0 }}>{concept.primary_text}</p>
              <div className="card-kicker">Image prompt</div>
              <p className="text-muted" style={{ margin: 0, fontSize: 12 }}>{concept.image_prompt}</p>
              <button type="button" className="btn btn-primary" onClick={() => setStep('image')}>
                Continue to image <ArrowRight size={14} />
              </button>
            </div>
          ) : null}
        </div>
      )}

      {step === 'image' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Still image</h3>
            <button type="button" className="btn btn-primary" disabled={!!busy || !concept} onClick={() => void doImage()}>
              <ImageIcon size={14} /> {busy === 'image' ? 'Generating…' : image ? 'Regenerate' : 'Generate image'}
            </button>
          </div>
          {!concept ? <p className="text-muted" style={{ fontSize: 13 }}>Generate a concept first.</p> : null}
          {image?.url ? (
            <>
              <img src={image.url} alt="Creative" style={{ maxWidth: '100%', maxHeight: 360, objectFit: 'contain', border: '1px solid var(--color-divider)' }} />
              <div className="text-muted" style={{ fontSize: 11 }}>
                {image.host} · {image.model}
                {image.warnings ? ` · ${image.warnings.join('; ')}` : ''}
              </div>
              <button type="button" className="btn btn-primary" onClick={() => setStep('video')}>
                Continue to video <ArrowRight size={14} />
              </button>
            </>
          ) : null}
        </div>
      )}

      {step === 'video' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Video</h3>
            <button type="button" className="btn btn-primary" disabled={!!busy || !concept} onClick={() => void doVideo()}>
              <Video size={14} />{' '}
              {busy === 'video'
                ? video?.status === 'processing'
                  ? 'Polling Fal…'
                  : 'Working…'
                : video
                  ? 'Retry video'
                  : 'Generate video / prompt'}
            </button>
          </div>
          {video ? (
            <>
              <div className="card-kicker">Script</div>
              <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: 0 }}>{video.script}</p>
              <div className="card-kicker">Production prompt</div>
              <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>{video.prompt}</p>
              {video.url ? (
                <video src={video.url} controls style={{ maxWidth: '100%', maxHeight: 320 }} />
              ) : (
                <p className="text-muted" style={{ fontSize: 12 }}>{video.note || 'Prompt ready — render when Fal/Veo available'}</p>
              )}
              <button type="button" className="btn btn-primary" onClick={() => setStep('approve')}>
                Continue to approve <ArrowRight size={14} />
              </button>
            </>
          ) : null}
        </div>
      )}

      {step === 'approve' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Approve creative pack</h3>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!!busy || !concept || run?.status === 'approved'}
            onClick={() => void doApprove()}
          >
            <CheckCircle size={14} /> {run?.status === 'approved' ? 'Approved' : busy === 'approve' ? 'Saving…' : 'Approve'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('social')}>
              Open Social
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('paid')}>
              Open Paid
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
