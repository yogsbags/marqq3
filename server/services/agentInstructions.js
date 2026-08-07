/**
 * agent_instructions — the "workflow.md" analog: a versioned, per-workspace,
 * per-agent rules file with a FROZEN block the weekly review pass may never
 * touch. Enforced at the code level (byte-diff before saving), not just by
 * asking the model nicely.
 */
import { getSupabaseReadClient, getSupabaseWriteClient } from '../lib/supabase.js';
import { isUuidWorkspace } from '../lib/persistence.js';
import { AGENT_CATALOG } from './agentOs.js';

const AGENT_BY_ID = new Map(AGENT_CATALOG.map((a) => [a.id, a]));
const FROZEN_MARKER = '## FROZEN — the review pass may not modify anything below this line';
export const MAX_RULES_BEFORE_CONSOLIDATION = 40;

function agentMeta(agentName) {
  return (
    AGENT_BY_ID.get(agentName) || {
      id: agentName,
      name: agentName,
      role: 'Agent',
      purpose: 'Drafts work for human review.',
    }
  );
}

/** Everything from the FROZEN marker to the end of the file, verbatim. */
export function extractFrozenBlock(content) {
  const idx = String(content || '').indexOf(FROZEN_MARKER);
  if (idx === -1) return '';
  return content.slice(idx).trim();
}

/** Count numbered rules under "## Rules" (stops at the next "## " heading). */
export function countRules(content) {
  const text = String(content || '');
  const rulesIdx = text.indexOf('## Rules');
  if (rulesIdx === -1) return 0;
  const afterRules = text.slice(rulesIdx);
  const nextHeadingIdx = afterRules.indexOf('\n## ', 1);
  const rulesSection = nextHeadingIdx === -1 ? afterRules : afterRules.slice(0, nextHeadingIdx);
  const matches = rulesSection.match(/^\d+\.\s+\S/gm);
  return matches ? matches.length : 0;
}

function defaultInstructions(agentName) {
  const meta = agentMeta(agentName);
  const today = new Date().toISOString().slice(0, 10);
  const content = `# Agent Instructions: ${meta.name}

**Version:** v1 · ${today}

## Job
${meta.purpose || `${meta.name} drafts work in the ${meta.role || 'assigned'} domain for human review.`}

## Rules
1. Follow the brand voice and context already loaded for this workspace.
2. Prefer concrete, specific output over generic filler.

## Known edge cases
(Empty at v1 — the weekly review pass fills this in from real corrections.)

${FROZEN_MARKER}
- Scope: ${meta.name} only drafts work in its assigned domain (${meta.role || 'its role'}). It never expands into another agent's domain without a human re-scoping it here.
- Output is always a draft. It never sends, publishes, or spends live budget on its own.
- This agent's output contract (the fields the rest of the app expects) may not be added, removed, or renamed by a review pass.
- Pricing, legal, and compliance language always requires explicit human sign-off — never draft these as final.`;

  return { content, frozenBlock: extractFrozenBlock(content), ruleCount: countRules(content) };
}

/**
 * Returns the active instructions row for (workspaceId, agentName), creating
 * v1 on first use. Never returns null for a real UUID workspace.
 */
export async function getActiveInstructions(workspaceId, agentName) {
  const db = getSupabaseReadClient();
  if (!db) return null;

  const { data, error } = await db
    .from('agent_instructions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('agent_name', agentName)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    console.warn('[agent-instructions] read failed:', error.message);
    return null;
  }
  if (data) return data;

  // Bootstrap v1
  const writeDb = getSupabaseWriteClient();
  if (!writeDb) return null;
  const { content, frozenBlock, ruleCount } = defaultInstructions(agentName);
  const { data: created, error: insertErr } = await writeDb
    .from('agent_instructions')
    .insert({
      workspace_id: workspaceId,
      agent_name: agentName,
      version: 1,
      content,
      frozen_block: frozenBlock,
      rule_count: ruleCount,
      active: true,
      created_by: 'system',
    })
    .select()
    .single();

  if (insertErr) {
    console.warn('[agent-instructions] bootstrap failed:', insertErr.message);
    return null;
  }
  return created;
}

