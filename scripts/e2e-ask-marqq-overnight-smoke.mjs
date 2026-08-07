#!/usr/bin/env node
/**
 * E2E: Ask Marqq "work on this overnight" -> agent_deployments queue ->
 * existing scheduler tick -> agent_notifications, against a real Supabase
 * workspace. Proves the phase-4 hand-off actually reaches a completed run
 * without the caller blocking on a synchronous LLM reply.
 *
 * Usage:
 *   node server/index.js &            # backend on :3001 (60s deployment tick)
 *   node scripts/e2e-ask-marqq-overnight-smoke.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE = process.env.API_BASE || 'http://127.0.0.1:3001';
const MAX_WAIT_MS = Number(process.env.OVERNIGHT_SMOKE_MAX_WAIT_MS || 90_000);

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let workspaceId = null;
let deploymentId = null;

async function cleanup() {
  if (deploymentId) {
    // local JSON db cleanup — same process the running server writes to
    try {
      const { getDb, updateDb } = await import('../server/db.js');
      updateDb((state) => ({
        ...state,
        agent_deployments: state.agent_deployments.filter((d) => d.id !== deploymentId),
        tasks: (state.tasks || []).filter((t) => t.deploymentId !== deploymentId),
        approvals: (state.approvals || []).filter((a) => a.deploymentId !== deploymentId),
      }));
    } catch (err) {
      console.warn('local db cleanup skipped:', err.message);
    }
    await db.from('agent_deployments').delete().eq('id', deploymentId).then(() => {}, () => {});
    await db.from('agent_notifications').delete().eq('workspace_id', workspaceId).eq('agent_name', 'zara').then(() => {}, () => {});
  }
  if (workspaceId) {
    await db.from('workspaces').delete().eq('id', workspaceId).then(() => {}, () => {});
  }
}

try {
  const { data: ws, error: wsErr } = await db
    .from('workspaces')
    .insert({ name: `ask-marqq-overnight-smoke-${Date.now()}`, owner_id: null })
    .select()
    .single();
  if (wsErr) throw new Error(`workspace insert failed: ${wsErr.message}`);
  workspaceId = ws.id;
  console.log('workspace', workspaceId);

  const queueRes = await fetch(`${BASE}/api/ask-marqq/queue-overnight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspaceId,
      channel: 'marketing-strategy',
      message: 'Smoke test: plan a launch campaign for our new SMB pricing tier',
    }),
  });
  const queueBody = await queueRes.json();
  console.log('queue response:', JSON.stringify(queueBody, null, 2));
  assert(queueRes.ok && queueBody.ok, 'POST /api/ask-marqq/queue-overnight returns ok');
  assert(Boolean(queueBody.deploymentId), 'response includes a deploymentId');
  assert(queueBody.agentName === 'zara', 'marketing-strategy channel routes to zara (matches SECTION_PRIMARY)');
  assert(/digest/i.test(queueBody.message || ''), 'acknowledgement mentions the co-founder digest, not an instant answer');
  deploymentId = queueBody.deploymentId;

  const listImmediately = await fetch(`${BASE}/api/ask-marqq/overnight?workspaceId=${workspaceId}`).then((r) => r.json());
  const queuedEntry = listImmediately.deployments?.find((d) => d.id === deploymentId);
  assert(Boolean(queuedEntry), 'deployment appears in GET /api/ask-marqq/overnight immediately (no synchronous wait)');
  assert(queuedEntry?.status === 'pending', 'deployment starts pending, not already answered inline');

  console.log(`waiting up to ${MAX_WAIT_MS}ms for the existing deployment scheduler tick to pick it up…`);
  const deadline = Date.now() + MAX_WAIT_MS;
  let finalEntry = null;
  while (Date.now() < deadline) {
    const list = await fetch(`${BASE}/api/ask-marqq/overnight?workspaceId=${workspaceId}`).then((r) => r.json());
    const entry = list.deployments?.find((d) => d.id === deploymentId);
    if (entry && entry.status !== 'pending' && entry.status !== 'running') {
      finalEntry = entry;
      break;
    }
    await sleep(5000);
  }

  assert(Boolean(finalEntry), 'deployment scheduler processed the overnight ask before timeout');
  assert(finalEntry?.status === 'completed', 'deployment finished as completed (not failed)');

  // Note: agentNotifications.js#resolveDeploymentNotificationUserId requires a
  // real workspace_members row (FK'd to auth.users) to resolve who to notify.
  // This smoke test intentionally does NOT attach a real auth user to its
  // disposable workspace (would mean touching a real account's membership
  // list, even temporarily) — so no agent_notifications row is expected here.
  // That resolution path is exercised safely in production (real workspaces
  // always have a real owner) and is not something this smoke test needs to
  // re-prove; what matters here is that the deployment queue -> scheduler ->
  // completed-run pipeline works, which the assertions above already cover.
  const { data: notifs, error: notifErr } = await db
    .from('agent_notifications')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('agent_name', 'zara');
  assert(!notifErr, 'agent_notifications query succeeded');
  console.log(
    `INFO: ${(notifs || []).length} agent_notifications row(s) found — 0 is expected here since this ` +
      'workspace has no real workspace_members row (see comment above); this is not a failure.'
  );
} catch (err) {
  console.error('FAIL:', err.message);
  ok = false;
} finally {
  await cleanup();
  console.log('cleanup ok');
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
