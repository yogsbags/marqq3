import React, { useState, useEffect, useRef } from 'react';
import {  ArrowRight, CheckCircle2, Shield, Sparkles, RefreshCw, AlertCircle, Mic, Square, Upload, FileText, Trash2, Pencil, Link2, Loader2, Eraser  } from 'lucide-react';
import {  supabase  } from '../lib/supabase';
import {  completeOnboardingWithGroq  } from '../services/groqService';
import {  connectComposioConnector, formatConnectorError  } from '../lib/composio';
import {  CONNECTOR_DISPLAY, isConnectorActive, NO_AUTH_CONNECTORS, connectorNeedsResourcePicker  } from '../lib/connectormeta';
import {  ResourcePickerModal  } from '../components/common/ResourcePickerModal';
import {  BrandStyleLoader  } from '../components/BrandStyleLoader';
import {  buildBrandContextFromOnboarding, persistBrandContext, fetchBrandContext, fetchKnowledgeFiles, getActiveWorkspaceId, resolveLogoImgSrc, deleteBrandLogo  } from '../lib/brandContext';
import { apiFetch } from '../lib/apiFetch';
import {  isOnboardingComplete, resetOnboardingDraft  } from '../lib/workspaceBootstrap';
import { ensureUserWorkspace, isUuidWorkspaceId } from '../lib/workspace.js';

const ONBOARDING_TOTAL_STEPS = 9;
const ONBOARDING_STEP_LABELS = ['Your AI team', 'Company', 'Audience', 'Growth goal', 'Data sources', 'Brand DNA', 'Agents activated', 'Market research', 'GTM ready'];
const ONBOARDING_FLOW_VERSION = 'first-value-v5';
const ONBOARDING_FLOW_VERSION_KEY = 'marqq_onboarding_flow_version';
/** Skip the live pre-GTM research gate — it blocks onboarding for too long. */
const SKIP_ONBOARDING_MARKET_RESEARCH = true;
const MARKET_RESEARCH_STEP = 8;

function last30SignalItems(report = {}) {
  const buckets = [
    ['reddit', 'Reddit'],
    ['x', 'X'],
    ['youtube', 'YouTube'],
    ['hackernews', 'HN'],
    ['hn', 'HN'],
    ['web', 'Web'],
    ['polymarket', 'Polymarket'],
  ];
  const items = [];
  for (const [key, label] of buckets) {
    const list = report[key]?.items || (Array.isArray(report[key]) ? report[key] : []);
    for (const item of list) {
      const title = String(item?.title || item?.text || item?.name || '').replace(/\s+/g, ' ').trim();
      if (!title) continue;
      items.push({
        source: label,
        title: title.slice(0, 180),
        url: item?.url || item?.link || item?.permalink || '',
        score: Number(item?.score || item?.engagement_score || item?.relevance || 0),
      });
    }
  }
  return items.sort((a, b) => b.score - a.score).slice(0, 6);
}

