#!/usr/bin/env node
/**
 * Smoke: activate Nouriva strategy → seed deployments → scheduler tick → approvals.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE = process.env.API_BASE || 'http://127.0.0.1:3001';

function loadNourivaDoc() {
  const p = join(ROOT, 'scripts/output/nouriva-gtm-smoke-2026-08-02T10-47-16-350Z.json');
  if (!existsSync(p)) throw new Error(`Missing ${p}`);
  const raw = JSON.parse(readFileSync(p, 'utf8'));
  const doc = raw.doc || raw;
  const auto = doc.autoSections || [];
  const goals = doc.goalsSections || [];
  // Normalize smoke shape → strategy.sections
  const sections = [
    ...auto.map((s) => ({
      id: s.id || slug(s.title),
      title: s.title,
      summary: s.summary,
      bullets: s.bullets || [],
      body: s.body || '',
    })),
    ...goals.map((s) => ({
      id: s.id || slug(s.title),
      title: s.title,
      summary: s.summary,
      bullets: s.bullets || [],
      body: s.body || '',
    })),
  ];
  return {
    title: doc.title || 'Nouriva AI GTM Strategy',
    generatedAt: doc.generatedAt || new Date().toISOString(),
    executiveSummary: doc.executiveSummary,
    goalAlignment: {
      north_star_metric: 'Paid conversions / month',
      quantified_target: '200 paid conversions / month',
      timeline_target: '90 days',
      business_archetype: 'consumer_product',
    },
    sections,
  };
}

function slug(title) {
  return String(title || 'section')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

async function main() {
  const strategy = loadNourivaDoc();
  console.log(`Strategy sections: ${strategy.sections.length}`);

  // Clear prior deployments so smoke is deterministic
  const { updateDb } = await import('../server/db.js');
  updateDb((state) => ({
    ...state,
    agent_deployments: [],
    scheduled_automations: [],
    approvals: (state.approvals || []).filter((a) => a.type !== 'Agent draft'),
    tasks: (state.tasks || []).filter((t) => !t.deploymentId),
  }));

  const act = await fetch(`${BASE}/api/strategy/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId: 'marqq-ws-1', strategy }),
  }).then((r) => r.json());
  if (!act.ok && act.error) throw new Error(act.error || JSON.stringify(act));
  console.log(`PASS activate deploymentsCreated=${act.deploymentsCreated}`);

  // Wait a moment for auto-tick from activate route
  await new Promise((r) => setTimeout(r, 2000));
  const tick = await fetch(`${BASE}/api/agents/scheduler/tick`, { method: 'POST' }).then((r) =>
    r.json()
  );
  console.log(`PASS tick ran=${tick.ran?.length || 0} failed=${tick.failed?.length || 0}`);

  const deps = await fetch(`${BASE}/api/agents/deployments`).then((r) => r.json());
  const approvals = await fetch(`${BASE}/api/approvals`).then((r) => r.json());
  const tasks = await fetch(`${BASE}/api/tasks`).then((r) => r.json());
  const autos = await fetch(`${BASE}/api/automations/scheduled`).then((r) => r.json());

  const depCount = deps.deployments?.length || 0;
  const apprAgent = (approvals.approvals || []).filter((a) => a.type === 'Agent draft').length;
  const scheduledTasks = (Array.isArray(tasks) ? tasks : tasks.tasks || []).filter(
    (t) => t.deploymentId
  ).length;

  console.log(
    `PASS deployments=${depCount} agentDraftApprovals=${apprAgent} strategyTasks=${scheduledTasks} automations=${autos.automations?.length || 0}`
  );

  if (depCount < 5) throw new Error(`Expected >=5 deployments, got ${depCount}`);
  if (apprAgent < 1) throw new Error('Expected at least one agent draft approval after tick');
  console.log('ALL PASS');
}

main().catch((err) => {
  console.error('FAIL', err.message || err);
  process.exit(1);
});
