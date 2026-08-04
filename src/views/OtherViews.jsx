import React, { useState, useEffect, useRef } from 'react';
import {  Layers, Shield, Sparkles, Plus, Play, CheckCircle, Database, FileCode, Sliders, Lock, ArrowRight, UserPlus, FileText, Calendar, Zap, MessageSquare, Video, HelpCircle, Upload, CheckCircle2, AlertTriangle, RefreshCw, Trash2  } from 'lucide-react';
import {  connectComposioConnector, formatConnectorError  } from '../lib/composio';
import {  CONNECTOR_DISPLAY, isConnectorActive, connectorLabel  } from '../lib/connectormeta';
import {  ResourcePickerModal  } from '../components/common/ResourcePickerModal';
import {  fetchBrandContext, fetchKnowledgeFiles, persistBrandContext, loadLocalBrandContext, getActiveWorkspaceId  } from '../lib/brandContext';
import JourneyBar from '../components/JourneyBar.jsx';
import GtmModuleSwitcher from '../components/GtmModuleSwitcher.jsx';
import MarketingCalendarView from './MarketingCalendarView.jsx';
import ExecutionModeToggle from '../components/ExecutionModeToggle.jsx';
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
import {  loadAgentOs, saveAgentOs  } from '../lib/agents/persist';
import {  planAgentTask  } from '../lib/agents/planTask';
import {  sectionBriefForScreen  } from '../lib/journeyHandoff';
import { GtmControlLoopPanel } from '../components/GtmControlLoopPanel.jsx';

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
        <GtmModuleSwitcher setActiveScreen={setActiveScreen} onSwitched={() => {
          try {
            const raw = sessionStorage.getItem('marqq_gtm_strategy');
            setDoc(raw ? JSON.parse(raw) : null);
          } catch {
            setDoc(null);
          }
        }} />
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No locked GTM strategy yet</h3>
          <p className="card-body">
            Finish the GTM Wizard to lock North Star and 16 strategy sections. This screen is the journey home —
            not a separate mock brief library. Use <strong>Add module</strong> above for another product, service, app, or business line.
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
      <GtmModuleSwitcher
        setActiveScreen={setActiveScreen}
        onSwitched={() => {
          try {
            const raw = sessionStorage.getItem('marqq_gtm_strategy');
            setDoc(raw ? JSON.parse(raw) : null);
          } catch {
            setDoc(null);
          }
        }}
      />
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
  const audience = getAudienceProfile();
  const wsId = getActiveWorkspaceId();
  const cacheKey = `marqq_market_research_${wsId}`;
  const signalsCacheKey = `marqq_apify_website_${wsId}`;
  const adsCacheKey = `marqq_apify_ads_${wsId}`;
  const [research, setResearch] = useState(() => {
    try {
      const raw = sessionStorage.getItem(cacheKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [websiteSignals, setWebsiteSignals] = useState(() => {
    try {
      const raw = sessionStorage.getItem(signalsCacheKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [adsIntel, setAdsIntel] = useState(() => {
    try {
      const raw = sessionStorage.getItem(adsCacheKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [apifyStatus, setApifyStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [adsLoading, setAdsLoading] = useState(false);
  const [error, setError] = useState('');
  const [adsError, setAdsError] = useState('');
  const [adsPlatforms, setAdsPlatforms] = useState({ google: true, linkedin: false, facebook: false });
  const [adsDomain, setAdsDomain] = useState(() => {
    const site = localStorage.getItem('marqq_ob_website') || '';
    try {
      return site ? new URL(site.startsWith('http') ? site : `https://${site}`).hostname.replace(/^www\./, '') : 'theelevate.co.in';
    } catch {
      return 'theelevate.co.in';
    }
  });
  const [adsCompetitor, setAdsCompetitor] = useState(() => intel.companyName || getCompanyName() || 'Elevate');
  const [linkedinSlug, setLinkedinSlug] = useState('');
  const [facebookPage, setFacebookPage] = useState('');

  useEffect(() => {
    fetch('/api/apify/status')
      .then((r) => r.json())
      .then((j) => setApifyStatus(j))
      .catch(() => setApifyStatus({ ok: false, configured: false }));
  }, []);

  const runResearch = async () => {
    setLoading(true);
    setError('');
    try {
      const website = localStorage.getItem('marqq_ob_website') || '';
      const res = await fetch('/api/market/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: intel.companyName || getCompanyName(),
          website,
          niche: intel.niche || audience.niche || '',
          icp: audience.icp || '',
          marketBrief: intel.marketBody || '',
          workspaceId: wsId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Research failed (${res.status})`);
      setResearch(json);
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(json));
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError(err.message || 'Research failed');
    } finally {
      setLoading(false);
    }
  };

  const runWebsiteSignals = async () => {
    setSignalsLoading(true);
    setError('');
    try {
      const website = localStorage.getItem('marqq_ob_website') || adsDomain || '';
      const res = await fetch('/api/apify/website-signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          website,
          domain: adsDomain,
          companyName: intel.companyName || getCompanyName(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!json.ok) throw new Error(json.error || `Website crawl failed (${res.status})`);
      setWebsiteSignals(json);
      try {
        sessionStorage.setItem(signalsCacheKey, JSON.stringify(json));
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError(err.message || 'Website crawl failed');
    } finally {
      setSignalsLoading(false);
    }
  };

  const runCompetitorAds = async () => {
    setAdsLoading(true);
    setAdsError('');
    try {
      const platforms = Object.entries(adsPlatforms)
        .filter(([, on]) => on)
        .map(([k]) => k);
      if (!platforms.length) throw new Error('Select at least one platform');
      const competitor = {
        name: adsCompetitor || intel.companyName || 'Competitor',
        google_domain: platforms.includes('google') ? adsDomain : undefined,
        linkedin_company: platforms.includes('linkedin') ? linkedinSlug || undefined : undefined,
        facebook_page: platforms.includes('facebook') ? facebookPage || undefined : undefined,
      };
      const res = await fetch('/api/apify/competitor-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitors: [competitor],
          platforms,
          country: 'IN',
          limit: 8,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok && !(json.ads || []).length) {
        throw new Error(json.error || `Ads scrape failed (${res.status})`);
      }
      setAdsIntel(json);
      try {
        sessionStorage.setItem(adsCacheKey, JSON.stringify(json));
      } catch {
        /* ignore */
      }
    } catch (err) {
      setAdsError(err.message || 'Ads scrape failed');
    } finally {
      setAdsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <JourneyBar screenId="market" setActiveScreen={setActiveScreen} title="Market & Competitor Intelligence" />
          <p className="text-muted" style={{ margin: '8px 0 0' }}>
            Strategy market brief + live web research + Apify scrapers for {intel.companyName}
            {intel.niche ? ` · ${intel.niche}` : ''}.
          </p>
          {apifyStatus ? (
            <p className="text-muted" style={{ margin: '6px 0 0', fontSize: 12 }} data-testid="apify-status">
              Apify {apifyStatus.configured ? 'connected' : 'not configured'} · actors:{' '}
              {apifyStatus.actors
                ? Object.keys(apifyStatus.actors).join(', ')
                : '—'}
            </p>
          ) : null}
        </div>
        <button type="button" className="btn btn-primary" disabled={loading} onClick={runResearch} data-testid="market-run-research">
          {loading ? 'Researching…' : research ? 'Refresh research' : 'Run live research'}
        </button>
      </div>

      {error ? <div className="card" style={{ color: 'var(--color-accent)' }}>{error}</div> : null}

      {!intel.hasStrategy ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No market brief yet</h3>
          <p className="card-body">
            Finish the GTM Wizard so Isha can work from your locked market analysis — or run live research now.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('gtmwizard')}>
              Open GTM Wizard
            </button>
            <button type="button" className="btn btn-primary" disabled={loading} onClick={runResearch}>
              {loading ? 'Researching…' : 'Run live research'}
            </button>
          </div>
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

      <div className="card" data-testid="apify-website-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h3 style={{ marginTop: 0 }}>Website signals · Apify crawler</h3>
            <p className="card-body" style={{ margin: 0 }}>
              Actor <code>apify/website-content-crawler</code> — homepage title, meta, excerpt.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={signalsLoading || apifyStatus?.configured === false}
            onClick={runWebsiteSignals}
            data-testid="apify-run-website"
          >
            {signalsLoading ? 'Crawling…' : websiteSignals?.ok ? 'Re-crawl site' : 'Crawl website'}
          </button>
        </div>
        {websiteSignals?.ok ? (
          <div style={{ marginTop: 12 }} data-testid="apify-website-result">
            <div style={{ fontWeight: 700 }}>{websiteSignals.title || websiteSignals.website}</div>
            <p className="card-body" style={{ marginTop: 6 }}>
              {websiteSignals.description || websiteSignals.signal_text || '—'}
            </p>
            <div className="text-muted" style={{ fontSize: 12 }}>
              {websiteSignals.domain} · {websiteSignals.source}
              {websiteSignals.scrapedAt ? ` · ${new Date(websiteSignals.scrapedAt).toLocaleString()}` : ''}
            </div>
          </div>
        ) : null}
      </div>

      <div className="card" data-testid="apify-ads-panel">
        <h3 style={{ marginTop: 0 }}>Competitor ads · Apify libraries</h3>
        <p className="card-body">
          LinkedIn · Facebook · Google Transparency actors (Marqq2). Start with Google for a domain; add LinkedIn/Facebook when you have page IDs.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginTop: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            Competitor name
            <input className="input" value={adsCompetitor} onChange={(e) => setAdsCompetitor(e.target.value)} data-testid="apify-ads-name" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            Google domain
            <input className="input" value={adsDomain} onChange={(e) => setAdsDomain(e.target.value)} data-testid="apify-ads-domain" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            LinkedIn company slug
            <input className="input" value={linkedinSlug} onChange={(e) => setLinkedinSlug(e.target.value)} placeholder="acme-corp" data-testid="apify-ads-linkedin" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            Facebook page
            <input className="input" value={facebookPage} onChange={(e) => setFacebookPage(e.target.value)} placeholder="Page name or ID" data-testid="apify-ads-facebook" />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {['google', 'linkedin', 'facebook'].map((p) => (
            <label key={p} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, textTransform: 'capitalize' }}>
              <input
                type="checkbox"
                checked={Boolean(adsPlatforms[p])}
                onChange={(e) => setAdsPlatforms((prev) => ({ ...prev, [p]: e.target.checked }))}
                data-testid={`apify-platform-${p}`}
              />
              {p}
            </label>
          ))}
          <button
            type="button"
            className="btn btn-primary"
            disabled={adsLoading || apifyStatus?.configured === false}
            onClick={runCompetitorAds}
            data-testid="apify-run-ads"
          >
            {adsLoading ? 'Scraping ads…' : 'Scrape competitor ads'}
          </button>
        </div>
        {adsError ? <div style={{ color: 'var(--color-accent)', marginTop: 10, fontSize: 13 }}>{adsError}</div> : null}
        {adsIntel ? (
          <div style={{ marginTop: 14 }} data-testid="apify-ads-result">
            <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
              {adsIntel.total ?? (adsIntel.ads || []).length} ads · {adsIntel.scrapedAt ? new Date(adsIntel.scrapedAt).toLocaleString() : ''}
            </div>
            {(adsIntel.results || []).map((r, i) => (
              <div key={i} style={{ fontSize: 12, marginBottom: 6 }}>
                <strong>{r.competitor}</strong>:{' '}
                {(r.platforms || [])
                  .map((p) =>
                    p.error
                      ? `${p.platform} ✗ ${p.error}`
                      : p.skipped
                        ? `${p.platform} skipped`
                        : `${p.platform} ${p.scraped}`
                  )
                  .join(' · ')}
              </div>
            ))}
            {(adsIntel.ads || []).length ? (
              <div className="table-container" style={{ marginTop: 10 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th>Advertiser</th>
                      <th>Headline / body</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(adsIntel.ads || []).slice(0, 12).map((ad) => (
                      <tr key={`${ad.platform}-${ad.ad_id}`}>
                        <td><span className="tag tag-outline">{ad.platform}</span></td>
                        <td style={{ fontWeight: 600 }}>{ad.advertiser || ad.competitor_name}</td>
                        <td>
                          {ad.headline || (ad.body ? String(ad.body).slice(0, 120) : null) || (
                            ad.destination_url ? (
                              <a href={ad.destination_url} target="_blank" rel="noreferrer">View creative</a>
                            ) : '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="card-body" style={{ marginTop: 8 }}>No ad creatives returned — try another domain or enable LinkedIn/Facebook with page IDs.</p>
            )}
          </div>
        ) : null}
      </div>

      {research ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h3 style={{ marginTop: 0 }}>Live research {research.source === 'groq' ? '· web' : '· offline fallback'}</h3>
            {research.updatedAt ? (
              <span className="text-muted" style={{ fontSize: 12 }}>{new Date(research.updatedAt).toLocaleString()}</span>
            ) : null}
          </div>
          {research.summary ? (
            <p className="card-body" style={{ whiteSpace: 'pre-wrap' }}>{research.summary}</p>
          ) : null}
          {Array.isArray(research.competitors) && research.competitors.length ? (
            <div className="table-container" style={{ marginTop: 12 }}>
              <table className="data-table">
                <thead>
                  <tr><th>Competitor</th><th>Angle</th><th>Threat</th></tr>
                </thead>
                <tbody>
                  {research.competitors.map((c, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{c.name}</td>
                      <td>{c.angle}</td>
                      <td><span className="tag tag-outline">{c.threat || '—'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
            {Array.isArray(research.opportunities) && research.opportunities.length ? (
              <div>
                <div className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>Opportunities</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {research.opportunities.map((o, i) => (
                    <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>{o}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {Array.isArray(research.risks) && research.risks.length ? (
              <div>
                <div className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>Risks</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {research.risks.map((r, i) => (
                    <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { AnalyticsView } from './AnalyticsScorecard.jsx';

export function AudiencesView({ setActiveScreen }) {
  const a = getAudienceProfile();
  const [c360, setC360] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState(null);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [signalsError, setSignalsError] = useState('');
  const wsId = getActiveWorkspaceId();
  const signalsCacheKey = `marqq_apollo_signals_${wsId}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/customer360?companyId=${encodeURIComponent(wsId)}&limit=75`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setC360(json); })
      .catch(() => { if (!cancelled) setC360(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [wsId]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(signalsCacheKey);
      if (raw) setSignals(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [signalsCacheKey]);

  const refreshSignals = async (force = false) => {
    setSignalsLoading(true);
    setSignalsError('');
    try {
      const res = await fetch('/api/apollo/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: wsId, refresh: force, limit: 8 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.error || 'Signals refresh failed');
      setSignals(json);
      try {
        sessionStorage.setItem(signalsCacheKey, JSON.stringify(json));
      } catch { /* ignore */ }
    } catch (err) {
      setSignalsError(err.message || 'Could not load Apollo signals');
    } finally {
      setSignalsLoading(false);
    }
  };

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
  for (const b of a.bullets.slice(0, 4)) {
    if (segments.some((s) => s.title === b || s.detail === b)) continue;
    segments.push({ title: b.length > 80 ? `${b.slice(0, 80)}…` : b, detail: b, tags: ['From strategy'] });
  }

  const liveSegments = Array.isArray(c360?.segments) ? c360.segments : [];
  const summary = c360?.summary || null;
  const sampleAccounts = Array.isArray(c360?.accounts) ? c360.accounts.slice(0, 6) : [];
  const signalAccounts = Array.isArray(signals?.accounts) ? signals.accounts : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="audiences" setActiveScreen={setActiveScreen} title="Audiences & ICP Segmentation" />
      <p className="text-muted" style={{ margin: 0 }}>
        ICP from onboarding + GTM Audience interview, plus live lead segments from CRM/Sheets for {a.companyName}.
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
        </>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Live lead segments</h3>
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('customer360')}>
            Customer 360
          </button>
        </div>
        {loading ? (
          <p className="text-muted" style={{ marginTop: 12 }}>Loading CRM / Sheets accounts…</p>
        ) : summary ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 14 }}>
              {[
                { label: 'Accounts', value: summary.total },
                { label: 'Replied', value: summary.replied },
                { label: 'In outreach', value: (summary.sent || 0) + (summary.drafted || 0) },
                { label: 'At risk', value: summary.at_risk },
              ].map((k) => (
                <div key={k.label} style={{ padding: 10, border: '1px solid var(--color-divider)', background: 'var(--color-bg)' }}>
                  <div className="text-muted" style={{ fontSize: 11 }}>{k.label}</div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{k.value ?? 0}</div>
                </div>
              ))}
            </div>
            {liveSegments.length ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                {liveSegments.map((s, i) => (
                  <span key={i} className="tag tag-outline">
                    {s.label || s.name || s.id}: {s.count ?? 0}
                  </span>
                ))}
              </div>
            ) : null}
            {sampleAccounts.length ? (
              <div className="table-container" style={{ marginTop: 14 }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Account</th><th>Status</th><th>Source</th></tr>
                  </thead>
                  <tbody>
                    {sampleAccounts.map((acc, i) => (
                      <tr key={acc.id || i}>
                        <td style={{ fontWeight: 700 }}>{acc.name || acc.company || acc.email || acc.id}</td>
                        <td><span className="tag tag-outline">{acc.status || '—'}</span></td>
                        <td>{acc.source || acc.channel || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="card-body" style={{ marginTop: 12 }}>
                No accounts yet — fetch leads in Outreach or sync via CRM.
              </p>
            )}
          </>
        ) : (
          <p className="card-body" style={{ marginTop: 12 }}>
            Could not load live segments. Check CRM Sync destination, then open Customer 360.
          </p>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>Apollo Signals</h3>
            <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              Org enrich · news · job postings for ICP accounts (Customer 360 + Outreach)
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={signalsLoading}
              onClick={() => refreshSignals(Boolean(signals))}
            >
              {signalsLoading ? 'Polling…' : signals ? 'Refresh signals' : 'Poll Apollo'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setActiveScreen && setActiveScreen('outreach')}>
              Outreach
            </button>
          </div>
        </div>

        {signals?.updatedAt ? (
          <p className="text-muted" style={{ marginTop: 10, fontSize: 11 }}>
            {signals.cached ? 'Cached · ' : ''}Updated {new Date(signals.updatedAt).toLocaleString()}
            {signals.polled != null ? ` · ${signals.polled} accounts` : ''}
          </p>
        ) : null}

        {signalsError ? (
          <p style={{ color: 'var(--color-accent-2)', fontSize: 12, marginTop: 10 }}>{signalsError}</p>
        ) : null}

        {signalsLoading && !signalAccounts.length ? (
          <p className="text-muted" style={{ marginTop: 12 }}>Polling Apollo for news, hiring, and org signals…</p>
        ) : null}

        {!signalsLoading && !signalAccounts.length && !signalsError ? (
          <p className="card-body" style={{ marginTop: 12 }}>
            {signals?.note ||
              'No signals yet. Fetch ICP leads in Outreach (or sync CRM), then poll Apollo. Requires Apollo connected under Integrations.'}
          </p>
        ) : null}

        {signalAccounts.length ? (
          <div className="table-container" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Signals</th>
                  <th>News</th>
                  <th>Hiring</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {signalAccounts.map((acc, i) => {
                  const topSignals = (acc.signals || []).slice(0, 2);
                  const newsTitle = acc.news?.[0]?.title;
                  const jobsCount = Array.isArray(acc.job_postings) ? acc.job_postings.length : 0;
                  return (
                    <tr key={acc.organization_id || acc.domain || acc.name || i}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{acc.name}</div>
                        <div className="text-muted" style={{ fontSize: 11 }}>
                          {acc.domain || '—'}
                          {acc.organization?.industry ? ` · ${acc.organization.industry}` : ''}
                        </div>
                        {acc.error || acc.resolve_error ? (
                          <div style={{ color: 'var(--color-accent-2)', fontSize: 11, marginTop: 2 }}>
                            {acc.error || acc.resolve_error}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 280 }}>
                        {topSignals.length
                          ? topSignals.map((s, si) => (
                              <div key={si} style={{ marginBottom: 4 }}>
                                <span className="tag tag-outline" style={{ marginRight: 4, fontSize: 10 }}>{s.type}</span>
                                {s.text}
                              </div>
                            ))
                          : <span className="text-muted">—</span>}
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 200 }}>
                        {newsTitle ? (
                          acc.news[0].url ? (
                            <a href={acc.news[0].url} target="_blank" rel="noopener noreferrer">{newsTitle}</a>
                          ) : newsTitle
                        ) : (
                          <span className="text-muted">{acc.news_error ? 'n/a' : '—'}</span>
                        )}
                      </td>
                      <td>
                        {jobsCount > 0 ? (
                          <span className="tag tag-accent">{jobsCount} roles</span>
                        ) : (
                          <span className="text-muted">{acc.jobs_error ? 'n/a' : '—'}</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 11 }}
                          onClick={() => {
                            try {
                              sessionStorage.setItem(
                                'marqq_apollo_signal_handoff',
                                JSON.stringify({
                                  company: acc.name,
                                  domain: acc.domain,
                                  signals: acc.signals || [],
                                  at: new Date().toISOString(),
                                })
                              );
                            } catch { /* ignore */ }
                            setActiveScreen && setActiveScreen('outreach');
                          }}
                        >
                          Use in Outreach
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('market')}>
          Market
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('outreach')}>
          Outreach
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('crm')}>
          CRM Sync
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
    </div>
  );
}

export function BrandView({ setActiveScreen }) {
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({});
  const logoInputRef = useRef(null);

  const refresh = async () => {
    const data = await fetchBrandContext();
    setCtx(data);
    setDraft({
      companyName: data?.companyName || getCompanyName(),
      website: data?.website || localStorage.getItem('marqq_ob_website') || '',
      brandTagline: data?.brandTagline || localStorage.getItem('marqq_ob_tagline') || '',
      toneOfVoice: data?.toneOfVoice || localStorage.getItem('marqq_ob_tone') || '',
      brandSummary: data?.brandSummary || '',
      niche: data?.niche || localStorage.getItem('marqq_ob_niche') || '',
      icp: data?.icp || localStorage.getItem('marqq_ob_icp') || '',
      fonts: data?.fonts || '',
      colors: Array.isArray(data?.colors) ? data.colors.join(', ') : '',
      positioningTags: Array.isArray(data?.positioningTags) ? data.positioningTags.join(', ') : '',
      logoUrl: data?.logoUrl || '',
    });
    setLoading(false);
  };

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  const company = draft.companyName || ctx?.companyName || getCompanyName();
  const positioning = getStrategySection('positioning_messaging');
  const positioningText = sectionPlainText(positioning);

  const save = async () => {
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const colors = String(draft.colors || '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const positioningTags = String(draft.positioningTags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const next = {
        ...(loadLocalBrandContext() || {}),
        ...(ctx || {}),
        workspaceId: getActiveWorkspaceId(),
        companyName: draft.companyName,
        website: draft.website,
        brandTagline: draft.brandTagline,
        toneOfVoice: draft.toneOfVoice,
        brandSummary: draft.brandSummary,
        niche: draft.niche,
        icp: draft.icp,
        fonts: draft.fonts,
        colors,
        positioningTags,
        logoUrl: draft.logoUrl || ctx?.logoUrl || '',
      };
      const saved = await persistBrandContext(next);
      try {
        localStorage.setItem('marqq_ob_companyName', draft.companyName || '');
        localStorage.setItem('marqq_ob_website', draft.website || '');
        localStorage.setItem('marqq_ob_tagline', draft.brandTagline || '');
        localStorage.setItem('marqq_ob_tone', draft.toneOfVoice || '');
        localStorage.setItem('marqq_ob_niche', draft.niche || '');
        localStorage.setItem('marqq_ob_icp', draft.icp || '');
      } catch {
        /* ignore */
      }
      setCtx(saved);
      setEditing(false);
      setMsg('Brand context saved.');
      await refresh();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const rerunDna = async () => {
    setRerunning(true);
    setError('');
    setMsg('');
    try {
      const res = await fetch('/api/brand-dna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: getActiveWorkspaceId(),
          companyName: draft.companyName || company,
          websiteUrl: draft.website,
          industry: draft.niche,
          icp: draft.icp,
        }),
      });
      const json = await res.json().catch(() => ({}));
      const dna = json.brandDna || {};
      const signals = json.signals || {};
      const nextDraft = {
        ...draft,
        brandSummary: dna.businessSummary || dna.brandSummary || draft.brandSummary,
        brandTagline: dna.brandTagline || draft.brandTagline,
        toneOfVoice: dna.toneOfVoice || draft.toneOfVoice,
        colors: (dna.colors || signals.colors || []).join(', ') || draft.colors,
        fonts: dna.fonts || signals.fonts || draft.fonts,
        positioningTags: (dna.positioningTags || []).join(', ') || draft.positioningTags,
        logoUrl: draft.logoUrl || signals.logoUrl || signals.faviconUrl || '',
      };
      setDraft(nextDraft);
      setEditing(true);
      setMsg(json.ok === false ? 'Synthesis returned fallback — review and save.' : 'Brand DNA refreshed — review and save.');
    } catch (err) {
      setError(err.message || 'Brand DNA failed');
    } finally {
      setRerunning(false);
    }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setLogoUploading(true);
    setError('');
    try {
      const ab = await file.arrayBuffer();
      let binary = '';
      new Uint8Array(ab).forEach((b) => { binary += String.fromCharCode(b); });
      const base64 = window.btoa(binary);
      const res = await fetch('/api/brand-dna/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: getActiveWorkspaceId(),
          name: file.name,
          mime: file.type || 'image/png',
          size: file.size,
          base64,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.logoUrl) throw new Error(json.error || 'Logo upload failed');
      setDraft((d) => ({ ...d, logoUrl: json.logoUrl }));
      const local = loadLocalBrandContext() || {};
      await persistBrandContext({ ...local, ...ctx, logoUrl: json.logoUrl, workspaceId: getActiveWorkspaceId() });
      setMsg('Logo updated.');
      await refresh();
    } catch (err) {
      setError(err.message || 'Logo upload failed');
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const colors = editing
    ? String(draft.colors || '').split(',').map((c) => c.trim()).filter(Boolean)
    : (Array.isArray(ctx?.colors) ? ctx.colors : []);
  const tags = editing
    ? String(draft.positioningTags || '').split(',').map((t) => t.trim()).filter(Boolean)
    : (Array.isArray(ctx?.positioningTags) ? ctx.positioningTags : []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <JourneyBar screenId="brand" setActiveScreen={setActiveScreen} title="Brand Center" />
          <p className="text-muted" style={{ marginTop: 8 }}>
            Edit live brand guidelines used by Creative, Outreach, and GTM agents.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadLogo(e.target.files?.[0])} />
          <button type="button" className="btn btn-ghost" disabled={logoUploading} onClick={() => logoInputRef.current?.click()}>
            {logoUploading ? 'Uploading…' : 'Upload logo'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('knowledge')}>
            Knowledge Base
          </button>
          <button type="button" className="btn btn-secondary" disabled={rerunning} onClick={rerunDna}>
            {rerunning ? 'Re-running…' : 'Re-run Brand DNA'}
          </button>
          {editing ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => { setEditing(false); refresh(); }}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>Edit</button>
          )}
        </div>
      </div>

      {msg ? <div className="card">{msg}</div> : null}
      {error ? <div className="card" style={{ color: 'var(--color-accent)' }}>{error}</div> : null}

      {loading ? (
        <div className="card text-muted">Loading brand context…</div>
      ) : (
        <>
          <div className="card" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            {(draft.logoUrl || ctx?.logoUrl) ? (
              <img
                src={draft.logoUrl || ctx.logoUrl}
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
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {editing ? (
                <>
                  <input className="input" value={draft.companyName || ''} onChange={(e) => setDraft({ ...draft, companyName: e.target.value })} placeholder="Company name" />
                  <input className="input" value={draft.website || ''} onChange={(e) => setDraft({ ...draft, website: e.target.value })} placeholder="https://" />
                  <input className="input" value={draft.brandTagline || ''} onChange={(e) => setDraft({ ...draft, brandTagline: e.target.value })} placeholder="Tagline" />
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{company}</div>
                  <div className="text-muted" style={{ fontSize: 13 }}>{draft.website || ctx?.website}</div>
                  <div style={{ fontWeight: 600 }}>{draft.brandTagline || ctx?.brandTagline}</div>
                </>
              )}
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {tags.map((t) => (
                    <span key={t} className="tag tag-accent">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Brand summary</h3>
            {editing ? (
              <textarea className="input" rows={5} value={draft.brandSummary || ''} onChange={(e) => setDraft({ ...draft, brandSummary: e.target.value })} />
            ) : (
              <p style={{ color: 'var(--color-neutral-300)', marginTop: '6px', lineHeight: 1.55 }}>
                {draft.brandSummary || ctx?.brandSummary || 'No summary yet — re-run Brand DNA.'}
              </p>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Voice &amp; Tone</h3>
            {editing ? (
              <input className="input" value={draft.toneOfVoice || ''} onChange={(e) => setDraft({ ...draft, toneOfVoice: e.target.value })} placeholder="Tone of voice" />
            ) : (
              <p style={{ color: 'var(--color-neutral-300)', marginTop: '6px' }}>Tone: {draft.toneOfVoice || ctx?.toneOfVoice || '—'}</p>
            )}
            {ctx?.voiceTranscript ? (
              <div style={{
                marginTop: 12, padding: 12, background: 'var(--color-bg)',
                border: '1px solid var(--color-divider)', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5,
              }}>
                <div className="text-muted" style={{ fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Voice notes
                </div>
                {ctx.voiceTranscript}
              </div>
            ) : null}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Palette, type &amp; ICP</h3>
            {editing ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input className="input" value={draft.colors || ''} onChange={(e) => setDraft({ ...draft, colors: e.target.value })} placeholder="Colors #hex, #hex" />
                <input className="input" value={draft.fonts || ''} onChange={(e) => setDraft({ ...draft, fonts: e.target.value })} placeholder="Fonts" />
                <input className="input" value={draft.niche || ''} onChange={(e) => setDraft({ ...draft, niche: e.target.value })} placeholder="Niche" />
                <input className="input" value={draft.icp || ''} onChange={(e) => setDraft({ ...draft, icp: e.target.value })} placeholder="ICP" />
                <input className="input" style={{ gridColumn: '1 / -1' }} value={draft.positioningTags || ''} onChange={(e) => setDraft({ ...draft, positioningTags: e.target.value })} placeholder="Positioning tags, comma-separated" />
              </div>
            ) : (
              <>
                {colors.length ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {colors.map((c) => (
                      <div key={c} title={c} style={{ width: 36, height: 36, background: c, border: '1px solid var(--color-divider)' }} />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted" style={{ marginTop: 10, fontSize: 13 }}>No palette yet.</p>
                )}
                <p className="text-muted" style={{ marginTop: 10, fontSize: 13 }}>{draft.fonts || ctx?.fonts || '—'}</p>
                <p style={{ marginTop: 10, fontSize: 13 }}>
                  {(draft.niche || ctx?.niche) ? <><strong>Niche:</strong> {draft.niche || ctx?.niche}{' '}</> : null}
                  {(draft.icp || ctx?.icp) ? <><strong>ICP:</strong> {draft.icp || ctx?.icp}</> : null}
                </p>
              </>
            )}
          </div>

          {positioningText ? (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Positioning (from strategy)</h3>
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
  const ws = getActiveWorkspaceId();
  const planKey = `marqq_billing_plan_${ws}`;
  const [plan, setPlan] = useState(() => {
    try {
      return localStorage.getItem(planKey) || 'workspace';
    } catch {
      return 'workspace';
    }
  });
  const [stats, setStats] = useState({
    agents: 0,
    deployments: 0,
    files: 0,
    connectors: 0,
    approvals: 0,
    loading: true,
  });
  const [credits, setCredits] = useState(null);
  const [creditsLoading, setCreditsLoading] = useState(true);

  const refreshCredits = async () => {
    setCreditsLoading(true);
    try {
      const res = await fetch(`/api/credits?workspaceId=${encodeURIComponent(ws)}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) setCredits(json);
    } catch {
      /* ignore */
    } finally {
      setCreditsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dep, files, intRes, appRes] = await Promise.all([
          fetch(`/api/agents/deployments?workspaceId=${encodeURIComponent(ws)}`).then((r) => r.json()).catch(() => ({})),
          fetchKnowledgeFiles().catch(() => []),
          fetch(`/api/integrations?companyId=${encodeURIComponent(ws)}`).then((r) => r.json()).catch(() => ({})),
          fetch('/api/approvals').then((r) => r.json()).catch(() => ({})),
        ]);
        if (cancelled) return;
        const connectors = Array.isArray(intRes?.connectors) ? intRes.connectors : Array.isArray(intRes) ? intRes : [];
        const approvals = Array.isArray(appRes?.approvals) ? appRes.approvals : Array.isArray(appRes) ? appRes : [];
        const os = loadAgentOs();
        setStats({
          agents: os?.agent_roster?.agents?.length || 0,
          deployments: Array.isArray(dep.deployments) ? dep.deployments.length : 0,
          files: Array.isArray(files) ? files.length : 0,
          connectors: connectors.filter((c) => c.connected || c.status === 'ACTIVE').length,
          approvals: approvals.length,
          loading: false,
        });
      } catch {
        if (!cancelled) setStats((s) => ({ ...s, loading: false }));
      }
    })();
    refreshCredits().catch(() => {});
    return () => { cancelled = true; };
  }, [ws]);

  const plans = [
    { id: 'workspace', label: 'Workspace', note: '99,999 credits / mo · soft caps', soft: { agents: 12, deployments: 40, files: 50, connectors: 8 }, allotment: 99999 },
    { id: 'growth', label: 'Growth', note: '5,000 credits / mo', soft: { agents: 24, deployments: 120, files: 200, connectors: 16 }, allotment: 5000 },
    { id: 'scale', label: 'Scale', note: '20,000 credits / mo', soft: { agents: 48, deployments: 400, files: 500, connectors: 32 }, allotment: 20000 },
  ];
  const activePlan = plans.find((p) => p.id === plan) || plans[0];

  const choosePlan = async (id) => {
    setPlan(id);
    try {
      localStorage.setItem(planKey, id);
    } catch {
      /* ignore */
    }
    try {
      await fetch('/api/credits/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: ws, plan: id }),
      });
      await refreshCredits();
    } catch {
      /* ignore */
    }
  };

  const rows = [
    { key: 'agents', label: 'Agents in roster', value: stats.agents, cap: activePlan.soft.agents },
    { key: 'deployments', label: 'Section deployments', value: stats.deployments, cap: activePlan.soft.deployments },
    { key: 'files', label: 'Knowledge files', value: stats.files, cap: activePlan.soft.files },
    { key: 'connectors', label: 'Live connectors', value: stats.connectors, cap: activePlan.soft.connectors },
  ];

  const wallet = credits?.wallet;
  const remaining = wallet?.credits_remaining;
  const recent = Array.isArray(credits?.recent) ? credits.recent : [];
  const byProvider = credits?.byProvider || {};
  const tokens = credits?.tokens || {};

  const copyUsage = async () => {
    const lines = [
      `${company} · billing usage`,
      `Plan: ${activePlan.label}`,
      `Workspace: ${ws}`,
      `Credits remaining: ${remaining === -1 ? 'unlimited' : remaining ?? '—'}`,
      `Groq tokens: ${tokens.prompt || 0} in / ${tokens.completion || 0} out`,
      `North Star: ${northStarLabel()}`,
      ...rows.map((r) => `- ${r.label}: ${r.value} / soft ${r.cap}`),
      `- Approvals logged: ${stats.approvals}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Billing &amp; Usage</h1>
          <p className="text-muted" style={{ marginTop: 6 }}>
            Credits meter Groq tokens and Fal AI costs (1 credit = $0.001). Estimate → reserve → settle on actual usage.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => refreshCredits()}>Refresh credits</button>
          <button type="button" className="btn btn-secondary" onClick={copyUsage}>Copy usage</button>
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('integrations')}>
            Connectors
          </button>
        </div>
      </div>

      <div className="card" data-testid="credits-wallet">
        <div className="text-muted">Credit balance</div>
        {creditsLoading && !wallet ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text)', marginTop: 4 }}>
              {remaining === -1 ? 'Unlimited' : `${Number(remaining || 0).toLocaleString()} credits`}
            </div>
            <div className="card-meta" style={{ marginTop: 6 }}>
              Plan {wallet?.plan || activePlan.id}
              {wallet?.credits_total != null && wallet.credits_total !== -1
                ? ` · ${Number(wallet.credits_total).toLocaleString()} / month`
                : ''}
              {wallet?.credits_reserved ? ` · ${wallet.credits_reserved} reserved` : ''}
              {wallet?.lifetime_usd != null ? ` · $${Number(wallet.lifetime_usd).toFixed(4)} lifetime API` : ''}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', fontSize: 13 }}>
              <span>Groq: {byProvider.groq || 0} cr · {tokens.total || 0} tokens</span>
              <span>Fal: {byProvider.fal || 0} cr</span>
              <span>Agents: {byProvider.internal || 0} cr</span>
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {plans.map((p) => (
          <button
            key={p.id}
            type="button"
            className="card"
            onClick={() => choosePlan(p.id)}
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              borderColor: plan === p.id ? 'var(--color-accent)' : undefined,
              color: 'var(--color-text)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong>{p.label}</strong>
              {plan === p.id ? <span className="tag tag-accent">Selected</span> : null}
            </div>
            <p className="text-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>{p.note}</p>
          </button>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Recent deductions</h3>
        {!recent.length ? (
          <p className="card-body">No metered calls yet — run Market research, Creative, or an agent deployment.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recent.slice(0, 12).map((e) => (
              <div key={e.id} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>
                  <strong>{e.feature}</strong> · {e.provider}
                  {e.tokens?.total ? ` · ${e.tokens.total} tok` : ''}
                  <span className="text-muted"> · est {e.estimatedCredits} → act {e.actualCredits}</span>
                </span>
                <span className="text-muted">{e.at ? new Date(e.at).toLocaleString() : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Activity vs soft caps</h3>
        {stats.loading ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
            {rows.map((u) => {
              const pct = Math.min(100, Math.round((u.value / Math.max(u.cap, 1)) * 100));
              return (
                <div key={u.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span>{u.label}</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{u.value} / {u.cap}</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--color-bg)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-accent)' }} />
                  </div>
                </div>
              );
            })}
            <div className="text-muted" style={{ fontSize: 12 }}>Approvals logged: {stats.approvals}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkflowsView({ setActiveScreen }) {
  const doc = loadStrategyDoc();
  const ops = (doc?.sections || []).find((s) => s.id === 'operations_execution');
  const ws = getActiveWorkspaceId();
  const [deployments, setDeployments] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => {
    const [dep, auto, app] = await Promise.all([
      fetch(`/api/agents/deployments?workspaceId=${encodeURIComponent(ws)}`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/automations/scheduled?companyId=${encodeURIComponent(ws)}`).then((r) => r.json()).catch(() => ({})),
      fetch('/api/approvals').then((r) => r.json()).catch(() => ({})),
    ]);
    setDeployments(Array.isArray(dep.deployments) ? dep.deployments : []);
    setAutomations(Array.isArray(auto.automations) ? auto.automations : []);
    const approvals = Array.isArray(app.approvals) ? app.approvals : [];
    const decided = app.approvedActions || {};
    setPendingApprovals(approvals.filter((a) => !decided[a.id] && a.status !== 'approved' && a.status !== 'rejected').length);
  };

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const runTick = async () => {
    setBusy('tick');
    setError('');
    setMsg('');
    try {
      const res = await fetch('/api/agents/scheduler/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true, workspaceId: ws }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Tick failed');
      setMsg(`Scheduler ran · ${json.ran?.length ?? 0} deployment(s)`);
      await refresh();
    } catch (err) {
      setError(err.message || 'Tick failed');
    } finally {
      setBusy('');
    }
  };

  const toggleAuto = async (a) => {
    const id = a.automation_id || a.id;
    setBusy(id);
    setError('');
    try {
      const res = await fetch(`/api/automations/scheduled/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: ws, active: !a.active }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Update failed');
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not pause/resume');
    } finally {
      setBusy('');
    }
  };

  const runAuto = async (a) => {
    const id = a.automation_id || a.id;
    setBusy(`run-${id}`);
    setError('');
    setMsg('');
    try {
      const res = await fetch(`/api/automations/scheduled/${encodeURIComponent(id)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: ws }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Run failed');
      setMsg(`Automation queued · check Approvals for drafts`);
      await refresh();
    } catch (err) {
      setError(err.message || 'Run failed');
    } finally {
      setBusy('');
    }
  };

  const createDeployment = async () => {
    setBusy('create');
    setError('');
    try {
      const res = await fetch('/api/agents/deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: ws,
          companyId: ws,
          agentName: 'neel',
          agentDisplayName: 'Neel',
          sectionId: 'operations_execution',
          sectionTitle: 'Manual workflow run',
          openScreen: 'orchestration',
          scheduleMode: 'once',
          deliveryMode: 'draft',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Create failed');
      setMsg('Deployment created · run scheduler to execute');
      await refresh();
    } catch (err) {
      setError(err.message || 'Create failed');
    } finally {
      setBusy('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <JourneyBar screenId="workflows" setActiveScreen={setActiveScreen} title="Workflows & Automation" />
          <p className="text-muted" style={{ marginTop: 8 }}>
            Pause, resume, and run automations. Due rows enqueue agent drafts → Approvals.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={createDeployment}>
            New deployment
          </button>
          <button type="button" className="btn btn-primary" disabled={Boolean(busy)} onClick={runTick}>
            {busy === 'tick' ? 'Running…' : 'Run scheduler now'}
          </button>
        </div>
      </div>

      {msg ? <div className="card">{msg}</div> : null}
      {error ? <div className="card" style={{ color: 'var(--color-accent)' }}>{error}</div> : null}

      {pendingApprovals > 0 ? (
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <strong>{pendingApprovals} approval(s) pending</strong>
            <div className="text-muted" style={{ fontSize: 13 }}>Draft agent outputs waiting for human sign-off.</div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('approvals')}>
            Open Approvals
          </button>
        </div>
      ) : null}

      {ops?.content || ops?.summary ? (
        <div className="card">
          <div className="card-kicker">Ops runbook</div>
          <p className="card-body" style={{ margin: 0 }}>
            {String(ops.summary || ops.content || '').slice(0, 220)}…
          </p>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {!automations.length ? (
          <div className="card">
            <p className="card-body" style={{ margin: 0 }}>No scheduled automations yet — lock GTM strategy to seed them.</p>
          </div>
        ) : (
          automations.map((a) => (
            <div key={a.automation_id || a.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{a.automation_id || a.id}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>
                  <strong>When:</strong> {a.cron || 'scheduled'} → <strong>Then:</strong> Agent {a.params?.agent || 'neel'}
                  {a.next_run ? ` · next ${new Date(a.next_run).toLocaleString()}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 'none' }}>
                <span className="tag tag-outline">{a.active ? 'Active' : 'Paused'}</span>
                <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => toggleAuto(a)}>
                  {a.active ? 'Pause' : 'Resume'}
                </button>
                <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => runAuto(a)}>
                  Run now
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Agent deployments ({deployments.length})</h3>
        {!deployments.length ? (
          <p className="card-body">Lock a GTM strategy or create a manual deployment.</p>
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
  const ws = getActiveWorkspaceId();
  const [os, setOs] = useState(osLocal);
  const [deployments, setDeployments] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [ticking, setTicking] = useState(false);
  const [activating, setActivating] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [modeBusy, setModeBusy] = useState(false);

  const refresh = async () => {
    const [osRes, dep, app] = await Promise.all([
      fetch(`/api/agent-os?workspaceId=${encodeURIComponent(ws)}`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/agents/deployments?workspaceId=${encodeURIComponent(ws)}`).then((r) => r.json()).catch(() => ({})),
      fetch('/api/approvals').then((r) => r.json()).catch(() => ({})),
    ]);
    if (osRes?.agentOs) {
      saveAgentOs(osRes.agentOs);
      setOs(osRes.agentOs);
    }
    setDeployments(Array.isArray(dep.deployments) ? dep.deployments : []);
    const approvals = Array.isArray(app.approvals) ? app.approvals : [];
    const decided = app.approvedActions || {};
    setPendingApprovals(approvals.filter((a) => !decided[a.id] && a.status !== 'approved' && a.status !== 'rejected').length);
  };

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const loop = os?.control_loop;
  const roster = os?.agent_roster;
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
  const hasOs = Boolean(roster?.agents?.length);
  const executionMode =
    os?.execution_mode === 'autonomous' || os?.executionMode === 'autonomous'
      ? 'autonomous'
      : 'human_gated';

  const setExecutionMode = async (nextMode) => {
    setModeBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await fetch('/api/agent-os/execution-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: ws, executionMode: nextMode }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update mode');
      if (json.agentOs) {
        saveAgentOs(json.agentOs);
        setOs(json.agentOs);
      }
      await refresh();
      setMsg(
        nextMode === 'autonomous'
          ? `Autonomous on${json.autoApproved ? ` · cleared ${json.autoApproved} pending approval(s)` : ''}.`
          : 'Human-gated on — new runs wait in Approvals.'
      );
    } catch (err) {
      setError(err.message || 'Mode update failed');
    } finally {
      setModeBusy(false);
    }
  };

  const runTick = async () => {
    setTicking(true);
    setError('');
    setMsg('');
    try {
      await fetch('/api/agents/scheduler/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true, workspaceId: ws }),
      });
      await refresh();
      setMsg(
        executionMode === 'autonomous'
          ? 'Tick complete — drafts auto-cleared (open studios).'
          : 'Tick complete — new drafts land in Approvals.'
      );
    } catch (err) {
      setError(err.message || 'Tick failed');
    } finally {
      setTicking(false);
    }
  };

  const activate = async () => {
    setActivating(true);
    setError('');
    setMsg('');
    try {
      let strategy = null;
      try {
        const raw = sessionStorage.getItem('marqq_gtm_strategy');
        if (raw) strategy = JSON.parse(raw);
      } catch {
        /* ignore */
      }
      const res = await fetch('/api/strategy/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: ws,
          companyId: ws,
          strategy,
          agentOs: os || loadAgentOs(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Activate failed');
      if (json.agentOs) {
        saveAgentOs(json.agentOs);
        setOs(json.agentOs);
      }
      setMsg('Strategy activated — deployments + automations seeded.');
      await refresh();
    } catch (err) {
      setError(err.message || 'Activate failed');
    } finally {
      setActivating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="orchestration" setActiveScreen={setActiveScreen} title="Orchestration" />
      <p className="text-muted" style={{ marginTop: -8 }}>
        Control plane for {northStarLabel()}. Status: <strong>{loop?.status || 'pending'}</strong>
        {last?.at ? ` · last run ${new Date(last.at).toLocaleString()} (${last.agentName})` : ''}
      </p>

      {msg ? <div className="card">{msg}</div> : null}
      {error ? <div className="card" style={{ color: 'var(--color-accent)' }}>{error}</div> : null}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h3 style={{ margin: 0 }}>Execution mode</h3>
            <p className="card-body" style={{ marginTop: 8, marginBottom: 12 }}>
              {due.length} active/pending deployments · {pendingApprovals} approval(s) waiting · still draft-safe (no live spend).
            </p>
            <ExecutionModeToggle
              value={executionMode}
              disabled={modeBusy}
              onChange={setExecutionMode}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!hasOs || !deployments.length ? (
              <button type="button" className="btn btn-secondary" disabled={activating} onClick={activate}>
                {activating ? 'Activating…' : 'Activate strategy'}
              </button>
            ) : null}
            <button type="button" className="btn btn-primary" disabled={ticking} onClick={runTick}>
              {ticking ? 'Running…' : 'Run due deployments now'}
            </button>
          </div>
        </div>
      </div>

      {pendingApprovals > 0 && executionMode === 'human_gated' ? (
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <strong>{pendingApprovals} draft(s) need approval</strong>
            <div className="text-muted" style={{ fontSize: 13 }}>Approve to unlock studio go-live paths — or switch to Autonomous to clear the gate.</div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('approvals')}>
            Approvals
          </button>
        </div>
      ) : null}

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

      <GtmControlLoopPanel onOsChange={(next) => setOs(next)} />

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
            <p className="card-body">No agent OS yet — generate strategy, then Activate.</p>
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
  const company = getCompanyName();
  const section = getStrategySection('pricing_monetization');
  const packages = playsFromSection('pricing_monetization', 'Package / offer');
  const financial = getStrategySection('financial_plan');
  const body = sectionPlainText(section);

  const handoffOffer = (screen, mission) => {
    stashJourneyHandoff({
      from: 'pricing',
      toScreen: screen,
      agentId: 'tara',
      mission: mission || `Publish pricing offer for ${company}`,
    });
    setActiveScreen && setActiveScreen(screen);
  };

  return (
    <StrategyRoom screenId="pricing" title="Pricing & Offers" setActiveScreen={setActiveScreen} planTarget="company_intel_pricing">
      {!packages.length && !body ? (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>No pricing section yet</h4>
          <p className="card-body">Lock <strong>pricing_monetization</strong> in GTM Wizard so Tara can package trials and pilots.</p>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('gtmwizard')}>
            Open GTM Wizard
          </button>
        </div>
      ) : (
        <>
          {body ? (
            <div className="card">
              <h4 style={{ marginTop: 0 }}>Monetization brief</h4>
              <p className="card-body" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                {body.slice(0, 900)}{body.length > 900 ? '…' : ''}
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 12 }}
                onClick={() =>
                  openSectionScreen('pricing_monetization', setActiveScreen, {
                    sectionTitle: section?.title || 'Pricing',
                    summary: body,
                  })
                }
              >
                Refine in Ask Marqq
              </button>
            </div>
          ) : null}

          <div className="card">
            <h4 style={{ marginTop: 0 }}>Packages &amp; offers ({packages.length})</h4>
            {!packages.length ? (
              <p className="card-body">Section locked but no bullet packages yet — use Ask Marqq to expand tiers.</p>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr><th>Offer / tier</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {packages.map((p, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 700, color: 'var(--color-text)' }}>{p.detail || p.name}</td>
                        <td><span className="tag tag-outline">{p.status}</span></td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: 12 }}
                            onClick={() =>
                              handoffOffer(
                                'landingpages',
                                `Build landing page for offer: ${String(p.detail || p.name).slice(0, 120)}`
                              )
                            }
                          >
                            → Landing
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {financial ? (
            <div className="card">
              <h4 style={{ marginTop: 0 }}>Financial plan (linked)</h4>
              <p className="card-body" style={{ margin: 0 }}>
                {sectionPlainText(financial).slice(0, 400)}
                {sectionPlainText(financial).length > 400 ? '…' : ''}
              </p>
            </div>
          ) : null}
        </>
      )}

      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="text-muted" style={{ fontSize: 13, marginRight: 8 }}>Tara publish path:</span>
        <button type="button" className="btn btn-secondary" onClick={() => handoffOffer('landingpages', `Pricing LP for ${company}`)}>
          Landing Pages
        </button>
        <button type="button" className="btn btn-primary" onClick={() => handoffOffer('leadmagnets', `Gated offer / pricing magnet for ${company}`)}>
          Lead Magnets
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setActiveScreen && setActiveScreen('experiments')}>
          Price tests
        </button>
      </div>
    </StrategyRoom>
  );
}

export function SeoView({ setActiveScreen }) {
  const company = getCompanyName();
  const plays = playsFromSection('distribution_channels', 'SEO / organic').slice(0, 8);
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/analytics/dashboard?period=30d&companyId=${encodeURIComponent(getActiveWorkspaceId())}`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setDash(json); })
      .catch(() => { if (!cancelled) setDash(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

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
      mission: `Start SEO blog research for ${company} in Content Studio`,
    });
    setActiveScreen && setActiveScreen('content');
  };

  const queries = Array.isArray(dash?.topQueries) ? dash.topQueries.slice(0, 8) : [];
  const pages = Array.isArray(dash?.topPages) ? dash.topPages.slice(0, 5) : [];
  const organicKpis = Array.isArray(dash?.kpis)
    ? dash.kpis.filter((k) => /click|impression|organic|search|position/i.test(String(k.label || ''))).slice(0, 4)
    : [];

  return (
    <StrategyRoom screenId="seo" title="SEO & Search Intelligence" setActiveScreen={setActiveScreen}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h4 style={{ marginTop: 0 }}>Maya · Organic / LLMO</h4>
        <p className="card-body" style={{ margin: 0 }}>
          Rank + AI-answer visibility for {company}. SEO blogs run in Content Studio (Maya research → Riya draft).
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={startSeoBlog}>
            Start SEO blog in Content
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('analytics')}>
            Full Scorecard
          </button>
          {dash?.connected === false ? (
            <button type="button" className="btn btn-ghost" onClick={() => setActiveScreen && setActiveScreen('integrations')}>
              Connect GSC
            </button>
          ) : null}
        </div>
      </div>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>Search Console (30d)</h4>
        {loading ? (
          <p className="text-muted">Loading GSC…</p>
        ) : (
          <>
            {organicKpis.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                {organicKpis.map((k, i) => (
                  <div key={i} style={{ padding: 10, border: '1px solid var(--color-divider)', background: 'var(--color-bg)' }}>
                    <div className="text-muted" style={{ fontSize: 11 }}>{k.label}</div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{k.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="card-body">
                {dash?.connected
                  ? 'No organic KPIs in this period.'
                  : 'GSC not connected — open Integrations to link Search Console.'}
              </p>
            )}
            {queries.length ? (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr><th>Top query</th><th>Clicks</th><th>Impr.</th><th>Pos.</th></tr>
                  </thead>
                  <tbody>
                    {queries.map((q, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 700 }}>{q.query}</td>
                        <td>{q.clicks ?? '—'}</td>
                        <td>{q.impressions ?? '—'}</td>
                        <td>{q.position != null ? Number(q.position).toFixed(1) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {pages.length ? (
              <div style={{ marginTop: 14 }}>
                <div className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>Top pages</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {pages.map((p, i) => (
                    <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                      {p.path} · {p.clicks ?? p.sessions ?? 0} clicks
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {dash?.dataNote ? <p className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>{dash.dataNote}</p> : null}
          </>
        )}
      </div>

      {plays.length ? (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Distribution plays (from strategy)</h4>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {plays.map((p, i) => (
              <li key={i} style={{ fontSize: 13, marginBottom: 6 }}>{p.detail || p.name}</li>
            ))}
          </ul>
        </div>
      ) : null}
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
  const company = getCompanyName();
  const audience = getAudienceProfile();
  const brief = sectionBriefForScreen('customer360');
  const plan = planAgentTask({ screenId: 'customer360', target: 'user_engagement' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/customer360?companyId=${encodeURIComponent(getActiveWorkspaceId())}&limit=75`
      );
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || 'Failed to load Customer 360');
      setData(json);
      if (!selectedId && json.accounts?.[0]) setSelectedId(json.accounts[0].id || json.accounts[0].email);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accounts = (data?.accounts || []).filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'at_risk') return a.at_risk;
    if (filter === 'replied') return a.status === 'replied';
    if (filter === 'sent') return a.status === 'sent';
    if (filter === 'fetched') return a.status === 'fetched';
    return true;
  });

  const selected =
    accounts.find((a) => (a.id || a.email) === selectedId) ||
    data?.accounts?.find((a) => (a.id || a.email) === selectedId) ||
    accounts[0] ||
    null;

  const summary = data?.summary || {};
  const destLabel =
    data?.destination?.destination === 'hubspot'
      ? 'HubSpot'
      : data?.destination?.destination === 'salesforce'
        ? 'Salesforce'
        : data?.destination?.destination === 'google_sheets'
          ? 'Google Sheets'
          : 'Not connected';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <JourneyBar screenId="customer360" setActiveScreen={setActiveScreen} title="Customer 360" />

      <div className="card">
        <div className="card-kicker">Agents · Tara (CS) · Kiran (lifecycle)</div>
        <div style={{ fontWeight: 700 }}>
          {brief.agentId === 'tara' ? 'Tara' : plan.agentDisplayName || 'Tara'} · Unified account view for {company}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
          Skills: churn-prevention, onboarding-cro, email-sequence
          {brief.metric ? ` · Metric: ${brief.metric}` : ''}
          {audience.icp ? ` · ICP: ${audience.icp}` : ''}
        </div>
        {brief.content ? (
          <p className="card-body" style={{ marginTop: 10 }}>
            {brief.content.slice(0, 420)}
            {brief.content.length > 420 ? '…' : ''}
          </p>
        ) : (
          <p className="card-body" style={{ marginTop: 10 }}>
            Live accounts from CRM / Google Sheets + Outreach. Lock customer_success in GTM for CS playbook context.
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
        {[
          { label: 'Accounts', value: summary.total ?? '—' },
          { label: 'Replied', value: summary.replied ?? '—' },
          { label: 'In-flight', value: (summary.sent || 0) + (summary.drafted || 0) },
          { label: 'At risk', value: summary.at_risk ?? '—' },
          { label: 'CRM', value: destLabel },
        ].map((k) => (
          <div key={k.label} className="card" style={{ padding: '12px 14px' }}>
            <div className="text-muted" style={{ fontSize: 11 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {data?.sheets?.url ? (
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div className="card-kicker">Lead store</div>
            <div style={{ fontWeight: 600 }}>
              {destLabel}
              {data.sheets.worksheet ? ` · ${data.sheets.worksheet}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="btn btn-secondary" href={data.sheets.url} target="_blank" rel="noreferrer">
              Open sheet
            </a>
            <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('outreach')}>
              Outreach
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div className="card-kicker">Lead store</div>
            <div style={{ fontWeight: 600 }}>{destLabel}</div>
            <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
              Connect Google Sheets under Integrations for CRM fallback leads.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('integrations')}>
              Integrations
            </button>
          </div>
        </div>
      )}

      {error ? (
        <div className="card" style={{ borderColor: 'var(--color-danger, #c44)' }}>
          <p className="card-body" style={{ margin: 0 }}>{error}</p>
          <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} onClick={load}>
            Retry
          </button>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div className="card" style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <h4 style={{ margin: 0 }}>Accounts</h4>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['all', 'replied', 'sent', 'fetched', 'at_risk'].map((f) => (
                <button
                  key={f}
                  type="button"
                  className={filter === f ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => setFilter(f)}
                >
                  {f === 'at_risk' ? 'At risk' : f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {loading && !data ? (
            <p className="text-muted">Loading accounts from Sheets + Outreach…</p>
          ) : !accounts.length ? (
            <div>
              <p className="card-body">No accounts yet. Fetch Apollo prospects or sync leads to Google Sheets.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('crm')}>
                  CRM Sync
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('outreach')}>
                  Outreach Studio
                </button>
              </div>
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Company</th>
                    <th>Status</th>
                    <th>Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => {
                    const key = a.id || a.email;
                    const active = selected && (selected.id || selected.email) === key;
                    return (
                      <tr
                        key={key}
                        onClick={() => setSelectedId(key)}
                        style={{ cursor: 'pointer', background: active ? 'var(--color-surface-2, rgba(0,0,0,0.04))' : undefined }}
                      >
                        <td style={{ fontWeight: 700 }}>
                          {a.full_name}
                          <div className="text-muted" style={{ fontSize: 11, fontWeight: 400 }}>{a.email || a.title}</div>
                        </td>
                        <td>{a.company || '—'}</td>
                        <td><span className="tag tag-outline">{a.status}</span></td>
                        <td className="text-muted" style={{ fontSize: 12 }}>
                          {a.at_risk ? a.risk_reason : a.opportunity?.replace(/_/g, ' ') || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <div className="card-kicker">Account deep-dive</div>
            {!selected ? (
              <p className="card-body">Select an account</p>
            ) : (
              <>
                <h3 style={{ margin: '4px 0 0' }}>{selected.full_name}</h3>
                <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  {[selected.title, selected.company].filter(Boolean).join(' · ') || '—'}
                </p>
                <div style={{ marginTop: 10, display: 'grid', gap: 6, fontSize: 13 }}>
                  <div><strong>Email</strong> · {selected.email || '—'}</div>
                  <div><strong>Phone</strong> · {selected.phone || '—'}</div>
                  <div><strong>Status</strong> · {selected.status}{selected.at_risk ? ` · ${selected.risk_reason}` : ''}</div>
                  <div><strong>Channel</strong> · {selected.channel || 'email'}</div>
                  <div><strong>Sources</strong> · {(selected.sources || [selected.origin]).join(', ')}</div>
                  {selected.linkedin_url ? (
                    <div>
                      <a href={selected.linkedin_url} target="_blank" rel="noreferrer">LinkedIn</a>
                    </div>
                  ) : null}
                  {selected.subject ? <div><strong>Subject</strong> · {selected.subject}</div> : null}
                  {selected.next_action ? <div><strong>Next</strong> · {selected.next_action}</div> : null}
                </div>
                {selected.timeline?.length ? (
                  <div style={{ marginTop: 12 }}>
                    <div className="card-kicker">Timeline</div>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
                      {selected.timeline.slice().reverse().map((t, i) => (
                        <li key={i}>
                          <span className="text-muted">{String(t.at || '').slice(0, 10)}</span> · {t.event}
                          {t.detail ? ` — ${t.detail}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('outreach')}>
                    Open in Outreach
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('crm')}>
                    CRM Sync
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-kicker">Segments</div>
            {(data?.segments || []).map((s) => (
              <div key={s.id} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border, #eee)' }}>
                <div style={{ fontWeight: 700 }}>{s.name} · {s.count}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>{s.signal}</div>
                <div style={{ fontSize: 12, marginTop: 2 }}>{s.next}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-kicker">Next actions</div>
            {(data?.next_actions || []).length ? (
              (data.next_actions || []).map((a, i) => (
                <div key={i} style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700 }}>{a.title}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{a.why}</div>
                  {a.screen ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ marginTop: 6, padding: '4px 10px', fontSize: 12 }}
                      onClick={() => setActiveScreen && setActiveScreen(a.screen)}
                    >
                      Go
                    </button>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="card-body">No actions yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
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
  return <MarketingCalendarView setActiveScreen={setActiveScreen} />;
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
  const [c360, setC360] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

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

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const ws = getActiveWorkspaceId();
      const [dest, live] = await Promise.all([
        fetch(`/api/crm/destination?companyId=${encodeURIComponent(ws)}`).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/customer360?companyId=${encodeURIComponent(ws)}&limit=75`).then((r) => r.json()).catch(() => ({})),
      ]);
      setCrmDest(dest);
      setC360(live);
    } catch (err) {
      setError(err.message || 'Could not load CRM');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const syncNow = async () => {
    setSyncing(true);
    setMsg('');
    setError('');
    try {
      const accounts = Array.isArray(c360?.accounts) ? c360.accounts : [];
      const prospects = (accounts.length
        ? accounts
        : segments.map((s, i) => ({
            id: `seg_${i}`,
            name: s.name,
            company: audience.companyName || getCompanyName(),
            title: s.fit,
            email: '',
            status: 'fetched',
          }))
      ).map((a) => ({
        id: a.id || a.email || `p_${Math.random().toString(36).slice(2, 8)}`,
        name: a.name || a.company || 'Lead',
        company: a.company || a.name || audience.companyName || getCompanyName(),
        title: a.title || a.persona || '',
        email: a.email || '',
        linkedin_url: a.linkedin_url || a.linkedin || '',
        domain: a.domain || '',
      }));
      if (!prospects.length) throw new Error('No accounts or segments to sync');
      const res = await fetch('/api/crm/sync-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: getActiveWorkspaceId(),
          companyName: audience.companyName || getCompanyName(),
          prospects,
          status: 'fetched',
          source: 'crm_sync_ui',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.error || `Sync failed (${res.status})`);
      setMsg(`Synced ${prospects.length} lead(s) → ${json.destination || crmDest?.destination || 'CRM'}.`);
      await refresh();
    } catch (err) {
      setError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const destLabel =
    crmDest?.destination === 'hubspot'
      ? 'HubSpot'
      : crmDest?.destination === 'salesforce'
        ? 'Salesforce'
        : crmDest?.destination === 'google_sheets'
          ? 'Google Sheets (CRM fallback)'
          : 'None — connect HubSpot, Salesforce, or Google Sheets';

  const accounts = Array.isArray(c360?.accounts) ? c360.accounts.slice(0, 12) : [];
  const summary = c360?.summary || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="crm" setActiveScreen={setActiveScreen} title="CRM Sync & Account Priorities" />
      <p className="text-muted" style={{ margin: 0 }}>
        Live leads + priority segments for {audience.companyName}. Sync pushes accounts to your CRM destination.
      </p>

      {msg ? <div className="card">{msg}</div> : null}
      {error ? <div className="card" style={{ color: 'var(--color-accent)' }}>{error}</div> : null}

      <div className="card" style={{ borderLeft: '3px solid var(--color-accent)' }}>
        <div className="card-kicker">Lead destination</div>
        <h3 style={{ margin: '4px 0 0' }}>{destLabel}</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
          {crmDest?.fallback
            ? 'No HubSpot/Salesforce connected — leads sync to Google Sheets by default.'
            : crmDest?.destination
              ? 'Outreach fetch / send / reply syncs leads here. Use Sync now for a manual push.'
              : 'Connect Google Sheets under Integrations to use it as the default CRM.'}
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
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('customer360')}>
            Customer 360
          </button>
          <button type="button" className="btn btn-primary" disabled={syncing || loading} onClick={syncNow}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setActiveScreen && setActiveScreen('outreach')}>
            Outreach
          </button>
        </div>
      </div>

      {summary ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: 'Accounts', value: summary.total },
            { label: 'Replied', value: summary.replied },
            { label: 'In outreach', value: (summary.sent || 0) + (summary.drafted || 0) },
            { label: 'At risk', value: summary.at_risk },
          ].map((k) => (
            <div key={k.label} className="card" style={{ padding: 12 }}>
              <div className="text-muted" style={{ fontSize: 11 }}>{k.label}</div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>{k.value ?? 0}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Live accounts</h3>
        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : !accounts.length ? (
          <p className="card-body">No CRM accounts yet — fetch leads in Outreach, then Sync now.</p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Account</th><th>Status</th><th>Source</th><th>Risk</th></tr>
              </thead>
              <tbody>
                {accounts.map((a, i) => (
                  <tr key={a.id || i}>
                    <td style={{ fontWeight: 700 }}>{a.name || a.company || a.email || a.id}</td>
                    <td><span className="tag tag-outline">{a.status || '—'}</span></td>
                    <td>{a.source || a.channel || '—'}</td>
                    <td>{a.at_risk ? <span className="tag tag-accent">At risk</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {segments.length ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Strategy segments</h3>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Segment / play</th><th>Type</th><th>Signal</th><th>Stage</th></tr>
              </thead>
              <tbody>
                {segments.map((a, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: 'var(--color-text)' }}>{a.name}</td>
                    <td><span className="tag tag-accent">{a.fit}</span></td>
                    <td>{a.intent}</td>
                    <td><span className="tag tag-outline">{a.stage}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
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

export function VoicebotView({ setActiveScreen }) {
  const company = getCompanyName();
  const icp = wizardAnswerLabel('icp') || getAudienceProfile().icp || 'your ICP';
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [voiceNotes, setVoiceNotes] = useState([]);
  const [fit, setFit] = useState(null);

  const qualifierScript = [
    `Thanks for reaching out to ${company} — quick fit check.`,
    `Who are you and what team are you on?`,
    `Does this match our ICP: ${icp}?`,
    `What problem are you trying to solve in the next 90 days?`,
    `If it's a fit, I'll book a short demo.`,
  ].join('\n');

  const refreshNotes = async () => {
    const files = await fetchKnowledgeFiles().catch(() => []);
    setVoiceNotes((Array.isArray(files) ? files : []).filter((f) => f.category === 'voice_note').slice(0, 8));
  };

  useEffect(() => {
    refreshNotes();
  }, []);

  const scoreFit = (text) => {
    const hay = String(text || '').toLowerCase();
    const needles = String(icp)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3)
      .slice(0, 12);
    const hits = needles.filter((w) => hay.includes(w));
    const score = needles.length ? Math.round((hits.length / needles.length) * 100) : hay.length > 40 ? 40 : 10;
    setFit({
      score,
      hits,
      label: score >= 55 ? 'Likely fit' : score >= 30 ? 'Needs clarifying' : 'Weak fit',
    });
  };

  const fileToBase64 = async (blob) => {
    const ab = await blob.arrayBuffer();
    let binary = '';
    new Uint8Array(ab).forEach((b) => { binary += String.fromCharCode(b); });
    return window.btoa(binary);
  };

  const startRecording = async () => {
    if (!('MediaRecorder' in window)) {
      setError('Voice recording not supported in this browser.');
      return;
    }
    setError('');
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => stream.getTracks().forEach((t) => t.stop());
      mr.start(250);
      setRecording(true);
    } catch (err) {
      setError(err.message || 'Microphone permission denied');
    }
  };

  const stopRecording = async () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    setRecording(false);
    setWorking(true);
    setError('');
    try {
      await new Promise((r) => {
        mr.addEventListener('stop', r, { once: true });
        mr.stop();
      });
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
      if (!blob.size) throw new Error('No audio captured');
      const base64 = await fileToBase64(blob);
      const res = await fetch('/api/voicebot/stt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: getActiveWorkspaceId(),
          audioBase64: base64,
          mimeType: blob.type || 'audio/webm',
          language: 'en',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Transcription failed');
      const text = String(json.transcript || '').trim();
      if (!text) throw new Error('No speech detected — try speaking longer.');
      setTranscript(text);
      scoreFit(text);
      await refreshNotes();
    } catch (err) {
      setError(err.message || 'Voice capture failed');
    } finally {
      setWorking(false);
      mediaRecorderRef.current = null;
      chunksRef.current = [];
    }
  };

  const handoffVideo = () => {
    stashJourneyHandoff({
      from: 'voicebot',
      toScreen: 'creative',
      agentId: 'riya',
      mission: `Draft ${company} explainer video from positioning — ICP: ${icp}`,
    });
    setActiveScreen && setActiveScreen('creative');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Voice &amp; Video Bot Manager</h1>
          <p className="text-muted" style={{ marginTop: 6 }}>
            Inbound qualifier for {company} against ICP · live STT saves to Knowledge Base.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('knowledge')}>
            Knowledge
          </button>
          <button type="button" className="btn btn-primary" onClick={handoffVideo}>
            Explainer in Creative
          </button>
        </div>
      </div>

      {error ? <div className="card" style={{ color: 'var(--color-accent)' }}>{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        <div className="card">
          <span className="tag tag-accent">Voice Bot</span>
          <h3 style={{ margin: '8px 0 4px', color: 'var(--color-text)' }}>Inbound Qualifier</h3>
          <p className="text-muted" style={{ fontSize: '13px' }}>
            Scripted against ICP: {icp}
          </p>
          <pre style={{
            marginTop: 12,
            padding: 12,
            background: 'var(--color-bg)',
            border: '1px solid var(--color-divider)',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
          }}
          >
            {qualifierScript}
          </pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={working}
              onClick={() => (recording ? stopRecording() : startRecording())}
            >
              {working ? 'Transcribing…' : recording ? 'Stop & transcribe' : 'Record prospect reply'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                try {
                  navigator.clipboard.writeText(qualifierScript);
                } catch {
                  /* ignore */
                }
              }}
            >
              Copy script
            </button>
          </div>
        </div>

        <div className="card">
          <span className="tag tag-outline">Video Bot</span>
          <h3 style={{ margin: '8px 0 4px', color: 'var(--color-text)' }}>{company} Explainer</h3>
          <p className="text-muted" style={{ fontSize: '13px' }}>
            Draft video explainer from positioning / offer — Creative Studio owns HeyGen / image assets.
          </p>
          <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={handoffVideo}>
            Open Creative Studio
          </button>
        </div>
      </div>

      {transcript ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Latest transcript</h3>
          <p className="card-body" style={{ whiteSpace: 'pre-wrap' }}>{transcript}</p>
          {fit ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="tag tag-accent">{fit.label} · {fit.score}%</span>
              {fit.hits?.length ? (
                <span className="text-muted" style={{ fontSize: 12 }}>Matched: {fit.hits.join(', ')}</span>
              ) : null}
              <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('outreach')}>
                Send to Outreach
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Saved voice notes</h3>
        {!voiceNotes.length ? (
          <p className="text-muted">No voice notes yet — record above or capture in Ask Marqq / onboarding.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {voiceNotes.map((v) => (
              <li key={v.id || v.name} style={{ fontSize: 13, marginBottom: 8 }}>
                <strong>{v.name}</strong>
                {v.transcript ? (
                  <div className="text-muted" style={{ marginTop: 2 }}>{String(v.transcript).slice(0, 160)}{String(v.transcript).length > 160 ? '…' : ''}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ExperimentsView({ setActiveScreen }) {
  const company = getCompanyName();
  const storageKey = `marqq_experiments_${getActiveWorkspaceId()}`;
  const seedPlays = [
    ...playsFromSection('marketing_strategy', 'Marketing test'),
    ...playsFromSection('pricing_monetization', 'Pricing test'),
    ...playsFromSection('positioning_messaging', 'Messaging test'),
  ].slice(0, 10);

  const loadStored = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const [experiments, setExperiments] = useState(() => {
    const stored = loadStored();
    if (Array.isArray(stored) && stored.length) return stored;
    return seedPlays.map((p, i) => ({
      id: `exp_${i}_${Date.now().toString(36)}`,
      name: p.detail || p.name,
      status: i === 0 ? 'Proposed' : 'Backlog',
      confidence: '—',
      winner: 'Not run yet',
      source: 'strategy',
    }));
  });
  const [draft, setDraft] = useState('');

  const persist = (next) => {
    setExperiments(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const cycleStatus = (id) => {
    const order = ['Backlog', 'Proposed', 'Running', 'Done'];
    persist(
      experiments.map((e) => {
        if (e.id !== id) return e;
        const idx = order.indexOf(e.status);
        const next = order[(idx + 1) % order.length];
        return {
          ...e,
          status: next,
          confidence: next === 'Running' ? 'Collecting' : next === 'Done' ? 'Measured' : '—',
          winner: next === 'Done' ? (e.winner === 'Not run yet' ? 'Needs review' : e.winner) : e.winner,
        };
      })
    );
  };

  const addExperiment = () => {
    const name = draft.trim();
    if (!name) return;
    persist([
      {
        id: `exp_${Date.now().toString(36)}`,
        name,
        status: 'Proposed',
        confidence: '—',
        winner: 'Not run yet',
        source: 'manual',
      },
      ...experiments,
    ]);
    setDraft('');
  };

  const removeExperiment = (id) => {
    persist(experiments.filter((e) => e.id !== id));
  };

  const handoff = (exp, screen) => {
    stashJourneyHandoff({
      from: 'experiments',
      toScreen: screen,
      agentId: screen === 'paid' ? 'zara' : 'tara',
      mission: `Build / measure experiment: ${String(exp.name).slice(0, 140)}`,
    });
    setActiveScreen && setActiveScreen(screen);
  };

  const reseeds = () => {
    const next = seedPlays.map((p, i) => ({
      id: `exp_seed_${i}_${Date.now().toString(36)}`,
      name: p.detail || p.name,
      status: i === 0 ? 'Proposed' : 'Backlog',
      confidence: '—',
      winner: 'Not run yet',
      source: 'strategy',
    }));
    persist(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>A/B Experiments &amp; Conversion Tests</h1>
          <p className="text-muted" style={{ marginTop: 6 }}>
            Hypotheses for {company}. Advance status as you run tests — nothing is “won” until you mark Done.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={reseeds}>Reseed from strategy</button>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('landingpages')}>Landing pages</button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Add hypothesis (e.g. Trial CTA vs demo CTA on LP)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addExperiment()}
        />
        <button type="button" className="btn btn-primary" onClick={addExperiment}>Add</button>
      </div>

      {!experiments.length ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No experiment backlog</h3>
          <p className="card-body">Lock marketing / pricing / positioning sections first, or add a hypothesis above.</p>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('gtmwizard')}>
            Open GTM Wizard
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Experiment</th><th>Status</th><th>Confidence</th><th>Leading Variant</th><th></th></tr>
              </thead>
              <tbody>
                {experiments.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                      {e.name}
                      <div className="text-muted" style={{ fontSize: 11 }}>{e.source}</div>
                    </td>
                    <td>
                      <button type="button" className="tag tag-outline" style={{ cursor: 'pointer' }} onClick={() => cycleStatus(e.id)} title="Advance status">
                        {e.status}
                      </button>
                    </td>
                    <td>{e.confidence}</td>
                    <td>{e.winner}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => handoff(e, 'landingpages')}>LP</button>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => handoff(e, 'paid')}>Paid</button>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => removeExperiment(e.id)}>×</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>Click status to cycle Backlog → Proposed → Running → Done.</p>
        </div>
      )}
    </div>
  );
}

export function ReportingView({ setActiveScreen }) {
  const company = getCompanyName();
  const financial = getStrategySection('financial_plan');
  const measurement = getStrategySection('measurement_optimization');
  const [dash, setDash] = useState(null);
  const [brief, setBrief] = useState('');
  const [loading, setLoading] = useState(true);
  const [briefLoading, setBriefLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/analytics/dashboard?period=30d&companyId=${encodeURIComponent(getActiveWorkspaceId())}`
        );
        const json = await res.json().catch(() => ({}));
        if (!cancelled) setDash(json);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load scorecard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const generateBrief = async () => {
    setBriefLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/command-center?companyId=${encodeURIComponent(getActiveWorkspaceId())}&period=30d`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ northStar: northStarLabel(), companyName: company }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Brief failed (${res.status})`);
      const text =
        json.briefing?.summary ||
        json.briefing?.headline ||
        json.diagnosisSummary ||
        json.summary ||
        (Array.isArray(json.insights) && json.insights[0]?.body) ||
        (Array.isArray(json.nextActions) && json.nextActions[0]?.label) ||
        (Array.isArray(json.kpis) ? json.kpis.map((k) => `${k.label}: ${k.value}`).join('\n') : '') ||
        'Brief generated — open Command Center for the full view.';
      setBrief(String(text));
    } catch (err) {
      setError(err.message || 'Could not generate board brief');
    } finally {
      setBriefLoading(false);
    }
  };

  const copyBrief = async () => {
    const kpis = Array.isArray(dash?.kpis) ? dash.kpis : [];
    const lines = [
      `${company} — executive report`,
      `North Star: ${northStarLabel()}`,
      '',
      'Live KPIs (30d):',
      ...kpis.slice(0, 8).map((k) => `- ${k.label}: ${k.value}${k.delta != null ? ` (${k.delta})` : ''}`),
      '',
      financial ? `Financial plan:\n${sectionPlainText(financial).slice(0, 500)}` : '',
      measurement ? `Measurement:\n${sectionPlainText(measurement).slice(0, 500)}` : '',
      brief ? `\nBoard brief:\n${brief}` : '',
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      /* ignore */
    }
  };

  const reports = [
    financial && { name: `${company} financial plan`, type: 'Strategy · financial_plan', body: sectionPlainText(financial) },
    measurement && { name: `${company} measurement`, type: 'Strategy · measurement', body: sectionPlainText(measurement) },
    { name: 'North Star scorecard', type: 'Live analytics', body: northStarLabel() },
  ].filter(Boolean);

  const kpis = Array.isArray(dash?.kpis) ? dash.kpis.slice(0, 6) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Executive &amp; Board Reporting</h1>
          <p className="text-muted" style={{ margin: 0 }}>
            Strategy sections + live scorecard for {company}.
            {dash?.connected === false ? ' Connectors offline — connect GSC/Meta for live KPIs.' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={copyBrief}>
            Copy summary
          </button>
          <button type="button" className="btn btn-secondary" disabled={briefLoading} onClick={generateBrief}>
            {briefLoading ? 'Generating…' : 'Generate board brief'}
          </button>
          {setActiveScreen ? (
            <button type="button" className="btn btn-primary" onClick={() => setActiveScreen('analytics')}>
              Open live Scorecard
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="card" style={{ color: 'var(--color-accent)' }}>{error}</div> : null}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Live KPIs (30d)</h3>
        {loading ? (
          <p className="text-muted">Loading scorecard…</p>
        ) : !kpis.length ? (
          <p className="card-body">
            No KPI data yet.
            {Array.isArray(dash?.connectedSources) && dash.connectedSources.length
              ? ` Sources: ${dash.connectedSources.map((s) => s.name || s.id).join(', ')}.`
              : ' Connect GSC or Meta in Integrations.'}
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {kpis.map((k, i) => (
              <div key={i} style={{ padding: 12, border: '1px solid var(--color-divider)', background: 'var(--color-bg)' }}>
                <div className="text-muted" style={{ fontSize: 11 }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)' }}>{k.value}</div>
                {k.delta != null ? <div style={{ fontSize: 12 }}>{k.delta}</div> : null}
              </div>
            ))}
          </div>
        )}
        {dash?.dataNote ? <p className="text-muted" style={{ marginTop: 12, fontSize: 12 }}>{dash.dataNote}</p> : null}
      </div>

      {brief ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Board brief</h3>
          <p className="card-body" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{brief}</p>
        </div>
      ) : null}

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
  const storageKey = `marqq_referrals_${getActiveWorkspaceId()}`;
  const allPlays = [
    ...playsFromSection('customer_success', 'Referral / retention'),
    ...playsFromSection('marketing_strategy', 'Referral play'),
  ].slice(0, 10);
  const referralPlays = allPlays.filter((p) =>
    /refer|partner|advocate|affiliate|word.of.mouth|incentive|invite/i.test(`${p.detail || ''} ${p.name || ''}`)
  );
  const seedRows = (referralPlays.length ? referralPlays : allPlays.slice(0, 6)).map((r, i) => ({
    id: `ref_${i}`,
    name: r.detail || r.name,
    status: r.status || 'Proposed',
    source: 'strategy',
  }));

  const loadStored = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const [programs, setPrograms] = useState(() => {
    const stored = loadStored();
    if (Array.isArray(stored) && stored.length) return stored;
    return seedRows;
  });
  const [draft, setDraft] = useState('');

  const persist = (next) => {
    setPrograms(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const cycleStatus = (id) => {
    const order = ['Proposed', 'Drafting', 'Active', 'Paused'];
    persist(
      programs.map((p) => {
        if (p.id !== id) return p;
        const idx = order.indexOf(p.status);
        return { ...p, status: order[(idx + 1) % order.length] };
      })
    );
  };

  const addProgram = () => {
    const name = draft.trim();
    if (!name) return;
    persist([
      { id: `ref_${Date.now().toString(36)}`, name, status: 'Proposed', source: 'manual' },
      ...programs,
    ]);
    setDraft('');
  };

  const activate = (p) => {
    persist(programs.map((x) => (x.id === p.id ? { ...x, status: 'Active' } : x)));
    stashJourneyHandoff({
      from: 'referrals',
      toScreen: 'outreach',
      agentId: 'arjun',
      mission: `Launch referral / partner outreach for: ${String(p.name).slice(0, 140)}`,
    });
    setActiveScreen && setActiveScreen('outreach');
  };

  const toLanding = (p) => {
    stashJourneyHandoff({
      from: 'referrals',
      toScreen: 'landingpages',
      agentId: 'tara',
      mission: `Referral / affiliate landing for: ${String(p.name).slice(0, 140)}`,
    });
    setActiveScreen && setActiveScreen('landingpages');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Referral &amp; Affiliate Programs</h1>
          <p className="text-muted" style={{ marginTop: 6 }}>
            Programs for {company} from customer success / marketing — activate into Outreach or a gated LP.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => persist(seedRows.map((r, i) => ({ ...r, id: `ref_seed_${i}_${Date.now().toString(36)}` })))}
        >
          Reseed from strategy
        </button>
      </div>

      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Add program (e.g. Partner 20% revenue share)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addProgram()}
        />
        <button type="button" className="btn btn-primary" onClick={addProgram}>Add</button>
      </div>

      {!programs.length ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No referral plays yet</h3>
          <p className="card-body">Add referral mechanics in customer success or marketing strategy, or create one above.</p>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('strategy')}>
            Strategy
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Program / play</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {programs.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                      {r.name}
                      <div className="text-muted" style={{ fontSize: 11 }}>{r.source}</div>
                    </td>
                    <td>
                      <button type="button" className="tag tag-outline" style={{ cursor: 'pointer' }} onClick={() => cycleStatus(r.id)}>
                        {r.status}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => toLanding(r)}>LP</button>
                        <button type="button" className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => activate(r)}>
                          Activate
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: '4px 8px' }}
                          onClick={() => persist(programs.filter((x) => x.id !== r.id))}
                        >
                          ×
                        </button>
                      </div>
                    </td>
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
  const company = getCompanyName();
  const [agents, setAgents] = useState(() => loadAgentOs()?.agent_roster?.agents || []);
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState('');
  const [tickMsg, setTickMsg] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => {
    setError('');
    try {
      const ws = getActiveWorkspaceId();
      const [osRes, depRes] = await Promise.all([
        fetch(`/api/agent-os?workspaceId=${encodeURIComponent(ws)}`).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/agents/deployments?workspaceId=${encodeURIComponent(ws)}`).then((r) => r.json()).catch(() => ({})),
      ]);
      const os = osRes?.agentOs || loadAgentOs();
      setAgents(os?.agent_roster?.agents || []);
      setDeployments(Array.isArray(depRes?.deployments) ? depRes.deployments : []);
    } catch (err) {
      setError(err.message || 'Could not load evaluations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const runsByAgent = {};
  for (const d of deployments) {
    const key = String(d.agentName || d.agentDisplayName || '').toLowerCase();
    if (!key) continue;
    if (!runsByAgent[key]) runsByAgent[key] = { runs: 0, lastStatus: d.status, openScreen: d.openScreen, lastAt: d.scheduledFor || d.createdAt };
    runsByAgent[key].runs += Number(d.runCount) || (d.status === 'completed' || d.status === 'done' ? 1 : 0) || 0;
    if (d.runCount) runsByAgent[key].runs = Math.max(runsByAgent[key].runs, Number(d.runCount) || 0);
    runsByAgent[key].lastStatus = d.status || runsByAgent[key].lastStatus;
    if (d.openScreen) runsByAgent[key].openScreen = d.openScreen;
  }

  const evals = agents.map((a) => {
    const key = String(a.id || a.name || '').toLowerCase();
    const stats = runsByAgent[key] || runsByAgent[String(a.name || '').toLowerCase()] || {};
    return {
      id: a.id || a.name,
      name: a.name || a.id,
      metric: a.mission || a.reason || a.role || 'Mission',
      status: a.status || a.rosterStatus || 'standby',
      priority: a.priority != null ? `P${a.priority}` : '—',
      runs: stats.runs || 0,
      lastStatus: stats.lastStatus || 'no runs',
      openScreen: stats.openScreen || a.openScreen || 'agents',
    };
  });

  const runAgent = async (agent) => {
    const name = String(agent.id || agent.name || '').trim();
    if (!name || running) return;
    setRunning(name);
    setError('');
    setTickMsg('');
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(name)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: getActiveWorkspaceId(),
          query: `Evaluate readiness for ${company}: ${agent.metric}`,
          deliveryMode: 'draft',
          triggered_by: 'evaluations',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Run failed (${res.status})`);
      setTickMsg(`${agent.name} ran · ${json.status || (json.ok ? 'draft queued' : 'done')}`);
      await refresh();
    } catch (err) {
      setError(err.message || 'Agent run failed');
    } finally {
      setRunning('');
    }
  };

  const tickScheduler = async () => {
    setTickMsg('');
    setError('');
    try {
      const res = await fetch('/api/agents/scheduler/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true, workspaceId: getActiveWorkspaceId() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Tick failed');
      setTickMsg(`Scheduler tick · processed ${json.processed ?? json.ran ?? 0}`);
      await refresh();
    } catch (err) {
      setError(err.message || 'Scheduler tick failed');
    }
  };

  const totalRuns = evals.reduce((n, e) => n + e.runs, 0);
  const active = evals.filter((e) => /high|running|active/i.test(String(e.status))).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>AI Agent Evaluations &amp; Accuracy</h1>
          <p className="text-muted" style={{ marginTop: 6 }}>
            Live roster + deployment run counts for {company}. Scores come from real runs — not fake accuracy %.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={tickScheduler}>Run scheduler tick</button>
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('orchestration')}>Orchestration</button>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('agents')}>Agents Hub</button>
        </div>
      </div>

      {error ? <div className="card" style={{ color: 'var(--color-accent)' }}>{error}</div> : null}
      {tickMsg ? <div className="card">{tickMsg}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div className="card"><div className="text-muted" style={{ fontSize: 11 }}>Agents</div><div style={{ fontSize: 22, fontWeight: 800 }}>{evals.length}</div></div>
        <div className="card"><div className="text-muted" style={{ fontSize: 11 }}>High priority / active</div><div style={{ fontSize: 22, fontWeight: 800 }}>{active}</div></div>
        <div className="card"><div className="text-muted" style={{ fontSize: 11 }}>Deployment runs</div><div style={{ fontSize: 22, fontWeight: 800 }}>{totalRuns}</div></div>
      </div>

      {loading ? (
        <div className="card text-muted">Loading evaluations…</div>
      ) : !evals.length ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No agent OS yet</h3>
          <p className="card-body">Generate GTM strategy to bootstrap the 12-agent roster, then evaluate from real runs.</p>
          <button type="button" className="btn btn-primary" onClick={() => setActiveScreen && setActiveScreen('gtmwizard')}>
            GTM Wizard
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Agent</th><th>Mission</th><th>Status</th><th>Runs</th><th>Last deploy</th><th></th></tr>
              </thead>
              <tbody>
                {evals.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                      {e.name}
                      <div className="text-muted" style={{ fontSize: 11 }}>{e.priority}</div>
                    </td>
                    <td>{e.metric}</td>
                    <td><span className="tag tag-outline">{e.status}</span></td>
                    <td>{e.runs}</td>
                    <td>{e.lastStatus}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          disabled={Boolean(running)}
                          onClick={() => runAgent(e)}
                        >
                          {running === e.id || running === e.name ? 'Running…' : 'Eval run'}
                        </button>
                        {setActiveScreen ? (
                          <button type="button" className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setActiveScreen(e.openScreen)}>
                            Open
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deployments.length ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recent deployments ({deployments.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {deployments.slice(0, 8).map((d) => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                <div>
                  <strong>{d.agentDisplayName || d.agentName}</strong> · {d.sectionTitle || d.sectionId}
                  <div className="text-muted">{d.status} · runs {d.runCount || 0}</div>
                </div>
                {setActiveScreen && d.openScreen ? (
                  <button type="button" className="btn btn-ghost" onClick={() => setActiveScreen(d.openScreen)}>Studio</button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
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
  const company = getCompanyName();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const inputRef = useRef(null);

  async function refresh() {
    const list = await fetchKnowledgeFiles();
    setFiles(Array.isArray(list) ? list : []);
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
    if (!fileId) return;
    setError('');
    const prev = files;
    setFiles((list) => list.filter((f) => f.id !== fileId));
    try {
      const res = await fetch(
        `/api/brand-dna/knowledge-base/${encodeURIComponent(fileId)}?workspaceId=${encodeURIComponent(getActiveWorkspaceId())}`,
        { method: 'DELETE' }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Delete failed (${res.status})`);
      const local = loadLocalBrandContext() || {};
      await persistBrandContext({
        ...local,
        knowledgeFiles: (local.knowledgeFiles || []).filter((f) => f.id !== fileId),
      });
      await refresh();
    } catch (err) {
      setFiles(prev);
      setError(err.message || 'Could not delete file');
    }
  }

  const fmtSize = (n) => {
    const num = Number(n) || 0;
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  const assetUrl = (f) => {
    if (f.url) return f.url;
    if (!f.id) return null;
    return `/api/brand-dna/assets/${encodeURIComponent(getActiveWorkspaceId())}/${encodeURIComponent(f.id)}`;
  };

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'brand_knowledge', label: 'Brand' },
    { id: 'logo', label: 'Logos' },
    { id: 'voice_note', label: 'Voice' },
  ];
  const filtered = files.filter((f) => {
    if (filter === 'all') return true;
    if (filter === 'brand_knowledge') return !f.category || f.category === 'brand_knowledge' || f.category === 'kb';
    return f.category === filter;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Workspace Files &amp; Agent Artifacts</h1>
          <p className="text-muted" style={{ marginTop: 6 }}>
            Upload, open, and delete files for {company}. Same store as Knowledge Base — agents and Brand DNA read these.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleUpload(e.target.files)}
          />
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('knowledge')}>
            Knowledge Base
          </button>
          <button type="button" className="btn btn-primary" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? 'Uploading…' : 'Upload files'}
          </button>
        </div>
      </div>

      {error ? <div className="card" style={{ color: 'var(--color-accent)' }}>{error}</div> : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={filter === c.id ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ padding: '6px 12px', fontSize: 12 }}
            onClick={() => setFilter(c.id)}
          >
            {c.label}
            {c.id === 'all' ? ` (${files.length})` : ''}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : !filtered.length ? (
          <>
            <p className="card-body">
              {files.length ? 'No files in this filter.' : 'No files yet. Upload brand guidelines, decks, or logos here.'}
            </p>
            {!files.length ? (
              <button type="button" className="btn btn-primary" disabled={uploading} onClick={() => inputRef.current?.click()}>
                {uploading ? 'Uploading…' : 'Upload first file'}
              </button>
            ) : null}
          </>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Category</th>
                  <th style={{ width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f, i) => {
                  const href = assetUrl(f);
                  return (
                    <tr key={f.id || i}>
                      <td style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                        {href ? (
                          <a href={href} target="_blank" rel="noreferrer">{f.name || f.id}</a>
                        ) : (
                          f.name || f.id
                        )}
                      </td>
                      <td>{f.mime || f.type || '—'}</td>
                      <td>{fmtSize(f.size)}</td>
                      <td><span className="tag tag-outline">{f.category || 'kb'}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {href ? (
                            <a className="btn btn-ghost" href={href} target="_blank" rel="noreferrer" style={{ padding: 6, fontSize: 12 }}>
                              Open
                            </a>
                          ) : null}
                          {f.id ? (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              title={`Delete ${f.name}`}
                              aria-label={`Delete ${f.name}`}
                              onClick={() => handleDelete(f.id)}
                              style={{ padding: 6, color: 'var(--color-muted)' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export { IntegrationsView } from './IntegrationsView.jsx';

export function AdminView({ setActiveScreen, userEmail }) {
  const company = getCompanyName();
  const wsId = getActiveWorkspaceId();
  const membersKey = `marqq_admin_members_${wsId}`;
  const settingsKey = `marqq_admin_settings_${wsId}`;

  const defaultOwnerEmail = (() => {
    if (userEmail) return userEmail;
    try {
      return localStorage.getItem('marqq_user_email') || '';
    } catch {
      return '';
    }
  })() || (() => {
    const site = localStorage.getItem('marqq_ob_website') || '';
    const host = String(site).replace(/^https?:\/\//, '').split('/')[0];
    return host ? `hello@${host}` : 'owner@workspace';
  })();

  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(settingsKey);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return {
      name: company,
      website: localStorage.getItem('marqq_ob_website') || '',
      requireApprovals: true,
      draftOnlyPublishing: true,
    };
  });
  const [members, setMembers] = useState(() => {
    try {
      const raw = localStorage.getItem(membersKey);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length) return list;
      }
    } catch {
      /* ignore */
    }
    return [{ id: 'owner', name: 'Workspace owner', email: defaultOwnerEmail, role: 'Owner' }];
  });
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Member');
  const [msg, setMsg] = useState('');

  const persistMembers = (next) => {
    setMembers(next);
    try {
      localStorage.setItem(membersKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const persistSettings = (next) => {
    setSettings(next);
    try {
      localStorage.setItem(settingsKey, JSON.stringify(next));
      if (next.name) localStorage.setItem('marqq_ob_companyName', next.name);
      if (next.website != null) localStorage.setItem('marqq_ob_website', next.website);
    } catch {
      /* ignore */
    }
  };

  const saveSettings = async () => {
    setMsg('');
    persistSettings(settings);
    try {
      const local = loadLocalBrandContext() || {};
      await persistBrandContext({
        ...local,
        companyName: settings.name || local.companyName,
        website: settings.website || local.website,
      });
      setMsg('Workspace settings saved.');
    } catch (err) {
      setMsg(err.message || 'Saved locally (brand sync failed)');
    }
  };

  const invite = () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setMsg('Enter a valid email');
      return;
    }
    if (members.some((m) => String(m.email).toLowerCase() === email)) {
      setMsg('Already invited');
      return;
    }
    persistMembers([
      ...members,
      {
        id: `m_${Date.now().toString(36)}`,
        name: email.split('@')[0],
        email,
        role: inviteRole,
      },
    ]);
    setInviteEmail('');
    setMsg(`Invited ${email} as ${inviteRole} (local seat — email invite API later).`);
  };

  const clearCaches = () => {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('marqq_')) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
    setMsg(`Cleared ${keys.length} session cache keys. Strategy / research caches reset.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Workspace Administration</h1>
          <p className="text-muted" style={{ marginTop: 6 }}>
            Settings &amp; seats for {company} · id <code>{wsId}</code>
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('billing')}>
          Billing
        </button>
      </div>

      {msg ? <div className="card">{msg}</div> : null}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Workspace settings</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            Display name
            <input
              className="input"
              value={settings.name || ''}
              onChange={(e) => setSettings({ ...settings, name: e.target.value })}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            Website
            <input
              className="input"
              value={settings.website || ''}
              onChange={(e) => setSettings({ ...settings, website: e.target.value })}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={Boolean(settings.requireApprovals)}
              onChange={(e) => setSettings({ ...settings, requireApprovals: e.target.checked })}
            />
            Require approvals before publish
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={Boolean(settings.draftOnlyPublishing)}
              onChange={(e) => setSettings({ ...settings, draftOnlyPublishing: e.target.checked })}
            />
            Draft / paused ads only
          </label>
        </div>
        <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={saveSettings}>
          Save settings
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Team members</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 180 }}
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && invite()}
          />
          <select className="input" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ width: 140 }}>
            <option>Member</option>
            <option>Admin</option>
            <option>Viewer</option>
          </select>
          <button type="button" className="btn btn-primary" onClick={invite}>Invite</button>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 700 }}>{m.name}</td>
                  <td>{m.email}</td>
                  <td><span className="tag tag-accent">{m.role}</span></td>
                  <td>
                    {m.role !== 'Owner' ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: 12 }}
                        onClick={() => persistMembers(members.filter((x) => x.id !== m.id))}
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Danger zone</div>
          <div className="text-muted" style={{ fontSize: 13 }}>Clear session research/idea caches for this browser (does not delete Supabase data).</div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={clearCaches}>Clear session caches</button>
      </div>
    </div>
  );
}

export function HelpView({ setActiveScreen }) {
  const company = getCompanyName();
  const [status, setStatus] = useState({
    loading: true,
    connectors: 0,
    approvals: 0,
    strategyLocked: Boolean(loadStrategyDoc()?.sections?.length),
    northStar: northStarLabel(),
    agents: (loadAgentOs()?.agent_roster?.agents || []).length,
    crmLabel: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [intRes, appRes, crmRes] = await Promise.all([
          fetch(`/api/integrations?companyId=${encodeURIComponent(getActiveWorkspaceId())}`).then((r) => r.json()).catch(() => ({})),
          fetch('/api/approvals').then((r) => r.json()).catch(() => ({})),
          fetch(`/api/crm/destination?companyId=${encodeURIComponent(getActiveWorkspaceId())}`).then((r) => r.json()).catch(() => ({})),
        ]);
        if (cancelled) return;
        const connectors = Array.isArray(intRes?.connectors) ? intRes.connectors : Array.isArray(intRes) ? intRes : [];
        const active = connectors.filter((c) => c.connected || c.status === 'ACTIVE').length;
        const approvals = Array.isArray(appRes?.approvals)
          ? appRes.approvals.filter((a) => a.status === 'pending' || !a.status).length
          : Array.isArray(appRes) ? appRes.length : 0;
        setStatus({
          loading: false,
          connectors: active,
          approvals,
          strategyLocked: Boolean(loadStrategyDoc()?.sections?.length),
          northStar: northStarLabel(),
          agents: (loadAgentOs()?.agent_roster?.agents || []).length,
          crmLabel: crmRes?.destination?.label || crmRes?.provider || crmRes?.type || '',
        });
      } catch {
        if (!cancelled) setStatus((s) => ({ ...s, loading: false }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const topics = [
    {
      title: 'Connect integrations',
      desc: status.loading
        ? 'Checking connectors…'
        : status.connectors
          ? `${status.connectors} live connector${status.connectors === 1 ? '' : 's'} for this workspace.`
          : 'No connectors active yet — Google, Meta, CRM, WhatsApp.',
      screen: 'integrations',
      badge: status.connectors ? 'Live' : 'Setup',
    },
    {
      title: 'Finish GTM Wizard',
      desc: status.strategyLocked
        ? `Strategy locked for ${company}. North Star: ${status.northStar || 'set'}.`
        : `Lock North Star and strategy sections for ${company}.`,
      screen: 'gtmwizard',
      badge: status.strategyLocked ? 'Locked' : 'Start',
    },
    {
      title: 'Agent approvals',
      desc: status.loading
        ? 'Loading queue…'
        : status.approvals
          ? `${status.approvals} item${status.approvals === 1 ? '' : 's'} waiting for sign-off.`
          : 'Queue clear — drafts still need your approval before publish.',
      screen: 'approvals',
      badge: status.approvals ? `${status.approvals} pending` : 'Clear',
    },
    {
      title: 'Performance Scorecard',
      desc: 'Live GSC + Meta against your North Star.',
      screen: 'analytics',
      badge: 'Live',
    },
    {
      title: 'CRM & leads',
      desc: status.crmLabel
        ? `Lead destination: ${status.crmLabel}. Sync and Customer 360 pull from here.`
        : 'Set HubSpot, Salesforce, or Google Sheets as lead destination.',
      screen: 'crm',
      badge: status.crmLabel ? 'Wired' : 'Setup',
    },
    {
      title: 'Ask Marqq',
      desc: status.agents
        ? `${status.agents} agents in roster — ask in plain language with workspace context.`
        : 'Chat with Marqq using brand + strategy context.',
      screen: 'chat',
      badge: status.agents ? `${status.agents} agents` : 'Chat',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Help Center &amp; Support</h1>
      <p className="text-muted" style={{ margin: 0 }}>
        Live guides for {company} — each card opens the real screen with current workspace status.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
        {topics.map((t, i) => (
          <button
            key={i}
            type="button"
            className="card"
            style={{ textAlign: 'left', cursor: 'pointer', color: 'var(--color-text)' }}
            onClick={() => setActiveScreen && setActiveScreen(t.screen)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <h3 style={{ fontSize: '15px', marginTop: 0, color: 'var(--color-text)' }}>{t.title}</h3>
              <span className="tag tag-outline" style={{ flex: 'none' }}>{t.badge}</span>
            </div>
            <p className="text-muted" style={{ fontSize: '13px', marginTop: '4px' }}>{t.desc}</p>
          </button>
        ))}
      </div>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Need a human?</div>
          <div className="text-muted" style={{ fontSize: 13 }}>Email support with your workspace id — we reply with setup help.</div>
        </div>
        <a
          className="btn btn-secondary"
          href={`mailto:hello@marqq.ai?subject=${encodeURIComponent(`${company} workspace help`)}&body=${encodeURIComponent(`Workspace: ${getActiveWorkspaceId()}\nCompany: ${company}\n`)}`}
        >
          Email support
        </a>
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
