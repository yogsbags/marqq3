import React, { useEffect, useState } from 'react';
import { Sparkles, CheckCircle, ArrowRight, FileText } from 'lucide-react';
import JourneyBar from '../components/JourneyBar.jsx';
import DeliveryModeToggle from '../components/DeliveryModeToggle.jsx';
import { stashJourneyHandoff } from '../lib/journeyHandoff';
import { studioSeed, getCompanyName } from '../lib/liveWorkspace';
import { BlogArticleBrowserPreview, InlineBrowserPreview } from '../components/outcome-previews/ChannelPreviews.jsx';

const STEPS = [
  { id: 'research', label: '1 · Research', agent: 'Maya' },
  { id: 'brief', label: '2 · Brief', agent: 'Maya' },
  { id: 'draft', label: '3 · Draft', agent: 'Riya' },
  { id: 'approve', label: '4 · Approve', agent: 'You' },
  { id: 'publish', label: '5 · Publish', agent: 'GitHub' },
];

export default function ContentStudio({ setActiveScreen }) {
  const [seed] = useState(() => studioSeed());
  const [step, setStep] = useState('research');
  const [runId, setRunId] = useState(null);
  const [run, setRun] = useState(null);
  const [plan, setPlan] = useState(null);
  const [brief, setBrief] = useState(null);
  const [article, setArticle] = useState(null);
  const [publish, setPublish] = useState(null);
  const [selectedQueueId, setSelectedQueueId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [deliveryMode, setDeliveryMode] = useState('draft'); // draft | live

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('marqq_smoke_content_article');
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (!payload?.article?.title || !payload?.article?.html) return;
      setArticle(payload.article);
      if (payload.brief) setBrief(payload.brief);
      if (payload.plan) setPlan(payload.plan);
      if (payload.runId) setRunId(payload.runId);
      setStep('approve');
      setNotice(`Smoke seeded “${payload.article.title}”`);
      sessionStorage.removeItem('marqq_smoke_content_article');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // Resume from SEO handoff if a run was stashed
    try {
      const raw = sessionStorage.getItem('marqq_content_run_id');
      if (raw) {
        void loadRun(raw);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // E2E / smoke: seed a drafted article so browser preview can be asserted
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('marqq_smoke_content_article');
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (!payload?.article?.title || !payload?.article?.html) return;
      setArticle(payload.article);
      if (payload.brief) setBrief(payload.brief);
      if (payload.plan) setPlan(payload.plan);
      if (payload.runId) setRunId(payload.runId);
      setStep('approve');
      setNotice(`Smoke seeded “${payload.article.title}”`);
      sessionStorage.removeItem('marqq_smoke_content_article');
    } catch {
      /* ignore */
    }
  }, []);

  const applyRun = (next) => {
    if (!next) return;
    setRun(next);
    setRunId(next.id);
    setPlan(next.plan || null);
    setBrief(next.brief || null);
    setArticle(next.article || null);
    setPublish(next.publish || null);
    if (next.step) setStep(next.step);
    try {
      sessionStorage.setItem('marqq_content_run_id', next.id);
    } catch {
      /* ignore */
    }
  };

  const loadRun = async (id) => {
    const res = await fetch(`/api/content/runs/${id}`);
    const data = await res.json();
    if (res.ok && data.ok) applyRun(data.run);
  };

  const startRun = async () => {
    setBusy('create');
    setError(null);
    try {
      const res = await fetch('/api/content/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(seed),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setStep('research');
      setNotice(`Content run ready for ${data.run.domain}`);
    } catch (err) {
      setError(err.message || 'Failed to start run');
    } finally {
      setBusy(null);
    }
  };

  const doResearch = async () => {
    let id = runId;
    if (!id) {
      setBusy('create');
      try {
        const res = await fetch('/api/content/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(seed),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        applyRun(data.run);
        id = data.run.id;
      } catch (err) {
        setError(err.message || 'Failed to start run');
        setBusy(null);
        return;
      }
    }
    setBusy('research');
    setError(null);
    try {
      const res = await fetch(`/api/content/runs/${id}/research`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setPlan(data.plan);
      setSelectedQueueId(data.plan?.article_queue?.[0]?.id || null);
      setStep('brief');
      setNotice(`Maya researched ${data.plan?.article_queue?.length || 0} blog opportunities`);
    } catch (err) {
      setError(err.message || 'Research failed');
    } finally {
      setBusy(null);
    }
  };

  const doBrief = async () => {
    if (!runId || !plan?.article_queue?.length) return;
    const idx = Math.max(
      0,
      plan.article_queue.findIndex((q) => q.id === selectedQueueId)
    );
    setBusy('brief');
    setError(null);
    try {
      const res = await fetch(`/api/content/runs/${runId}/brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueIndex: idx < 0 ? 0 : idx }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setBrief(data.brief);
      setStep('draft');
      setNotice(`Maya briefed “${data.brief.keyword}” — ready for Riya`);
    } catch (err) {
      setError(err.message || 'Brief failed');
    } finally {
      setBusy(null);
    }
  };

  const doDraft = async () => {
    if (!runId) return;
    setBusy('draft');
    setError(null);
    try {
      const res = await fetch(`/api/content/runs/${runId}/draft`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setArticle(data.article);
      setStep('approve');
      setNotice(`Riya drafted “${data.article.title}” (${data.article.word_count} words)`);
    } catch (err) {
      setError(err.message || 'Draft failed');
    } finally {
      setBusy(null);
    }
  };

  const saveArticleEdits = async () => {
    if (!runId || !article) return;
    const res = await fetch(`/api/content/runs/${runId}/article`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: article.title,
        meta_description: article.meta_description,
        slug: article.slug,
        html: article.html,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    setArticle(data.article);
    return data.article;
  };

  const doApprove = async () => {
    if (!runId) return;
    setBusy('approve');
    setError(null);
    try {
      await saveArticleEdits();
      const res = await fetch(`/api/content/runs/${runId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setArticle(data.article);
      setNotice('Article approved — format SEO package for GitHub');
      setStep('publish');
    } catch (err) {
      setError(err.message || 'Approve failed');
    } finally {
      setBusy(null);
    }
  };

  const doPublish = async (live = false) => {
    if (!runId) return;
    setBusy(live ? 'publish-live' : 'publish');
    setError(null);
    try {
      const res = await fetch(`/api/content/runs/${runId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publish_live: live, deploy_provider: 'github_actions' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyRun(data.run);
      setPublish(data.publish);
      setNotice(
        live
          ? `Published to GitHub · ${data.url || data.publish?.canonical || ''}`
          : `SEO package ready (score ${data.publish?.seo?.score ?? '?'}%) — push live when ready`
      );
      stashJourneyHandoff({
        from: 'content',
        toScreen: 'approvals',
        agentId: 'riya',
        mission: live
          ? `Blog live: ${data.publish?.title || article?.title}`
          : `Blog SEO package: ${data.publish?.title || article?.title}`,
      });
    } catch (err) {
      setError(err.message || 'Publish failed');
    } finally {
      setBusy(null);
    }
  };

  const agentChip =
    step === 'research' || step === 'brief'
      ? 'Maya · SEO'
      : step === 'draft'
        ? 'Riya · Content'
        : step === 'publish'
          ? 'GitHub · site deploy'
          : 'Human approve';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <JourneyBar screenId="content" setActiveScreen={setActiveScreen} title="Content Studio" />
      <div>
        <p className="text-muted" style={{ margin: 0 }}>
          One door for SEO blogs: Maya → Riya (Marqq2 seo_article / seo_article_b2c skills + humanizer) → approve → GitHub publish. Social/image/video stay on their own screens.
        </p>
        {setActiveScreen ? (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: 8, paddingLeft: 0 }}
            onClick={() => setActiveScreen('analytics')}
          >
            Check organic on Performance Scorecard →
          </button>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={step === s.id ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setStep(s.id)}
            style={{ fontSize: 12 }}
          >
            {s.label}
          </button>
        ))}
        <span className="tag tag-outline" style={{ marginLeft: 'auto' }}>
          {agentChip}
        </span>
      </div>

      {error ? (
        <div className="card" style={{ borderLeft: '3px solid #c44' }}>
          <div style={{ fontSize: 13 }}>{error}</div>
        </div>
      ) : null}
      {notice ? (
        <div className="card" style={{ borderLeft: '3px solid var(--color-accent)' }}>
          <div style={{ fontSize: 13 }}>{notice}</div>
        </div>
      ) : null}

      {step === 'research' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0 }}>Maya · SEO research</h3>
              <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Domain {seed.domain} · skills: ai-seo, content-strategy, seo-audit
              </p>
            </div>
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void doResearch()}>
              <Sparkles size={14} /> {busy === 'research' || busy === 'create' ? 'Maya researching…' : plan ? 'Re-run research' : 'Start research'}
            </button>
          </div>
          {plan ? (
            <>
              <p style={{ fontSize: 13, margin: 0 }}>{plan.topical_authority}</p>
              {plan.llmo_notes?.length ? (
                <div>
                  <div className="card-kicker">LLMO / AI-answer notes</div>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
                    {plan.llmo_notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Keyword</th>
                      <th>Intent</th>
                      <th>Why</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(plan.article_queue || []).map((q) => (
                      <tr key={q.id} style={{ background: selectedQueueId === q.id ? 'var(--color-surface)' : undefined }}>
                        <td style={{ fontWeight: 700 }}>{q.keyword}</td>
                        <td>{q.intent}</td>
                        <td style={{ fontSize: 12 }}>{q.why}</td>
                        <td>
                          <button type="button" className="btn btn-secondary" onClick={() => { setSelectedQueueId(q.id); setStep('brief'); }}>
                            Select
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(plan.content_gaps || []).length ? (
                <div>
                  <div className="card-kicker">Content gaps</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {plan.content_gaps.map((g, i) => (
                      <div key={i} style={{ padding: 10, border: '1px solid var(--color-divider)', borderRadius: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{g.cluster || g.title}</div>
                        <div className="text-muted" style={{ fontSize: 12 }}>{g.note || g.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <button type="button" className="btn btn-primary" onClick={() => setStep('brief')}>
                Continue to brief <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <p className="text-muted" style={{ fontSize: 13 }}>
              Start research to generate an SEO article queue and LLMO gaps for {getCompanyName()}.
            </p>
          )}
        </div>
      )}

      {step === 'brief' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0 }}>Maya · SEO brief</h3>
              <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Pick a queue keyword, then generate the brief Riya will draft from.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!!busy || !plan?.article_queue?.length}
              onClick={() => void doBrief()}
            >
              <FileText size={14} /> {busy === 'brief' ? 'Briefing…' : 'Generate brief'}
            </button>
          </div>
          {!plan?.article_queue?.length ? (
            <p className="text-muted" style={{ fontSize: 13 }}>Run research first.</p>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {plan.article_queue.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className={selectedQueueId === q.id ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ fontSize: 12 }}
                  onClick={() => setSelectedQueueId(q.id)}
                >
                  {q.keyword}
                </button>
              ))}
            </div>
          )}
          {brief ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 700 }}>{brief.topic}</div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                Keyword: {brief.keyword} · Intent: {brief.intent}
              </div>
              <div className="card-kicker">Outline</div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {(brief.outline || []).map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ol>
              <div className="card-kicker">Secondary keywords</div>
              <div style={{ fontSize: 12 }}>{(brief.secondary_keywords || []).join(' · ')}</div>
              <button type="button" className="btn btn-primary" onClick={() => setStep('draft')}>
                Continue to Riya draft <ArrowRight size={14} />
              </button>
            </div>
          ) : null}
        </div>
      )}

      {step === 'draft' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0 }}>Riya · Draft article</h3>
              <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Skills: ai-seo, copywriting, content-strategy · from Maya brief
              </p>
            </div>
            <button type="button" className="btn btn-primary" disabled={!!busy || !brief} onClick={() => void doDraft()}>
              <Sparkles size={14} /> {busy === 'draft' ? 'Riya writing…' : article ? 'Redraft' : 'Generate draft'}
            </button>
          </div>
          {!brief ? <p className="text-muted" style={{ fontSize: 13 }}>Generate a brief first.</p> : null}
          {article ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{article.title}</div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                /{article.slug} · {article.word_count} words · {article.primary_keyword}
              </div>
              <div className="card-kicker">Browser preview · feels published</div>
              <BlogArticleBrowserPreview
                title={article.title}
                metaDescription={article.meta_description || article.excerpt}
                html={article.html}
                urlLabel={seed.domain || 'blog.yoursite.com'}
              />
              <button type="button" className="btn btn-primary" onClick={() => setStep('approve')}>
                Continue to approve <ArrowRight size={14} />
              </button>
            </>
          ) : null}
        </div>
      )}

      {step === 'approve' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Approve blog</h3>
          {!article ? (
            <p className="text-muted" style={{ fontSize: 13 }}>Draft an article first.</p>
          ) : (
            <>
              <div className="field">
                <label>Title</label>
                <input className="input" value={article.title || ''} onChange={(e) => setArticle({ ...article, title: e.target.value })} />
              </div>
              <div className="field">
                <label>Meta description</label>
                <input
                  className="input"
                  value={article.meta_description || ''}
                  onChange={(e) => setArticle({ ...article, meta_description: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Slug</label>
                <input className="input" value={article.slug || ''} onChange={(e) => setArticle({ ...article, slug: e.target.value })} />
              </div>
              <div className="field">
                <label>HTML body</label>
                <textarea
                  className="input"
                  rows={8}
                  value={article.html || ''}
                  onChange={(e) => setArticle({ ...article, html: e.target.value })}
                />
              </div>
              <div className="card-kicker">Browser preview · feels published</div>
              <BlogArticleBrowserPreview
                title={article.title}
                metaDescription={article.meta_description}
                html={article.html}
                urlLabel={seed.domain || 'blog.yoursite.com'}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={!!busy || article.status === 'approved'}
                onClick={() => void doApprove()}
              >
                <CheckCircle size={14} />{' '}
                {busy === 'approve' ? 'Saving…' : article.status === 'approved' ? 'Approved' : 'Approve article'}
              </button>
              {run?.status === 'approved' || run?.step === 'publish' ? (
                <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                  Approved. Continue to Publish for SEO package + GitHub.
                </p>
              ) : null}
              <button type="button" className="btn btn-secondary" onClick={() => setStep('publish')} disabled={!article || article.status !== 'approved'}>
                Continue to publish <ArrowRight size={14} />
              </button>
            </>
          )}
        </div>
      )}

      {step === 'publish' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Publish · SEO HTML → GitHub</h3>
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
            Formats a full SEO page (canonical, OG, Article JSON-LD), then optionally pushes to the
            configured GitHub blog path for {getCompanyName() || 'this workspace'}.
            Destination repo and public URL come from publish settings / env — not a hardcoded demo site.
          </p>
          {!article ? (
            <p className="text-muted" style={{ fontSize: 13 }}>Approve an article first.</p>
          ) : (
            <>
              <DeliveryModeToggle
                value={deliveryMode}
                onChange={setDeliveryMode}
                draftLabel="Draft (safe)"
                liveLabel="Publish live"
                draftHint="Formats the SEO HTML package only — nothing is pushed to GitHub."
                liveHint="Will format (if needed) and push the blog post live via GitHub → Cloudflare."
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!!busy}
                  onClick={() => void doPublish(deliveryMode === 'live')}
                >
                  {deliveryMode === 'live' ? (
                    <>
                      <CheckCircle size={14} />{' '}
                      {busy === 'publish-live' || busy === 'publish'
                        ? 'Publishing…'
                        : 'Approve & publish live'}
                    </>
                  ) : (
                    <>
                      <FileText size={14} /> {busy === 'publish' ? 'Formatting…' : 'Format SEO package'}
                    </>
                  )}
                </button>
                {deliveryMode === 'draft' && publish?.seo?.ok ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!!busy}
                    onClick={() => setDeliveryMode('live')}
                  >
                    Switch to Publish live
                  </button>
                ) : null}
              </div>
              {publish ? (
                <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div>
                    SEO score <strong>{publish.seo?.score ?? '?'}%</strong>
                    {publish.seo?.failed?.length ? ` · missing: ${publish.seo.failed.join(', ')}` : ' · all checks passed'}
                  </div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {publish.file_path} · {publish.canonical}
                  </div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    Deploy: {publish.deployment?.provider} · {publish.deployment?.status}
                  </div>
                  {publish.url || publish.canonical ? (
                    <a href={publish.url || publish.canonical} target="_blank" rel="noreferrer">
                      {publish.url || publish.canonical}
                    </a>
                  ) : null}
                  {publish.html ? (
                    <>
                      <div className="card-kicker">Live SEO package · browser preview</div>
                      <InlineBrowserPreview
                        urlLabel={(publish.canonical || publish.url || seed.domain || 'yoursite.com').replace(/^https?:\/\//, '').split('/')[0]}
                        title={article?.title}
                        html={publish.html}
                        height={480}
                      />
                    </>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {!runId && step === 'research' ? null : (
        <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>
          Run {runId || '—'} · status {run?.status || '—'}
          {!runId ? (
            <>
              {' · '}
              <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: 0 }} onClick={() => void startRun()}>
                Init run only
              </button>
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
