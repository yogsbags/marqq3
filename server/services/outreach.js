/**
 * Marqq-test outreach desk — Apollo fetch → Sam cold-email → Gmail send → replies.
 * Entity id defaults to marqq-ws-1 (Composio connections we just verified).
 */

import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeComposioAction, executeComposioProxy, resolveConnectedAccountId } from './composio.js';
import { meteredStudioJson, assertCanAfford } from './credits/index.js';
import {
  launchInstantlyCampaign,
  launchHeyReachCampaign,
  launchWhatsAppSend,
  listWhatsAppTemplates,
  OUTREACH_CHANNEL_CONNECTORS,
} from './outreachProviders.js';
import {
  registerWhatsAppSend,
  handleWhatsAppWebhookPayload,
  listWhatsAppStatusesForRun,
  pollWhatsAppMessageStatusTrigger,
  listRecentInboundReplies,
} from './whatsappTracking.js';
import { persistOutreachRun, loadOutreachRun } from './outreachPersist.js';
import {
  normalizeSequenceEmails,
  ensureEmailSequence,
  buildGmailSequenceSteps,
  scheduleNextGmailSequenceStep,
  stopGmailSequenceOnReply,
  processDueOutreachSends as processDueSendsCore,
  ensureEmailGreeting,
  resolveProspectFirstName,
} from './outreachSequences.js';
import { syncProspectsToCrm, syncProspectToCrm } from './crmLeads.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const APOLLO_PEOPLE_API = 'https://api.apollo.io/api/v1/mixed_people/api_search';

/** @type {Map<string, object>} */
const runsById = new Map();

function cacheRun(run) {
  if (!run?.id) return run;
  runsById.set(run.id, run);
  void persistOutreachRun(run);
  return run;
}

function groqKey() {
  return process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '';
}

function resolveSenderName(explicit) {
  return (
    String(explicit || '').trim() ||
    String(process.env.OUTREACH_SENDER_NAME || '').trim() ||
    String(process.env.DEFAULT_SENDER_NAME || '').trim() ||
    'Yogesh'
  );
}

function extractEmailAddress(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const angle = raw.match(/<([^>]+)>/);
  const candidate = (angle?.[1] || raw).trim();
  const match = candidate.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : '';
}

function extractGmailThreadId(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return (
    payload.thread_id ||
    payload.threadId ||
    payload.data?.thread_id ||
    payload.data?.threadId ||
    payload.message?.thread_id ||
    payload.message?.threadId ||
    payload.response_data?.thread_id ||
    payload.response_data?.threadId ||
    payload.result?.thread_id ||
    null
  );
}

function extractGmailMessageId(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return (
    payload.id ||
    payload.message_id ||
    payload.messageId ||
    payload.data?.id ||
    payload.message?.id ||
    payload.response_data?.id ||
    null
  );
}

/** Strip LLM placeholders, ensure "Hi <FirstName>," and a real sign-off. */
function finalizeEmailBody(body, senderName, companyName, prospect = null) {
  let text = String(body || '').trim();
  const name = String(senderName || 'Yogesh').trim();
  const company = String(companyName || '').trim();
  text = text
    .replace(/\[Your Name\]/gi, name)
    .replace(/\[Sender Name\]/gi, name)
    .replace(/\[Name\]/gi, name)
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\s*name\s*\}/gi, name)
    .replace(/Your Name(?=\s*$)/gim, name);
  if (prospect) {
    text = ensureEmailGreeting(text, prospect);
  }
  // If sign-off still looks like a placeholder, rewrite the last lines
  if (/\b(thanks|best|regards|cheers)[,\s]*$/i.test(text.split('\n').slice(-2).join(' ')) &&
      !new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text.slice(-80))) {
    text = `${text}\n${name}${company ? `\n${company}` : ''}`;
  } else if (!new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text.slice(-120))) {
    text = `${text}\n\nBest,\n${name}${company ? `\n${company}` : ''}`;
  }
  return text.trim();
}

function normalizeSubjectKey(subject) {
  return String(subject || '')
    .replace(/^(re|fwd|fw)\s*:\s*/gi, '')
    .trim()
    .toLowerCase();
}

function sentProspects(run) {
  return (run.prospects || []).filter(
    (p) => p.sent_at || p.status === 'sent' || p.status === 'replied' || p.gmail_thread_id
  );
}

function listSentEmails(run) {
  return sentProspects(run).map((p) => ({
    id: `sent-${p.id}-${p.sent_at || p.id}`,
    prospectId: p.id,
    prospectName: p.full_name,
    to: p.send_meta?.to || p.email,
    subject: p.subject,
    body: p.body,
    sentAt: p.sent_at,
    threadId: p.gmail_thread_id || null,
    messageId: p.gmail_message_id || null,
    test: Boolean(p.send_meta?.test),
  }));
}

function loadColdEmailPlaybook() {
  const candidates = [
    join(ROOT, '../Marqq2/platform/agent-runtime/skills/marketingskills/skills/cold-email/SKILL.md'),
    join(ROOT, 'scripts/marqq2-playbooks/cold-email-SKILL.md'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return readFileSync(p, 'utf8').slice(0, 12000);
      } catch {
        /* ignore */
      }
    }
  }
  return `Write a short B2B cold email. Peer tone, specific value, one clear CTA. Subject under 50 chars. Body under 120 words.`;
}

function extractPeople(payload) {
  const root = payload?.data || payload?.result || payload || {};
  const lists = [
    root.people,
    root.contacts,
    root.profiles,
    root.matches,
    root?.data?.people,
    Array.isArray(root) ? root : null,
  ];
  for (const list of lists) {
    if (Array.isArray(list) && list.length) return list;
  }
  return [];
}

function mapPerson(person, index) {
  const org = person.organization || {};
  const email =
    person.email ||
    person.email_status === 'verified' && person.email ||
    (Array.isArray(person.contact_emails) && person.contact_emails[0]?.email) ||
    '';
  const phone =
    person.sanitized_phone ||
    person.phone_numbers?.[0]?.sanitized_number ||
    person.phone_numbers?.[0]?.raw_number ||
    person.phone ||
    '';
  return {
    id: String(person.id || `p-${index}-${randomUUID().slice(0, 8)}`),
    first_name: String(person.first_name || '').trim() || String(person.name || '').trim().split(/\s+/)[0] || '',
    last_name: String(person.last_name || '').trim(),
    full_name: [person.first_name, person.last_name].filter(Boolean).join(' ') || person.name || 'Unknown',
    title: person.title || person.headline || '',
    company: org.name || person.organization_name || '',
    email: String(email || '').trim(),
    linkedin_url: person.linkedin_url || person.linkedin || '',
    phone_e164: String(phone || '').trim(),
    status: 'new',
    subject: '',
    body: '',
    channel_copies: null,
    copy_locked: false,
    gmail_draft_id: null,
    gmail_thread_id: null,
    sent_at: null,
    send_error: null,
    replies: [],
  };
}

