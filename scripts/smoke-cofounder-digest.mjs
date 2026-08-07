#!/usr/bin/env node
/**
 * Smoke: co-founder digest generation against a real Supabase workspace.
 *
 * Creates a disposable workspace + workspace_member + a couple of
 * agent_notifications rows, calls POST /api/cofounder-digest/generate,
 * and asserts the pipeline reaches the final insert (success once
 * database/migrations/cofounder-digest.sql is applied, or a clean
 * "table not found" failure before that — either is a PASS for this
 * smoke test's purpose, which is to prove the read path + synthesis +
 * write attempt all work end-to-end). Cleans up everything it creates.
 *
 * Usage:
 *   node server/index.js &            # backend on :3001
 *   node scripts/smoke-cofounder-digest.mjs
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in env or .env.marqq-live.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE = process.env.API_BASE || 'http://127.0.0.1:3001';

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    const v = m[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv(join(ROOT, '.env'));
loadEnv(join(ROOT, '.env.marqq-live'));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

let ok = true;
function assert(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) ok = false;
}

const smokeUserId = randomUUID();
let workspaceId = null;
const notificationIds = [];

async function cleanup() {
  if (notificationIds.length) {
    await db.from('agent_notifications').delete().in('id', notificationIds);
  }
  if (workspaceId) {
    await db.from('cofounder_digests').delete().eq('workspace_id', workspaceId).then(
      () => {},
      () => {} // table may not exist yet — fine
    );
    await db.from('workspace_members').delete().eq('workspace_id', workspaceId);
    await db.from('workspaces').delete().eq('id', workspaceId);
  }
}

try {
  const { data: ws, error: wsErr } = await db
    .from('workspaces')
    .insert({ name: `cofounder-digest-smoke-${Date.now()}`, owner_id: null })
    .select()
    .single();
  if (wsErr) throw new Error(`workspace insert failed: ${wsErr.message}`);
  workspaceId = ws.id;
  console.log('workspace', workspaceId);

  // Real auth.users FK means we can't insert a fake owner row here (same
  // constraint supabase-persistence-smoke.mjs hits) — that's fine, the digest
  // code tolerates a null resolved user_id.
  await db.from('workspace_members').insert({ workspace_id: workspaceId, user_id: smokeUserId, role: 'owner' }).then(
    () => {},
    () => {}
  );

  const seedRows = [
    {
      // agent_notifications.user_id is nullable + FK's to auth.users — leave
      // null here rather than attach smoke data to a real auth user. The
      // digest reads by workspace_id only, so this doesn't affect the test.
      user_id: null,
      workspace_id: workspaceId,
      agent_name: 'riya',
      agent_role: 'Content',
      task_type: 'editorial_production_cycle',
      title: 'Drafted 3 blog posts',
      summary: 'Riya produced 3 SEO-targeted blog drafts for the Q3 content calendar.',
      status: 'success',
      action_items: [{ label: 'Review drafts', priority: 'medium' }],
    },
    {
      user_id: null,
      workspace_id: workspaceId,
      agent_name: 'arjun',
      agent_role: 'Leads',
      task_type: 'daily_funnel_review',
      title: '12 new qualified leads found',
      summary: 'Arjun sourced 12 SMB leads matching the ICP and drafted outreach sequences.',
      status: 'success',
      action_items: [{ label: 'Approve outreach', priority: 'high' }],
    },
  ];
  const { data: inserted, error: notifErr } = await db.from('agent_notifications').insert(seedRows).select();
  if (notifErr) throw new Error(`notification seed failed: ${notifErr.message}`);
  notificationIds.push(...inserted.map((r) => r.id));
  assert(inserted.length === 2, 'seeded 2 agent_notifications for the smoke workspace');

  const res = await fetch(`${BASE}/api/cofounder-digest/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, force: true }),
  });
  const body = await res.json();
  console.log('generate response:', JSON.stringify(body, null, 2));

  const migrationNotApplied = body.reason === 'insert_failed' && /could not find the table/i.test(body.error || '');
  assert(res.ok, 'POST /api/cofounder-digest/generate responded 200');
  assert(
    body.ok === true || migrationNotApplied,
    'digest pipeline either inserted successfully or failed ONLY because cofounder_digests is not migrated yet'
  );

  if (body.ok && body.digest) {
    assert(typeof body.digest.headline === 'string' && body.digest.headline.length > 0, 'digest has a headline');
    assert(Array.isArray(body.digest.highlights), 'digest has a highlights array');
    assert(body.digest.source_notification_ids.length === 2, 'digest references both seeded notifications');

    const latest = await fetch(`${BASE}/api/cofounder-digest/latest?workspaceId=${workspaceId}`).then((r) => r.json());
    assert(latest.ok && latest.digest?.id === body.digest.id, 'GET /api/cofounder-digest/latest returns the digest just created');
  } else if (migrationNotApplied) {
    console.warn(
      '\n⚠ database/migrations/cofounder-digest.sql has not been run against this Supabase project yet.\n' +
        '  Everything up to the final insert (read notifications, synthesize, resolve workspace) works —\n' +
        '  run the migration in the Supabase SQL Editor to get past this.\n'
    );
  }
} catch (err) {
  console.error('FAIL:', err.message);
  ok = false;
} finally {
  await cleanup();
  console.log('cleanup ok');
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
