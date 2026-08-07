#!/usr/bin/env node
/**
 * Smoke: FROZEN-block enforcement logic in agentInstructions.js.
 *
 * This is the single most safety-critical piece of the self-improvement loop
 * ("what stops it going sideways"), so it gets a pure, no-network unit test
 * that doesn't depend on the agent_instructions table existing yet.
 *
 * Usage: node scripts/smoke-agent-instructions-frozen.mjs
 */
import { extractFrozenBlock, countRules, extractInjectableRules } from '../server/services/agentInstructions.js';

let ok = true;
function assert(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) ok = false;
}

const original = `# Agent Instructions: Riya

**Version:** v1 · 2026-08-01

## Job
Drafts blog posts and social copy.

## Rules
1. Always cite a real source for statistics.
2. Match the brand voice loaded for this workspace.

## Known edge cases
(Empty at v1.)

## FROZEN — the review pass may not modify anything below this line
- Scope: Riya only drafts content. It never publishes without human approval.
- Output is always a draft.
- The output contract's fields may not be renamed.
- Pricing/legal claims always require human sign-off.`;

const frozen = extractFrozenBlock(original);
assert(frozen.startsWith('## FROZEN'), 'extractFrozenBlock finds the FROZEN marker');
assert(frozen.includes('Pricing/legal claims'), 'extractFrozenBlock captures the full block to end of file');
assert(countRules(original) === 2, `countRules finds exactly 2 rules (got ${countRules(original)})`);

// A legitimate edit: adds a rule, leaves FROZEN untouched.
const legitEdit = original.replace(
  '## Known edge cases\n(Empty at v1.)',
  '## Known edge cases\n(Empty at v1.)\n\n3. Unit of measure comes from the customer record default, never inferred from copy text.'
);
assert(extractFrozenBlock(legitEdit) === frozen, 'a rule-only edit leaves the FROZEN block byte-identical');

// A tampered edit: review pass tries to widen scope inside FROZEN.
const tamperedEdit = original.replace(
  'Scope: Riya only drafts content. It never publishes without human approval.',
  'Scope: Riya drafts AND publishes content directly.'
);
assert(
  extractFrozenBlock(tamperedEdit) !== frozen,
  'a FROZEN-tampering edit is detected as different (this is what saveNewVersion() rejects)'
);

// Missing FROZEN block entirely (e.g. a model that dropped it) must also be caught.
const droppedFrozen = original.split('## FROZEN')[0];
assert(extractFrozenBlock(droppedFrozen) === '', 'a version with no FROZEN marker at all extracts to empty string, not silently passing');

const injectable = extractInjectableRules(original);
assert(injectable.startsWith('## Rules'), 'extractInjectableRules starts at Rules');
assert(!injectable.includes('FROZEN'), 'extractInjectableRules never includes the FROZEN block (prompt injection scope stays narrow)');
assert(!injectable.includes('**Version:**'), 'extractInjectableRules excludes the header/Job boilerplate');

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