export async function createOutreachRun(input = {}) {
  const workspaceId = String(input.workspaceId || input.companyId || 'marqq-ws-1').trim();
  const companyId = String(input.companyId || workspaceId).trim();
  const companyName = String(input.companyName || 'Your company').trim();
  const limit = Math.min(Math.max(Number(input.limit) || 5, 1), 100);
  const titles = Array.isArray(input.titles)
    ? input.titles.map(String).filter(Boolean).slice(0, 8)
    : String(input.titles || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8);
  const industries = Array.isArray(input.industries)
    ? input.industries.map(String).filter(Boolean).slice(0, 8)
    : [];
  const country = String(input.country || 'India');
  const contactChannels = (Array.isArray(input.contactChannels) ? input.contactChannels : ['email'])
    .map((c) => String(c).toLowerCase())
    .filter((c) => c === 'email' || c === 'linkedin' || c === 'phone' || c === 'whatsapp');

  // Apollo people search typically caps at 100 per page — request enough to fill after filters
  const perPage = Math.min(100, Math.max(limit, Math.min(limit * 2, 100)));
  const DEFAULT_TITLES = ['Founder', 'CEO', 'Head of Marketing', 'VP Sales', 'Managing Director', 'Chief Strategy Officer'];
  const searchBody = {
    page: 1,
    per_page: perPage,
    person_titles: titles.length ? titles : DEFAULT_TITLES,
    person_locations: [country],
    contact_email_status: contactChannels.includes('email') || !contactChannels.length ? ['verified', 'likely to engage'] : undefined,
  };
  if (industries.length) {
    searchBody.q_organization_keyword_tags = industries;
  }

  // Drop titles that look like company ICP prose (not job titles) — they return 0 Apollo hits
  const looksLikeJobTitle = (t) =>
    /\b(founder|ceo|cto|cmo|coo|cso|vp|vice president|head|director|manager|partner|principal|owner|chief)\b/i.test(
      String(t || '')
    ) && String(t || '').length <= 50;
  if (
    Array.isArray(searchBody.person_titles) &&
    searchBody.person_titles.length &&
    !searchBody.person_titles.some(looksLikeJobTitle)
  ) {
    searchBody.person_titles = DEFAULT_TITLES;
  }

  let people = [];
  let source = 'apollo';

  async function apolloSearch(body) {
    const proxy = await executeComposioProxy({
      toolkit: 'apollo',
      userId: companyId,
      method: 'POST',
      endpoint: APOLLO_PEOPLE_API,
      body,
    });
    if (!proxy.error) {
      return { people: extractPeople(proxy.result), source: 'apollo_people_api_search', error: null };
    }
    const tool = await executeComposioAction('APOLLO_PEOPLE_SEARCH', body, companyId, 'apollo');
    if (!tool.error) {
      return { people: extractPeople(tool.result), source: 'apollo_people_search', error: null };
    }
    const broad = { ...body };
    delete broad.contact_email_status;
    const tool2 = await executeComposioAction('APOLLO_PEOPLE_SEARCH', broad, companyId, 'apollo');
    if (!tool2.error) {
      return { people: extractPeople(tool2.result), source: 'apollo_people_search_broad', error: null };
    }
    return { people: [], source: null, error: proxy.error || tool.error || tool2.error };
  }

  let search = await apolloSearch(searchBody);
  people = search.people;
  source = search.source || source;

  // Retry: drop industry tags + email filter, use default decision-maker titles
  if (!people.length) {
    const retryBody = {
      page: 1,
      per_page: perPage,
      person_titles: DEFAULT_TITLES,
      person_locations: [country],
    };
    search = await apolloSearch(retryBody);
    if (search.people.length) {
      people = search.people;
      source = `${search.source || 'apollo'}_fallback_titles`;
      searchBody.person_titles = DEFAULT_TITLES;
      delete searchBody.q_organization_keyword_tags;
      delete searchBody.contact_email_status;
    } else if (search.error) {
      throw new Error(search.error || 'Apollo search failed');
    }
  }

  // Last resort: India founders/CEOs without email status requirement
  if (!people.length) {
    search = await apolloSearch({
      page: 1,
      per_page: perPage,
      person_titles: ['Founder', 'CEO', 'Managing Director'],
      person_locations: [country],
    });
    people = search.people;
    source = search.source ? `${search.source}_last_resort` : source;
    if (!people.length && search.error) {
      throw new Error(search.error || 'Apollo search failed');
    }
  }

  // Enrich first N people for emails when missing; apply channel filters progressively
  const prospects = [];
  const requireEmail = contactChannels.includes('email') || !contactChannels.length;
  const requireLinkedin = contactChannels.includes('linkedin');
  const requirePhone = contactChannels.includes('phone') || contactChannels.includes('whatsapp');

  function matchesChannels(mapped, { email = requireEmail, linkedin = requireLinkedin, phone = requirePhone } = {}) {
    if (email && !mapped.email) return false;
    if (linkedin && !mapped.linkedin_url) return false;
    if (phone && !mapped.phone_e164) return false;
    return true;
  }

  async function enrichPerson(person) {
    let next = person;
    const needsEnrich =
      (!next.email && requireEmail) ||
      (!next.linkedin_url && requireLinkedin) ||
      (!next.phone_e164 && requirePhone);
    if (needsEnrich && next.id) {
      const enrich = await executeComposioAction(
        'APOLLO_PEOPLE_ENRICHMENT',
        { id: next.id },
        companyId,
        'apollo'
      );
      if (!enrich.error) {
        const data = enrich.result?.person || enrich.result?.data?.person || enrich.result || {};
        if (data && typeof data === 'object') next = { ...next, ...data };
      }
    }
    return next;
  }

  for (let i = 0; i < people.length && prospects.length < limit; i++) {
    const person = await enrichPerson(people[i]);
    const mapped = mapPerson(person, i);
    if (matchesChannels(mapped)) prospects.push(mapped);
  }

  // Soften filters if too strict (phone especially is sparse in Apollo)
  if (!prospects.length && people.length && requirePhone) {
    for (let i = 0; i < people.length && prospects.length < limit; i++) {
      const person = await enrichPerson(people[i]);
      const mapped = mapPerson(person, i);
      if (matchesChannels(mapped, { phone: false })) prospects.push(mapped);
    }
    if (prospects.length) source = `${source}_phone_optional`;
  }

  if (!prospects.length && people.length && requireLinkedin) {
    for (let i = 0; i < people.length && prospects.length < limit; i++) {
      const person = await enrichPerson(people[i]);
      const mapped = mapPerson(person, i);
      if (matchesChannels(mapped, { linkedin: false, phone: false })) prospects.push(mapped);
    }
    if (prospects.length) source = `${source}_linkedin_optional`;
  }

  // If email filter emptied the list, accept people without revealed emails (draft outreach still works)
  if (!prospects.length && people.length) {
    for (let i = 0; i < people.length && prospects.length < limit; i++) {
      prospects.push(mapPerson(people[i], i));
    }
    source = `${source}_no_email_filter`;
  }

  if (!prospects.length) {
    throw new Error(
      `No prospects matched Apollo filters (${(searchBody.person_titles || []).join(', ') || 'default titles'}). Try broader titles or ensure Apollo reveals emails.`
    );
  }

  const run = {
    id: randomUUID(),
    workspaceId,
    companyId,
    companyName,
    senderName: resolveSenderName(input.senderName || input.sender_name),
    question: String(input.question || ''),
    contactChannels: contactChannels.length ? contactChannels : ['email'],
    titles: searchBody.person_titles,
    industries,
    source,
    sequence_emails: normalizeSequenceEmails(input.sequence_emails || input.sequenceEmails),
    createdAt: new Date().toISOString(),
    prospects,
    replies: [],
    campaigns: [],
  };
  cacheRun(run);

  // CRM / Sheets fallback: create lead rows when no HubSpot/Salesforce (or Sheets bridge)
  let crmSync = null;
  try {
    crmSync = await syncProspectsToCrm(run, prospects, {
      status: 'fetched',
      next_action: 'awaiting_copy',
      source: source || 'apollo',
    });
    run.crm_sync = crmSync;
    if (crmSync?.ok) await touchRun(run);
  } catch (err) {
    console.warn('[outreach/crm-sync]', err?.message || err);
    crmSync = { ok: false, error: err?.message || String(err) };
    run.crm_sync = crmSync;
  }

  return run;
}

