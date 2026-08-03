/**
 * Smoke: Instantly multi-step + Gmail sequence helpers + follow-up skill load.
 * Run: node scripts/e2e-outreach-sequences-smoke.mjs
 */
import assert from 'node:assert/strict';
import {
  normalizeSequenceEmails,
  buildGmailSequenceSteps,
  stopGmailSequenceOnReply,
  generateFollowUpEmails,
  ensureEmailGreeting,
  resolveProspectFirstName,
  loadFollowUpSkillPlaybook,
  DEFAULT_SEQUENCE_DELAYS,
} from '../server/services/outreachSequences.js';

function instantlyBuildSequences(emails) {
  const steps = (Array.isArray(emails) ? emails : [])
    .filter((e) => e && (e.subject || e.body))
    .map((e, i) => ({
      type: 'email',
      delay: i === 0 ? 0 : Number(e.delay_days ?? e.delay ?? 3),
      variants: [{ subject: String(e.subject || 'Quick question'), body: String(e.body || '') }],
    }));
  return steps.length ? [{ steps }] : null;
}

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.error(`FAIL  ${name}: ${err.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.error(`FAIL  ${name}: ${err.message}`);
  }
}

const sample = [
  { subject: 'Quick question for {{firstName}}', body: 'Hi — first touch.', delay_days: 0 },
  { subject: 'Re: Quick question', body: 'Bump with a tighter angle.', delay_days: 3 },
  { subject: 'Different angle', body: 'One concrete outcome.', delay_days: 7 },
  { subject: 'Closing the loop', body: 'Last note — reply later to pause.', delay_days: 14 },
];

check('skill cadence is day 0/3/7/14', () => {
  assert.deepEqual(DEFAULT_SEQUENCE_DELAYS, [0, 3, 7, 14]);
});

check('loadFollowUpSkillPlaybook includes follow-up + cadence', () => {
  const playbook = loadFollowUpSkillPlaybook();
  assert.ok(playbook.length > 200, 'playbook too short');
  assert.match(playbook, /copywriting-follow-up|follow-up/i);
  assert.match(playbook, /Follow-Up Sequences|day 3|Cadence/i);
});

check('normalizeSequenceEmails keeps 4 steps with delays', () => {
  const n = normalizeSequenceEmails(sample);
  assert.equal(n.length, 4);
  assert.equal(n[0].delay_days, 0);
  assert.equal(n[1].delay_days, 3);
  assert.equal(n[2].delay_days, 7);
  assert.equal(n[3].delay_days, 14);
});

check('Instantly sequences payload has multi-step delays', () => {
  const seq = instantlyBuildSequences(sample);
  assert.ok(seq);
  assert.equal(seq[0].steps.length, 4);
  assert.equal(seq[0].steps[0].delay, 0);
  assert.equal(seq[0].steps[1].delay, 3);
  assert.equal(seq[0].steps[2].delay, 7);
  assert.equal(seq[0].steps[3].delay, 14);
});

check('Gmail drip steps include schedule fields', () => {
  const steps = buildGmailSequenceSteps(sample);
  assert.equal(steps.length, 4);
  assert.ok(steps[0].scheduled_for);
  assert.equal(steps[1].scheduled_for, null);
});

check('stopGmailSequenceOnReply clears schedule', () => {
  const prospect = {
    gmail_sequence_steps: buildGmailSequenceSteps(sample),
    gmail_sequence_status: 'scheduled',
    scheduled_for: new Date().toISOString(),
    gmail_draft_id: 'draft_1',
  };
  stopGmailSequenceOnReply(prospect);
  assert.equal(prospect.gmail_sequence_status, 'stopped_reply');
  assert.equal(prospect.scheduled_for, null);
  assert.equal(prospect.gmail_draft_id, null);
});

check('ensureEmailGreeting prepends Hi FirstName', () => {
  const p = { first_name: 'Riya', full_name: 'Riya Sharma' };
  assert.equal(resolveProspectFirstName(p), 'Riya');
  assert.match(ensureEmailGreeting('Quick thought on labs.', p), /^Hi Riya,\n\nQuick thought/);
  assert.match(ensureEmailGreeting('Hi,\n\nQuick thought.', p), /^Hi Riya,\n\nQuick thought/);
  assert.equal(ensureEmailGreeting('Hi Riya,\n\nAlready good.', p), 'Hi Riya,\n\nAlready good.');
});

await checkAsync('fallback follow-ups use skill cadence + greeting', async () => {
  const prev = process.env.GROQ_API_KEY;
  const prevV = process.env.VITE_GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.VITE_GROQ_API_KEY;
  try {
    const followUps = await generateFollowUpEmails({
      companyName: 'Nouriva AI',
      senderName: 'Yogesh',
      prospect: { full_name: 'Alex Founder', title: 'CEO', company: 'Acme' },
      firstSubject: 'Personalized nutrition for Acme',
      firstBody: 'Hi Alex — first touch about Nouriva.',
    });
    assert.equal(followUps.length, 3);
    assert.deepEqual(
      followUps.map((f) => f.delay_days),
      [3, 7, 14]
    );
    assert.ok(followUps.every((f) => /^Hi Alex,/i.test(f.body)));
  } finally {
    if (prev != null) process.env.GROQ_API_KEY = prev;
    if (prevV != null) process.env.VITE_GROQ_API_KEY = prevV;
  }
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} pass · ${failed.length} fail`);
process.exit(failed.length ? 1 : 0);
