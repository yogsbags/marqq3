/**
 * Weekly self-review pass — the "review.md" analog.
 *
 * Reads a week of draft_corrections for one (workspace, agent), groups them
 * into patterns (>=2 occurrences only — a one-off is noise, not signal),
 * proposes the smallest edit to that agent's instructions, runs it against
 * every existing agent_testcases row (regression check), and verifies the
 * FROZEN block survived before saving. Cheap to run for every agent every
 * week: agents with zero corrections cost one Supabase insert, not an LLM call.
 */
import { getActiveInstructions, saveNewVersion, countRules, MAX_RULES_BEFORE_CONSOLIDATION } from './agentInstructions.js';
import { listRecentCorrections } from './draftCorrections.js';
import { getSupabaseReadClient, getSupabaseWriteClient } from '../lib/supabase.js';
import { getAgentReportCard } from './agentReportCard.js';
import { meteredStudioJson, assertCanAfford, InsufficientCreditsError } from './credits/index.js';

const WINDOW_DAYS = 7;

const REVIEW_SYSTEM_PROMPT = `You are improving one AI agent's instruction file. You are not running the agent.

Read the current instructions (including their FROZEN section) and a set of real
human corrections grouped by pattern. For each group with 2 or more members:
classify it as missing_rule (add/sharpen a rule), wrong_field (sharpen the output
contract description in Rules, not the FROZEN contract itself), or
should_have_escalated (this means tightening escalation guidance, not adding a
rule about the task itself).

Hard requirements:
- Copy the FROZEN section into your output byte-for-byte, unchanged. If you are
  not sure you copied it exactly, copy it again more carefully. Any change to it
  will cause your entire edit to be discarded.
- Add no more than 3 new rules in a single pass. Prefer sharpening an existing
  rule over adding a new one.
- Never delete a rule unless a correction shows it actively caused an error.
- Never rewrite for tone or style. Correctness only.
- If the current Rules section already has close to the maximum allowed size,
  consolidate overlapping rules instead of adding more, and say so in what_changed.
- Do not act on a pattern with only 1 occurrence — note it in what_stayed instead.

Return ONLY valid JSON, no markdown fences:
{
  "updated_content": "the full instructions file, Job/Rules/Known edge cases updated as needed, FROZEN section copied verbatim",
  "what_changed": "one sentence describing the edit, or 'No change' if nothing warranted one",
  "what_stayed": "one sentence on what you deliberately did not change and why",
  "human_decision_needed": "one sentence naming a judgment call only a human should make, or null",
  "new_testcase": {"title": "string", "why_it_exists": "string", "input_example": "string", "must_remain_true": "string"} | null
}`;

const REGRESSION_SYSTEM_PROMPT = `You are a strict regression checker for an AI agent's instruction file.
You did not write the proposed edit and have no stake in it being accepted.

You will be given the agent's PREVIOUS instructions, its PROPOSED new instructions,
and a list of existing testcases — each one a real past correction that must never
happen again, expressed as (input_example, must_remain_true).

For each testcase, decide: does the PROPOSED instructions file still make it clear
the agent must honor "must_remain_true" when it encounters something like
"input_example"? A testcase fails only if the proposed edit removed, weakened,
contradicted, or silently deprioritized the rule that guarantees that invariant —
not because the wording changed.

Return ONLY valid JSON, no markdown fences:
{
  "passed": boolean,
  "failures": [{"title": "string (the testcase title)", "why": "one sentence, specific to what broke"}]
}
passed must be false if failures is non-empty, and true only if failures is empty.`;

function groupByEditType(corrections) {
  const groups = {};
  for (const c of corrections) {
    if (c.action === 'approved_as_is' || !c.edit_type) continue;
    if (!groups[c.edit_type]) groups[c.edit_type] = [];
    groups[c.edit_type].push(c);
  }
  return Object.entries(groups)
    .map(([editType, items]) => ({ editType, items }))
    .filter((g) => g.items.length >= 2);
}

export async function listTestcases(workspaceId, agentName) {
  const db = getSupabaseReadClient();
  if (!db) return [];
  const { data, error } = await db
    .from('agent_testcases')
    .select('id, title, why_it_exists, input_example, must_remain_true')
    .eq('workspace_id', workspaceId)
    .eq('agent_name', agentName);
  if (error) {
    if (!/could not find the table/i.test(error.message || '')) {
      console.warn('[agent-self-review] testcase list failed:', error.message);
    }
    return [];
  }
  return data || [];
}

/**
 * Run every existing testcase's invariant against the PROPOSED content before
 * it's ever saved. No testcases yet = nothing to regress against = pass free
 * (this is exactly how a brand-new agent's first accepted edit works — there's
 * nothing to protect until the first testcase exists).
 */
export async function checkRegressions(workspaceId, currentContent, proposedContent, testcases) {
  if (!testcases.length) return { ok: true, failures: [] };

  try {
    assertCanAfford(workspaceId, 'agent_self_review');
    const result = await meteredStudioJson({
      workspaceId,
      feature: 'agent_self_review',
      system: REGRESSION_SYSTEM_PROMPT,
      user: JSON.stringify(
        {
          previous_instructions: currentContent,
          proposed_instructions: proposedContent,
          testcases: testcases.map((t) => ({
            title: t.title,
            input_example: t.input_example,
            must_remain_true: t.must_remain_true,
          })),
        },
        null,
        2
      ),
      temperature: 0.1,
      max_tokens: 1200,
    });
    const failures = Array.isArray(result.failures) ? result.failures : [];
    return { ok: result.passed === true && !failures.length, failures };
  } catch (err) {
    // A broken regression check must never silently let an edit through —
    // fail closed, not open.
    return {
      ok: false,
      failures: [{ title: 'regression-check-itself', why: `Regression check could not run (${err.message}) — treated as a failure, not skipped.` }],
    };
  }
}