export async function getOutreachRun(runId) {
  const cached = runsById.get(runId);
  if (cached) return cached;
  const loaded = await loadOutreachRun(runId);
  if (loaded) {
    runsById.set(loaded.id, loaded);
    return loaded;
  }
  return null;
}

async function touchRun(run) {
  if (!run?.id) return;
  cacheRun(run);
}

export function listOutreachRuns(workspaceId) {
  return [...runsById.values()].filter((r) => !workspaceId || r.workspaceId === workspaceId);
}

export function patchProspect(runId, prospectId, patch = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Outreach run not found');
  const prospect = run.prospects.find((p) => p.id === prospectId);
  if (!prospect) throw new Error('Prospect not found');
  const allowed = [
    'full_name',
    'title',
    'company',
    'email',
    'linkedin_url',
    'phone_e164',
    'subject',
    'body',
    'copy_locked',
    'channel_copies',
    'status',
  ];
  for (const key of allowed) {
    if (patch[key] !== undefined) prospect[key] = patch[key];
  }
  if (patch.body !== undefined || patch.channel_copies?.email?.body) {
    const senderName = resolveSenderName(run.senderName);
    prospect.body = finalizeEmailBody(prospect.body, senderName, run.companyName, prospect);
    if (prospect.channel_copies?.email) {
      prospect.channel_copies.email.body = finalizeEmailBody(
        prospect.channel_copies.email.body || prospect.body,
        senderName,
        run.companyName,
        prospect
      );
    }
  }
  void persistOutreachRun(run);
  return prospect;
}

async function groqJson(system, user, workspaceId = 'marqq-ws-1') {
  return meteredStudioJson({
    workspaceId,
    feature: 'outreach_copy',
    system,
    user,
    temperature: 0.4,
    meta: { studio: 'outreach' },
  });
}

export async function generateProspectCopy(runId, prospectId, { channels } = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Outreach run not found');
  assertCanAfford(run.workspaceId || run.companyId, 'outreach_copy');
  const prospect = run.prospects.find((p) => p.id === prospectId);
  if (!prospect) throw new Error('Prospect not found');

  const wanted = (channels || run.contactChannels || ['email']).map(String);
  const playbook = loadColdEmailPlaybook();
  const channelCopies = { ...(prospect.channel_copies || {}) };
  const senderName = resolveSenderName(run.senderName);

  if (wanted.includes('email') || wanted.includes('email')) {
    const firstName = resolveProspectFirstName(prospect) || 'there';
    const parsed = await groqJson(
      `You are Sam, Marqq copy agent. Follow the cold-email skill playbook strictly. Return JSON: {"subject":"...","body":"..."}. Never use placeholders like [Your Name], [Name], {{name}}, or {{first_name}} — always use real names. Body MUST open with "Hi ${firstName}," on its own line.`,
      `${playbook}\n\n---\nWrite a first-touch cold email for:\nCompany sending: ${run.companyName}\nSender full name (sign-off MUST use this exact name): ${senderName}\nProspect first name (salutation MUST be "Hi ${firstName},"): ${firstName}\nProspect: ${prospect.full_name}, ${prospect.title} at ${prospect.company}\nBrief: ${run.question || 'Book a short intro call about lab-personalized nutrition for their patients / org.'}\nOpen with: Hi ${firstName},\nSign off as:\nThanks,\n${senderName}\n${run.companyName}\nReturn only JSON.`,
      run.workspaceId || run.companyId || 'marqq-ws-1'
    );
    const rawBody = String(parsed.body || '').trim();
    channelCopies.email = {
      subject: String(parsed.subject || '').trim() || `Quick idea for ${prospect.company}`,
      body: finalizeEmailBody(rawBody, senderName, run.companyName, prospect),
      skills: ['cold-email'],
    };
    prospect.subject = channelCopies.email.subject;
    prospect.body = channelCopies.email.body;
  }

  if (wanted.includes('linkedin')) {
    const parsed = await groqJson(
      `You are Sam. Write a short LinkedIn DM (under 300 chars). Return JSON: {"body":"..."}. Sign as ${senderName}, never [Your Name].`,
      `Prospect: ${prospect.full_name}, ${prospect.title} @ ${prospect.company}. Sender: ${senderName} at ${run.companyName}. Goal: reply / short call. Return JSON.`,
      run.workspaceId || run.companyId || 'marqq-ws-1'
    );
    channelCopies.linkedin_dm = {
      subject: '',
      body: finalizeEmailBody(String(parsed.body || '').trim(), senderName, run.companyName),
      skills: ['linkedin-outbound-angle'],
    };
  }

  if (wanted.includes('whatsapp') || wanted.includes('phone')) {
    const parsed = await groqJson(
      `You are Sam. Write a concise WhatsApp outreach (under 280 chars). Return JSON: {"body":"..."}. Sign as ${senderName}, never [Your Name].`,
      `Prospect: ${prospect.full_name} @ ${prospect.company}. Sender: ${senderName} at ${run.companyName}. Return JSON.`,
      run.workspaceId || run.companyId || 'marqq-ws-1'
    );
    channelCopies.whatsapp_dm = {
      subject: '',
      body: finalizeEmailBody(String(parsed.body || '').trim(), senderName, run.companyName),
      skills: ['copywriting'],
    };
  }

  prospect.channel_copies = channelCopies;
  prospect.status = 'copy_ready';
  return prospect;
}

export async function saveGmailDraft(runId, prospectId, { subject, body, buildSequence = true } = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Outreach run not found');
  const prospect = run.prospects.find((p) => p.id === prospectId);
  if (!prospect) throw new Error('Prospect not found');
  if (subject != null) prospect.subject = String(subject);
  if (body != null) prospect.body = String(body);
  if (!prospect.email) throw new Error('Prospect email required');
  if (!prospect.subject || !prospect.body) throw new Error('Subject and body required');

  prospect.body = finalizeEmailBody(
    prospect.body,
    resolveSenderName(run.senderName),
    run.companyName,
    prospect
  );

  let sequenceEmails = normalizeSequenceEmails(run.sequence_emails);
  if (buildSequence) {
    sequenceEmails = await ensureEmailSequence(run, prospect, {
      subject: prospect.subject,
      body: prospect.body,
    });
  } else if (!sequenceEmails.length) {
    sequenceEmails = [{ subject: prospect.subject, body: prospect.body, delay_days: 0 }];
  }

  const draft = await executeComposioAction(
    'GMAIL_CREATE_EMAIL_DRAFT',
    {
      recipient_email: prospect.email,
      to: prospect.email,
      subject: prospect.subject,
      body: prospect.body,
      message_body: prospect.body,
    },
    run.companyId,
    'gmail'
  );
  if (draft.error) throw new Error(draft.error);
  const draftId =
    draft.result?.id ||
    draft.result?.draft_id ||
    draft.result?.draft?.id ||
    draft.raw?.data?.id ||
    null;

  prospect.gmail_sequence_steps = buildGmailSequenceSteps(sequenceEmails, { prospect });
  prospect.gmail_sequence_index = 0;
  prospect.gmail_sequence_status = 'draft';
  if (prospect.gmail_sequence_steps[0]) {
    prospect.gmail_sequence_steps[0].draft_id = draftId;
  }
  prospect.gmail_draft_id = draftId;
  prospect.scheduled_for = null;
  prospect.status = 'drafted';
  await touchRun(run);
  return {
    prospect,
    draftId,
    result: draft.result,
    sequence_steps: prospect.gmail_sequence_steps,
    sequence_emails: run.sequence_emails,
  };
}

