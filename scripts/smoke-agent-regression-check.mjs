#!/usr/bin/env node
/**
 * Smoke: the "don't let week 6 break week 1" safety net.
 *
 * Directly exercises checkRegressions() with three scenarios:
 *   1. No testcases yet -> free pass (no LLM call).
 *   2. A proposed edit that blatantly contradicts an existing testcase's
 *      invariant -> must be caught (ok: false, with a failure reason).
 *   3. A proposed edit that's compatible with an existing testcase -> passes.
 *
 * This is a real Groq call for scenarios 2/3 (LLM judgment, not pure logic —
 * unlike the FROZEN-block check, which is byte-exact and has its own
 * dependency-free unit test). The scenarios are deliberately unambiguous so
 * any reasonable model call should get them right.
 *
 * Usage: node scripts/smoke-agent-regression-check.mjs
 * Requires GROQ_API_KEY (via .env / .env.marqq-live) for scenarios 2 and 3.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

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

const { checkRegressions } = await import('../server/services/agentSelfReview.js');

let ok = true;
function assert(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) ok = false;
}

const WORKSPACE_ID = 'smoke-regression-check'; // never persisted — checkRegressions only uses it for credit metering

const BASE_INSTRUCTIONS = `# Agent Instructions: Riya

## Rules
1. Blog CTAs must always link to the /pricing page, never a generic "learn more" link.
2. Match the brand voice loaded for this workspace.

## FROZEN — the review pass may not modify anything below this line
- Scope: draft only.`;

const testcase = {
  title: 'CTA must link to pricing',
  input_example: 'A blog post about "5 ways to cut CAC" for a B2B SaaS company.',
  must_remain_true: 'The CTA in the blog post must link to /pricing, never a generic "learn more" or homepage link.',
};

// --- Scenario 1: no testcases at all -> free pass, no LLM call ---
const noTestcasesResult = await checkRegressions(WORKSPACE_ID, BASE_INSTRUCTIONS, BASE_INSTRUCTIONS, []);
assert(noTestcasesResult.ok === true, 'no existing testcases -> automatic pass (nothing to protect yet)');
assert(noTestcasesResult.failures.length === 0, 'no existing testcases -> empty failures array');

if (!process.env.GROQ_API_KEY && !process.env.VITE_GROQ_API_KEY) {
  console.warn('\n⚠ No GROQ_API_KEY configured — skipping the two LLM-judgment scenarios.\n');
} else {
  // --- Scenario 2: proposed edit blatantly contradicts the testcase ---
  const contradictingEdit = `# Agent Instructions: Riya

## Rules
1. Blog CTAs must always link to the homepage, never to /pricing directly — /pricing feels too salesy for organic readers.
2. Match the brand voice loaded for this workspace.

## FROZEN — the review pass may not modify anything below this line
- Scope: draft only.`;

  const contradictResult = await checkRegressions(WORKSPACE_ID, BASE_INSTRUCTIONS, contradictingEdit, [testcase]);
  console.log('contradicting-edit check result:', JSON.stringify(contradictResult, null, 2));
  assert(contradictResult.ok === false, 'a blatantly contradicting edit is caught (ok: false)');
  assert(contradictResult.failures.length > 0, 'the failure is reported with a reason, not silently dropped');

  // --- Scenario 3: proposed edit is compatible (adds a rule, keeps the CTA one intact) ---
  const compatibleEdit = `# Agent Instructions: Riya

## Rules
1. Blog CTAs must always link to the /pricing page, never a generic "learn more" link.
2. Match the brand voice loaded for this workspace.
3. Unit of measure comes from the customer record default, never inferred from copy text.

## FROZEN — the review pass may not modify anything below this line
- Scope: draft only.`;

  const compatibleResult = await checkRegressions(WORKSPACE_ID, BASE_INSTRUCTIONS, compatibleEdit, [testcase]);
  console.log('compatible-edit check result:', JSON.stringify(compatibleResult, null, 2));
  assert(compatibleResult.ok === true, 'a compatible edit (rule 1 untouched, new rule 3 added) passes');
  assert(compatibleResult.failures.length === 0, 'no false-positive failures on a safe edit');
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