/**
 * Run the review pass for one (workspace, agent). Always writes an
 * agent_review_log row (even "nothing to report") so the report card has a
 * cadence to show; only calls the LLM when there's an actual pattern.
 */
export async function reviewAgent(workspaceId, agentName, { windowDays = WINDOW_DAYS } = {}) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const now = new Date();

  const [current, corrections, card, testcases] = await Promise.all([
    getActiveInstructions(workspaceId, agentName),
    listRecentCorrections(workspaceId, agentName, since),
    getAgentReportCard(workspaceId, agentName, { windowDays }),
    listTestcases(workspaceId, agentName),
  ]);

  if (!current) {
    return { ok: false, reason: 'no_instructions_and_supabase_unavailable', workspaceId, agentName };
  }

  const patterns = groupByEditType(corrections);
  const base = {
    workspace_id: workspaceId,
    agent_name: agentName,
    period_start: since.toISOString(),
    period_end: now.toISOString(),
    runs: card.runs,
    edit_rate: card.editRate,
    escalation_rate: card.escalationRate,
  };

  if (!patterns.length) {
    const row = {
      ...base,
      what_changed: 'No change — insufficient signal or no repeating pattern found.',
      what_stayed: corrections.length
        ? `${corrections.length} correction(s) logged this week, but none repeated (>=2x) on the same edit_type — treated as noise, not signal.`
        : 'No corrections logged this week.',
      tests_added: 0,
      reverted: false,
      new_version: null,
    };
    await writeReviewLog(row);
    return { ok: true, changed: false, workspaceId, agentName, ...row };
  }

  let proposal;
  try {
    assertCanAfford(workspaceId, 'agent_self_review');
    proposal = await meteredStudioJson({
      workspaceId,
      feature: 'agent_self_review',
      system: REVIEW_SYSTEM_PROMPT,
      user: JSON.stringify(
        {
          current_instructions: current.content,
          current_rule_count: current.rule_count,
          max_rules_before_consolidation: MAX_RULES_BEFORE_CONSOLIDATION,
          patterns: patterns.map((g) => ({
            edit_type: g.editType,
            count: g.items.length,
            notes: g.items.map((c) => c.note).filter(Boolean),
          })),
        },
        null,
        2
      ),
      temperature: 0.3,
      max_tokens: 2000,
    });
  } catch (err) {
    const reason = err instanceof InsufficientCreditsError ? 'insufficient_credits' : `llm_failed: ${err.message}`;
    const row = {
      ...base,
      what_changed: 'No change — review synthesis failed.',
      what_stayed: `${patterns.length} pattern(s) found but could not be processed (${reason}).`,
      tests_added: 0,
      reverted: false,
      new_version: null,
    };
    await writeReviewLog(row);
    return { ok: false, reason, workspaceId, agentName };
  }

  const regression = await checkRegressions(workspaceId, current.content, proposal.updated_content, testcases);

  let saveResult = { ok: false, reason: 'regression_check_failed' };
  if (regression.ok) {
    saveResult = await saveNewVersion(workspaceId, agentName, proposal.updated_content, {
      createdBy: 'weekly_review',
    });
  }

  let testsAdded = 0;
  if (saveResult.ok && proposal.new_testcase) {
    testsAdded = await addTestcase(workspaceId, agentName, proposal.new_testcase, patterns[0].items[0]?.id);
  }

  let row;
  if (saveResult.ok) {
    row = {
      ...base,
      what_changed: proposal.what_changed || 'Updated instructions based on repeated corrections.',
      what_stayed: proposal.what_stayed || null,
      tests_added: testsAdded,
      reverted: false,
      new_version: saveResult.version.version,
      human_decision_needed: proposal.human_decision_needed || null,
    };
  } else if (!regression.ok) {
    const failureSummary = regression.failures.map((f) => `"${f.title}": ${f.why}`).join('; ');
    row = {
      ...base,
      what_changed: 'No change — proposed edit failed the regression check.',
      what_stayed: `${testcases.length} existing testcase(s) checked; ${regression.failures.length} would have broken: ${failureSummary}`,
      tests_added: 0,
      reverted: true,
      revert_reason: `regression_check_failed: ${failureSummary}`,
      new_version: null,
    };
  } else {
    row = {
      ...base,
      what_changed: 'Proposed edit was discarded.',
      what_stayed: `The model's proposal failed a safety check (${saveResult.reason}) — the FROZEN section must survive byte-for-byte, so the whole edit was rejected rather than partially applied.`,
      tests_added: 0,
      reverted: true,
      revert_reason: saveResult.reason,
      new_version: null,
    };
  }

  await writeReviewLog(row);
  return { ok: true, changed: saveResult.ok, workspaceId, agentName, ...row };
}

async function addTestcase(workspaceId, agentName, testcase, sourceCorrectionId) {
  const db = getSupabaseWriteClient();
  if (!db) return 0;
  const { error } = await db.from('agent_testcases').insert({
    workspace_id: workspaceId,
    agent_name: agentName,
    title: testcase.title,
    why_it_exists: testcase.why_it_exists,
    input_example: testcase.input_example,
    must_remain_true: testcase.must_remain_true,
    source_correction_id: sourceCorrectionId || null,
  });
  if (error) {
    console.warn('[agent-self-review] testcase insert failed:', error.message);
    return 0;
  }
  return 1;
}

async function writeReviewLog(row) {
  const db = getSupabaseWriteClient();
  if (!db) return;
  const { error } = await db.from('agent_review_log').insert(row);
  if (error && !/could not find the table/i.test(error.message || '')) {
    console.warn('[agent-self-review] review log insert failed:', error.message);
  }
}