/**
 * Send via Gmail. Optional testTo overrides recipient (smoke: yogsbags@gmail.com).
 * When a multi-step sequence exists, advances to the next scheduled drip step.
 */
export async function sendProspectEmail(
  runId,
  prospectId,
  { subject, body, testTo, advanceSequence = true } = {}
) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Outreach run not found');
  const prospect = run.prospects.find((p) => p.id === prospectId);
  if (!prospect) throw new Error('Prospect not found');
  if (prospect.status === 'replied' || prospect.gmail_sequence_status === 'stopped_reply') {
    throw new Error('Sequence stopped because this prospect has already replied');
  }
  if (subject != null) prospect.subject = String(subject);
  if (body != null) prospect.body = String(body);
  prospect.body = finalizeEmailBody(
    prospect.body,
    resolveSenderName(run.senderName),
    run.companyName,
    prospect
  );

  const to = String(testTo || prospect.email || '').trim();
  if (!to) throw new Error('Missing recipient email');
  if (!prospect.subject || !prospect.body) throw new Error('Subject and body required');

  let method = 'gmail_send_email';
  let result = null;

  // Prefer send draft if we have one and not redirecting to a test inbox
  if (prospect.gmail_draft_id && !testTo) {
    const sendDraft = await executeComposioAction(
      'GMAIL_SEND_DRAFT',
      { draft_id: prospect.gmail_draft_id, id: prospect.gmail_draft_id },
      run.companyId,
      'gmail'
    );
    if (!sendDraft.error) {
      method = 'gmail_send_draft';
      result = sendDraft.result;
    }
  }

  if (!result) {
    const sendEmail = await executeComposioAction(
      'GMAIL_SEND_EMAIL',
      {
        recipient_email: to,
        to,
        subject: prospect.subject,
        body: prospect.body,
        message_body: prospect.body,
      },
      run.companyId,
      'gmail'
    );
    if (sendEmail.error) {
      prospect.send_error = sendEmail.error;
      throw new Error(sendEmail.error);
    }
    method = 'gmail_send_email';
    result = sendEmail.result;
  }

  const sentAt = new Date().toISOString();
  prospect.sent_at = sentAt;
  prospect.send_error = null;
  prospect.gmail_thread_id = extractGmailThreadId(result) || prospect.gmail_thread_id;
  prospect.gmail_message_id = extractGmailMessageId(result) || prospect.gmail_message_id;
  prospect.send_meta = { to, method, test: Boolean(testTo), result };

  const steps = Array.isArray(prospect.gmail_sequence_steps) ? prospect.gmail_sequence_steps : [];
  const idx = Number(prospect.gmail_sequence_index || 0);
  if (steps[idx]) {
    steps[idx].sent_at = sentAt;
    steps[idx].draft_id = null;
  }

  let sequenceAdvance = null;
  if (advanceSequence && steps.length > 1 && !testTo) {
    sequenceAdvance = await scheduleNextGmailSequenceStep(run, prospect, { now: new Date() });
    if (sequenceAdvance?.done) {
      prospect.status = 'sent';
    }
  } else {
    prospect.status = 'sent';
    prospect.gmail_draft_id = null;
    if (steps.length <= 1) {
      prospect.gmail_sequence_status = steps.length ? 'completed' : prospect.gmail_sequence_status;
    }
  }

  await touchRun(run);
  try {
    await syncProspectToCrm(run, prospect, {
      status: prospect.status === 'scheduled' ? 'scheduled' : 'sent',
      channel: 'email',
      provider: 'gmail',
      sent_at: prospect.sent_at || '',
      next_action: prospect.status === 'scheduled' ? 'awaiting_follow_up' : 'awaiting_reply',
      source: 'outreach_send',
    });
    await touchRun(run);
  } catch (err) {
    console.warn('[outreach/send/crm]', err?.message || err);
  }
  return {
    prospect,
    method,
    result,
    to,
    sent: listSentEmails(run),
    sequence_advance: sequenceAdvance,
  };
}

function matchReplyToSentProspect(run, msg) {
  const from = extractEmailAddress(msg.from || msg.sender || msg.from_email || '');
  const subject = String(msg.subject || msg.snippet || '').trim();
  const subjectKey = normalizeSubjectKey(subject);
  const threadId = String(
    msg.thread_id || msg.threadId || msg.thread || msg.data?.thread_id || ''
  ).trim();
  const sent = sentProspects(run);
  if (!sent.length || !from) return null;

  // Never treat our own outbound mailbox as a "reply"
  const selfAddrs = new Set(
    [
      process.env.OUTREACH_FROM_EMAIL,
      process.env.GMAIL_CONNECTED_EMAIL,
      'yogeshb@productverse.co.in',
    ]
      .map((v) => extractEmailAddress(v))
      .filter(Boolean)
  );
  if (selfAddrs.has(from)) return null;

  const testTo = extractEmailAddress(
    process.env.OUTREACH_TEST_TO || process.env.DEFAULT_TEST_EMAIL || 'yogsbags@gmail.com'
  );

  const expectedFromFor = (p) => {
    const expected = new Set();
    if (p.email) expected.add(extractEmailAddress(p.email));
    if (p.send_meta?.to) expected.add(extractEmailAddress(p.send_meta.to));
    if (testTo) expected.add(testTo);
    expected.delete('');
    return expected;
  };

  const subjectMatches = (p) => {
    const key = normalizeSubjectKey(p.subject);
    if (!key || !subjectKey) return false;
    return subjectKey === key || subjectKey.includes(key) || key.includes(subjectKey);
  };

  // 1) Same Gmail thread AND from is prospect/test recipient (not us)
  if (threadId) {
    const byThread = sent.find((p) => p.gmail_thread_id && String(p.gmail_thread_id) === threadId);
    if (byThread && expectedFromFor(byThread).has(from)) return byThread;
  }

  // 2) From expected reply address + subject matches a sent email
  for (const p of sent) {
    if (!expectedFromFor(p).has(from)) continue;
    if (subjectMatches(p)) return p;
  }

  return null;
}

