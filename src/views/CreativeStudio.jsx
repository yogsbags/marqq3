import React, { useState } from 'react';
import { Sparkles, CheckCircle, ArrowRight, Image as ImageIcon, Video } from 'lucide-react';
import JourneyBar from '../components/JourneyBar.jsx';
import { studioSeed } from '../lib/liveWorkspace';
import { SocialPostPreview } from '../components/outcome-previews/ChannelPreviews.jsx';

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
  const [platform, setPlatform] = useState(() => seed.platform || 'instagram');
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
      body: JSON.stringify({ ...seed, topic, platform, aspectRatio: platform === 'twitter' || platform === 'x' ? '1:1' : '9:16' }),
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
        body: JSON.stringify({ topic, platform }),
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
        Riya decides a channel-native organic video with viral potential, then Seedance executes it. Brand DNA logo watermarks stills; uploaded refs can inform the concept.
      </p>
      {seed.logoUrl ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <img src={seed.logoUrl} alt="Brand logo" style={{ height: 28, maxWidth: 120, objectFit: 'contain' }} />
          <span className="text-muted">Logo available for still watermark / brand continuity.</span>
        </div>
      ) : (
        <p className="text-muted" style={{ margin: 0, fontSize: 12 }}>
          No logo in Brand DNA yet — upload one for watermarked stills.
        </p>
      )}

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
          <div className="field">
            <label>Channel</label>
            <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="instagram">Instagram Reels</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube Shorts</option>
              <option value="linkedin">LinkedIn video</option>
              <option value="facebook">Facebook Reels</option>
              <option value="twitter">X / Twitter</option>
            </select>
          </div>
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void doConcept()}>
            <Sparkles size={14} /> {busy === 'concept' ? 'Riya deciding format…' : 'Generate viral concept'}
          </button>
          {concept ? (
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 700 }}>{concept.headline}</div>
              <p style={{ margin: 0 }}>{concept.primary_text}</p>
              {concept.video_plan ? (
                <div className="card" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--color-surface-2, transparent)' }}>
                  <div className="card-kicker">Viral video decision</div>
                  <div>
                    <strong>{concept.video_plan.channel_label}</strong>
                    {' · '}
                    {concept.video_plan.format}
                    {' · '}
                    {concept.video_plan.aspect_ratio}
                    {' · '}
                    {concept.video_plan.duration_seconds}s
                    {' · '}
                    {concept.video_plan.render_mode}
                  </div>
                  {concept.video_plan.hook ? <div><strong>Hook:</strong> {concept.video_plan.hook}</div> : null}
                  {concept.video_plan.viral_angle ? <div><strong>Angle:</strong> {concept.video_plan.viral_angle}</div> : null}
                  {Array.isArray(concept.video_plan.beats) && concept.video_plan.beats.length ? (
                    <div>
                      <strong>Beats:</strong>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                        {concept.video_plan.beats.map((b) => <li key={b}>{b}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {concept.video_plan.cta ? <div><strong>CTA:</strong> {concept.video_plan.cta}</div> : null}
                  {concept.video_plan.why_this_format ? (
                    <p className="text-muted" style={{ margin: 0 }}>{concept.video_plan.why_this_format}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="card-kicker">Cover / still prompt</div>
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
              <div className="card-kicker">Channel preview · feels published</div>
              <SocialPostPreview
                platform={platform}
                authorName={seed.companyName || 'Your Brand'}
                post={concept?.primary_text || ''}
                hook={concept?.headline}
                imageUrl={image.url}
                cta={concept?.video_plan?.cta}
              />
              <div className="text-muted" style={{ fontSize: 11 }}>
                {image.host} · {image.model}
                {image.watermark?.applied ? ' · logo watermark applied' : ''}
                {image.used_reference_assets ? ' · brand refs used' : ''}
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
          {(video || image?.url) ? (
            <>
              <div className="card-kicker">Channel preview · feels published</div>
              <SocialPostPreview
                platform={platform}
                authorName={seed.companyName || 'Your Brand'}
                post={concept?.primary_text || ''}
                hook={concept?.video_plan?.hook || concept?.headline}
                imageUrl={!video?.url ? image?.url : undefined}
                videoUrl={video?.url || undefined}
                cta={concept?.video_plan?.cta || video?.plan?.cta}
              />
              {video?.plan ? (
                <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="card-kicker">Execution</div>
                  <div>
                    {video.plan.channel_label || platform}
                    {' · '}
                    {video.aspect_ratio || video.plan.aspect_ratio || '?'}
                    {' · '}
                    {video.duration_seconds}s
                    {' · '}
                    {video.plan.render_mode}
                    {video.model ? ` · ${video.model}` : ''}
                  </div>
                  {video.plan.hook ? <div><strong>Hook:</strong> {video.plan.hook}</div> : null}
                </div>
              ) : null}
              {video ? (
                <>
                  <div className="card-kicker">Script</div>
                  <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: 0 }}>{video.script}</p>
                  {!video.url ? (
                    <p className="text-muted" style={{ fontSize: 12 }}>{video.note || 'Prompt ready — render when Fal/Seedance available'}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-muted" style={{ fontSize: 12 }}>Cover still ready — generate video when you want motion.</p>
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
          {(image?.url || video?.url) && (
            <>
              <div className="card-kicker">Channel preview · feels published</div>
              <SocialPostPreview
                platform={platform}
                authorName={seed.companyName || 'Your Brand'}
                post={concept?.primary_text || ''}
                hook={concept?.video_plan?.hook || concept?.headline}
                imageUrl={image?.url}
                videoUrl={video?.url}
                cta={concept?.video_plan?.cta}
              />
            </>
          )}
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
