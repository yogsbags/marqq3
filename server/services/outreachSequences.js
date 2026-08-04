/**
 * Email sequence engine (Marqq2 parity):
 * - Instantly: multi-step sequence_emails → campaign.sequences
 * - Gmail: local drip steps + due-send scheduler + stop-on-reply
 * - Follow-ups use copywriting-follow-up + cold-email follow-up-sequences skills
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeComposioAction } from './composio.js';
import { meteredStudioJson } from './credits/index.js';

/** Cadence from cold-email follow-up-sequences skill: day 0 / 3 / 7 / 14 */
export const DEFAULT_SEQUENCE_DELAYS = [0, 3, 7, 14];

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Marqq2 outreach_follow_up pack:
 * primary copywriting-follow-up + secondary cold-email (follow-up-sequences ref).
 */
export function loadFollowUpSkillPlaybook({ maxChars = 10000 } = {}) {
  const chunks = [];
  const candidates = [
    [
      'copywriting-follow-up',
      join(
        ROOT,
        '../Marqq2/platform/agent-runtime/skills/marketingskills/skills/copywriting-follow-up/SKILL.md'
      ),
      join(ROOT, 'scripts/marqq2-playbooks/copywriting-follow-up-SKILL.md'),
    ],
    [
      'cold-email/follow-up-sequences',
      join(
        ROOT,
        '../Marqq2/platform/agent-runtime/skills/marketingskills/skills/cold-email/references/follow-up-sequences.md'
      ),
      join(ROOT, 'scripts/marqq2-playbooks/cold-email-follow-up-sequences.md'),
    ],
    [
      'cold-email',
      join(ROOT, '../Marqq2/platform/agent-runtime/skills/marketingskills/skills/cold-email/SKILL.md'),
      join(ROOT, 'scripts/marqq2-playbooks/cold-email-SKILL.md'),
    ],
  ];

  for (const [label, ...paths] of candidates) {
    for (const p of paths) {
      if (!existsSync(p)) continue;
      try {
        const text = readFileSync(p, 'utf8').trim();
        if (text) {
          chunks.push(`### Skill: ${label}\n${text}`);
          break;
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (!chunks.length) {
    return [
      'Write concise outbound follow-ups after no reply.',
      'Never say "just following up" or repeat the first email.',
      'Each follow-up: one fresh angle (proof, insight, objection, resource), shorter than first touch, one CTA.',
      'Cadence: day 3, day 7, day 14. Last touch may be a breakup that leaves the door open.',
    ].join(' ');
  }

  return chunks.join('\n\n---\n\n').slice(0, maxChars);
}

/** Resolve a usable first name for email salutations. */
export function resolveProspectFirstName(prospect) {
  const fromField = String(prospect?.first_name || '').trim();
  if (fromField && !/^unknown$/i.test(fromField)) return fromField.split(/\s+/)[0];
  const full = String(prospect?.full_name || '').trim();
  if (!full || /^unknown$/i.test(full)) return '';
  return full.split(/\s+/)[0];
}

/**
 * Guarantee body starts with "Hi <FirstName>," (Marqq2 parity).
 * Rewrites bare "Hi," / "Hello" openings that omit the name.
 */
export function ensureEmailGreeting(body, prospect) {
  let text = String(body || '').trim();
  if (!text) return text;
  const firstName = resolveProspectFirstName(prospect) || 'there';

  text = text
    .replace(/\{\{\s*first[_\s-]?name\s*\}\}/gi, firstName)
    .replace(/\{\s*first[_\s-]?name\s*\}/gi, firstName)
    .replace(/\{firstName\}/gi, firstName)
    .replace(/\[first[_\s-]?name\]/gi, firstName)
    .replace(/\{\{\s*firstName\s*\}\}/gi, firstName);

  // Already personalized: Hi Alex, / Hello Alex
  if (new RegExp(`^(hi|hello|hey)\\s+${escapeRegExp(firstName)}\\b`, 'i').test(text)) {
    return text;
  }
  // Already has a named greeting (leave alone)
  if (/^(hi|hello|hey)\s+[A-Za-z][A-Za-z'’.-]{1,40}\s*[,!\n]/i.test(text)) {
    return text;
  }

  // Strip bare Hi/Hello/Hey (with optional punctuation, no name) then prepend
  const stripped = text.replace(/^(hi|hello|hey)\b\s*[,—–-]?\s*/i, '').trim();
  return `Hi ${firstName},\n\n${stripped}`;
}

export function normalizeSequenceEmails(emails, { max = 5 } = {}) {
  return (Array.isArray(emails) ? emails : [])
    .map((step, i) => ({
      subject: String(step?.subject || '').trim(),
      body: String(step?.body || '').trim(),
      delay_days:
        i === 0
          ? 0
          : Math.max(1, Number(step?.delay_days ?? step?.delay ?? DEFAULT_SEQUENCE_DELAYS[i] ?? 3)),
    }))
    .filter((step) => step.subject || step.body)
    .slice(0, max);
}

function fallbackFollowUps({ firstSubject, companyName, senderName, firstName }) {
  const name = firstName || 'there';
  const base = String(firstSubject || 'Quick question').replace(/^re:\s*/i, '').trim();
  return [
    {
      subject: `Re: ${base}`,
      body: `Hi ${name},\n\nOne more angle that often matters for teams like yours: turning messy lab markers into a clear next meal plan patients will actually follow.\n\nHappy to send a 3-bullet version if useful.\n\nBest,\n${senderName}\n${companyName}`,
      delay_days: 3,
    },
    {
      subject: `Different angle on ${base}`,
      body: `Hi ${name},\n\nSharing a tighter angle — clinicians usually want one concrete patient outcome before a bigger rollout.\n\nWorth a 10-min look?\n\nBest,\n${senderName}\n${companyName}`,
      delay_days: 7,
    },
    {
      subject: `Closing the loop — ${base}`,
      body: `Hi ${name},\n\nI'll close the loop after this note. If timing is off, just reply "later" and I'll pause.\n\nBest,\n${senderName}\n${companyName}`,
      delay_days: 14,
    },
  ];
}

/**
 * AI-generate 3 follow-up emails after the first touch.
 */
export async function generateFollowUpEmails({
  companyName,
  senderName,
  prospect,
  firstSubject,
  firstBody,
  brandContext = '',
  workspaceId = 'marqq-ws-1',
} = {}) {
  const firstName = resolveProspectFirstName(prospect) || 'there';
  const skillPlaybook = loadFollowUpSkillPlaybook();
  try {
    const parsed = await meteredStudioJson({
      workspaceId: workspaceId || 'marqq-ws-1',
      feature: 'outreach_sequences',
      temperature: 0.45,
      system: [
        'You write B2B cold-email follow-ups. Follow the skill playbooks strictly.',
        'Return ONLY JSON:',
        '{"follow_ups":[{"subject":"...","body":"...","delay_days":3,"angle":"..."},{"subject":"...","body":"...","delay_days":7,"angle":"..."},{"subject":"...","body":"...","delay_days":14,"angle":"..."}]}',
        'Rules: exactly 3 follow-ups; each shorter than the first email; one fresh angle each; one low-friction CTA; never "just checking in" / "just following up";',
        'Cadence delays MUST be 3, 7, and 14 days (skill cadence). Third follow-up may be a breakup that leaves the door open.',
        `Every body MUST open with "Hi ${firstName}," (exact first name — never omit the salutation);`,
        `sign as "Best,\\n${senderName}\\n${companyName}"; never invent proof, metrics, customers, or fake stats.`,
        '',
        '=== Marketing skill playbooks (authoritative) ===',
        skillPlaybook,
      ].join('\n'),
      user: JSON.stringify(
        {
          company: companyName,
          sender: senderName,
          brand_context: brandContext,
          skills: ['copywriting-follow-up', 'cold-email'],
          prospect: {
            first_name: firstName,
            name: prospect?.full_name,
            title: prospect?.title,
            company: prospect?.company,
          },
          first_email: { subject: firstSubject, body: firstBody },
        },
        null,
        2
      ),
      meta: { studio: 'outreach_sequences' },
    });
    const followUps = Array.isArray(parsed?.follow_ups) ? parsed.follow_ups : [];
    const normalized = normalizeSequenceEmails(
      followUps.map((f, i) => ({
        subject: f.subject,
        body: ensureEmailGreeting(f.body, prospect),
        delay_days: Number(f.delay_days) || DEFAULT_SEQUENCE_DELAYS[i + 1] || 3 + i * 4,
      })),
      { max: 3 }
    );
    if (normalized.length >= 2) {
      // Force skill cadence even if model drifts
      return normalized.map((step, i) => ({
        ...step,
        delay_days: DEFAULT_SEQUENCE_DELAYS[i + 1] ?? step.delay_days,
      }));
    }
  } catch (err) {
    console.warn('[outreach/sequence] follow-up AI failed:', err?.message || err);
  }
  return fallbackFollowUps({ firstSubject, companyName, senderName, firstName });
}

/**
 * Build a full sequence: first touch + follow-ups (from run.sequence_emails or AI).
 */
export async function ensureEmailSequence(run, prospect, { subject, body } = {}) {
  const firstSubject = String(subject || prospect.subject || 'Quick question').trim();
  const firstBody = ensureEmailGreeting(String(body || prospect.body || '').trim(), prospect);
  if (!firstBody) throw new Error('First email body required for sequence');

  let steps = normalizeSequenceEmails(run.sequence_emails);
  if (steps.length >= 2) {
    // Ensure step 0 matches current composer; greet every step
    steps = [
      { subject: firstSubject, body: firstBody, delay_days: 0 },
      ...steps.slice(1).map((s) => ({
        ...s,
        body: ensureEmailGreeting(s.body, prospect),
      })),
    ];
  } else {
    const followUps = await generateFollowUpEmails({
      companyName: run.companyName,
      senderName: run.senderName || 'Team',
      prospect,
      firstSubject,
      firstBody,
      workspaceId: run.workspaceId || run.companyId,
    });
    steps = [{ subject: firstSubject, body: firstBody, delay_days: 0 }, ...followUps].slice(0, 5);
  }

  run.sequence_emails = steps;
  return steps;
}

export function buildGmailSequenceSteps(emails, { now = new Date(), prospect = null } = {}) {
  const steps = normalizeSequenceEmails(emails).map((step) => ({
    ...step,
    body: prospect ? ensureEmailGreeting(step.body, prospect) : step.body,
  }));
  return steps.map((step, index) => ({
    index,
    subject: step.subject,
    body: step.body,
    delay_days: step.delay_days,
    draft_id: null,
    scheduled_for: index === 0 ? now.toISOString() : null,
    sent_at: null,
  }));
}

function suggestAptSendTime({ from = new Date(), delayDays = 3 } = {}) {
  const d = new Date(from.getTime() + Math.max(0, Number(delayDays) || 0) * 86_400_000);
  // Nudge into weekday business hours IST-ish (09:00–17:00 local)
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() + 1);
  if (day === 6) d.setDate(d.getDate() + 2);
  if (d.getHours() < 9) d.setHours(9, 15, 0, 0);
  if (d.getHours() >= 17) {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 15, 0, 0);
  }
  return d.toISOString();
}

export async function createGmailDraftForStep(run, prospect, step) {
  const draft = await executeComposioAction(
    'GMAIL_CREATE_EMAIL_DRAFT',
    {
      recipient_email: prospect.email,
      to: prospect.email,
      subject: step.subject,
      body: step.body,
      message_body: step.body,
    },
    run.companyId,
    'gmail'
  );
  if (draft.error) throw new Error(draft.error);
  return (
    draft.result?.id ||
    draft.result?.draft_id ||
    draft.result?.draft?.id ||
    draft.raw?.data?.id ||
    null
  );
}

/**
 * After sending current step, schedule next Gmail drip step (or complete).
 */
export async function scheduleNextGmailSequenceStep(run, prospect, { now = new Date() } = {}) {
  const steps = Array.isArray(prospect.gmail_sequence_steps) ? prospect.gmail_sequence_steps : [];
  if (steps.length <= 1) {
    prospect.gmail_sequence_status = 'completed';
    prospect.scheduled_for = null;
    return { done: true, prospect };
  }
  const nextIndex = Number(prospect.gmail_sequence_index || 0) + 1;
  if (nextIndex >= steps.length) {
    prospect.gmail_sequence_status = 'completed';
    prospect.gmail_sequence_index = steps.length - 1;
    prospect.scheduled_for = null;
    prospect.gmail_draft_id = null;
    return { done: true, prospect };
  }
  const next = steps[nextIndex];
  const draftId = await createGmailDraftForStep(run, prospect, next);
  next.draft_id = draftId;
  next.scheduled_for = suggestAptSendTime({ from: now, delayDays: next.delay_days || 3 });
  prospect.gmail_sequence_index = nextIndex;
  prospect.gmail_sequence_status = 'scheduled';
  prospect.scheduled_for = next.scheduled_for;
  prospect.gmail_draft_id = draftId;
  prospect.subject = next.subject;
  prospect.body = next.body;
  prospect.status = 'scheduled';
  return { done: false, prospect, next };
}

export function stopGmailSequenceOnReply(prospect) {
  if (!prospect) return;
  const steps = Array.isArray(prospect.gmail_sequence_steps) ? prospect.gmail_sequence_steps : [];
  if (steps.length > 1) {
    prospect.gmail_sequence_status = 'stopped_reply';
    prospect.scheduled_for = null;
    prospect.gmail_draft_id = null;
  }
}

/**
 * Process all due Gmail drip sends across cached runs.
 * sendFn(runId, prospectId) should send the current step.
 */
export async function processDueOutreachSends(runsById, { now = new Date(), sendFn } = {}) {
  if (typeof sendFn !== 'function') throw new Error('sendFn required');
  const ts = now.getTime();
  const results = [];
  for (const run of runsById.values()) {
    for (const prospect of run.prospects || []) {
      if (prospect.gmail_sequence_status === 'stopped_reply') continue;
      if (prospect.status === 'replied') continue;
      if (prospect.status !== 'scheduled') continue;
      const dueAt = Date.parse(String(prospect.scheduled_for || ''));
      if (!Number.isFinite(dueAt) || dueAt > ts) continue;
      try {
        const sent = await sendFn(run.id, prospect.id, { advanceSequence: true });
        results.push({ runId: run.id, prospectId: prospect.id, ok: true, to: sent?.to });
      } catch (err) {
        results.push({
          runId: run.id,
          prospectId: prospect.id,
          ok: false,
          error: err.message || String(err),
        });
      }
    }
  }
  return { processed: results.length, results };
}