export async function pollGmailReplies(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Outreach run not found');

  const sent = sentProspects(run);
  const sentList = listSentEmails(run);
  if (!sent.length) {
    return {
      replies: [],
      fresh: [],
      sent: sentList,
      note: 'No sent emails in this run yet — send first, then poll replies.',
    };
  }

  // Build a tight Gmail query: only from addresses we actually emailed / test inbox
  const fromAddrs = new Set();
  for (const p of sent) {
    if (p.email) fromAddrs.add(extractEmailAddress(p.email));
    if (p.send_meta?.to) fromAddrs.add(extractEmailAddress(p.send_meta.to));
  }
  const testTo = extractEmailAddress(process.env.OUTREACH_TEST_TO || process.env.DEFAULT_TEST_EMAIL || 'yogsbags@gmail.com');
  if (testTo) fromAddrs.add(testTo);
  fromAddrs.delete('');

  const earliest = sent.map((p) => p.sent_at).filter(Boolean).sort()[0];
  const afterDate = earliest ? new Date(earliest) : null;
  // Gmail after: uses YYYY/MM/DD
  let afterClause = '';
  if (afterDate && !Number.isNaN(afterDate.getTime())) {
    const y = afterDate.getUTCFullYear();
    const m = String(afterDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(afterDate.getUTCDate()).padStart(2, '0');
    afterClause = ` after:${y}/${m}/${d}`;
  }
  const fromClause =
    fromAddrs.size === 1
      ? `from:${[...fromAddrs][0]}`
      : `(${[...fromAddrs].map((a) => `from:${a}`).join(' OR ')})`;
  const q = `${fromClause} in:inbox -in:sent${afterClause}`.trim();

  const fetchRes = await executeComposioAction(
    'GMAIL_FETCH_EMAILS',
    {
      max_results: 25,
      label_ids: ['INBOX'],
      q,
    },
    run.companyId,
    'gmail'
  );

  let messages = [];
  if (fetchRes.error) {
    // Fallback: list recent inbox, still filter client-side to sent only
    const loose = await executeComposioAction(
      'GMAIL_FETCH_EMAILS',
      { max_results: 30, label_ids: ['INBOX'], q: 'in:inbox newer_than:14d' },
      run.companyId,
      'gmail'
    );
    if (loose.error) throw new Error(fetchRes.error);
    messages =
      loose.result?.messages ||
      loose.result?.emails ||
      loose.result?.data?.messages ||
      [];
  } else {
    messages =
      fetchRes.result?.messages ||
      fetchRes.result?.emails ||
      fetchRes.result?.data?.messages ||
      [];
  }

  // Thread-id fallback: pull messages on known sent threads
  for (const p of sent) {
    if (!p.gmail_thread_id) continue;
    const threadRes = await executeComposioAction(
      'GMAIL_FETCH_MESSAGE_BY_THREAD_ID',
      {
        thread_id: p.gmail_thread_id,
        threadId: p.gmail_thread_id,
        user_id: 'me',
        userId: 'me',
      },
      run.companyId,
      'gmail'
    );
    if (threadRes.error) continue;
    const threadMsgs =
      threadRes.result?.messages ||
      threadRes.result?.emails ||
      threadRes.result?.data?.messages ||
      (Array.isArray(threadRes.result) ? threadRes.result : []);
    if (Array.isArray(threadMsgs)) messages = messages.concat(threadMsgs);
  }

  const fresh = [];
  const seenIds = new Set((run.replies || []).map((r) => r.id));

  for (const msg of Array.isArray(messages) ? messages : []) {
    const fromRaw = String(msg.from || msg.sender || msg.from_email || '');
    const from = extractEmailAddress(fromRaw) || fromRaw.toLowerCase();
    const subject = String(msg.subject || msg.snippet || '').trim();
    const body = String(msg.messageText || msg.body || msg.snippet || msg.text || '').trim();
    const id = String(msg.id || msg.message_id || msg.messageId || `${from}-${subject}-${msg.date || ''}`);
    if (!id || seenIds.has(id)) continue;

    const match = matchReplyToSentProspect(run, msg);
    if (!match) continue; // only replies tied to emails we sent

    // Skip our own outbound mirrored in inbox
    if (String(body).slice(0, 200) === String(match.body || '').slice(0, 200) && from !== extractEmailAddress(match.send_meta?.to || match.email)) {
      continue;
    }

    const reply = {
      id,
      prospectId: match.id,
      prospectName: match.full_name,
      from: fromRaw || from,
      subject,
      body,
      receivedAt: msg.date || msg.internalDate || msg.received_at || new Date().toISOString(),
      status: 'new',
      channel: 'email',
      provider: 'gmail_poll',
      threadId: msg.thread_id || msg.threadId || match.gmail_thread_id || null,
      email: from || extractEmailAddress(match.send_meta?.to || match.email),
      draft_subject: `Re: ${match.subject || subject}`,
      draft_body: '',
      auto_reply_draft: null,
      classification: null,
    };
    if (!match.gmail_thread_id && reply.threadId) match.gmail_thread_id = reply.threadId;
    match.status = 'replied';
    stopGmailSequenceOnReply(match);
    match.replies = Array.isArray(match.replies) ? match.replies : [];
    match.replies.unshift(reply);
    run.replies.unshift(reply);
    seenIds.add(id);
    fresh.push(reply);
  }

  // Keep only matched replies in the run inbox (drop any legacy unmatched dump)
  run.replies = (run.replies || []).filter((r) => r.prospectId);

  // Marqq2 parity: Sam auto-drafts a reply for each fresh inbound (never auto-sends)
  for (const reply of fresh) {
    if (reply.auto_reply_draft?.status === 'draft' || reply.auto_reply_draft?.status === 'sent') continue;
    const prospect = run.prospects.find((p) => p.id === reply.prospectId);
    if (!prospect) continue;
    try {
      await draftAutoReplyForRecordedReply(run, prospect, reply);
    } catch (err) {
      reply.auto_reply_draft = {
        status: 'draft_failed',
        error: err.message || String(err),
        created_at: new Date().toISOString(),
      };
      console.warn('[outreach/auto-reply-draft]', err.message || err);
    }
  }

  if (fresh.length) {
    await touchRun(run);
    for (const reply of fresh) {
      const prospect = run.prospects.find((p) => p.id === reply.prospectId);
      if (!prospect) continue;
      try {
        await syncProspectToCrm(run, prospect, {
          status: 'replied',
          channel: 'email',
          replied_at: reply.receivedAt || new Date().toISOString(),
          next_action: 'review_reply',
          source: 'outreach_reply',
        });
      } catch (err) {
        console.warn('[outreach/reply/crm]', err?.message || err);
      }
    }
    await touchRun(run);
  }

  return {
    replies: run.replies,
    fresh,
    sent: listSentEmails(run),
    query: q,
  };
}

function findReplyInRun(run, replyId) {
  const reply = (run.replies || []).find((r) => r.id === replyId);
  if (!reply) return null;
  const prospect = run.prospects.find((p) => p.id === reply.prospectId) || null;
  return { reply, prospect };
}

function syncReplyOnRun(run, prospect, replyId, updater) {
  const apply = (list) => {
    if (!Array.isArray(list)) return;
    const idx = list.findIndex((r) => r.id === replyId);
    if (idx >= 0) list[idx] = updater(list[idx]);
  };
  apply(run.replies);
  if (prospect) apply(prospect.replies);
  return (run.replies || []).find((r) => r.id === replyId) || null;
}

/**
 * Classify inbound + draft Sam reply. Never sends — status stays `draft`.
 */
export async function draftAutoReplyForRecordedReply(run, prospect, reply) {
  const inboundBody = String(reply?.body || '').trim();
  const inboundSubject = String(reply?.subject || '').trim();
  if (!inboundBody && !inboundSubject) {
    return { status: 'skipped', reason: 'empty_inbound' };
  }

  const senderName = resolveSenderName(run.senderName);
  const originalSubject = String(prospect.subject || '').trim();
  const originalBody = String(prospect.channel_copies?.email?.body || prospect.body || '').trim();

  const parsed = await groqJson(
    [
      'You are Sam, Marqq B2B outreach specialist.',
      'Classify the prospect reply and draft a short email reply.',
      'Never invent facts, meetings, or product claims not in the original outreach.',
      'Never use placeholders like [Your Name] — sign as the real sender name provided.',
      'Return ONLY valid JSON with keys:',
      'classification (interested|not_interested|question|ooo|meeting_booked|referral|unsubscribe|other),',
      'confidence (0-1 number),',
      'rationale (short string),',
      'should_reply (boolean),',
      'subject (string),',
      'body (string).',
      'If OOO or clear not_interested with no question, should_reply may be false and body empty.',
      'Reply body: under 90 words, peer tone, one clear next step when appropriate.',
    ].join(' '),
    JSON.stringify(
      {
        prospect: {
          name: prospect.full_name,
          title: prospect.title,
          company: prospect.company,
          email: prospect.email,
        },
        sender: { name: senderName, company: run.companyName },
        original_outreach: { subject: originalSubject, body: originalBody },
        inbound_reply: { subject: inboundSubject, body: inboundBody },
        company_context: run.companyName || '',
        goal: run.question || 'reply',
      },
      null,
      2
    ),
    run.workspaceId || run.companyId || 'marqq-ws-1'
  );

  const classification = String(parsed.classification || 'other')
    .toLowerCase()
    .replace(/\s+/g, '_');
  const allowed = new Set([
    'interested',
    'not_interested',
    'question',
    'ooo',
    'meeting_booked',
    'referral',
    'unsubscribe',
    'other',
  ]);
  const classSafe = allowed.has(classification) ? classification : 'other';
  const shouldReply =
    parsed.should_reply != null
      ? Boolean(parsed.should_reply)
      : !['ooo', 'not_interested', 'unsubscribe'].includes(classSafe);

  let draftSubject = String(parsed.subject || '').trim();
  if (!draftSubject) {
    if (inboundSubject) {
      draftSubject = /^re\s*:/i.test(inboundSubject) ? inboundSubject : `Re: ${inboundSubject}`;
    } else {
      draftSubject = `Re: ${originalSubject || 'your note'}`;
    }
  }

  let draftBody = finalizeEmailBody(String(parsed.body || '').trim(), senderName, run.companyName);
  if (!shouldReply) draftBody = '';

  const autoReplyDraft = {
    status: 'draft',
    classification: classSafe,
    confidence: Number(parsed.confidence) || null,
    rationale: String(parsed.rationale || '').trim() || null,
    should_reply: shouldReply,
    subject: shouldReply ? draftSubject : '',
    body: shouldReply ? draftBody : '',
    channel: 'email',
    created_at: new Date().toISOString(),
    approved_at: null,
    sent_at: null,
    send_meta: null,
    gmail_draft_id: null,
    error: null,
  };

  // Optional: park in Gmail Drafts (separate from approve/send)
  const replyTo =
    extractEmailAddress(reply.email || reply.from) ||
    extractEmailAddress(prospect.send_meta?.to) ||
    extractEmailAddress(prospect.email);
  if (shouldReply && draftBody && replyTo) {
    try {
      const gmailDraft = await executeComposioAction(
        'GMAIL_CREATE_EMAIL_DRAFT',
        {
          recipient_email: replyTo,
          to: replyTo,
          subject: draftSubject,
          body: draftBody,
          message_body: draftBody,
        },
        run.companyId,
        'gmail'
      );
      if (gmailDraft.error) throw new Error(gmailDraft.error);
      autoReplyDraft.gmail_draft_id =
        gmailDraft.result?.id ||
        gmailDraft.result?.draft_id ||
        gmailDraft.result?.draft?.id ||
        null;
    } catch (error) {
      autoReplyDraft.error = `Gmail draft creation failed: ${error?.message || error}`;
      console.warn('[outreach/auto-reply-gmail-draft]', error?.message || error);
    }
  }

  const updated = syncReplyOnRun(run, prospect, reply.id, (r) => ({
    ...r,
    classification: classSafe,
    draft_subject: autoReplyDraft.subject,
    draft_body: autoReplyDraft.body,
    auto_reply_draft: autoReplyDraft,
    status: 'drafted',
  }));

  return {
    status: 'draft',
    classification: classSafe,
    draft: updated?.auto_reply_draft || autoReplyDraft,
    reply: updated,
  };
}

export async function regenerateReplyDraft(runId, replyId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Outreach run not found');
  const found = findReplyInRun(run, replyId);
  if (!found?.reply) throw new Error('Reply not found');
  if (!found.prospect) throw new Error('Prospect not found for reply');
  return draftAutoReplyForRecordedReply(run, found.prospect, found.reply);
}

export async function updateReplyDraft(runId, replyId, patch = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Outreach run not found');
  const found = findReplyInRun(run, replyId);
  if (!found?.reply) throw new Error('Reply not found');
  const { prospect, reply } = found;
  if (!prospect) throw new Error('Prospect not found for reply');

  const draft = reply.auto_reply_draft || {
    status: 'draft',
    classification: reply.classification || 'other',
    should_reply: true,
    subject: reply.draft_subject || '',
    body: reply.draft_body || '',
    created_at: new Date().toISOString(),
  };
  if (draft.status === 'sent') throw new Error('Reply already sent');

  if (patch.subject != null) draft.subject = String(patch.subject);
  if (patch.body != null) {
    draft.body = finalizeEmailBody(
      String(patch.body),
      resolveSenderName(run.senderName),
      run.companyName
    );
  }
  if (patch.should_reply != null) draft.should_reply = Boolean(patch.should_reply);
  draft.status = 'draft';
  draft.error = null;
  draft.updated_at = new Date().toISOString();

  const updated = syncReplyOnRun(run, prospect, replyId, (r) => ({
    ...r,
    draft_subject: draft.subject,
    draft_body: draft.body,
    auto_reply_draft: { ...draft },
  }));
  return updated;
}

export async function rejectReplyDraft(runId, replyId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Outreach run not found');
  const found = findReplyInRun(run, replyId);
  if (!found?.reply) throw new Error('Reply not found');

  return syncReplyOnRun(run, found.prospect, replyId, (r) => ({
    ...r,
    status: 'dismissed',
    auto_reply_draft: r.auto_reply_draft
      ? { ...r.auto_reply_draft, status: 'rejected', rejected_at: new Date().toISOString() }
      : { status: 'rejected', rejected_at: new Date().toISOString() },
  }));
}

/**
 * Explicit approve → send drafted reply via Gmail. Never auto-fires on poll.
 */
export async function approveReplyDraft(runId, replyId, { send = true, testTo } = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Outreach run not found');
  const found = findReplyInRun(run, replyId);
  if (!found?.reply) throw new Error('Reply not found');
  const { prospect, reply } = found;
  if (!prospect) throw new Error('Prospect not found for reply');

  const draft = reply.auto_reply_draft;
  if (!draft) throw new Error('No auto-reply draft to approve — regenerate from inbox');
  if (draft.status === 'sent') return { status: 'already_sent', reply };
  if (draft.status === 'rejected') throw new Error('Draft was rejected — regenerate or edit first');

  const shouldSend = send !== false && draft.should_reply !== false && String(draft.body || '').trim();
  if (!shouldSend) {
    const updated = syncReplyOnRun(run, prospect, replyId, (r) => ({
      ...r,
      status: 'no_reply_needed',
      auto_reply_draft: {
        ...draft,
        status: 'approved_no_send',
        approved_at: new Date().toISOString(),
      },
    }));
    return { status: 'approved_no_send', reply: updated };
  }

  const subject = String(draft.subject || '').trim() || `Re: ${prospect.subject || 'your note'}`;
  const body = finalizeEmailBody(
    String(draft.body || '').trim(),
    resolveSenderName(run.senderName),
    run.companyName
  );
  const to =
    String(testTo || '').trim() ||
    extractEmailAddress(reply.email || reply.from) ||
    extractEmailAddress(prospect.send_meta?.to) ||
    extractEmailAddress(prospect.email);
  if (!to) throw new Error('Missing reply recipient');

  const threadId = reply.threadId || prospect.gmail_thread_id || null;
  let sendResult = null;
  let method = 'gmail_send_email';

  if (threadId) {
    const threadReply = await executeComposioAction(
      'GMAIL_REPLY_TO_THREAD',
      {
        thread_id: threadId,
        threadId,
        recipient_email: to,
        to,
        subject,
        body,
        message_body: body,
        user_id: 'me',
      },
      run.companyId,
      'gmail'
    );
    if (!threadReply.error) {
      sendResult = threadReply.result;
      method = 'gmail_reply_to_thread';
    }
  }

  if (!sendResult) {
    const sendEmail = await executeComposioAction(
      'GMAIL_SEND_EMAIL',
      {
        recipient_email: to,
        to,
        subject,
        body,
        message_body: body,
      },
      run.companyId,
      'gmail'
    );
    if (sendEmail.error) throw new Error(sendEmail.error);
    sendResult = sendEmail.result;
    method = 'gmail_send_email';
  }

  const updated = syncReplyOnRun(run, prospect, replyId, (r) => ({
    ...r,
    status: 'replied_sent',
    auto_reply_draft: {
      ...draft,
      subject,
      body,
      status: 'sent',
      approved_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      send_meta: { to, method, result: sendResult },
    },
  }));

  return { status: 'sent', method, to, reply: updated, result: sendResult };
}

export function getWorkspaceSummary(workspaceId) {
  const runs = listOutreachRuns(workspaceId);
  const replies = runs.flatMap((r) =>
    (r.replies || []).filter((reply) => reply.prospectId).map((reply) => ({ ...reply, runId: r.id }))
  );
  const prospects = runs.flatMap((r) => r.prospects.map((p) => ({ ...p, runId: r.id })));
  const sent = runs.flatMap((r) => listSentEmails(r).map((s) => ({ ...s, runId: r.id })));
  return {
    runs: runs.map((r) => ({
      id: r.id,
      companyName: r.companyName,
      senderName: r.senderName,
      source: r.source,
      prospectCount: r.prospects.length,
      createdAt: r.createdAt,
      crm_sync: r.crm_sync || null,
    })),
    prospects,
    replies,
    sent,
    crm_synced: prospects.filter((p) => p.crm_sync?.destination).length,
  };
}

async function connectorActive(companyId, connectorId) {
  try {
    await resolveConnectedAccountId(connectorId, companyId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Channel-aware go-live (Marqq2 pattern).
 * email → Instantly (preferred) or Gmail; linkedin → HeyReach; whatsapp → WhatsApp.
 */
export async function goLiveProspect(runId, prospectId, opts = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Outreach run not found');
  const prospect = run.prospects.find((p) => p.id === prospectId);
  if (!prospect) throw new Error('Prospect not found');

  const channel = String(opts.channel || 'email').toLowerCase();
  const delivery = String(opts.delivery || 'draft').toLowerCase() === 'live' ? 'live' : 'draft';
  const activate = delivery === 'live' || opts.activate === true;
  const companyId = run.companyId || 'marqq-ws-1';

  if (opts.subject != null) prospect.subject = String(opts.subject);
  if (opts.body != null) prospect.body = String(opts.body);

  const copies = prospect.channel_copies || {};
  let subject = prospect.subject;
  let body = prospect.body;
  const templateName =
    String(opts.template_name || opts.templateName || copies.whatsapp_dm?.template_name || '').trim() ||
    null;
  const languageCode =
    String(opts.language_code || opts.languageCode || copies.whatsapp_dm?.language_code || 'en_US').trim() ||
    'en_US';

  if (channel === 'linkedin') {
    body = copies.linkedin_dm?.body || body;
    subject = '';
  } else if (channel === 'whatsapp') {
    body = copies.whatsapp_dm?.body || body;
    subject = '';
  } else {
    subject = copies.email?.subject || subject;
    body = copies.email?.body || body;
    body = finalizeEmailBody(body, resolveSenderName(run.senderName), run.companyName, prospect);
  }
  if (channel === 'whatsapp') {
    if (!templateName && !body) throw new Error('WhatsApp text or approved template_name required');
  } else if (!body) {
    throw new Error('Message body required — generate copy first');
  }

  const lead = {
    email: prospect.email,
    first_name: prospect.first_name || String(prospect.full_name || '').split(' ')[0] || '',
    last_name: prospect.last_name || String(prospect.full_name || '').split(' ').slice(1).join(' ') || '',
    full_name: prospect.full_name,
    company: prospect.company,
    company_name: prospect.company,
    title: prospect.title,
    linkedin_url: prospect.linkedin_url,
    phone_e164: prospect.phone_e164,
    phone: prospect.phone_e164,
  };

  let result;
  if (channel === 'email') {
    const prefer = String(opts.provider || '').toLowerCase();
    const instantlyOk = await connectorActive(companyId, 'instantly');
    const gmailOk = await connectorActive(companyId, 'gmail');
    const useInstantly = prefer === 'instantly' || (prefer !== 'gmail' && instantlyOk);

    // Multi-step sequence (Instantly + Gmail drip): body opts.sequence_emails or AI follow-ups
    if (Array.isArray(opts.sequence_emails) && opts.sequence_emails.length) {
      run.sequence_emails = normalizeSequenceEmails(opts.sequence_emails);
    }
    const sequenceEmails = await ensureEmailSequence(run, prospect, { subject, body });
    subject = sequenceEmails[0]?.subject || subject;
    body = sequenceEmails[0]?.body || body;
    prospect.subject = subject;
    prospect.body = body;
    prospect.channel_copies = {
      ...(prospect.channel_copies || {}),
      email: { subject, body, skills: ['cold-email'] },
    };

    if (useInstantly && instantlyOk) {
      result = await launchInstantlyCampaign(companyId, {
        name: `Marqq · ${prospect.full_name || prospect.email || 'lead'}`.slice(0, 80),
        subject: subject || 'Quick question',
        body,
        sequence_emails: sequenceEmails,
        leads: [lead],
        activate,
      });
    } else if (gmailOk) {
      if (activate) {
        const draft = await saveGmailDraft(runId, prospectId, {
          subject,
          body,
          buildSequence: true,
        });
        const sent = await sendProspectEmail(runId, prospectId, {
          subject,
          body,
          testTo: opts.testTo || null,
          advanceSequence: !opts.testTo,
        });
        result = {
          provider: 'gmail',
          status: 'live',
          sequence_steps: prospect.gmail_sequence_steps?.length || draft.sequence_steps?.length || 1,
          draftId: draft.draftId,
          method: sent.method,
          to: sent.to,
          sequence_advance: sent.sequence_advance
            ? { done: Boolean(sent.sequence_advance.done) }
            : null,
        };
      } else {
        const draft = await saveGmailDraft(runId, prospectId, { subject, body, buildSequence: true });
        result = {
          provider: 'gmail',
          status: 'draft',
          draftId: draft.draftId,
          sequence_steps: draft.sequence_steps?.length || 1,
        };
      }
    } else {
      throw new Error('Connect Instantly or Gmail under Integrations for email outreach');
    }
  } else if (channel === 'linkedin') {
    if (!(await connectorActive(companyId, 'heyreach'))) {
      throw new Error('Connect HeyReach under Integrations for LinkedIn outreach');
    }
    if (!lead.linkedin_url) throw new Error('Prospect needs a LinkedIn URL');
    result = await launchHeyReachCampaign(companyId, {
      campaign_name: `Marqq · ${prospect.full_name || 'LI'}`.slice(0, 50),
      leads: [lead],
      message: body,
      activate,
    });
  } else if (channel === 'whatsapp') {
    if (!(await connectorActive(companyId, 'whatsapp'))) {
      throw new Error('Connect WhatsApp under Integrations');
    }
    if (templateName) {
      prospect.channel_copies = {
        ...(prospect.channel_copies || {}),
        whatsapp_dm: {
          ...(prospect.channel_copies?.whatsapp_dm || {}),
          body: body || prospect.channel_copies?.whatsapp_dm?.body || '',
          template_name: templateName,
          language_code: languageCode,
          skills: ['copywriting'],
        },
      };
    }
    result = await launchWhatsAppSend(companyId, {
      text: body,
      template_name: templateName,
      language_code: languageCode,
      leads: [lead],
      activate,
    });
    if (activate && Array.isArray(result.results)) {
      for (const row of result.results) {
        if (row.message_id) {
          registerWhatsAppSend({
            runId,
            prospectId,
            companyId,
            messageId: row.message_id,
            toNumber: row.to_number,
            templateName: templateName || row.template_name,
            phoneNumberId: result.phone_number_id,
          });
        }
      }
    }
  } else {
    throw new Error(`Unknown channel: ${channel}`);
  }

  prospect.go_live = {
    ...(prospect.go_live || {}),
    channel,
    delivery,
    at: new Date().toISOString(),
    result: result
      ? {
          provider: result.provider,
          status: result.status,
          campaign_id: result.campaign_id || null,
          activated: result.activated || false,
          sequence_steps: result.sequence_steps || null,
          method: result.method || null,
          to: result.to || null,
          draftId: result.draftId || null,
        }
      : null,
  };
  if (result.status === 'live' || result.activated) {
    // Preserve Gmail drip "scheduled" after step-0 send
    if (prospect.gmail_sequence_status !== 'scheduled') {
      prospect.status = 'sent';
      prospect.sent_at = prospect.sent_at || new Date().toISOString();
    }
  } else if (prospect.status !== 'sent' && prospect.status !== 'scheduled') {
    prospect.status = 'drafted';
  }

  await touchRun(run);

  let crmSync = null;
  try {
    const status =
      prospect.gmail_sequence_status === 'scheduled'
        ? 'scheduled'
        : result.status === 'live' || result.activated
          ? 'sent'
          : 'drafted';
    crmSync = await syncProspectToCrm(run, prospect, {
      status,
      channel,
      provider: result.provider || '',
      campaign_id: result.campaign_id || '',
      sent_at: prospect.sent_at || '',
      next_action:
        status === 'scheduled'
          ? 'awaiting_follow_up'
          : status === 'sent'
            ? 'awaiting_reply'
            : 'awaiting_activate',
      source: 'outreach_go_live',
    });
    if (crmSync?.ok) await touchRun(run);
  } catch (err) {
    console.warn('[outreach/go-live/crm]', err?.message || err);
    crmSync = { ok: false, error: err?.message || String(err) };
  }

  return {
    prospect,
    channel,
    delivery,
    result,
    channelPlan: OUTREACH_CHANNEL_CONNECTORS[channel] || null,
    sequence_emails: run.sequence_emails || [],
    crm_sync: crmSync,
  };
}

export function getWhatsAppTemplatesForCompany(companyId) {
  return listWhatsAppTemplates(companyId);
}

export function getWhatsAppDeliveryForRun(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Outreach run not found');
  const tracked = listWhatsAppStatusesForRun(runId);
  // Merge latest delivery_status onto prospect go_live results
  for (const prospect of run.prospects || []) {
    const rows = prospect.go_live?.result?.results;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row.message_id) continue;
      const st = tracked.statuses.find((s) => s.message_id === row.message_id);
      if (st?.delivery_status) row.delivery_status = st.delivery_status;
    }
  }
  return {
    runId,
    ...tracked,
    prospects: (run.prospects || [])
      .filter((p) => p.go_live?.channel === 'whatsapp')
      .map((p) => ({
        id: p.id,
        full_name: p.full_name,
        phone_e164: p.phone_e164,
        status: p.status,
        go_live: p.go_live,
      })),
  };
}

export function resolveOutreachProspectByPhone(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (!digits) return null;
  for (const run of runsById.values()) {
    for (const p of run.prospects || []) {
      const pDigits = String(p.phone_e164 || '').replace(/[^\d]/g, '');
      if (pDigits && (pDigits === digits || pDigits.endsWith(digits) || digits.endsWith(pDigits))) {
        return {
          runId: run.id,
          prospectId: p.id,
          prospectName: p.full_name || null,
          companyId: run.companyId,
        };
      }
    }
  }
  return null;
}

export function ingestWhatsAppWebhook(payload) {
  return handleWhatsAppWebhookPayload(payload, {
    resolveProspectByPhone: resolveOutreachProspectByPhone,
  });
}

export async function pollWhatsAppStatuses(companyId) {
  return pollWhatsAppMessageStatusTrigger(companyId);
}

export function getWhatsAppInbound(runId) {
  return listRecentInboundReplies({ runId });
}

/**
 * Generate / replace run-level multi-step email sequence (first + 3 follow-ups).
 */
export async function generateRunEmailSequence(runId, { subject, body, prospectId } = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Outreach run not found');
  const prospect =
    (prospectId && run.prospects.find((p) => p.id === prospectId)) ||
    run.prospects.find((p) => p.subject || p.body || p.channel_copies?.email) ||
    run.prospects[0];
  if (!prospect) throw new Error('No prospect available for sequence generation');

  const firstSubject = String(
    subject || prospect.subject || prospect.channel_copies?.email?.subject || 'Quick question'
  ).trim();
  const firstBody = String(
    body || prospect.body || prospect.channel_copies?.email?.body || ''
  ).trim();
  if (!firstBody) throw new Error('Write or generate first-touch email body before building a sequence');

  // Force regenerate follow-ups
  run.sequence_emails = [];
  const steps = await ensureEmailSequence(run, prospect, {
    subject: firstSubject,
    body: firstBody,
  });
  await touchRun(run);
  return { sequence_emails: steps, prospectId: prospect.id };
}

/**
 * Patch run-level sequence_emails from the UI.
 */
export function setRunEmailSequence(runId, emails) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Outreach run not found');
  run.sequence_emails = normalizeSequenceEmails(emails);
  touchRun(run);
  return { sequence_emails: run.sequence_emails };
}

/**
 * Due Gmail drip processor (Marqq2 ~60s poller).
 */
export async function processDueOutreachSends({ now = new Date() } = {}) {
  return processDueSendsCore(runsById, {
    now,
    sendFn: (runId, prospectId) =>
      sendProspectEmail(runId, prospectId, { advanceSequence: true }),
  });
}
