/**
 * Co-founder Digest — rolls up recent `agent_notifications` (Veena, Isha,
 * Neel, Zara, Dev, Priya, Tara, Sam, Kiran, Maya, Riya, Arjun) AND the
 * workspace's GTM control-loop diagnosis into ONE narrative, written in a
 * single "co-founder" voice instead of a dozen separate notification rows —
 * the Mengo-style "your co-founder was busy while you were away" recap.
 *
 * Runs per-workspace (see cofounderDigestScheduler.js for the daily tick that
 * iterates every tenant from workspaceRegistry.js).
 */
import { getSupabaseReadClient, getSupabaseWriteClient } from '../lib/supabase.js';
import { isUuidWorkspace } from '../lib/persistence.js';
import { resolveWorkspaceOwnerUserId } from './workspaceRegistry.js';
import { loadAgentOsProfileAsync } from './agentOsStore.js';
import { AGENT_CATALOG } from './agentOs.js';
import { meteredStudioJson, assertCanAfford, InsufficientCreditsError } from './credits/index.js';

const AGENT_BY_ID = new Map(AGENT_CATALOG.map((a) => [a.id, a]));
const DEFAULT_LOOKBACK_HOURS = 24;

const DIGEST_SYSTEM_PROMPT = `You are Marqq, the AI co-founder who runs the marketing side of the \
business while the founder is away. You just reviewed what your team of specialist AI agents \
(Veena, Isha, Neel, Zara, Dev, Priya, Tara, Sam, Kiran, Maya, Riya, Arjun) completed, plus the \
latest GTM control-loop diagnosis (Measure -> Diagnose -> Recommend) if one is available. Write a \
short, warm, confident recap in first person, as if you personally reviewed the work — the way a \
co-founder reports back, not the way a dashboard prints logs.

Rules:
- Be concrete: name real deliverables (e.g. "a 6-email sequence", "3 blog drafts", "a competitor \
  pricing alert"), not vague filler like "various tasks".
- Never invent facts. Only summarize what appears in the run data or diagnosis provided.
- Keep the narrative to 2-4 sentences.
- If a control-loop diagnosis is present, work its bottleneck/recommendation into the narrative —
  this is the single most important insight to surface, not just a notification tally.
- All work described here is DRAFT/recommendation-stage unless the input explicitly says
  something published or sent live — never claim something shipped that only exists as a draft.
- The headline is a single punchy sentence (<90 chars), e.g. "Your co-founder found a bottleneck
  and shipped 4 drafts while you were away."
- highlights: one line per agent that produced something notable, attributed to that agent by name.
- Only include agents that actually appear in the run data.

Return ONLY valid JSON matching this shape, no markdown fences, no commentary:
{
  "headline": "string",
  "narrative": "string",
  "highlights": [{"agent": "riya", "agent_role": "Content", "text": "string"}],
  "stats": {"tasks_completed": 0, "agents_active": 0, "action_items_count": 0}
}`;

function agentRole(agentName) {
  return AGENT_BY_ID.get(agentName)?.role || agentName;
}

async function lastDigestPeriodEnd(db, workspaceId) {
  try {
    const { data, error } = await db
      .from('cofounder_digests')
      .select('period_end')
      .eq('workspace_id', workspaceId)
      .order('period_end', { ascending: false })
      .limit(1);
    if (error) {
      if (!/could not find the table/i.test(error.message || '')) {
        console.warn('[cofounder-digest] last period lookup failed:', error.message);
      }
      return null;
    }
    return data?.[0]?.period_end ? new Date(data[0].period_end) : null;
  } catch (err) {
    console.warn('[cofounder-digest] last period lookup failed:', err.message);
    return null;
  }
}