/**
 * Save a new version proposed by the weekly review pass.
 * Hard-rejects (does not save) if:
 *   - the FROZEN block changed at all (byte comparison), or
 *   - the new content has no FROZEN marker at all.
 * This is the code-level backstop for "the review pass may not modify the
 * FROZEN section" — it does not rely solely on the model following the rule.
 */
export async function saveNewVersion(workspaceId, agentName, newContent, { createdBy = 'weekly_review' } = {}) {
  const current = await getActiveInstructions(workspaceId, agentName);
  if (!current) return { ok: false, reason: 'no_current_version' };

  const newFrozen = extractFrozenBlock(newContent);
  if (!newFrozen) {
    return { ok: false, reason: 'frozen_block_missing' };
  }
  if (newFrozen !== current.frozen_block) {
    return { ok: false, reason: 'frozen_block_modified' };
  }

  const ruleCount = countRules(newContent);
  const writeDb = getSupabaseWriteClient();
  if (!writeDb) return { ok: false, reason: 'supabase_not_configured' };

  const nextVersion = (current.version || 1) + 1;

  const { error: deactivateErr } = await writeDb
    .from('agent_instructions')
    .update({ active: false })
    .eq('id', current.id);
  if (deactivateErr) {
    return { ok: false, reason: 'deactivate_failed', error: deactivateErr.message };
  }

  const { data: created, error: insertErr } = await writeDb
    .from('agent_instructions')
    .insert({
      workspace_id: workspaceId,
      agent_name: agentName,
      version: nextVersion,
      content: newContent,
      frozen_block: newFrozen,
      rule_count: ruleCount,
      active: true,
      created_by: createdBy,
    })
    .select()
    .single();

  if (insertErr) {
    // Roll back the deactivation so we don't leave the agent with no active version
    await writeDb.from('agent_instructions').update({ active: true }).eq('id', current.id);
    return { ok: false, reason: 'insert_failed', error: insertErr.message };
  }

  return { ok: true, version: created, previousVersion: current, ruleCount };
}

/** Only the Rules + Known edge cases sections — what generation prompts should
 * actually inject (never the Job/header boilerplate, never FROZEN twice). */
export function extractInjectableRules(content) {
  const text = String(content || '');
  const rulesIdx = text.indexOf('## Rules');
  const frozenIdx = text.indexOf(FROZEN_MARKER);
  if (rulesIdx === -1) return '';
  const end = frozenIdx === -1 ? text.length : frozenIdx;
  return text.slice(rulesIdx, end).trim();
}


/**
 * The one thing that actually closes the self-improvement loop: fetch this
 * (workspace, agent)'s current Rules + Known edge cases and format them as an
 * appendable system-prompt block. Every generation call site (content,
 * social, landing, lead magnet, paid, creative, outreach, market research,
 * GEO scanner, marketing ideas, GTM strategy) calls this additively —
 * it never replaces a hand-written system prompt, only extends it.
 *
 * Fails silently (returns '') on any error — a Supabase hiccup here must
 * never break a live generation call.
 */
export async function getInjectableRulesBlock(workspaceId, agentName) {
  if (!agentName || !isUuidWorkspace(workspaceId)) return '';
  try {
    const instructions = await getActiveInstructions(workspaceId, agentName);
    if (!instructions) return '';
    const rules = extractInjectableRules(instructions.content);
    if (!rules) return '';
    return `\n\n---\nLearned rules for this workspace (from real human corrections — follow these in addition to everything above):\n${rules}`;
  } catch (err) {
    console.warn(`[agent-instructions] rules injection skipped for ${agentName}:`, err.message);
    return '';
  }
}
