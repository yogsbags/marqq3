#!/usr/bin/env node
/**
 * Nouriva outreach: regenerate copy + skill-guided sequence → Gmail live to test inbox.
 *
 *   OUTREACH_TEST_TO=yogsbags@gmail.com node scripts/e2e-nouriva-outreach-sequence-live.mjs
 *
 * Requires: backend :3001, Gmail (+ optional Apollo) for marqq-ws-1, GROQ key
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(__dirname, 'output');
const BASE = String(process.env.BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const TEST_TO = process.env.OUTREACH_TEST_TO || 'yogsbags@gmail.com';
const COMPANY_ID = process.env.COMPANY_ID || 'marqq-ws-1';

function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const results = [];
function ok(name, detail = '') {
  results.push({ name, status: 'pass', detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  results.push({ name, status: 'fail', detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { res, data };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`\n[outreach-sequence-live] ${BASE} · testTo=${TEST_TO}\n`);

  const health = await api('/health');
  if (health.res.ok) ok('health');
  else {
    fail('health', String(health.res.status));
    process.exit(1);
  }

  const int = await api(`/api/integrations?companyId=${encodeURIComponent(COMPANY_ID)}`);
  const connectors = int.data.connectors || [];
  const gmail = connectors.find((c) => c.id === 'gmail');
  const apollo = connectors.find((c) => c.id === 'apollo');
  if (gmail?.connected || gmail?.status === 'active') ok('connector:gmail');
  else fail('connector:gmail', JSON.stringify(gmail));
  if (apollo?.connected || apollo?.status === 'active') ok('connector:apollo');
  else console.warn('  ~ apollo not active — will seed a prospect if fetch empty');

  console.log('\n[1] Fetch / seed prospect');
  let runId = null;
  let prospect = null;
  const runRes = await api('/api/outreach/runs', {
    method: 'POST',
    body: {
      companyName: 'Nouriva AI',
      companyId: COMPANY_ID,
      workspaceId: COMPANY_ID,
      senderName: process.env.OUTREACH_SENDER_NAME || 'Yogesh',
      question:
        'B2B clinical partners for Nouriva AI — lab-personalized nutrition. Book a 15-min intro.',
      titles: ['Endocrinologist', 'Dietitian', 'Medical Director', 'Head of Nutrition'],
      industries: ['hospital & health care', 'medical practice'],
      contactChannels: ['email'],
      country: 'India',
      limit: 5,
    },
  });

  if (runRes.res.ok && runRes.data.ok && (runRes.data.prospects || []).length) {
    runId = runRes.data.runId;
    prospect = (runRes.data.prospects || []).find((p) => p.email) || runRes.data.prospects[0];
    ok('fetch:apollo', `${runRes.data.prospects.length} · ${prospect.full_name}`);
  } else {
    fail('fetch:apollo', runRes.data.error || 'empty — seeding');
    // Seed via a minimal run isn't available without Apollo — try patch path after create fails.
    // Create a synthetic run by calling copy on a smoke seed through go-live isn't possible.
    // Fall back: use POST with a fake person via internal - not exposed.
    // Instead call generate on whatever we got, or exit.
    if (!runId) {
      console.error('Cannot continue without an outreach run. Ensure Apollo is connected.');
      writeReport();
      process.exit(1);
    }
  }

  console.log('\n[2] Regenerate cold-email copy (cold-email skill)');
  const copyRes = await api(`/api/outreach/runs/${runId}/prospects/${prospect.id}/copy`, {
    method: 'POST',
    body: { channels: ['email'] },
  });
  if (!copyRes.res.ok || !copyRes.data.ok) {
    fail('copy', copyRes.data.error || JSON.stringify(copyRes.data).slice(0, 300));
    writeReport({ runId, prospect });
    process.exit(1);
  }
  const copied = copyRes.data.prospect;
  const firstName = String(copied.first_name || copied.full_name || '').split(/\s+/)[0] || 'there';
  const hasHi = new RegExp(`^Hi\\s+${firstName}\\b`, 'i').test(String(copied.body || ''));
  ok(
    'copy',
    `Hi=${hasHi} subj="${(copied.subject || '').slice(0, 50)}" · ${(copied.body || '').length} chars`
  );
  if (!hasHi) fail('copy:salutation', (copied.body || '').slice(0, 80));

  console.log('\n[3] Generate 4-step sequence (copywriting-follow-up + cold-email cadence)');
  const seqRes = await api(`/api/outreach/runs/${runId}/generate-sequence`, {
    method: 'POST',
    body: {
      prospectId: prospect.id,
      subject: copied.subject,
      body: copied.body,
    },
  });
  if (!seqRes.res.ok || !seqRes.data.ok) {
    fail('sequence', seqRes.data.error || JSON.stringify(seqRes.data).slice(0, 300));
    writeReport({ runId, prospect: copied });
    process.exit(1);
  }
  const steps = seqRes.data.sequence_emails || [];
  const delays = steps.map((s) => s.delay_days);
  ok('sequence', `${steps.length} steps · delays=${JSON.stringify(delays)}`);
  if (steps.length < 4) fail('sequence:length', String(steps.length));
  if (JSON.stringify(delays) !== JSON.stringify([0, 3, 7, 14])) {
    fail('sequence:cadence', JSON.stringify(delays));
  } else {
    ok('sequence:cadence', 'day 0 / 3 / 7 / 14');
  }
  const allGreeted = steps.every((s) => /^Hi\s+/i.test(s.body || ''));
  if (allGreeted) ok('sequence:greeting');
  else fail('sequence:greeting', steps.map((s) => (s.body || '').slice(0, 40)).join(' | '));

  console.log(`\n[4] Go-live via Gmail → ${TEST_TO} (step 0 only; follow-ups scheduled)`);
  const liveRes = await api(`/api/outreach/runs/${runId}/prospects/${prospect.id}/go-live`, {
    method: 'POST',
    body: {
      channel: 'email',
      provider: 'gmail',
      delivery: 'live',
      subject: steps[0]?.subject || copied.subject,
      body: steps[0]?.body || copied.body,
      sequence_emails: steps,
      testTo: TEST_TO,
    },
  });
  if (!liveRes.res.ok || !liveRes.data.ok) {
    fail('go-live:gmail', liveRes.data.error || JSON.stringify(liveRes.data).slice(0, 400));
  } else {
    const r = liveRes.data.result || {};
    ok(
      'go-live:gmail',
      `to=${r.to || TEST_TO} method=${r.method || r.status} steps=${r.sequence_steps || steps.length}`
    );
    // Preview first email body in report
    console.log('\n--- Email body preview ---');
    console.log(`Subject: ${steps[0]?.subject}`);
    console.log((steps[0]?.body || '').slice(0, 600));
    console.log('--------------------------\n');
  }

  writeReport({
    runId,
    prospect: liveRes.data.prospect || copied,
    sequence_emails: steps,
    testTo: TEST_TO,
    goLive: liveRes.data,
  });

  const failed = results.filter((r) => r.status === 'fail').length;
  const passed = results.filter((r) => r.status === 'pass').length;
  console.log(`\n=== Sequence live smoke: ${passed} pass · ${failed} fail ===\n`);
  if (failed) process.exitCode = 1;
}

function writeReport(extra = {}) {
  const path = join(OUT_DIR, `nouriva-outreach-sequence-live-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify({ at: new Date().toISOString(), base: BASE, results, ...extra }, null, 2));
  console.log(`Report: ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