async function fetchRecentNotifications(db, workspaceId, since) {
  const { data, error } = await db
    .from('agent_notifications')
    .select('id, agent_name, agent_role, task_type, title, summary, action_items, status, created_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'success')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });
  if (error) throw new Error(`agent_notifications query failed: ${error.message}`);
  return data || [];
}

function buildUserPrompt(notifications, diagnosis) {
  const compactNotifications = notifications.map((n) => ({
    agent: n.agent_name,
    agent_role: n.agent_role || agentRole(n.agent_name),
    task_type: n.task_type,
    title: n.title,
    summary: String(n.summary || '').slice(0, 500),
    action_items: (n.action_items || [])
      .map((item) => (item && typeof item === 'object' ? item.label : null))
      .filter(Boolean)
      .slice(0, 5),
  }));

  const payload = { notifications: compactNotifications };
  if (diagnosis) {
    payload.control_loop_diagnosis = {
      bottleneck_stage: diagnosis.bottleneck_stage,
      summary: diagnosis.summary,
      primary_constraint: diagnosis.primary_constraint,
      reallocation: diagnosis.reallocation,
      diagnosedAt: diagnosis.diagnosedAt,
    };
  }

  return `Here is what the team completed and diagnosed:\n\n${JSON.stringify(payload, null, 2)}`;
}

function fallbackDigest(notifications, diagnosis) {
  const agents = [...new Set(notifications.map((n) => n.agent_name))];
  const totalActions = notifications.reduce(
    (sum, n) => sum + (Array.isArray(n.action_items) ? n.action_items.length : 0),
    0
  );
  const diagnosisLine = diagnosis?.summary ? ` Control-loop watch: ${diagnosis.summary}` : '';
  return {
    headline: notifications.length
      ? `Your co-founder shipped ${notifications.length} draft update(s) while you were away.`
      : 'Your co-founder has a control-loop update.',
    narrative:
      (notifications.length
        ? `${agents.map((a) => a[0].toUpperCase() + a.slice(1)).join(', ')} finished ${notifications.length} task(s). See the AI Team feed below for the full breakdown.`
        : 'No new agent runs since the last digest.') + diagnosisLine,
    highlights: notifications.map((n) => ({
      agent: n.agent_name,
      agent_role: n.agent_role || agentRole(n.agent_name),
      text: n.title || 'Completed a task.',
    })),
    stats: {
      tasks_completed: notifications.length,
      agents_active: agents.length,
      action_items_count: totalActions,
    },
  };
}

/**
 * Generate (and persist) one co-founder digest for a single workspace.
 * Returns the inserted row, or null if there was nothing new to summarize.
 */
export async function generateCofounderDigest(workspaceId, { force = false } = {}) {
  if (!isUuidWorkspace(workspaceId)) {
    return { ok: false, reason: 'not_a_uuid_workspace', workspaceId };
  }

  const readDb = getSupabaseReadClient();
  const writeDb = getSupabaseWriteClient();
  if (!readDb || !writeDb) {
    return { ok: false, reason: 'supabase_not_configured', workspaceId };
  }

  const now = new Date();
  const lastEnd = await lastDigestPeriodEnd(readDb, workspaceId);
  const periodStart = lastEnd || new Date(now.getTime() - DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000);

  const [notifications, agentOs] = await Promise.all([
    fetchRecentNotifications(readDb, workspaceId, periodStart),
    loadAgentOsProfileAsync(workspaceId).catch(() => null),
  ]);

  const diagnosis = agentOs?.control_loop?.lastDiagnosis || null;
  const diagnosisIsNew = diagnosis?.diagnosedAt ? new Date(diagnosis.diagnosedAt) > periodStart : false;

  if (!notifications.length && !diagnosisIsNew && !force) {
    return { ok: true, skipped: true, reason: 'nothing_new', workspaceId };
  }

  let digest;
  try {
    assertCanAfford(workspaceId, 'cofounder_digest');
    digest = await meteredStudioJson({
      workspaceId,
      feature: 'cofounder_digest',
      system: DIGEST_SYSTEM_PROMPT,
      user: buildUserPrompt(notifications, diagnosisIsNew ? diagnosis : null),
      temperature: 0.4,
      max_tokens: 900,
      meta: { notificationCount: notifications.length, hasDiagnosis: diagnosisIsNew },
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      console.warn(`[cofounder-digest] ${workspaceId}: insufficient credits, using fallback digest`);
    } else {
      console.warn(`[cofounder-digest] ${workspaceId}: synthesis failed, using fallback:`, err.message);
    }
    digest = fallbackDigest(notifications, diagnosisIsNew ? diagnosis : null);
  }

  const userId = await resolveWorkspaceOwnerUserId(workspaceId);

  const row = {
    user_id: userId,
    workspace_id: workspaceId,
    period_start: periodStart.toISOString(),
    period_end: now.toISOString(),
    headline: digest.headline || 'Your co-founder has an update.',
    narrative: digest.narrative || '',
    highlights: digest.highlights || [],
    stats: digest.stats || {},
    control_loop_diagnosis: diagnosisIsNew ? diagnosis : null,
    source_notification_ids: notifications.map((n) => n.id),
  };

  try {
    const { data, error } = await writeDb.from('cofounder_digests').insert(row).select().single();
    if (error) {
      if (/could not find the table/i.test(error.message || '')) {
        console.warn(
          '[cofounder-digest] cofounder_digests table not found — run database/migrations/cofounder-digest.sql'
        );
      } else {
        console.warn('[cofounder-digest] insert failed:', error.message);
      }
      return { ok: false, reason: 'insert_failed', error: error.message, workspaceId };
    }
    return { ok: true, digest: data, workspaceId };
  } catch (err) {
    console.warn('[cofounder-digest] insert failed:', err.message);
    return { ok: false, reason: 'insert_failed', error: err.message, workspaceId };
  }
}