export function SignInView({ setActiveScreen }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: String(email || '').trim(),
        password,
      });

      if (error) {
        setErrorMsg(error.message || 'Sign in failed');
        return;
      }
      if (!data?.session) {
        setErrorMsg('Sign in failed — no session returned. Check Supabase env on Railway.');
        return;
      }
      // App listens for SIGNED_IN and routes to onboarding or command
    } catch (err) {
      setErrorMsg(err?.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
      <div style={{ width: '380px' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '24px', marginBottom: '28px' }}>
          MARQQ<span style={{ color: 'var(--color-accent)' }}>.</span>
        </div>
        <h2 style={{ marginBottom: '6px' }}>Sign in</h2>
        <p className="text-muted" style={{ marginBottom: '24px' }}>Welcome back to your Marqq workspace.</p>

        {errorMsg && (
          <div style={{ padding: '10px 12px', background: 'rgba(242,121,10,0.15)', border: '1px solid var(--color-accent-2)', fontSize: '12px', marginBottom: '14px', borderRadius: '0px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={14} color="var(--color-accent-2)" /> {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px', marginBottom: '16px' }}>
          <div className="field">
            <label htmlFor="li-email">Email</label>
            <input className="input" id="li-email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="li-pass">Password</label>
            <input className="input" id="li-pass" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign in'} <ArrowRight size={14} />
          </button>
        </form>

        <div className="hr" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled
            title="Google OAuth not configured yet"
          >
            Continue with Google
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled
            title="SSO not configured yet"
          >
            Continue with SSO
          </button>
        </div>

        <p className="text-muted" style={{ fontSize: '13px', marginTop: '16px', textAlign: 'center' }}>
          No account?{' '}
          <a href="#signup" onClick={(e) => { e.preventDefault(); setActiveScreen('signup'); }}>
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}

export function SignUpView({ setActiveScreen }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify your password.');
      return;
    }

    setLoading(true);

    try {
      // Clear any leftover demo Brand DNA before session routes into onboarding
      resetOnboardingDraft();

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name }
        }
      });
      if (error) {
        setErrorMsg(error.message || 'Sign up failed');
        return;
      }
      if (!data?.session && !data?.user) {
        setErrorMsg('Sign up failed — check Supabase env on Railway.');
        return;
      }
      // Email confirmation may leave session null; still send to onboarding only if signed in
      if (data?.session) {
        // App SIGNED_IN handler routes to onboarding
      } else {
        setErrorMsg('Check your email to confirm, then sign in.');
        setActiveScreen('login');
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
      <div style={{ width: '380px' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '24px', marginBottom: '28px' }}>
          MARQQ<span style={{ color: 'var(--color-accent)' }}>.</span>
        </div>
        <h2 style={{ marginBottom: '6px' }}>Create your workspace</h2>
        <p className="text-muted" style={{ marginBottom: '24px' }}>Set up Marqq for your marketing team.</p>

        {errorMsg && (
          <div style={{ padding: '10px 12px', background: 'rgba(242,121,10,0.15)', border: '1px solid var(--color-accent-2)', fontSize: '12px', marginBottom: '14px', borderRadius: '0px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={14} color="var(--color-accent-2)" /> {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px', marginBottom: '16px' }}>
          <div className="field">
            <label htmlFor="su-name">Full name</label>
            <input className="input" id="su-name" autoComplete="name" placeholder="Arjun Mehta" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="su-email">Work email</label>
            <input className="input" id="su-email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="su-pass">Password</label>
            <input className="input" id="su-pass" type="password" autoComplete="new-password" placeholder="Create a password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="su-confirm-pass">Confirm password</label>
            <input className="input" id="su-confirm-pass" type="password" autoComplete="new-password" placeholder="Re-enter your password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'} <ArrowRight size={14} />
          </button>
        </form>

        <p className="text-muted" style={{ fontSize: '13px', marginTop: '16px', textAlign: 'center' }}>
          Already have an account?{' '}
          <a href="#signin" onClick={(e) => { e.preventDefault(); setActiveScreen('login'); }}>
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}

// Brand DNA fetching uses shared BrandStyleLoader (same orb / shimmer / steps).

export function OnboardingView({ setActiveScreen }) {

  const [step, setStep] = useState(() => {
    // Always honor persisted step; bootstrap reset writes "1" before this mounts.
    const savedStep = localStorage.getItem('marqq_onboarding_step');
    if (!savedStep) return 1;
    const n = parseInt(savedStep, 10);
    if (!Number.isFinite(n)) return 1;
    if (localStorage.getItem(ONBOARDING_FLOW_VERSION_KEY) === ONBOARDING_FLOW_VERSION) {
      const restored = Math.min(Math.max(n, 1), ONBOARDING_TOTAL_STEPS);
      return SKIP_ONBOARDING_MARKET_RESEARCH && restored === MARKET_RESEARCH_STEP
        ? ONBOARDING_TOTAL_STEPS
        : restored;
    }
    // Preserve progress from the current five-step first-value flow while
    // restoring the original welcome and activation screens.
    const previousVersion = localStorage.getItem(ONBOARDING_FLOW_VERSION_KEY);
    if (previousVersion === 'first-value-v3') {
      localStorage.setItem(ONBOARDING_FLOW_VERSION_KEY, ONBOARDING_FLOW_VERSION);
      return Math.min(Math.max(n + 1, 2), ONBOARDING_TOTAL_STEPS);
    }
    if (previousVersion === 'first-value-v2') {
      localStorage.setItem(ONBOARDING_FLOW_VERSION_KEY, ONBOARDING_FLOW_VERSION);
      return Math.min(Math.max(n + 1, 2), ONBOARDING_TOTAL_STEPS);
    }
    // Migrate the former eight-step flow once: the welcome and activation/
    // ready screens were orientation-only, so resume at the equivalent step.
    const migrated = n >= 8 ? 8 : n === 7 ? 7 : n === 6 ? 6 : Math.min(Math.max(n, 1), 6);
    localStorage.setItem(ONBOARDING_FLOW_VERSION_KEY, ONBOARDING_FLOW_VERSION);
    return SKIP_ONBOARDING_MARKET_RESEARCH && migrated === MARKET_RESEARCH_STEP
      ? ONBOARDING_TOTAL_STEPS
      : migrated;
  });
  const [onboardingError, setOnboardingError] = useState('');

  const [companyName, setCompanyName] = useState(() => localStorage.getItem('marqq_ob_companyName') || '');
  const [website, setWebsite] = useState(() => localStorage.getItem('marqq_ob_website') || '');
  const [niche, setNiche] = useState(() => localStorage.getItem('marqq_ob_niche') || '');
  const [icp, setIcp] = useState(() => localStorage.getItem('marqq_ob_icp') || '');
  const [customerType, setCustomerType] = useState(() => localStorage.getItem('marqq_ob_customerType') || '');
  const [audienceIndustry, setAudienceIndustry] = useState(() => localStorage.getItem('marqq_ob_audienceIndustry') || localStorage.getItem('marqq_ob_niche') || '');
  const [buyerRole, setBuyerRole] = useState(() => localStorage.getItem('marqq_ob_buyerRole') || '');
  const [companySize, setCompanySize] = useState(() => localStorage.getItem('marqq_ob_companySize') || '');
  const [audienceLocation, setAudienceLocation] = useState(() => localStorage.getItem('marqq_ob_audienceLocation') || '');
  const [audienceProblem, setAudienceProblem] = useState(() => localStorage.getItem('marqq_ob_audienceProblem') || '');
  const [audienceNotes, setAudienceNotes] = useState(() => localStorage.getItem('marqq_ob_audienceNotes') || localStorage.getItem('marqq_ob_icp') || '');
  const [outcome, setOutcome] = useState(() => localStorage.getItem('marqq_ob_outcome') || '');
  const [timeWindow, setTimeWindow] = useState(() => localStorage.getItem('marqq_ob_timeWindow') || '');
  const [target, setTarget] = useState(() => localStorage.getItem('marqq_ob_target') || '');
  const [baseline, setBaseline] = useState(() => localStorage.getItem('marqq_ob_baseline') || '');

  useEffect(() => {
    localStorage.setItem('marqq_onboarding_step', String(step));
  }, [step]);

  useEffect(() => {
    localStorage.setItem('marqq_ob_companyName', companyName);
    localStorage.setItem('marqq_ob_website', website);
    localStorage.setItem('marqq_ob_niche', niche);
    localStorage.setItem('marqq_ob_icp', icp);
    localStorage.setItem('marqq_ob_customerType', customerType);
    localStorage.setItem('marqq_ob_audienceIndustry', audienceIndustry);
    localStorage.setItem('marqq_ob_buyerRole', buyerRole);
    localStorage.setItem('marqq_ob_companySize', companySize);
    localStorage.setItem('marqq_ob_audienceLocation', audienceLocation);
    localStorage.setItem('marqq_ob_audienceProblem', audienceProblem);
    localStorage.setItem('marqq_ob_audienceNotes', audienceNotes);
    localStorage.setItem('marqq_ob_outcome', outcome);
    localStorage.setItem('marqq_ob_timeWindow', timeWindow);
    localStorage.setItem('marqq_ob_target', target);
    localStorage.setItem('marqq_ob_baseline', baseline);
  }, [companyName, website, niche, icp, customerType, audienceIndustry, buyerRole, companySize, audienceLocation, audienceProblem, audienceNotes, outcome, timeWindow, target, baseline]);

  // AI Synthesis State
  const [groqLoading, setGroqLoading] = useState(false);
  const [groqData, setGroqData] = useState(null);
  const [appLinks, setAppLinks] = useState({ googlePlay: [], appleAppStore: [], androidPackageNames: [], appleAppIds: [] });
  /** Website URL that the current Brand DNA fields were successfully fetched for. */
  const [brandDnaFetchedFor, setBrandDnaFetchedFor] = useState('');
  const brandDnaInFlightRef = useRef('');
  const brandDnaAutoAttemptRef = useRef('');
  const [preGtmResearch, setPreGtmResearch] = useState(() => {
    try { return JSON.parse(localStorage.getItem('marqq_pre_gtm_research') || 'null'); } catch { return null; }
  });
  const [preGtmResearchLoading, setPreGtmResearchLoading] = useState(false);

  // Brand DNA extra fields
  const [brandTagline, setBrandTagline] = useState(() => localStorage.getItem('marqq_ob_tagline') || '');
  const [toneOfVoice, setToneOfVoice] = useState(() => localStorage.getItem('marqq_ob_tone') || '');
  const [editingColors, setEditingColors] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoDisplaySrc, setLogoDisplaySrc] = useState('');
  const [kbFiles, setKbFiles] = useState([]);
  const [kbUploading, setKbUploading] = useState(false);
  const [kbError, setKbError] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [recording, setRecording] = useState(false);
  const [voiceWorking, setVoiceWorking] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const logoInputRef = useRef(null);
  const kbInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const normalizeWebsiteKey = (url) =>
    String(url || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/$/, '')
      .toLowerCase();

  const isPlaceholderBrandSummary = (summary, name = companyName) => {
    const text = String(summary || '').trim();
    if (!text) return true;
    return /empowers mid-tier leaders in .+ to accelerate growth through innovative solutions/i.test(text)
      || (/^The\s+/i.test(text) && /innovative solutions/i.test(text) && text.length < 180);
  };

  const brandDnaReadyForSite =
    Boolean(brandDnaFetchedFor) &&
    brandDnaFetchedFor === normalizeWebsiteKey(website) &&
    Boolean(groqData?.brandSummary) &&
    !isPlaceholderBrandSummary(groqData.brandSummary);

  useEffect(() => { localStorage.setItem('marqq_ob_tagline', brandTagline); }, [brandTagline]);
  useEffect(() => { localStorage.setItem('marqq_ob_tone', toneOfVoice); }, [toneOfVoice]);

  // If Brand DNA step is restored without a successful scrape for this website, fetch once.
  useEffect(() => {
    if (step !== 6 || groqLoading || brandDnaReadyForSite || !normalizeWebsiteKey(website)) return;
    const siteKey = normalizeWebsiteKey(website);
    if (brandDnaAutoAttemptRef.current === siteKey) return;
    brandDnaAutoAttemptRef.current = siteKey;
    void handleRunGroqSynthesis({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional gate on step/website readiness
  }, [step, website, brandDnaReadyForSite, groqLoading]);

  useEffect(() => {
    // During incomplete onboarding, never hydrate shared workspace Brand DNA into the
    // review form. That race skipped the live website scrape (thin placeholder DNA).
    if (!isOnboardingComplete()) {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const [ctx, files] = await Promise.all([fetchBrandContext(), fetchKnowledgeFiles()]);
      if (cancelled) return;
      if (ctx?.voiceTranscript) setVoiceTranscript(ctx.voiceTranscript);
      if (ctx?.logoUrl) { setLogoUrl(ctx.logoUrl); setLogoBroken(false); }
      if (ctx?.brandSummary || ctx?.colors?.length) {
        setGroqData(prev => prev || {
          brandSummary: ctx.brandSummary || '',
          positioningTags: ctx.positioningTags || [],
          colors: ctx.colors || [],
          fonts: ctx.fonts || '',
        });
      }
      if (ctx?.brandTagline) setBrandTagline(ctx.brandTagline);
      if (ctx?.toneOfVoice) setToneOfVoice(ctx.toneOfVoice);
      if (ctx?.website || ctx?.websiteUrl) {
        setBrandDnaFetchedFor(normalizeWebsiteKey(ctx.website || ctx.websiteUrl));
      }
      if (files?.length) setKbFiles(files);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!logoUrl) {
        if (alive) setLogoDisplaySrc('');
        return;
      }
      const src = await resolveLogoImgSrc(logoUrl);
      if (!alive) return;
      if (!src) {
        setLogoBroken(true);
        setLogoDisplaySrc('');
        return;
      }
      setLogoDisplaySrc(src);
      setLogoBroken(false);
    })();
    return () => { alive = false; };
  }, [logoUrl]);

  async function saveBrandContextNow(extra = {}) {
    const context = buildBrandContextFromOnboarding({
      companyName,
      website,
      niche,
      icp,
      customerType,
      audienceIndustry,
      buyerRole,
      companySize,
      audienceLocation,
      audienceProblem,
      audienceNotes,
      outcome,
      timeWindow,
      target,
      baseline,
      brandTagline,
      toneOfVoice,
      voiceTranscript,
      kbFiles,
      logoUrl,
      groqData,
      ...extra,
    });
    return persistBrandContext(context);
  }

  function buildAudienceSummary() {
    const typeLabel = customerType === 'organizations' ? 'Organizations or businesses' : customerType === 'people' ? 'People or households' : customerType === 'both' ? 'People and organizations' : '';
    const sizeLabel = companySize ? `${companySize}${customerType === 'people' ? ' people' : ' organizations'}` : '';
    return [
      buyerRole,
      sizeLabel,
      audienceIndustry,
      audienceLocation,
      typeLabel,
      audienceProblem ? `who need help with ${audienceProblem}` : '',
      audienceNotes,
    ].filter(Boolean).join('; ');
  }

  async function fileToBase64(file) {
    const ab = await file.arrayBuffer();
    let binary = '';
    new Uint8Array(ab).forEach(b => { binary += String.fromCharCode(b); });
    return window.btoa(binary);
  }

  async function handleLogoUpload(file) {
    if (!file) return;
    setLogoUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await apiFetch('/api/brand-dna/logo', {
        method: 'POST',
        body: JSON.stringify({ workspaceId: getActiveWorkspaceId(), name: file.name, mime: file.type || 'image/png', size: file.size, base64 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.logoUrl) throw new Error(json.error || 'Logo upload failed');
      setLogoUrl(json.logoUrl);
      setLogoBroken(false);
      await saveBrandContextNow({ logoUrl: json.logoUrl });
    } catch (err) {
      console.warn('[logo]', err.message);
      const localUrl = URL.createObjectURL(file);
      setLogoUrl(localUrl);
      setLogoDisplaySrc(localUrl);
      setLogoBroken(false);
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  async function handleLogoDelete() {
    const prev = logoUrl;
    setLogoUrl('');
    setLogoDisplaySrc('');
    setLogoBroken(false);
    try {
      await deleteBrandLogo();
      await saveBrandContextNow({ logoUrl: '' });
    } catch (err) {
      console.warn('[logo delete]', err.message);
      setLogoUrl(prev);
    }
  }

  async function handleKbDelete(fileId) {
    if (!fileId) return;
    const prev = kbFiles;
    const next = kbFiles.filter((f) => f.id !== fileId);
    setKbFiles(next);
    setKbError('');
    try {
      const res = await fetch(
        `/api/brand-dna/knowledge-base/${encodeURIComponent(fileId)}?workspaceId=${encodeURIComponent(getActiveWorkspaceId())}`,
        { method: 'DELETE' }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Delete failed (${res.status})`);
      await saveBrandContextNow({ kbFiles: next });
    } catch (err) {
      console.warn('[kb delete]', err.message);
      setKbFiles(prev);
      setKbError(err.message || 'Could not delete file');
    }
  }

  async function handleKbUpload(files) {
    if (!files?.length) return;
    setKbUploading(true); setKbError('');
    try {
      const payload = await Promise.all(Array.from(files).map(async f => ({
        name: f.name, mime: f.type || 'application/octet-stream', size: f.size, base64: await fileToBase64(f)
      })));
      const res = await fetch('/api/brand-dna/knowledge-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: getActiveWorkspaceId(), files: payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Knowledge upload failed');
      const created = Array.isArray(json.files) ? json.files : [];
      setKbFiles(prev => {
        const next = [...created, ...prev];
        saveBrandContextNow({ kbFiles: next });
        return next;
      });
    } catch (err) {
      setKbError(err.message || 'Upload failed');
      const local = Array.from(files).map((f, i) => ({ id: `kb-local-${Date.now()}-${i}`, name: f.name, size: f.size }));
      setKbFiles(prev => [...local, ...prev]);
    } finally { setKbUploading(false); if (kbInputRef.current) kbInputRef.current.value = ''; }
  }

  async function startVoiceRecording() {
    if (!('MediaRecorder' in window)) { setVoiceError('Voice recording not supported in this browser.'); return; }
    setVoiceError(''); chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => stream.getTracks().forEach(t => t.stop());
      mr.start(250);
      setRecording(true);
    } catch (err) { setVoiceError(err.message || 'Microphone permission denied'); }
  }

  async function stopVoiceRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    setRecording(false); setVoiceWorking(true);
    try {
      await new Promise(r => { mr.addEventListener('stop', r, { once: true }); mr.stop(); });
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
      if (!blob.size) throw new Error('No audio captured');
      const base64 = await fileToBase64(blob);
      const res = await fetch('/api/voicebot/stt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: getActiveWorkspaceId(), audioBase64: base64, mimeType: blob.type, language: 'en' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Transcription failed');
      const text = String(json?.transcript || '').trim();
      if (text) {
        setVoiceTranscript(prev => {
          const next = prev ? `${prev}\n\n${text}` : text;
          saveBrandContextNow({ voiceTranscript: next });
          return next;
        });
      } else throw new Error('No speech detected — try speaking a bit longer.');
    } catch (err) { setVoiceError(err.message || 'Voice capture failed'); }
    finally { setVoiceWorking(false); mediaRecorderRef.current = null; chunksRef.current = []; }
  }

  function displayHost(url) {
    try { return new URL(url.startsWith('http') ? url : `https://${url}`).host.replace(/^www\./, ''); }
    catch { return url.replace(/^https?:\/\//, '').replace(/\/$/, ''); }
  }

  function formatBytes(size) {
    if (!size) return '0 B';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  const welcomeAgents = [
    { name: 'Veena', role: 'Company Intel', avatarColor: '#3d8bff', letter: 'V', avatarUrl: 'https://images.unsplash.com/photo-1618151313441-bc79b11e5090?w=200&auto=format&fit=crop&q=80' },
    { name: 'Dev', role: 'Performance', avatarColor: '#ff6a00', letter: 'D', avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&auto=format&fit=crop&q=80' },
    { name: 'Riya', role: 'Content Producer', avatarColor: '#38b06b', letter: 'R', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80' },
    { name: 'Maya', role: 'SEO & Search', avatarColor: '#c74dd1', letter: 'M', avatarUrl: 'https://images.unsplash.com/photo-1614283233556-f35b0c801ef1?w=200&auto=format&fit=crop&q=80' },
    { name: 'Arjun', role: 'B2B Leads', avatarColor: '#d13a5c', letter: 'A', avatarUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=200&auto=format&fit=crop&q=80' },
    { name: 'Zara', role: 'Channel Strategy', avatarColor: '#4aa8a3', letter: 'Z', avatarUrl: 'https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?w=200&auto=format&fit=crop&q=80' },
    { name: 'Isha', role: 'Market Research', avatarColor: '#e0b13a', letter: 'I', avatarUrl: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=200&auto=format&fit=crop&q=80' },
    { name: 'Neel', role: 'Strategy & GTM', avatarColor: '#5a6ee0', letter: 'N', avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80' },
    { name: 'Tara', role: 'CRO & Offers', avatarColor: '#c74d8f', letter: 'T', avatarUrl: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=200&auto=format&fit=crop&q=80' },
    { name: 'Sam', role: 'Messaging & Voice', avatarColor: '#39a6a3', letter: 'S', avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&auto=format&fit=crop&q=80' },
    { name: 'Kiran', role: 'Social Media', avatarColor: '#8a5ce0', letter: 'K', avatarUrl: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=200&auto=format&fit=crop&q=80' },
    { name: 'Priya', role: 'Competitor Watch', avatarColor: '#e0575a', letter: 'P', avatarUrl: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&auto=format&fit=crop&q=80' }
  ];

  const [integrationsState, setIntegrationsState] = useState([
    { id: 'google_ads', name: 'Google Ads', connected: false, status: 'not_connected' },
    { id: 'meta_ads', name: 'Meta Ads', connected: false, status: 'not_connected' },
    { id: 'ga4', name: 'Google Analytics', connected: false, status: 'not_connected' },
    { id: 'gsc', name: 'Google Search Console', connected: false, status: 'not_connected' },
    { id: 'linkedin_ads', name: 'LinkedIn Ads', connected: false, status: 'not_connected' },
    { id: 'salesforce', name: 'Salesforce CRM', connected: false, status: 'not_connected' },
    { id: 'hubspot', name: 'HubSpot CRM', connected: false, status: 'not_connected' },
    { id: 'ga4', name: 'Google Analytics', connected: false, status: 'not_connected' },
    { id: 'google_sheets', name: 'Google Sheets', connected: false, status: 'not_connected' },
    { id: 'google_docs', name: 'Google Docs', connected: false, status: 'not_connected' },
    { id: 'github', name: 'GitHub', connected: false, status: 'not_connected' },
    { id: 'appstore_connect', name: 'App Store Connect', connected: false, status: 'not_connected' },
    { id: 'revenuecat', name: 'RevenueCat', connected: false, status: 'not_connected' },
    { id: 'firebase', name: 'Firebase', connected: false, status: 'not_connected' },
    { id: 'google_play_console', name: 'Google Play Console', connected: false, status: 'not_connected' },
    { id: 'supabase', name: 'Supabase', connected: false, status: 'not_connected' },
  ]);
  const [connectingConnectorId, setConnectingConnectorId] = useState(null);
  const [connectError, setConnectError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Bind this user's workspace before listing connectors (never inherit prior browser workspace).
      await ensureUserWorkspace({ name: companyName || 'My workspace', websiteUrl: website || null }).catch(() => null);
      if (cancelled) return;
      const ws = getActiveWorkspaceId();
      try {
        const r = await apiFetch(`/api/integrations?companyId=${encodeURIComponent(ws)}`);
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.connectors && data.connectors.length > 0) {
          setIntegrationsState(data.connectors);
        }
      } catch {
        /* keep defaults — all disconnected */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [onboardingPickerId, setOnboardingPickerId] = useState(null);

  const handleConnectConnector = async (connectorId) => {
    if (NO_AUTH_CONNECTORS.has(connectorId)) {
      setOnboardingPickerId(connectorId);
      return;
    }
    setConnectingConnectorId(connectorId);
    setConnectError('');
    try {
      const res = await connectComposioConnector({
        companyId: getActiveWorkspaceId(),
        connectorId,
        onConnected: (id) => {
          // OAuth authenticates the provider; resource selection is a separate
          // workspace-scoped step and must happen before analytics can run.
          setIntegrationsState(prev =>
            prev.map(c => c.id === id ? { ...c, connected: true, status: 'active' } : c)
          );
          if (connectorNeedsResourcePicker(id)) setOnboardingPickerId(id);
        }
      });
      if (res?.status === 'connected') {
        setIntegrationsState(prev =>
          prev.map(c => c.id === connectorId ? { ...c, connected: true, status: 'active' } : c)
        );
        if (connectorNeedsResourcePicker(connectorId)) setOnboardingPickerId(connectorId);
      }
      // 'closed' / 'redirect' → user dismissed popup or same-tab OAuth started.
    } catch (err) {
      const msg = formatConnectorError(err);
      console.warn('Connect notice:', msg);
      setConnectError(msg);
    } finally {
      setConnectingConnectorId(null);
    }
  };

  const handleRunGroqSynthesis = async ({ force = false } = {}) => {
    const siteKey = normalizeWebsiteKey(website);
    if (!siteKey) {
      setOnboardingError('Add a website first so Marqq can scrape Brand DNA.');
      return false;
    }
    if (!force && brandDnaReadyForSite) return true;
    if (brandDnaInFlightRef.current === siteKey) return false;

    brandDnaInFlightRef.current = siteKey;
    setGroqLoading(true);
      setAppLinks({ googlePlay: [], appleAppStore: [], androidPackageNames: [], appleAppIds: [], firebaseProjectIds: [] });
    setOnboardingError('');
    try {
      const audienceSummary = buildAudienceSummary() || icp;
      const res = await fetch('/api/brand-dna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, websiteUrl: website, industry: niche || audienceIndustry, icp: audienceSummary, workspaceId: getActiveWorkspaceId() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false || !json?.brandDna) {
        throw new Error(json?.error || `Brand DNA request failed (${res.status})`);
      }
      const dna = json.brandDna || {};
      const signals = json.signals || {};
      const discoveredAppLinks = signals.appLinks || { googlePlay: [], appleAppStore: [], androidPackageNames: [], appleAppIds: [], firebaseProjectIds: [] };
      setAppLinks(discoveredAppLinks);
      try {
        localStorage.setItem(`marqq_mobile_app_hints_${getActiveWorkspaceId()}`, JSON.stringify({
          website: siteKey,
          firebaseProjectId: discoveredAppLinks.firebaseProjectIds?.[0] || '',
          googlePlayPackageName: discoveredAppLinks.androidPackageNames?.[0] || '',
          appstoreConnectAppId: discoveredAppLinks.appleAppIds?.[0] || '',
          discoveredAt: new Date().toISOString(),
        }));
      } catch { /* optional convenience hint */ }
      const fallbackSummary = signals.description || signals.h1 || signals.ogDescription || `${companyName || 'Your company'} serves ${audienceSummary || 'your target audience'}.`;
      const nextSummary = dna.businessSummary || dna.brandSummary || fallbackSummary;
      if (isPlaceholderBrandSummary(nextSummary, companyName) && !signals.description && !signals.h1) {
        throw new Error('Website scrape returned no usable brand signals. Check the URL and re-run.');
      }
      const nextColors = dna.colors || signals.colors || ['#ff6a00', '#f2790a', '#191613'];
      const nextFonts = dna.fonts || signals.fonts || 'Archivo, Inter';
      const nextTagline = String(dna.brandTagline || signals.pageTagline || signals.ogDescription || '').trim();
      const nextTone = String(dna.toneOfVoice || '').trim();
      setGroqData({
        brandSummary: nextSummary,
        positioningTags: dna.positioningTags || [],
        colors: nextColors,
        fonts: nextFonts,
      });
      if (nextTagline) setBrandTagline(nextTagline);
      if (nextTone) setToneOfVoice(nextTone);
      // Always apply the freshly scraped logo — previous empty/broken URLs must not stick.
      const scraped = [signals.logoUrl, signals.logoSourceUrl, signals.faviconUrl]
        .map((u) => String(u || '').trim())
        .find((u) =>
          (/^https?:\/\//i.test(u) || u.startsWith('data:image/')) &&
          !/og-cover|og-image|opengraph|twitter.?image|social.?share|imgs\/og/i.test(u)
        ) || '';
      if (scraped) {
        setLogoUrl(scraped);
        setLogoBroken(false);
      }
      setBrandDnaFetchedFor(siteKey);
      await saveBrandContextNow({
        logoUrl: scraped || logoUrl || '',
        icp: audienceSummary,
        niche: niche || audienceIndustry,
        brandTagline: nextTagline || brandTagline,
        toneOfVoice: nextTone || toneOfVoice,
        groqData: {
          brandSummary: nextSummary,
          positioningTags: dna.positioningTags || [],
          colors: nextColors,
          fonts: nextFonts,
        },
      });
      return true;
    } catch (err) {
      console.warn('[brand-dna] synthesis error:', err.message);
      setBrandDnaFetchedFor('');
      setOnboardingError(`Brand DNA could not be fetched. ${err.message || 'Check the website and try again.'}`);
      return false;
    } finally {
      if (brandDnaInFlightRef.current === siteKey) brandDnaInFlightRef.current = '';
      setGroqLoading(false);
    }
  };

  const runPreGtmResearch = async ({ force = false } = {}) => {
    const researchSite = normalizeWebsiteKey(preGtmResearch?.inputs?.website);
    if (!force && preGtmResearch?.status === 'completed' && researchSite === normalizeWebsiteKey(website)) return preGtmResearch;
    setPreGtmResearchLoading(true);
    setOnboardingError('');
    try {
      const response = await apiFetch('/api/gtm/preflight-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: getActiveWorkspaceId(),
          companyName,
          website,
          niche: niche || audienceIndustry,
          icp: buildAudienceSummary() || icp,
          audienceLocation,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) throw new Error(json?.error || `Research failed (${response.status})`);
      let next = json;
      if (response.status === 202 && json?.jobId) {
        for (let attempt = 0; attempt < 120; attempt += 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          const poll = await apiFetch(`/api/gtm/preflight-research/${encodeURIComponent(json.jobId)}?workspaceId=${encodeURIComponent(getActiveWorkspaceId())}`);
          const pollJson = await poll.json().catch(() => ({}));
          if (!poll.ok) throw new Error(pollJson?.error || `Research status failed (${poll.status})`);
          if (pollJson?.job?.status === 'completed') {
            next = pollJson.job;
            break;
          }
          if (pollJson?.job?.status === 'failed') throw new Error(pollJson.job.error || 'Research failed');
          if (attempt === 119) throw new Error('Research is still running. It remains queued and can be refreshed later.');
        }
      }
      next = { ...next, status: next.status || 'completed' };
      setPreGtmResearch(next);
      localStorage.setItem('marqq_pre_gtm_research', JSON.stringify(next));
      return next;
    } catch (err) {
      setOnboardingError(`Pre-GTM research could not be completed. ${err.message || 'Retry or continue later.'}`);
      return null;
    } finally {
      setPreGtmResearchLoading(false);
    }
  };

  useEffect(() => {
    if (SKIP_ONBOARDING_MARKET_RESEARCH && step === MARKET_RESEARCH_STEP) {
      setStep(ONBOARDING_TOTAL_STEPS);
      return;
    }
    if (SKIP_ONBOARDING_MARKET_RESEARCH) return;
    const researchSite = normalizeWebsiteKey(preGtmResearch?.inputs?.website);
    if (step !== MARKET_RESEARCH_STEP || preGtmResearchLoading || (preGtmResearch?.status === 'completed' && researchSite === normalizeWebsiteKey(website))) return;
    void runPreGtmResearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when research gate opens
  }, [step, website]);


  const nextStep = async () => {
    // Don't leave Brand DNA while scrape/synthesis is still running
    if (groqLoading) return;
    setOnboardingError('');
    if (step === 2 && (!companyName.trim() || !website.trim())) {
      setOnboardingError('Add your company name and website so Marqq can ground its research.');
      return;
    }
    if (step === 2) {
      const workspace = await ensureUserWorkspace({ name: companyName, websiteUrl: website }).catch(() => null);
      if (!workspace || !isUuidWorkspaceId(workspace.id) || !isUuidWorkspaceId(getActiveWorkspaceId())) {
        setOnboardingError('Marqq could not bind this onboarding flow to a workspace. Please retry once, then continue.');
        return;
      }
    }
    if (step === 3) {
      const audienceSummary = buildAudienceSummary();
      if (audienceSummary) setIcp(audienceSummary);
      if (!audienceSummary.trim() && !icp.trim()) {
        setOnboardingError('Add the customer type, market, and problem you solve so Marqq can target the right audience.');
        return;
      }
    }
    if (step === 4 && (!outcome.trim() || !timeWindow)) {
      setOnboardingError('Add a primary outcome and target window so Marqq can measure progress.');
      return;
    }
    if (step === 5) {
      // Always enter Brand DNA with a live scrape for the current website.
      // Do not skip when stale groqData exists from another workspace/session.
      setStep(6);
      await handleRunGroqSynthesis({ force: !brandDnaReadyForSite });
      return;
    }
    if (step === 6) {
      if (!brandDnaReadyForSite) {
        const ok = await handleRunGroqSynthesis({ force: true });
        if (!ok) return;
      }
      await saveBrandContextNow();
      setStep(7);
      return;
    }
    if (step === 7 && SKIP_ONBOARDING_MARKET_RESEARCH) {
      setStep(ONBOARDING_TOTAL_STEPS);
      return;
    }
    if (step === MARKET_RESEARCH_STEP) {
      if (SKIP_ONBOARDING_MARKET_RESEARCH) {
        setStep(ONBOARDING_TOTAL_STEPS);
        return;
      }
      if (preGtmResearchLoading) return;
      const researchSite = normalizeWebsiteKey(preGtmResearch?.inputs?.website);
      const result = preGtmResearch?.status === 'completed' && researchSite === normalizeWebsiteKey(website)
        ? preGtmResearch
        : await runPreGtmResearch({ force: true });
      if (!result) return;
      setStep(9);
      return;
    }
    if (step < ONBOARDING_TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      await saveBrandContextNow();
      localStorage.setItem('marqq_onboarding_complete', '1');
      localStorage.removeItem('marqq_onboarding_step');
      setActiveScreen('gtmwizard');
    }
  };

  const prevStep = () => {
    if (step <= 1) return;
    if (SKIP_ONBOARDING_MARKET_RESEARCH && step === ONBOARDING_TOTAL_STEPS) {
      setStep(7);
      return;
    }
    setStep(step - 1);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header */}
      <div style={{ padding: '20px 32px', borderBottom: '2px solid var(--color-divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '20px' }}>
          MARQQ<span style={{ color: 'var(--color-accent)' }}>.</span>
        </div>
      </div>

      {/* Main Form Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '56px 24px' }}>
        <div style={{ width: '560px' }}>
          {/* Progress Dots Bar */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
            {Array.from({ length: ONBOARDING_TOTAL_STEPS }, (_, i) => i + 1).map(s => (
              <span
                key={s}
                style={{
                  height: '3px',
                  flex: 1,
                  background: s <= step ? 'var(--color-accent)' : 'var(--color-divider)'
                }}
              />
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p className="text-muted" style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0, fontWeight: 800 }}>
              Step {step} of {ONBOARDING_TOTAL_STEPS} · {ONBOARDING_STEP_LABELS[step - 1]}
            </p>
            <span className="tag tag-accent" style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sparkles size={12} /> AI Strategy Engine
            </span>
          </div>

          {/* Step 1: Welcome AI Team */}
          {step === 1 && (
            <div>
              <h1 style={{ marginBottom: '6px' }}>Your AI team is waiting</h1>
              <p className="text-muted" style={{ marginBottom: '24px' }}>Twelve specialists, ready to research, plan and execute once you brief them.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '24px' }}>
                {welcomeAgents.map((a, i) => (
                  <div
                    key={i}
                    className="card agent-onboarding-card"
                    style={{
                      textAlign: 'center',
                      padding: '14px 6px',
                      animationDelay: `${i * 0.05}s`,
                      border: '1px solid var(--color-divider)'
                    }}
                  >
                    <div className="agent-avatar-box" style={{ width: '42px', height: '42px', margin: '0 auto 8px', borderRadius: '0px', background: `linear-gradient(135deg, ${a.avatarColor}, #191613)`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
                      <img src={a.avatarUrl} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                      <span style={{ display: 'none', fontFamily: 'var(--font-heading)', fontWeight: 800, color: '#fff', fontSize: '15px' }}>{a.letter}</span>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>{a.name}</div>
                    <div className="text-muted" style={{ fontSize: '10px', marginTop: '2px' }}>{a.role}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Company Details */}
          {step === 2 && (
            <div>
              <h1 style={{ marginBottom: '6px' }}>Tell us about your company</h1>
              <p className="text-muted" style={{ marginBottom: '28px' }}>Research starts as soon as you continue.</p>
              <div style={{ display: 'grid', gap: '16px', marginBottom: '24px' }}>
                <div className="field">
                  <label htmlFor="ob-name">Company name</label>
                  <input
                    className="input"
                    id="ob-name"
                    placeholder="Acme Health"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ob-site">Website URL</label>
                  <input
                    className="input"
                    id="ob-site"
                    placeholder="https://acme.example"
                    value={website}
                    onChange={e => setWebsite(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Audience & ICP */}
          {step === 3 && (
            <div>
              <h1 style={{ marginBottom: '6px' }}>Who is this for?</h1>
              <p className="text-muted" style={{ marginBottom: '24px' }}>Describe the people, organizations, or communities you want to reach.</p>
              <div style={{ display: 'grid', gap: '14px', marginBottom: '18px' }}>
                <div className="field">
                  <label htmlFor="ob-customer-type">Audience type</label>
                  <select className="input" id="ob-customer-type" value={customerType} onChange={e => setCustomerType(e.target.value)}>
                    <option value="">Choose one</option>
                    <option value="organizations">Organizations or businesses</option>
                    <option value="people">People or households</option>
                    <option value="both">Both people and organizations</option>
                    <option value="unsure">Not sure yet</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field"><label htmlFor="ob-audience-industry">Industry or category</label><input className="input" id="ob-audience-industry" placeholder="e.g. Hospitals, fintech, fitness" value={audienceIndustry} onChange={e => { setAudienceIndustry(e.target.value); setNiche(e.target.value); }} /></div>
                  <div className="field"><label htmlFor="ob-buyer-role">Buyer role or persona</label><input className="input" id="ob-buyer-role" placeholder="e.g. Founder, CMO, clinic owner" value={buyerRole} onChange={e => setBuyerRole(e.target.value)} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field"><label htmlFor="ob-company-size">Company size or life stage</label><select className="input" id="ob-company-size" value={companySize} onChange={e => setCompanySize(e.target.value)}><option value="">Choose if relevant</option><option>Solo / early stage</option><option>Small business</option><option>Mid-market</option><option>Enterprise</option><option>Any size</option></select></div>
                  <div className="field"><label htmlFor="ob-audience-location">Location or market</label><input className="input" id="ob-audience-location" placeholder="e.g. India, US, Southeast Asia" value={audienceLocation} onChange={e => setAudienceLocation(e.target.value)} /></div>
                </div>
                <div className="field"><label htmlFor="ob-audience-problem">Main problem they want solved</label><input className="input" id="ob-audience-problem" placeholder="e.g. Generate more qualified pipeline" value={audienceProblem} onChange={e => setAudienceProblem(e.target.value)} /></div>
                <div className="field"><label htmlFor="ob-audience-notes">Anything else Marqq should know? <span className="text-muted">(optional)</span></label><textarea className="input" id="ob-audience-notes" style={{ minHeight: '58px' }} placeholder="Add buying context, exclusions, or a more specific description" value={audienceNotes} onChange={e => setAudienceNotes(e.target.value)} /></div>
              </div>
              <p className="text-muted" style={{ fontSize: '11px', margin: 0 }}>Marqq can use your website to suggest audience details, but you stay in control of what gets used.</p>
            </div>
          )}

          {/* Step 4: Primary Goal */}
          {step === 4 && (
            <div>
              <h1 style={{ marginBottom: '6px' }}>What is your primary growth goal?</h1>
              <p className="text-muted" style={{ marginBottom: '24px' }}>Set your target outcome and timeline horizon.</p>
              <div style={{ display: 'grid', gap: '16px', marginBottom: '24px' }}>
                <div className="field">
                  <label htmlFor="ob-outcome">Business outcome</label>
                  <textarea className="input" id="ob-outcome" style={{ minHeight: '70px' }} placeholder="e.g. Generate more qualified leads, increase bookings, or launch in a new market" value={outcome} onChange={e => setOutcome(e.target.value)} />
                </div>
                <div className="field">
                  <label>Target window</label>
                  <div className="seg">
                    {['30 days', '60 days', '90 days', '2 quarters'].map((w) => (
                      <button
                        key={w}
                        type="button"
                        className={timeWindow === w ? 'seg-opt active' : 'seg-opt'}
                        onClick={() => setTimeWindow(w)}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label htmlFor="ob-target">Quantified target (optional)</label>
                    <input className="input" id="ob-target" value={target} onChange={e => setTarget(e.target.value)} placeholder="$2M pipeline" />
                  </div>
                  <div className="field">
                    <label htmlFor="ob-baseline">Current baseline (optional)</label>
                    <input className="input" id="ob-baseline" value={baseline} onChange={e => setBaseline(e.target.value)} placeholder="$1.2M pipeline" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Data Integration Connectors */}
          {step === 5 && (
            <div>
              <h1 style={{ marginBottom: '6px' }}>Connect the data Marqq should use</h1>
              <p className="text-muted" style={{ marginBottom: '28px' }}>Optional — skip and Marqq will flag missing data as it works.</p>
              {connectError ? (
                <p className="text-muted" role="alert" style={{ marginBottom: '16px', color: 'var(--color-danger)', fontSize: 13 }}>
                  {connectError}
                </p>
              ) : null}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '24px' }}>
                {integrationsState.map((ing, i) => {
                  const active = isConnectorActive(ing);
                  const isConnecting = connectingConnectorId === ing.id;
                  return (
                    <div key={i} className="card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>{ing.name}</span>
                      <button
                        type="button"
                        className={active ? 'tag tag-accent' : 'tag tag-neutral'}
                        onClick={() => {
                          if (NO_AUTH_CONNECTORS.has(ing.id) || (active && connectorNeedsResourcePicker(ing.id))) {
                            setOnboardingPickerId(ing.id);
                          } else if (!active) {
                            handleConnectConnector(ing.id);
                          }
                        }}
                        disabled={isConnecting}
                        style={{ cursor: 'pointer', border: 'none' }}
                      >
                        {isConnecting ? 'CONNECTING...' : active ? 'CONNECTED' : NO_AUTH_CONNECTORS.has(ing.id) ? 'CONFIGURE' : 'CONNECT'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {onboardingPickerId && (
                <ResourcePickerModal
                  connectorId={onboardingPickerId}
                  companyId={getActiveWorkspaceId()}
                  onClose={() => setOnboardingPickerId(null)}
                  onSaved={() => {
                    setIntegrationsState(prev => prev.map(c => c.id === onboardingPickerId ? { ...c, connected: true, status: 'active' } : c));
                    setOnboardingPickerId(null);
                  }}
                />
              )}
            </div>
          )}

          {/* Step 6: Brand DNA Review */}
          {step === 6 && (
            <div className="onboarding-brand-review">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <h1 style={{ margin: 0 }}>Review your Brand DNA</h1>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleRunGroqSynthesis({ force: true })}
                  disabled={groqLoading}
                  style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <RefreshCw size={12} className={groqLoading ? 'spin' : ''} /> Re-run
                </button>
              </div>
              <p className="text-muted" style={{ fontSize: '13px', marginBottom: '18px' }}>Confirm the context Marqq will use. Edit any field — these enrich every agent action.</p>

              {/* GTM Brief Recap */}
              {(outcome || timeWindow || target) && (
                <div style={{ marginBottom: '16px', borderRadius: '10px', border: '1px solid rgba(255,101,33,0.25)', background: 'rgba(255,101,33,0.07)', padding: '12px 14px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,154,107,0.9)', marginBottom: '8px' }}>GTM brief captured</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 16px', fontSize: '12px', color: 'rgba(255,255,255,0.65)' }}>
                    <div><span style={{ color: 'rgba(255,255,255,0.3)' }}>Outcome: </span>{outcome || 'Not set'}</div>
                    <div><span style={{ color: 'rgba(255,255,255,0.3)' }}>Window: </span>{timeWindow || 'Not set'}</div>
                    <div><span style={{ color: 'rgba(255,255,255,0.3)' }}>Target: </span>{target || 'Marqq will propose one'}</div>
                    <div><span style={{ color: 'rgba(255,255,255,0.3)' }}>Baseline: </span>{baseline || 'Not supplied'}</div>
                  </div>
                </div>
              )}

              {groqLoading ? (
                <BrandStyleLoader title="Fetching your Brand DNA" website={website} />
              ) : !brandDnaReadyForSite ? (
                <div className="card" style={{ padding: '28px 20px', textAlign: 'center' }}>
                  <AlertCircle size={22} style={{ color: 'var(--color-accent)', marginBottom: 10 }} />
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Brand DNA not ready yet</div>
                  <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
                    Marqq needs a live scrape of {displayHost(website) || 'your website'} before you continue. Re-run to fetch tagline, tone, colors, and summary.
                  </p>
                  <button type="button" className="btn btn-primary" onClick={() => handleRunGroqSynthesis({ force: true })}>
                    Fetch Brand DNA
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>

                  {(appLinks.googlePlay.length > 0 || appLinks.appleAppStore.length > 0 || appLinks.firebaseProjectIds?.length > 0) && (
                    <div className="card" style={{ gridColumn: 'span 2', padding: '14px 16px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: '6px' }}>Mobile app links found on website</div>
                      <p className="text-muted" style={{ fontSize: 11, margin: '0 0 8px' }}>Review these links before selecting the matching app in Integrations.</p>
                      <div style={{ display: 'grid', gap: 5, fontSize: 12 }}>
                        {appLinks.googlePlay.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-accent)', overflowWrap: 'anywhere' }}>Google Play · {url}</a>)}
                        {appLinks.appleAppStore.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-accent)', overflowWrap: 'anywhere' }}>Apple App Store · {url}</a>)}
                      </div>
                      {(appLinks.androidPackageNames.length > 0 || appLinks.appleAppIds.length > 0) && (
                        <div className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>
                          IDs found: {appLinks.androidPackageNames.map((id) => `Android ${id}`).concat(appLinks.appleAppIds.map((id) => `Apple ${id}`), (appLinks.firebaseProjectIds || []).map((id) => `Firebase ${id}`)).join(' · ')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Identity — company name + website */}
                  <div className="card" style={{ gridColumn: 'span 2', padding: '14px 16px' }}>
                    <input
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      className="input"
                      style={{ background: 'transparent', border: 'none', padding: 0, fontWeight: 800, fontSize: '18px', marginBottom: '4px' }}
                      placeholder="Company name"
                    />
                    {website && (
                      <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: 'rgba(255,255,255,0.45)', textDecoration: 'none' }}>
                        <Link2 size={12} /> {displayHost(website)}
                      </a>
                    )}
                  </div>

                  {/* Logo */}
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '110px', padding: '14px' }}>
                    {logoUrl && !logoBroken && logoDisplaySrc ? (
                      <div style={{ width: '100%' }}>
                        <div style={{ background: '#111', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '64px' }}>
                          <img src={logoDisplaySrc} alt="Logo" referrerPolicy="no-referrer" style={{ maxHeight: '56px', maxWidth: '100%', objectFit: 'contain' }} onError={() => setLogoBroken(true)} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginTop: '6px' }}>
                          <button type="button" aria-label="Replace logo" onClick={() => logoInputRef.current?.click()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>
                            Replace
                          </button>
                          <button type="button" aria-label="Remove logo" onClick={handleLogoDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : logoUrl && !logoBroken ? (
                      <Loader2 size={18} style={{ color: 'rgba(255,255,255,0.4)', animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <button type="button" disabled={logoUploading} onClick={() => logoInputRef.current?.click()}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.18)', borderRadius: '8px', padding: '14px 20px', cursor: 'pointer', width: '100%' }}>
                        {logoUploading ? <Loader2 size={18} style={{ color: 'rgba(255,255,255,0.4)', animation: 'spin 1s linear infinite' }} /> : <Upload size={18} style={{ color: 'rgba(255,255,255,0.4)' }} />}
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Upload logo</span>
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>PNG, JPG, SVG, WebP</span>
                      </button>
                    )}
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden" style={{ display: 'none' }} onChange={e => handleLogoUpload(e.target.files?.[0])} />
                  </div>

                  {/* Business summary */}
                  <div className="card" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: '6px' }}>Business summary</div>
                    <textarea
                      value={groqData?.brandSummary || ''}
                      onChange={e => setGroqData(prev => ({ ...prev, brandSummary: e.target.value }))}
                      rows={4}
                      style={{ width: '100%', background: 'transparent', border: 'none', resize: 'none', fontSize: '12px', lineHeight: '1.6', color: 'rgba(255,255,255,0.7)', outline: 'none' }}
                      placeholder="What does this company do?"
                    />
                  </div>

                  {/* Colors */}
                  <div className="card" style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)' }}>Colors</div>
                      <button type="button" aria-label={editingColors ? 'Finish editing brand colors' : 'Edit brand colors'} onClick={() => setEditingColors(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'rgba(255,255,255,0.4)' }}>
                        <Pencil size={12} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(groqData?.colors || ['#ff6a00', '#f2790a', '#191613']).slice(0, 3).map((color, idx) => (
                        <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                          {editingColors ? (
                            <input type="color" value={color.length === 7 ? color : '#000000'}
                              onChange={e => {
                                const next = [...(groqData?.colors || ['#ff6a00','#f2790a','#191613'])];
                                next[idx] = e.target.value;
                                setGroqData(prev => ({ ...prev, colors: next }));
                              }}
                              style={{ height: '40px', width: '100%', cursor: 'pointer', borderRadius: '8px', border: 0, background: 'transparent', padding: 0 }}
                            />
                          ) : (
                            <div style={{ height: '40px', width: '100%', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: color }} />
                          )}
                          <span style={{ fontFamily: 'monospace', fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>{color}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Fonts */}
                  <div className="card" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: '8px' }}>Fonts</div>
                    <div style={{ fontWeight: 600, fontSize: '32px', color: 'rgba(255,255,255,0.85)', lineHeight: 1, marginBottom: '8px' }}>Aa</div>
                    <input
                      value={groqData?.fonts || 'Archivo, Inter'}
                      onChange={e => setGroqData(prev => ({ ...prev, fonts: e.target.value }))}
                      style={{ width: '100%', background: 'transparent', border: 'none', fontSize: '12px', color: 'rgba(255,255,255,0.55)', outline: 'none' }}
                      placeholder="Inter, Fraunces, Georgia"
                    />
                  </div>

                  {/* Brand tagline */}
                  <div className="card" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: '6px' }}>Brand tagline</div>
                    <textarea
                      value={brandTagline}
                      onChange={e => setBrandTagline(e.target.value)}
                      rows={3}
                      style={{ width: '100%', background: 'transparent', border: 'none', resize: 'none', fontSize: '13px', lineHeight: '1.5', color: 'rgba(255,255,255,0.75)', outline: 'none' }}
                      placeholder="One-line brand promise"
                    />
                  </div>

                  {/* Tone of voice */}
                  <div className="card" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: '6px' }}>Tone of voice</div>
                    <textarea
                      value={toneOfVoice}
                      onChange={e => setToneOfVoice(e.target.value)}
                      rows={3}
                      style={{ width: '100%', background: 'transparent', border: 'none', resize: 'none', fontSize: '12px', lineHeight: '1.5', color: 'rgba(255,255,255,0.65)', outline: 'none' }}
                      placeholder="How should agents write for this brand?"
                    />
                  </div>

                  {/* Positioning tags */}
                  {(groqData?.positioningTags?.length > 0) && (
                    <div className="card" style={{ gridColumn: 'span 2', padding: '12px 16px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: '8px' }}>Positioning</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {groqData.positioningTags.map((tag, idx) => (
                          <span key={idx} className="tag tag-outline" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 8px' }}>{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Voice brand brief */}
                  <div style={{ gridColumn: 'span 2', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.02)', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)' }}>Voice brand brief</div>
                        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '3px' }}>Record anything about your brand — takes append to the same transcript.</p>
                      </div>
                      {!recording ? (
                        <button type="button" disabled={voiceWorking} onClick={startVoiceRecording}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', padding: '5px 12px', fontSize: '12px', color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}>
                          {voiceWorking ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Mic size={12} />}
                          {voiceWorking ? 'Saving…' : voiceTranscript ? 'Add more' : 'Record'}
                        </button>
                      ) : (
                        <button type="button" onClick={stopVoiceRecording}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', borderRadius: '999px', border: '1px solid rgba(248,113,113,0.4)', background: 'rgba(239,68,68,0.2)', padding: '5px 12px', fontSize: '12px', color: 'rgba(254,202,202,0.9)', cursor: 'pointer' }}>
                          <Square size={10} style={{ fill: 'currentColor' }} /> Stop
                        </button>
                      )}
                    </div>
                    {recording && <p style={{ fontSize: '11px', color: 'rgba(254,202,202,0.85)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#f87171', animation: 'pulse 1s infinite' }} />Listening… speak freely, then tap Stop.</p>}
                    {voiceError && <p style={{ fontSize: '11px', color: 'var(--color-warning)', marginTop: '6px' }}>{voiceError}</p>}
                    {voiceTranscript && (
                      <div style={{ marginTop: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: '4px' }}><Pencil size={11} style={{ color: 'rgba(255,255,255,0.35)' }} /> Transcript</span>
                          <button type="button" aria-label="Clear voice transcript" onClick={() => setVoiceTranscript('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: '2px' }} title="Clear"><Eraser size={12} /></button>
                        </div>
                        <textarea value={voiceTranscript} onChange={e => setVoiceTranscript(e.target.value)} rows={4}
                          style={{ width: '100%', background: 'transparent', border: 'none', resize: 'vertical', fontSize: '12px', lineHeight: '1.6', color: 'rgba(255,255,255,0.7)', outline: 'none' }}
                          placeholder="Edit your brand brief here…" />
                      </div>
                    )}
                    {!voiceTranscript && !recording && <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '8px' }}>No voice notes yet — describe your product, audience, or brand voice out loud.</p>}
                  </div>

                  {/* Knowledge base upload */}
                  <div style={{ gridColumn: 'span 2', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.02)', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)' }}>Brand knowledge base</div>
                        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '3px' }}>Upload PDF, PPTX, images, TXT, or MD so agents learn your brand.</p>
                      </div>
                      <button type="button" disabled={kbUploading} onClick={() => kbInputRef.current?.click()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', padding: '5px 12px', fontSize: '12px', color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}>
                        {kbUploading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={12} />} Upload
                      </button>
                      <input ref={kbInputRef} type="file" multiple accept=".pdf,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.txt,.md" style={{ display: 'none' }} onChange={e => handleKbUpload(e.target.files)} />
                    </div>
                    {kbError && <p style={{ fontSize: '11px', color: 'var(--color-warning)', marginTop: '6px' }}>{kbError}</p>}
                    {kbFiles.filter(f => f.category !== 'voice_note' && f.category !== 'voice_transcript').length > 0 ? (
                      <ul style={{ marginTop: '10px', listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {kbFiles.filter(f => f.category !== 'voice_note' && f.category !== 'voice_transcript').map(file => (
                          <li key={file.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', fontSize: '12px', color: 'rgba(255,255,255,0.65)' }}>
                            <FileText size={13} style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                            <span style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{formatBytes(file.size)}</span>
                            <button type="button" aria-label={`Delete ${file.name}`} onClick={() => handleKbDelete(file.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '2px' }}><Trash2 size={12} /></button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '8px' }}>No files yet — guidelines, decks, and brand docs welcome.</p>
                    )}
                  </div>

                </div>
              )}
            </div>
          )}

          {/* Step 7: Activated AI Team */}
          {step === 7 && (
            <div>
              <h1 style={{ marginBottom: '6px' }}>Your AI team is activated</h1>
              <p className="text-muted" style={{ marginBottom: '24px' }}>All 12 specialist agents are ready to research, plan and execute against your industry, ICP and goal.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '24px' }}>
                {welcomeAgents.map((a, i) => (
                  <div
                    key={i}
                    className="card agent-onboarding-card"
                    style={{
                      textAlign: 'center',
                      padding: '14px 6px',
                      animationDelay: `${i * 0.06}s`,
                      border: '1px solid var(--color-accent)'
                    }}
                  >
                    <div
                      className="agent-avatar-box agent-activating-pulse"
                      style={{
                        width: '42px',
                        height: '42px',
                        margin: '0 auto 8px',
                        borderRadius: '0px',
                        background: `linear-gradient(135deg, ${a.avatarColor}, #191613)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid rgba(255,255,255,0.2)',
                        boxShadow: '0 0 12px rgba(255,106,0,0.3)',
                        overflow: 'hidden'
                      }}
                    >
                      <img src={a.avatarUrl} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                      <span style={{ display: 'none', fontFamily: 'var(--font-heading)', fontWeight: 800, color: '#fff', fontSize: '15px' }}>{a.letter}</span>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '2px' }}>{a.name}</div>
                    <span className="tag tag-accent" style={{ fontSize: '9px', padding: '1px 6px' }}>
                      <CheckCircle2 size={10} style={{ marginRight: '2px' }} /> Activated
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 8: Pre-GTM research (hidden during onboarding — too slow) */}
          {step === MARKET_RESEARCH_STEP && !SKIP_ONBOARDING_MARKET_RESEARCH && (
            <div>
              <h1 style={{ marginBottom: '6px' }}>Research before GTM strategy</h1>
              <p className="text-muted" style={{ marginBottom: '24px' }}>
                Your agents are activated. They are gathering live market, website, and recent-signal evidence before the GTM strategy is generated.
              </p>
              {preGtmResearchLoading ? (
                <>
                  <BrandStyleLoader
                    title="Researching your market"
                    website={website}
                    steps={[
                      { icon: '🌐', label: 'Website signals', detail: website || 'your site' },
                      { icon: '◈', label: 'Market landscape', detail: 'category · demand · alternatives' },
                      { icon: '📰', label: 'Recent 30-day signals', detail: 'Reddit · X · YouTube · web' },
                      { icon: '✓', label: 'Evidence pack', detail: 'ready for GTM strategy' },
                    ]}
                    messages={[
                      `Scanning ${website || 'your website'} for positioning signals…`,
                      'Mapping the category, demand, and alternatives…',
                      'Checking recent conversations and emerging signals…',
                      'Combining evidence for the strategy team…',
                    ]}
                  />
                  <p className="text-muted" style={{ fontSize: 12, textAlign: 'center', margin: '-4px 0 0' }}>
                    Recent-signal research can take up to 45 seconds. GTM will continue with a clearly marked evidence gap if it times out.
                  </p>
                </>
              ) : preGtmResearch ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div className="card" role="status">
                    <strong>Research pack ready</strong>
                    <div className="text-muted" style={{ fontSize: 12, marginTop: 5 }}>
                      Generated {preGtmResearch.generatedAt ? new Date(preGtmResearch.generatedAt).toLocaleString() : 'now'} · strategy generation will use this evidence.
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {Object.entries(preGtmResearch.sources || {}).map(([key, source]) => (
                      <div key={key} className="card" style={{ padding: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</div>
                        <span className={source.status === 'completed' ? 'tag tag-accent' : 'tag tag-outline'} style={{ marginTop: 7, display: 'inline-flex' }}>{source.status}</span>
                      </div>
                    ))}
                  </div>
                  {preGtmResearch.market?.source === 'groq' && preGtmResearch.market?.summary ? <div className="card"><strong>Market snapshot</strong><p className="card-body" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{preGtmResearch.market.summary}</p></div> : null}
                  {preGtmResearch.market?.source === 'groq' && preGtmResearch.market?.competitors?.length ? <div className="card"><strong>Competitors and alternatives</strong><ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>{preGtmResearch.market.competitors.slice(0, 5).map((item, index) => <li key={index} style={{ fontSize: 13, marginBottom: 4 }}>{item.name || item}{item.angle ? ` — ${item.angle}` : ''}</li>)}</ul></div> : null}
                  {preGtmResearch.market?.source === 'fallback' ? <div className="card" style={{ color: 'var(--color-accent-2)' }}>Live market research was unavailable. No market snapshot or competitor claims are being shown.</div> : null}
                  {preGtmResearch.last30days?.status === 'completed' ? (() => {
                    const insights = preGtmResearch.last30days.insights || {};
                    const signals = last30SignalItems(preGtmResearch.last30days);
                    return (
                    <div className="card">
                      <strong>{insights.headline || 'What changed in the last 30 days'}</strong>
                      {preGtmResearch.last30days.topic ? (
                        <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                          Searched: {preGtmResearch.last30days.topic}
                        </div>
                      ) : null}
                      <p className="card-body" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
                        {insights.insight || preGtmResearch.last30days.summary || 'Live signals were collected for GTM.'}
                      </p>
                      {Array.isArray(insights.themes) && insights.themes.length ? (
                        <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                          {insights.themes.map((theme, index) => (
                            <li key={index} style={{ fontSize: 13, marginBottom: 6 }}>
                              <strong>{theme.name || theme}</strong>
                              {theme.soWhat ? ` — ${theme.soWhat}` : ''}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {Array.isArray(insights.implications) && insights.implications.length ? (
                        <div style={{ marginTop: 10 }}>
                          <div className="text-muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Implications for GTM</div>
                          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                            {insights.implications.map((item, index) => (
                              <li key={index} style={{ fontSize: 13, marginBottom: 4 }}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {signals.length ? (
                        <div style={{ marginTop: 10 }}>
                          <div className="text-muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Evidence</div>
                          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                            {signals.map((item, index) => (
                              <li key={`${item.source}-${index}`} style={{ fontSize: 13, marginBottom: 6 }}>
                                <span className="text-muted">{item.source} · </span>
                                {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : item.title}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                    );
                  })() : (
                    <div className="card" style={{ color: 'var(--color-accent-2)' }}>
                      {preGtmResearch.last30days?.status === 'timed_out'
                        ? 'Recent-signal research took too long, so GTM can continue with market and website evidence. The strategy will label this evidence gap rather than inventing recent trends.'
                        : 'Recent-signal service unavailable: the strategy will label this evidence gap rather than inventing recent trends.'}
                    </div>
                  )}
                  <button type="button" className="btn btn-secondary" onClick={() => runPreGtmResearch({ force: true })}>Refresh research</button>
                </div>
              ) : (
                <div className="card" role="alert">Research has not started yet. Click Continue to retry.</div>
              )}
            </div>
          )}

          {/* Step 9: Ready → GTM Wizard */}
          {step === 9 && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: '52px', height: '52px', margin: '0 auto 16px', borderRadius: '0px', background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-bg)' }}>
                <CheckCircle2 size={28} />
              </div>
              <h1 style={{ marginBottom: '6px' }}>Your GTM Strategy Workspace is ready</h1>
              <p className="text-muted" style={{ marginBottom: '28px' }}>
                Brand DNA and agents are ready. Next: generate the strategy, review it, and lock the North Star.
              </p>
            </div>
          )}

          {/* Navigation Controls */}
          {onboardingError ? <div className="card" role="alert" style={{ marginTop: 20, color: 'var(--color-accent-2)' }}>{onboardingError}</div> : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
            {step > 1 ? (
              <button type="button" className="btn btn-secondary" onClick={prevStep}>
                Back
              </button>
            ) : <div />}

            <button type="button" className="btn btn-primary" onClick={nextStep} disabled={groqLoading}>
              {groqLoading
                ? 'Fetching Brand DNA…'
                : !SKIP_ONBOARDING_MARKET_RESEARCH && preGtmResearchLoading
                  ? 'Researching…'
                  : step === ONBOARDING_TOTAL_STEPS
                  ? 'Launch GTM Strategy Wizard →'
                  : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
