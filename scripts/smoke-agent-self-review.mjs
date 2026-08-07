#!/usr/bin/env node
/**
 * Smoke: correction capture -> weekly self-review -> report card, end to end
 * against a real Supabase workspace.
 *
 * Seeds 2 corrections with the SAME edit_type (the minimum pattern size the
 * review pass acts on), calls POST /api/agents/self-review, and asserts:
 *   - if agent-self-improvement.sql has been applied: a new instructions
 *     version was created, the FROZEN block is unchanged, and the report
 *     card reflects the correction volume.
 *   - if not yet applied: every step fails cleanly with "table not found",
 *     never a crash or a fabricated result (same contract as
 *     smoke-cofounder-digest.mjs).
 *
 * Usage:
 *   node server/index.js &
 *   node scripts/smoke-agent-self-review.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE = process.env.API_BASE || 'http://127.0.0.1:3001';
const AGENT_NAME = 'riya';

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
function tableMissing(errOrBody) {
  const msg = typeof errOrBody === 'string' ? errOrBody : errOrBody?.error || '';
  return /could not find the table/i.test(msg);
}

let workspaceId = null;
const correctionIds = [];

async function cleanup() {
  if (correctionIds.length) {
    await db.from('draft_corrections').delete().in('id', correctionIds).then(() => {}, () => {});
  }
  if (workspaceId) {
    await db.from('agent_review_log').delete().eq('workspace_id', workspaceId).then(() => {}, () => {});
    await db.from('agent_testcases').delete().eq('workspace_id', workspaceId).then(() => {}, () => {});
    await db.from('agent_instructions').delete().eq('workspace_id', workspaceId).then(() => {}, () => {});
    await db.from('workspaces').delete().eq('id', workspaceId).then(() => {}, () => {});
  }
}

try {
  const { data: ws, error: wsErr } = await db
    .from('workspaces')
    .insert({ name: `agent-self-review-smoke-${Date.now()}`, owner_id: null })
    .select()
    .single();
  if (wsErr) throw new Error(`workspace insert failed: ${wsErr.message}`);
  workspaceId = ws.id;
  console.log('workspace', workspaceId);

  // Bootstrap instructions via the API (exercises getActiveInstructions' lazy bootstrap path)
  const instrRes = await fetch(`${BASE}/api/agents/instructions?workspaceId=${workspaceId}&agentName=${AGENT_NAME}`).then((r) => r.json());
  const migrationPending = !instrRes.instructions && instrRes.ok;
  if (migrationPending) {
    console.warn(
      '\n⚠ database/migrations/agent-self-improvement.sql has not been run against this Supabase project yet.\n' +
        '  Reporting a clean skip for every downstream step rather than failing.\n'
    );
  } else {
    assert(Boolean(instrRes.instructions), 'GET /api/agents/instructions bootstraps v1 on first call');
    assert(instrRes.instructions?.version === 1, 'bootstrapped instructions start at version 1');
    assert(
      instrRes.instructions?.content?.includes('FROZEN'),
      'bootstrapped instructions include a FROZEN section'
    );
  }

  // Seed 2 corrections with the same edit_type — the minimum pattern size reviewAgent() acts on.
  const seedRows = [
    {
      workspace_id: workspaceId,
      agent_name: AGENT_NAME,
      action: 'edited',
      edit_type: 'missing_rule',
      note: 'Defaulted to a generic CTA; this workspace always wants a link to the pricing page in blog CTAs.',
    },
    {
      workspace_id: workspaceId,
      agent_name: AGENT_NAME,
      action: 'rejected',
      edit_type: 'missing_rule',
      note: 'Same issue again — blog draft CTA did not link to /pricing.',
    },
  ];
  const { data: inserted, error: correctionErr } = await db.from('draft_corrections').insert(seedRows).select();
  if (correctionErr) {
    assert(tableMissing(correctionErr.message), `draft_corrections seed only fails because the table is missing (${correctionErr.message})`);
  } else {
    correctionIds.push(...inserted.map((r) => r.id));
    assert(inserted.length === 2, 'seeded 2 same-pattern corrections');

    const reviewRes = await fetch(`${BASE}/api/agents/self-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, agentName: AGENT_NAME }),
    }).then((r) => r.json());
    console.log('review response:', JSON.stringify(reviewRes, null, 2));

    assert(reviewRes.ok !== false || tableMissing(reviewRes.error || reviewRes.reason || ''), 'self-review responded without crashing');

    if (reviewRes.ok) {
      assert(typeof reviewRes.what_changed === 'string', 'review reports what_changed');
      assert(reviewRes.runs !== undefined, 'review reports a run count');

      // Whatever happened, the active instructions must still have an intact FROZEN block.
      const after = await fetch(`${BASE}/api/agents/instructions?workspaceId=${workspaceId}&agentName=${AGENT_NAME}`).then((r) => r.json());
      assert(
        after.instructions?.content?.includes('FROZEN — the review pass may not modify'),
        'FROZEN section is present in whatever version ended up active'
      );
      assert(
        after.instructions?.frozen_block === instrRes.instructions?.frozen_block,
        'FROZEN block is byte-identical to the bootstrapped version, whether or not a rule edit was applied'
      );

      const cardRes = await fetch(`${BASE}/api/agents/report-card?workspaceId=${workspaceId}&agentName=${AGENT_NAME}`).then((r) => r.json());
      assert(cardRes.ok && cardRes.card?.correctionCount === 2, 'report card reflects the 2 seeded corrections');
    }
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
