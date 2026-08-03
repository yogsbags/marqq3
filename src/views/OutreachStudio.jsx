import React, { useEffect, useState } from 'react';
import { Mail, Linkedin, Phone, Send, CheckCircle, RefreshCw, Sparkles, ArrowLeft } from 'lucide-react';
import JourneyBar from '../components/JourneyBar.jsx';
import DeliveryModeToggle from '../components/DeliveryModeToggle.jsx';
import { getActiveWorkspaceId, loadLocalBrandContext } from '../lib/brandContext';
import { getAudienceProfile, getCompanyName, wizardAnswerLabel } from '../lib/liveWorkspace';
import { loadStrategyDoc, northStarLabel } from '../lib/journeyHandoff';
import {
  EmailClientPreview,
  WhatsAppDmPreview,
  SocialPostPreview,
} from '../components/outcome-previews/ChannelPreviews.jsx';

const STEPS = [
  { id: 'prospects', label: '1 · Prospects' },
  { id: 'compose', label: '2 · Compose' },
  { id: 'approve', label: '3 · Approve & send' },
  { id: 'inbox', label: '4 · Sent & replies' },
];

/** Derive Apollo person titles from ICP / persona free text. */
function titlesFromAudience(icp = '', persona = '') {
  const blob = `${persona} ${icp}`.trim();
  if (!blob) return ['Founder', 'CEO', 'Head of Marketing', 'VP Sales', 'Managing Director'];
  const parts = blob
    .split(/[,;/|]| and | & |\n/i)
    .map((s) => s.replace(/^(vp|head of|chief|director of)\s+/i, (m) => m).trim())
    .map((s) => s.replace(/^[^a-zA-Z]+/, '').trim())
    .filter((s) => s.length >= 3 && s.length <= 60)
    .slice(0, 6);
  if (parts.length) return parts;
  // Fallback: use first meaningful phrase as a single title search term
  return [blob.slice(0, 48)];
}

function liveOutreachDefaults() {
  const brand = loadLocalBrandContext() || {};
  const audience = getAudienceProfile();
  const company = getCompanyName();
  const doc = loadStrategyDoc();
  const ga = doc?.goalAlignment || {};
  const icp = audience.icp || brand.icp || localStorage.getItem('marqq_ob_icp') || '';
  const persona = audience.persona || wizardAnswerLabel('persona') || '';
  const niche = audience.niche || brand.niche || localStorage.getItem('marqq_ob_niche') || '';
  const outcome = ga.quantified_target || northStarLabel() || brand.outcome || localStorage.getItem('marqq_ob_outcome') || '';
  const titles = titlesFromAudience(icp, persona);
  const industries = niche
    ? niche
        .split(/[,;/]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];

  return {
    companyName: company,
    companyId: getActiveWorkspaceId(),
    workspaceId: getActiveWorkspaceId(),
    senderName: localStorage.getItem('marqq_ob_senderName') || 'Marqq',
    question: [
      `Prospects for ${company}`,
      icp ? `— ICP: ${icp}` : '',
      outcome ? `— goal: ${outcome}` : '',
      'Book a short intro.',
    ]
      .filter(Boolean)
      .join(' '),
    titles,
    industries,
    contactChannels: ['email'],
    country: localStorage.getItem('marqq_ob_country') || 'India',
    limit: 8,
  };
}

