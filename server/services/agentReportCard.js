/**
 * Agent Report Card — composes agent_notifications (run volume) +
 * draft_corrections (edit/escalation signal) + agent_instructions (current
 * rule count/version) + agent_review_log (recent self-edits) into the
 * numbers AgentsHub.jsx's grid + detail views actually need.
 */
import { getSupabaseReadClient } from '../lib/supabase.js';
import { getActiveInstructions } from './agentInstructions.js';
import { listRecentCorrections } from './draftCorrections.js';

const DEFAULT_WINDOW_DAYS = 7;

function round1(n) {
  return Math.round(n * 10) / 10;
}

async function countRuns(db, workspaceId, agentName, since) {
  const { count, error } = await db
    .from('agent_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('agent_name', agentName)
    .eq('status', 'success')
    .gte('created_at', since.toISOString());
  if (error) return 0;
  return count || 0;
}

/**
 * Single-agent report card for one workspace.
 */
export async function getAgentReportCard(workspaceId, agentName, { windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  const readDb = getSupabaseReadClient();
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [runs, corrections, instructions, reviewLog] = await Promise.all([
    readDb ? countRuns(readDb, workspaceId, agentName, since) : 0,
    listRecentCorrections(workspaceId, agentName, since),
    getActiveInstructions(workspaceId, agentName),
    readDb
      ? readDb
          .from('agent_review_log')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('agent_name', agentName)
          .order('created_at', { ascending: false })
          .limit(3)
          .then(({ data }) => data || [])
      : [],
  ]);

  const denom = Math.max(runs, corrections.length, 1);
  const editedOrRejected = corrections.filter((c) => c.action !== 'approved_as_is').length;
  const escalated = corrections.filter((c) => c.confidence === 'low').length;

  const editRate = round1((editedOrRejected / denom) * 100);
  const escalationRate = round1((escalated / denom) * 100);

  const editTypeCounts = corrections.reduce((acc, c) => {
    if (!c.edit_type) return acc;
    acc[c.edit_type] = (acc[c.edit_type] || 0) + 1;
    return acc;
  }, {});
  const topPattern = Object.entries(editTypeCounts).sort((a, b) => b[1] - a[1])[0] || null;

  return {
    workspaceId,
    agentName,
    windowDays,
    runs,
    correctionCount: corrections.length,
    editRate,
    escalationRate,
    topPattern: topPattern ? { editType: topPattern[0], count: topPattern[1] } : null,
    ruleCount: instructions?.rule_count ?? null,
    instructionsVersion: instructions?.version ?? null,
    recentReviews: reviewLog,
    // Simple letter grade for the grid card — informational, not scientific.
    grade: gradeFor(editRate, escalationRate, runs),
  };
}

function gradeFor(editRate, escalationRate, runs) {
  if (runs === 0) return 'No data yet';
  if (editRate <= 10 && escalationRate <= 10) return `${round1(100 - editRate)}% clean`;
  if (editRate <= 30) return `${round1(100 - editRate)}% clean`;
  return `${round1(100 - editRate)}% clean · needs review`;
}

/** Report cards for every catalog agent in one workspace — powers the grid view. */
export async function getWorkspaceReportCards(workspaceId, agentNames, opts = {}) {
  const cards = await Promise.all(agentNames.map((name) => getAgentReportCard(workspaceId, name, opts)));
  return Object.fromEntries(cards.map((c) => [c.agentName, c]));
}
