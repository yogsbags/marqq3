#!/usr/bin/env node
/**
 * Smoke: confidence actually flows from planAgentTask() -> the approval
 * object -> draft_corrections.confidence -> the report card's escalation
 * rate, end to end. This is the fix for "escalation rate always reads 0%".
 *
 * Also catches the real bug found while wiring this: the approval object
 * created in agentScheduler.js#executeAgentRun never included workspaceId,
 * so /api/approvals/decide's correction capture was silently never firing.
 *
 * Usage:
 *   node server/index.js &
 *   node scripts/smoke-agent-confidence-signal.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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

// planAgentTask itself, unit-style — no server/network needed for this part.
const { planAgentTask } = await import('../server/services/agentOs.js');

const noTargetPlan = planAgentTask({});
assert(noTargetPlan.confidence === 'low', `no resolved target -> low confidence (got ${noTargetPlan.confidence})`);

const leadsPlan = planAgentTask({ target: 'lead_intelligence' });
assert(
  leadsPlan.confidence === 'low' && leadsPlan.requiredConnectors.length > 0,
  `a target requiring a connector (lead_intelligence needs apollo) -> low confidence (got ${leadsPlan.confidence})`
);

const seoPlan = planAgentTask({ target: 'company_intel_seo' });
assert(
  seoPlan.confidence === 'high' && seoPlan.requiredConnectors.length === 0 && seoPlan.skills.length > 0,
  `a fully-matched target with no required connectors -> high confidence (got ${seoPlan.confidence})`
);

let workspaceId = null;
let deploymentId = null;

async function cleanup() {
  if (deploymentId) {
    try {
      const { updateDb } = await import('../server/db.js');
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
  }
  if (workspaceId) {
    await db.from('draft_corrections').delete().eq('workspace_id', workspaceId).then(() => {}, () => {});
    await db.from('workspaces').delete().eq('id', workspaceId).then(() => {}, () => {});
  }
}

try {
  const { data: ws, error: wsErr } = await db
    .from('workspaces')
    .insert({ name: `confidence-signal-smoke-${Date.now()}`, owner_id: null })
    .select()
    .single();
  if (wsErr) throw new Error(`workspace insert failed: ${wsErr.message}`);
  workspaceId = ws.id;
  console.log('workspace', workspaceId);

  // Queue an overnight ask that resolves to lead_intelligence-shaped routing
  // (sales-strategy channel -> arjun -> requires apollo -> low confidence).
  const queueRes = await fetch(`${BASE}/api/ask-marqq/queue-overnight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspaceId,
      channel: 'sales-strategy',
      message: 'Smoke test: find and sequence 10 new SMB leads',
    }),
  }).then((r) => r.json());
  assert(queueRes.ok, 'queue-overnight accepted the ask');
  deploymentId = queueRes.deploymentId;

  // Wait for the existing deployment scheduler tick to create the approval.
  const deadline = Date.now() + 90_000;
  let approval = null;
  while (Date.now() < deadline) {
    const { getDb } = await import('../server/db.js');
    const state = getDb();
    approval = (state.approvals || []).find((a) => a.deploymentId === deploymentId);
    if (approval) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  assert(Boolean(approval), 'scheduler created an approval for the deployment before timeout');
  assert(approval?.workspaceId === workspaceId, 'the approval object now carries workspaceId (the bug fix)');
  assert(typeof approval?.confidence === 'string', 'the approval object carries a confidence value');
  console.log('approval confidence:', approval?.confidence, '| risk label:', approval?.risk);

  // Decide it (reject, with a reason) and confirm a real draft_correction lands with that confidence.
  const decideRes = await fetch(`${BASE}/api/approvals/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: approval.id, decision: 'rejected', editType: 'should_have_escalated', note: 'smoke test' }),
  });
  assert(decideRes.ok, '/api/approvals/decide responded ok');

  // Fire-and-forget insert — give it a moment.
  await new Promise((r) => setTimeout(r, 2000));
  const { data: corrections, error: corrErr } = await db
    .from('draft_corrections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('approval_id', approval.id);
  assert(!corrErr, 'draft_corrections query succeeded');
  assert((corrections || []).length === 1, `a draft_correction row was actually written (the bug fix) — found ${corrections?.length || 0}`);
  if (corrections?.length) {
    assert(
      corrections[0].confidence === approval.confidence,
      `the correction's confidence (${corrections[0].confidence}) matches the approval's (${approval.confidence})`
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