export default function OutreachStudio({ setActiveScreen }) {
  const [outreachDefaults] = useState(() => liveOutreachDefaults());
  const [step, setStep] = useState('prospects');
  const [runId, setRunId] = useState(null);
  const [prospects, setProspects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [composeChannel, setComposeChannel] = useState('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [testTo, setTestTo] = useState('');
  const [replies, setReplies] = useState([]);
  const [sent, setSent] = useState([]);
  const [inboxTab, setInboxTab] = useState('replies');
  const [draftEdits, setDraftEdits] = useState({});
  const [busy, setBusy] = useState(null);
  const [busyReplyId, setBusyReplyId] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [connectors, setConnectors] = useState([]);

  const [deliveryMode, setDeliveryMode] = useState('draft'); // draft | live
  const [emailProvider, setEmailProvider] = useState('auto'); // auto | instantly | gmail
  const [sequenceSteps, setSequenceSteps] = useState([]);
  const [waTemplates, setWaTemplates] = useState([]);
  const [waTemplateName, setWaTemplateName] = useState('');
  const [waLanguage, setWaLanguage] = useState('en_US');
  const [waStatuses, setWaStatuses] = useState(null);

  const selected = prospects.find((p) => p.id === selectedId) || null;
  const company = outreachDefaults.companyName || getCompanyName();

  const connectorStatus = (id) => {
    const c = connectors.find((x) => x.id === id);
    if (!c) return 'missing';
    if (c.connected || c.status === 'active') return 'active';
    return c.status || 'not_connected';
  };

  useEffect(() => {
    fetch(`/api/integrations?companyId=${encodeURIComponent(getActiveWorkspaceId())}`)
      .then((r) => r.json())
      .then((d) => setConnectors(d.connectors || []))
      .catch(() => {});
  }, []);

  // E2E / smoke: seed a compose prospect when Apollo returns empty
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('marqq_smoke_outreach_prospect');
      if (!raw) return;
      const p = JSON.parse(raw);
      if (!p?.id || !p?.full_name) return;
      setProspects((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev]));
      setSelectedId(p.id);
      setSubject(p.subject || 'Partnership idea for your patients');
      setBody(p.body || 'Hi — quick note from Nouriva AI about lab-personalized meal plans.');
      setStep('compose');
      setComposeChannel('email');
      sessionStorage.removeItem('marqq_smoke_outreach_prospect');
    } catch {
      /* ignore */
    }
  }, []);

  const loadWaTemplates = async () => {
    try {
      const res = await fetch(`/api/outreach/whatsapp/templates?companyId=${encodeURIComponent(getActiveWorkspaceId())}`);
      const data = await res.json();
      setWaTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch {
      setWaTemplates([]);
    }
  };

  useEffect(() => {
    if (composeChannel !== 'whatsapp') return;
    const wa = connectors.find((x) => x.id === 'whatsapp');
    if (wa?.connected || wa?.status === 'active') void loadWaTemplates();
  }, [composeChannel, connectors]);

  const refreshWaStatuses = async () => {
    if (!runId) return;
    setBusy('wa-status');
    try {
      const res = await fetch(`/api/outreach/runs/${runId}/whatsapp/statuses`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setWaStatuses(data);
      setNotice(
        data.statuses?.length
          ? `WhatsApp delivery: ${data.statuses.map((s) => s.delivery_status).join(', ')}`
          : 'No WhatsApp delivery events yet — webhook updates appear after live sends'
      );
    } catch (err) {
      setError(err.message || 'Status refresh failed');
    } finally {
      setBusy(null);
    }
  };

  const selectProspect = (p) => {
    setSelectedId(p.id);
    const copies = p.channel_copies || {};
    const email = copies.email || {};
    setSubject(email.subject || p.subject || '');
    setBody(email.body || p.body || '');
    setComposeChannel('email');
    setStep('compose');
    setError(null);
  };

  const fetchProspects = async () => {
    setBusy('fetch');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/outreach/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(outreachDefaults),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRunId(data.runId);
      setProspects(data.prospects || []);
      setSelectedId(null);
      setReplies([]);
      setSent([]);
      setNotice(
        `Loaded ${(data.prospects || []).length} Apollo prospects · ${data.run?.source || 'apollo'}${
          data.crm_sync?.ok
            ? ` · CRM → ${data.crm_sync.destination}${data.crm_sync.url ? ` (${data.crm_sync.count || ''} leads)` : ''}`
            : data.crm_sync?.skipped
              ? ' · no CRM/Sheets connected (leads stay in Marqq)'
              : data.crm_sync?.error
                ? ` · CRM sync warn: ${data.crm_sync.error}`
                : ''
        }`
      );
      setStep('prospects');
    } catch (err) {
      setError(err.message || 'Fetch failed');
    } finally {
      setBusy(null);
    }
  };

  const generateCopy = async () => {
    if (!runId || !selected) return;
    setBusy('copy');
    setError(null);
    try {
      const channels = ['email'];
      if (selected.linkedin_url) channels.push('linkedin');
      if (selected.phone_e164) channels.push('whatsapp');
      const res = await fetch(`/api/outreach/runs/${runId}/prospects/${selected.id}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const p = data.prospect;
      setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...p } : x)));
      const copy =
        composeChannel === 'linkedin'
          ? p.channel_copies?.linkedin_dm
          : composeChannel === 'whatsapp'
            ? p.channel_copies?.whatsapp_dm
            : p.channel_copies?.email || { subject: p.subject, body: p.body };
      setSubject(copy?.subject || '');
      setBody(copy?.body || '');
      setNotice('Sam drafted copy with cold-email skill');
      if (composeChannel === 'email' && (copy?.subject || copy?.body)) {
        // Auto-build 4-step sequence after first-touch copy
        try {
          const seqRes = await fetch(`/api/outreach/runs/${runId}/generate-sequence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prospectId: selected.id,
              subject: copy?.subject || '',
              body: copy?.body || '',
            }),
          });
          const seqData = await seqRes.json();
          if (seqRes.ok && seqData.ok && Array.isArray(seqData.sequence_emails)) {
            setSequenceSteps(seqData.sequence_emails);
            setNotice(`Sam drafted copy + ${seqData.sequence_emails.length}-step email sequence`);
          }
        } catch {
          /* sequence is optional enrichment */
        }
      }
    } catch (err) {
      setError(err.message || 'Copy failed');
    } finally {
      setBusy(null);
    }
  };

  const generateSequence = async () => {
    if (!runId || !selected) return;
    setBusy('sequence');
    setError(null);
    try {
      await saveEdits();
      const res = await fetch(`/api/outreach/runs/${runId}/generate-sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: selected.id, subject, body }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSequenceSteps(data.sequence_emails || []);
      const first = data.sequence_emails?.[0];
      if (first) {
        setSubject(first.subject || subject);
        setBody(first.body || body);
      }
      setNotice(`${(data.sequence_emails || []).length}-step sequence ready (day 0 / 3 / 7 / 14 · follow-up skill)`);
    } catch (err) {
      setError(err.message || 'Sequence failed');
    } finally {
      setBusy(null);
    }
  };

  const persistSequence = async (steps) => {
    if (!runId) return;
    setSequenceSteps(steps);
    await fetch(`/api/outreach/runs/${runId}/sequence`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sequence_emails: steps }),
    }).catch(() => {});
  };

  const updateSequenceStep = (index, patch) => {
    const next = sequenceSteps.map((s, i) => (i === index ? { ...s, ...patch } : s));
    void persistSequence(next);
    if (index === 0) {
      if (patch.subject != null) setSubject(patch.subject);
      if (patch.body != null) setBody(patch.body);
    }
  };

  const saveEdits = async () => {
    if (!runId || !selected) return;
    const emailSubject = sequenceSteps[0]?.subject || subject;
    const emailBody = sequenceSteps[0]?.body || body;
    const channel_copies = { ...(selected.channel_copies || {}) };
    if (composeChannel === 'linkedin') {
      channel_copies.linkedin_dm = { ...(channel_copies.linkedin_dm || {}), body, skills: ['copywriting'] };
    } else if (composeChannel === 'whatsapp') {
      channel_copies.whatsapp_dm = { ...(channel_copies.whatsapp_dm || {}), body, skills: ['copywriting'] };
    } else {
      channel_copies.email = { subject: emailSubject, body: emailBody, skills: ['cold-email'] };
    }
    await fetch(`/api/outreach/runs/${runId}/prospects/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: composeChannel === 'email' ? emailSubject : selected.subject,
        body: composeChannel === 'email' ? emailBody : selected.body,
        channel_copies,
      }),
    });
    if (composeChannel === 'email' && sequenceSteps.length) {
      await persistSequence(
        sequenceSteps.map((s, i) =>
          i === 0 ? { ...s, subject: emailSubject, body: emailBody } : s
        )
      );
    }
  };

  const goApprove = async () => {
    await saveEdits();
    setStep('approve');
  };

  const sendNow = async () => {
    if (!runId || !selected) return;
    setBusy('send');
    setError(null);
    try {
      await saveEdits();
      const res = await fetch(`/api/outreach/runs/${runId}/prospects/${selected.id}/go-live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: composeChannel,
          delivery: deliveryMode,
          subject,
          body,
          sequence_emails:
            composeChannel === 'email' && sequenceSteps.length ? sequenceSteps : undefined,
          testTo: composeChannel === 'email' ? testTo || undefined : undefined,
          provider: composeChannel === 'email' && emailProvider !== 'auto' ? emailProvider : undefined,
          template_name: composeChannel === 'whatsapp' ? waTemplateName || undefined : undefined,
          language_code: composeChannel === 'whatsapp' && waTemplateName ? waLanguage : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProspects((prev) =>
        prev.map((x) => (x.id === selected.id ? { ...x, ...data.prospect } : x))
      );
      if (Array.isArray(data.sequence_emails) && data.sequence_emails.length) {
        setSequenceSteps(data.sequence_emails);
      }
      const provider = data.result?.provider || composeChannel;
      const status = data.result?.status || data.delivery;
      const seqN = data.result?.sequence_steps || data.sequence_emails?.length || sequenceSteps.length;
      setNotice(
        data.delivery === 'live'
          ? `Live via ${provider} · ${status}${seqN ? ` · ${seqN}-step sequence` : ''}${
              data.result?.template_name ? ` · template ${data.result.template_name}` : ''
            }${
              data.prospect?.gmail_sequence_status === 'scheduled'
                ? ` · next drip ${data.prospect.scheduled_for || 'queued'}`
                : ''
            }`
          : `Prepared via ${provider} (draft — not activated)${seqN ? ` · ${seqN}-step sequence` : ''}. Flip to Live to send.`
      );
      if (data.delivery === 'live' || data.result?.activated) {
        setInboxTab('sent');
        setStep('inbox');
        if (composeChannel === 'email') await refreshInbox();
        if (composeChannel === 'whatsapp') await refreshWaStatuses();
      }
    } catch (err) {
      setError(err.message || 'Go-live failed');
    } finally {
      setBusy(null);
    }
  };

  const refreshInbox = async () => {
    if (!runId) return;
    setBusy('inbox');
    setError(null);
    try {
      const res = await fetch(`/api/outreach/runs/${runId}/poll-gmail-replies`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setReplies(data.replies || []);
      if (Array.isArray(data.sent)) setSent(data.sent);
      const drafted = (data.fresh || []).filter((r) => r.auto_reply_draft?.status === 'draft').length;
      setNotice(
        data.fresh?.length
          ? `${data.fresh.length} new reply(ies)${drafted ? ` · Sam drafted ${drafted} response(s) (not sent)` : ''}`
          : data.note || 'Inbox refreshed — only replies to emails you sent appear here'
      );
      if ((data.fresh || []).length) setInboxTab('replies');
    } catch (err) {
      setError(err.message || 'Inbox poll failed');
    } finally {
      setBusy(null);
    }
  };

  const draftFields = (r) => {
    const edit = draftEdits[r.id];
    const d = r.auto_reply_draft || {};
    return {
      subject: edit?.subject ?? d.subject ?? r.draft_subject ?? '',
      body: edit?.body ?? d.body ?? r.draft_body ?? '',
    };
  };

  const setDraftField = (replyId, key, value) => {
    setDraftEdits((prev) => {
      const r = replies.find((x) => x.id === replyId);
      const base = prev[replyId] || {
        subject: r?.auto_reply_draft?.subject ?? r?.draft_subject ?? '',
        body: r?.auto_reply_draft?.body ?? r?.draft_body ?? '',
      };
      return { ...prev, [replyId]: { ...base, [key]: value } };
    });
  };

  const regenerateDraft = async (replyId) => {
    if (!runId) return;
    setBusyReplyId(replyId);
    setError(null);
    try {
      const res = await fetch(`/api/outreach/runs/${runId}/replies/${replyId}/regenerate-draft`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const updated = data.reply || data.draft;
      setReplies((prev) =>
        prev.map((r) =>
          r.id === replyId
            ? {
                ...r,
                ...(data.reply || {}),
                auto_reply_draft: data.draft || data.reply?.auto_reply_draft || r.auto_reply_draft,
              }
            : r
        )
      );
      setDraftEdits((prev) => {
        const next = { ...prev };
        delete next[replyId];
        return next;
      });
      setNotice(`Sam redrafted reply (${data.classification || updated?.classification || 'draft'})`);
    } catch (err) {
      setError(err.message || 'Regenerate failed');
    } finally {
      setBusyReplyId(null);
    }
  };

  const saveDraftEdits = async (replyId) => {
    if (!runId) return;
    const fields = draftFields(replies.find((r) => r.id === replyId) || { id: replyId });
    const res = await fetch(`/api/outreach/runs/${runId}/replies/${replyId}/draft`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    setReplies((prev) => prev.map((r) => (r.id === replyId ? { ...r, ...data.reply } : r)));
    return data.reply;
  };

  const approveDraft = async (replyId) => {
    if (!runId) return;
    setBusyReplyId(replyId);
    setError(null);
    try {
      await saveDraftEdits(replyId);
      const res = await fetch(`/api/outreach/runs/${runId}/replies/${replyId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testTo: testTo || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setReplies((prev) => prev.map((r) => (r.id === replyId ? { ...r, ...data.reply } : r)));
      setNotice(
        data.status === 'sent'
          ? `Reply sent → ${data.to} (${data.method})`
          : `Approved without send (${data.status})`
      );
    } catch (err) {
      setError(err.message || 'Approve failed');
    } finally {
      setBusyReplyId(null);
    }
  };

  const rejectDraft = async (replyId) => {
    if (!runId) return;
    setBusyReplyId(replyId);
    try {
      const res = await fetch(`/api/outreach/runs/${runId}/replies/${replyId}/reject`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setReplies((prev) => prev.map((r) => (r.id === replyId ? { ...r, ...data.reply } : r)));
      setNotice('Draft dismissed');
    } catch (err) {
      setError(err.message || 'Dismiss failed');
    } finally {
      setBusyReplyId(null);
    }
  };

  const apolloOk = connectorStatus('apollo') === 'active';
  const gmailOk = connectorStatus('gmail') === 'active';
  const instantlyOk = connectorStatus('instantly') === 'active';
  const heyreachOk = connectorStatus('heyreach') === 'active';
  const whatsappOk = connectorStatus('whatsapp') === 'active';
  const emailReady = instantlyOk || gmailOk;
  const channelReady =
    composeChannel === 'email'
      ? emailReady
      : composeChannel === 'linkedin'
        ? heyreachOk
        : whatsappOk;
  const channelHint =
    composeChannel === 'email'
      ? instantlyOk
        ? 'Instantly (preferred) · multi-step sequences · Gmail fallback'
        : gmailOk
          ? 'Gmail drip · 4-step local sequence · stop on reply'
          : 'Connect Instantly or Gmail'
      : composeChannel === 'linkedin'
        ? heyreachOk
          ? 'HeyReach LinkedIn campaigns'
          : 'Connect HeyReach'
        : whatsappOk
          ? 'WhatsApp · text (24h) or approved template'
          : 'Connect WhatsApp';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <JourneyBar screenId="outreach" setActiveScreen={setActiveScreen} title="Outreach Studio" />
      <div>
        <p className="text-muted" style={{ margin: 0 }}>
          Arjun fetches Apollo prospects · Sam writes a multi-step email sequence · you approve · Instantly or Gmail drip · stop on reply.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
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
          Apollo {apolloOk ? '●' : '○'} · Instantly {instantlyOk ? '●' : '○'} · Gmail {gmailOk ? '●' : '○'} ·
          HeyReach {heyreachOk ? '●' : '○'} · WhatsApp {whatsappOk ? '●' : '○'}
          {' · '}
          <button type="button" className="btn btn-ghost" style={{ padding: 0, fontSize: 12 }} onClick={() => setActiveScreen && setActiveScreen('integrations')}>
            Integrations
          </button>
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

      {step === 'prospects' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--color-text)' }}>{company} prospects</h3>
              <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Apollo titles from your ICP
                {outreachDefaults.titles?.length
                  ? `: ${outreachDefaults.titles.slice(0, 4).join(', ')}${outreachDefaults.titles.length > 4 ? '…' : ''}`
                  : ' (set ICP in Audience / Brand DNA)'}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy === 'fetch' || !apolloOk}
              onClick={() => void fetchProspects()}
            >
              {busy === 'fetch' ? 'Searching Apollo…' : runId ? 'Refresh prospects' : 'Fetch prospects'}
            </button>
          </div>
          {!apolloOk ? (
            <p className="text-muted" style={{ fontSize: 13 }}>
              Connect Apollo under Integrations first.
            </p>
          ) : null}
          {prospects.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 13 }}>
              No prospects yet. Fetch from Apollo to begin.
            </p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Company</th>
                    <th>Email</th>
                    <th>LI / Phone</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {prospects.map((p) => (
                    <tr key={p.id} style={{ background: selectedId === p.id ? 'var(--color-surface)' : undefined }}>
                      <td style={{ fontWeight: 700 }}>{p.full_name}</td>
                      <td>{p.title}</td>
                      <td>{p.company}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.email || '—'}</td>
                      <td style={{ fontSize: 11 }}>
                        {p.linkedin_url ? 'LI ' : ''}
                        {p.phone_e164 ? 'Phone' : ''}
                        {!p.linkedin_url && !p.phone_e164 ? '—' : ''}
                      </td>
                      <td>
                        <button type="button" className="btn btn-secondary" onClick={() => selectProspect(p)}>
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {(step === 'compose' || step === 'approve') && selected && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 20 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start', paddingInline: 0 }} onClick={() => setStep('prospects')}>
              <ArrowLeft size={14} /> Back to prospects
            </button>
            <h3 style={{ margin: 0 }}>{selected.full_name}</h3>
            <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
              {selected.title} · {selected.company}
            </p>
            <div style={{ fontSize: 12, fontFamily: 'monospace' }}>{selected.email || 'No email'}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['email', 'linkedin', 'whatsapp'].map((ch) => (
                <button
                  key={ch}
                  type="button"
                  className={composeChannel === ch ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ textTransform: 'capitalize', fontSize: 12 }}
                  onClick={() => {
                    setComposeChannel(ch);
                    const copies = selected.channel_copies || {};
                    if (ch === 'linkedin') {
                      setSubject('');
                      setBody(copies.linkedin_dm?.body || '');
                    } else if (ch === 'whatsapp') {
                      setSubject('');
                      setBody(copies.whatsapp_dm?.body || '');
                    } else {
                      setSubject(copies.email?.subject || selected.subject || '');
                      setBody(copies.email?.body || selected.body || '');
                    }
                  }}
                >
                  {ch === 'email' ? <Mail size={12} /> : ch === 'linkedin' ? <Linkedin size={12} /> : <Phone size={12} />}
                  {ch}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-secondary" disabled={busy === 'copy'} onClick={() => void generateCopy()}>
              <Sparkles size={14} /> {busy === 'copy' ? 'Sam writing…' : 'Generate copy (cold-email)'}
            </button>
            {composeChannel === 'email' ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy === 'sequence' || !(body || sequenceSteps[0]?.body)}
                onClick={() => void generateSequence()}
              >
                <Sparkles size={14} /> {busy === 'sequence' ? 'Building sequence…' : 'Generate 4-step sequence'}
              </button>
            ) : null}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0 }}>{step === 'approve' ? 'Approve & send' : 'Sequence composer'}</h3>
            {composeChannel === 'email' && sequenceSteps.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="card-kicker">
                  {sequenceSteps.length}-step sequence · Instantly multi-touch or Gmail drip (stop on reply)
                </div>
                {sequenceSteps.map((s, i) => (
                  <div
                    key={`seq-${i}`}
                    className="card"
                    style={{
                      padding: 10,
                      background: i === 0 ? 'var(--color-surface)' : 'var(--color-bg)',
                      border: i === 0 ? '1px solid var(--color-accent)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <strong style={{ fontSize: 12 }}>
                        Step {i + 1}
                        {i === 0 ? ' · first touch' : ` · +${s.delay_days || 0}d`}
                      </strong>
                      {i > 0 ? (
                        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                          Delay
                          <input
                            className="input"
                            type="number"
                            min={1}
                            max={30}
                            value={s.delay_days ?? 3}
                            style={{ width: 56, padding: '2px 6px', fontSize: 12 }}
                            onChange={(e) =>
                              updateSequenceStep(i, { delay_days: Number(e.target.value) || 3 })
                            }
                          />
                          d
                        </label>
                      ) : null}
                    </div>
                    <input
                      className="input"
                      value={s.subject || ''}
                      placeholder="Subject"
                      style={{ marginBottom: 6, fontSize: 13 }}
                      onChange={(e) => updateSequenceStep(i, { subject: e.target.value })}
                    />
                    <textarea
                      className="input"
                      rows={i === 0 ? 5 : 3}
                      value={s.body || ''}
                      placeholder="Body"
                      style={{ fontSize: 12 }}
                      onChange={(e) => updateSequenceStep(i, { body: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {composeChannel === 'email' ? (
                  <div className="field">
                    <label>Subject</label>
                    <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
                  </div>
                ) : null}
                <div className="field">
                  <label>Body</label>
                  <textarea className="input" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
                </div>
              </>
            )}

            <div className="card-kicker">Channel preview · feels published</div>
            {composeChannel === 'email' ? (
              <EmailClientPreview
                from={`${getCompanyName() || 'you'}@${(loadLocalBrandContext()?.website || 'company.com').replace(/^https?:\/\//, '').split('/')[0]}`}
                to={selected.email || 'prospect@company.com'}
                subject={sequenceSteps[0]?.subject || subject}
                body={sequenceSteps[0]?.body || body}
              />
            ) : composeChannel === 'whatsapp' ? (
              <WhatsAppDmPreview contactName={selected.full_name} message={body || (waTemplateName ? `Template: ${waTemplateName}` : '')} />
            ) : (
              <SocialPostPreview
                platform="linkedin"
                authorName={getCompanyName() || 'You'}
                authorHandle={selected.title || 'Outreach'}
                post={body}
                hook={`DM to ${selected.full_name}`}
              />
            )}

            {step === 'compose' ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  composeChannel === 'whatsapp'
                    ? !(body || waTemplateName)
                    : !(sequenceSteps[0]?.body || body)
                }
                onClick={() => void goApprove()}
              >
                Continue to approve <Send size={14} />
              </button>
            ) : (
              <>
                <div className="card" style={{ padding: 12, marginBottom: 4, background: 'var(--color-bg)' }}>
                  <div className="card-kicker">Channel readiness</div>
                  <p className="card-body" style={{ margin: '4px 0 0', fontSize: 13 }}>{channelHint}</p>
                  {!channelReady ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ marginTop: 8 }}
                      onClick={() => setActiveScreen && setActiveScreen('integrations')}
                    >
                      Connect required connector
                    </button>
                  ) : null}
                </div>
                <DeliveryModeToggle
                  value={deliveryMode}
                  onChange={setDeliveryMode}
                  draftLabel="Draft (safe)"
                  liveLabel="Publish live"
                  draftHint="Draft prepares Instantly campaigns / HeyReach plans without activating. WhatsApp stays unsent. Gmail creates sequence drafts only."
                  liveHint={`Live will activate Instantly campaigns, start HeyReach sequences, or send WhatsApp${
                    composeChannel === 'whatsapp' && waTemplateName
                      ? ` template “${waTemplateName}”`
                      : ' messages'
                  }.`}
                />
                {composeChannel === 'email' && instantlyOk && gmailOk ? (
                  <div className="field">
                    <label>Email provider</label>
                    <select className="input" value={emailProvider} onChange={(e) => setEmailProvider(e.target.value)}>
                      <option value="auto">Auto (Instantly preferred)</option>
                      <option value="instantly">Instantly</option>
                      <option value="gmail">Gmail</option>
                    </select>
                  </div>
                ) : null}
                {composeChannel === 'email' ? (
                  <div className="field">
                    <label>Send test To (Gmail smoke only)</label>
                    <input
                      className="input"
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                      placeholder="yogsbags@gmail.com"
                    />
                    <p className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                      Used when provider is Gmail. Instantly / HeyReach / WhatsApp use the prospect contact.
                    </p>
                  </div>
                ) : null}
                {composeChannel === 'whatsapp' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="field">
                      <label>Template (cold outreach / outside 24h window)</label>
                      <select
                        className="input"
                        value={waTemplateName}
                        onChange={(e) => {
                          const name = e.target.value;
                          setWaTemplateName(name);
                          const match = waTemplates.find((t) => t.name === name);
                          if (match?.language) setWaLanguage(String(match.language));
                        }}
                      >
                        <option value="">Free-form text (session only)</option>
                        {waTemplates.map((t) => (
                          <option key={`${t.name}-${t.language}`} value={t.name}>
                            {t.name} · {t.language || 'en_US'} · {t.status || 'unknown'}
                          </option>
                        ))}
                      </select>
                      {!waTemplates.length ? (
                        <p className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                          No approved templates on this WABA yet — paste a Meta-approved name below, or use free-form text inside the 24h window.
                        </p>
                      ) : null}
                    </div>
                    {!waTemplates.length || waTemplateName ? (
                      <div className="field">
                        <label>Template name (manual override)</label>
                        <input
                          className="input"
                          value={waTemplateName}
                          onChange={(e) => setWaTemplateName(e.target.value)}
                          placeholder="hello_world"
                        />
                      </div>
                    ) : null}
                    {waTemplateName ? (
                      <div className="field">
                        <label>Language code</label>
                        <input
                          className="input"
                          value={waLanguage}
                          onChange={(e) => setWaLanguage(e.target.value)}
                          placeholder="en_US"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    busy === 'send' ||
                    !channelReady ||
                    (composeChannel === 'whatsapp' ? !(body || waTemplateName) : !(sequenceSteps[0]?.body || body))
                  }
                  onClick={() => void sendNow()}
                >
                  {busy === 'send' ? 'Working…' : (
                    <>
                      <CheckCircle size={14} /> {deliveryMode === 'live' ? 'Approve & go live' : 'Prepare draft'} · {composeChannel}
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {step === 'inbox' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Sent & replies</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className={inboxTab === 'sent' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ fontSize: 12 }}
                onClick={() => setInboxTab('sent')}
              >
                Sent ({sent.length})
              </button>
              <button
                type="button"
                className={inboxTab === 'replies' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ fontSize: 12 }}
                onClick={() => setInboxTab('replies')}
              >
                Replies ({replies.length})
              </button>
              <button type="button" className="btn btn-secondary" disabled={busy === 'inbox' || !runId} onClick={() => void refreshInbox()}>
                <RefreshCw size={14} /> {busy === 'inbox' ? 'Polling…' : 'Refresh Gmail'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy === 'wa-status' || !runId || !whatsappOk}
                onClick={() => void refreshWaStatuses()}
              >
                <Phone size={14} /> {busy === 'wa-status' ? 'Statuses…' : 'WhatsApp status'}
              </button>
            </div>
          </div>
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
            On refresh, Sam auto-drafts a response (never auto-sends). You edit → Approve &amp; send, or dismiss.
            WhatsApp delivery uses Meta webhook <code>/api/webhooks/whatsapp</code> (sent → delivered → read).
          </p>

          {waStatuses?.statuses?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h4 style={{ margin: 0, fontSize: 13 }}>WhatsApp delivery</h4>
              {waStatuses.statuses.map((s) => (
                <div key={s.message_id} style={{ padding: 10, border: '1px solid var(--color-divider)', borderRadius: 8, fontSize: 12 }}>
                  <strong>{s.delivery_status}</strong>
                  {' · '}
                  {s.to_number || '—'}
                  {s.template_name ? ` · ${s.template_name}` : ''}
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                    {s.message_id} · {s.updated_at}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {waStatuses?.inbound?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h4 style={{ margin: 0, fontSize: 13 }}>WhatsApp inbound</h4>
              {waStatuses.inbound.map((r) => (
                <div key={r.id} style={{ padding: 10, border: '1px solid var(--color-divider)', borderRadius: 8, fontSize: 12 }}>
                  From {r.from} · {r.prospect_name || 'unmatched'} · {r.received_at}
                  <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{r.body}</p>
                </div>
              ))}
            </div>
          ) : null}
          {inboxTab === 'sent' ? (
            sent.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13 }}>No sent emails yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sent.map((s) => (
                  <div key={s.id} style={{ padding: 12, border: '1px solid var(--color-divider)', borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{s.subject || '(no subject)'}</div>
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                      To {s.to} · {s.prospectName} · {s.sentAt}
                      {s.test ? ' · test redirect' : ''}
                    </div>
                    <p style={{ fontSize: 13, margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{s.body}</p>
                  </div>
                ))}
              </div>
            )
          ) : replies.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 13 }}>
              No matched replies yet — open the smoke email in Gmail, reply (e.g. “Ok”), then hit Refresh Gmail.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {replies.map((r) => {
                const d = r.auto_reply_draft;
                const fields = draftFields(r);
                const sentReply = d?.status === 'sent';
                const rejected = d?.status === 'rejected';
                const drafting = busyReplyId === r.id;
                return (
                  <div key={r.id} style={{ padding: 12, border: '1px solid var(--color-divider)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{r.subject || '(no subject)'}</div>
                      <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                        From {r.from} · {r.prospectName || 'matched send'} · {r.receivedAt}
                        {r.classification || d?.classification ? ` · ${r.classification || d.classification}` : ''}
                      </div>
                      <p style={{ fontSize: 13, margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{r.body}</p>
                    </div>

                    {d?.status === 'draft_failed' ? (
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        Draft failed: {d.error}{' '}
                        <button type="button" className="btn btn-secondary" style={{ fontSize: 11 }} disabled={drafting} onClick={() => void regenerateDraft(r.id)}>
                          Retry Sam draft
                        </button>
                      </div>
                    ) : null}

                    {d && d.status !== 'draft_failed' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: '1px solid var(--color-divider)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <strong style={{ fontSize: 12 }}>Sam draft {sentReply ? '(sent)' : rejected ? '(dismissed)' : '(not sent)'}</strong>
                          {d.should_reply === false ? (
                            <span className="tag tag-outline" style={{ fontSize: 11 }}>no reply suggested</span>
                          ) : null}
                        </div>
                        {d.rationale ? (
                          <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>{d.rationale}</p>
                        ) : null}
                        {!sentReply && !rejected ? (
                          <>
                            <div className="field">
                              <label>Reply subject</label>
                              <input
                                className="input"
                                value={fields.subject}
                                onChange={(e) => setDraftField(r.id, 'subject', e.target.value)}
                              />
                            </div>
                            <div className="field">
                              <label>Reply body</label>
                              <textarea
                                className="input"
                                rows={5}
                                value={fields.body}
                                onChange={(e) => setDraftField(r.id, 'body', e.target.value)}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-primary"
                                disabled={drafting || !fields.body}
                                onClick={() => void approveDraft(r.id)}
                              >
                                <CheckCircle size={14} /> {drafting ? 'Working…' : 'Approve & send reply'}
                              </button>
                              <button type="button" className="btn btn-secondary" disabled={drafting} onClick={() => void regenerateDraft(r.id)}>
                                <Sparkles size={14} /> Redraft
                              </button>
                              <button type="button" className="btn btn-ghost" disabled={drafting} onClick={() => void rejectDraft(r.id)}>
                                Dismiss
                              </button>
                            </div>
                          </>
                        ) : sentReply ? (
                          <p style={{ fontSize: 13, margin: 0, whiteSpace: 'pre-wrap' }}>
                            Sent to {d.send_meta?.to || '—'} · {d.sent_at}
                            {'\n\n'}
                            {d.body}
                          </p>
                        ) : null}
                      </div>
                    ) : !d ? (
                      <button type="button" className="btn btn-secondary" disabled={drafting} onClick={() => void regenerateDraft(r.id)}>
                        <Sparkles size={14} /> Draft reply with Sam
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
