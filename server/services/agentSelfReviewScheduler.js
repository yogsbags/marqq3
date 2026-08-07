/**
 * Weekly agent self-review scheduler — same setInterval-tick pattern as
 * cofounderDigestScheduler.js (no new cron dependency), fires once a week
 * instead of once a day, and iterates every (workspace x catalog agent) pair.
 *
 * Cost note: this is cheap even at scale. reviewAgent() only makes an LLM
 * call when a workspace+agent has a real repeating correction pattern that
 * week; everything else is a single lightweight Supabase insert.
 */
import { listActiveWorkspaceIds } from './workspaceRegistry.js';
import { reviewAgent } from './agentSelfReview.js';
import { AGENT_CATALOG } from './agentOs.js';

const TICK_MS = Math.max(60_000, Number(process.env.AGENT_REVIEW_TICK_MS || 5 * 60_000));
const TARGET_DAY = Number.isFinite(Number(process.env.AGENT_REVIEW_DAY)) ? Number(process.env.AGENT_REVIEW_DAY) : 1; // 0=Sun..1=Mon
const TARGET_HOUR = Number.isFinite(Number(process.env.AGENT_REVIEW_HOUR)) ? Number(process.env.AGENT_REVIEW_HOUR) : 9;
const TARGET_MINUTE = Number.isFinite(Number(process.env.AGENT_REVIEW_MINUTE)) ? Number(process.env.AGENT_REVIEW_MINUTE) : 0;

let timer = null;
let ticking = false;
/** workspaceId -> ISO-week key of the last run, so a tick landing inside the
 * same target minute twice in one week doesn't double-fire. */
const lastRunWeekByWorkspace = new Map();

function isoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

function isTargetSlot(date = new Date()) {
  return date.getDay() === TARGET_DAY && date.getHours() === TARGET_HOUR && date.getMinutes() === TARGET_MINUTE;
}

/**
 * Run the review pass for every catalog agent, for every known workspace,
 * once. Exposed directly so a manual "run now" trigger / tests don't have to
 * wait for the clock.
 */
export async function runWeeklyReviewForAllWorkspaces({ agentNames = null } = {}) {
  const workspaceIds = await listActiveWorkspaceIds();
  const agents = agentNames?.length ? agentNames : AGENT_CATALOG.map((a) => a.id);
  const results = [];
  for (const workspaceId of workspaceIds) {
    for (const agentName of agents) {
      try {
        const result = await reviewAgent(workspaceId, agentName);
        results.push(result);
      } catch (err) {
        console.warn(`[agent-self-review-scheduler] ${workspaceId}/${agentName} failed:`, err?.message || err);
        results.push({ ok: false, workspaceId, agentName, error: err?.message || String(err) });
      }
    }
    lastRunWeekByWorkspace.set(workspaceId, isoWeekKey());
  }
  return results;
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const now = new Date();
    if (!isTargetSlot(now)) return;

    const workspaceIds = await listActiveWorkspaceIds();
    const due = workspaceIds.filter((id) => lastRunWeekByWorkspace.get(id) !== isoWeekKey(now));
    if (!due.length) return;

    for (const workspaceId of due) {
      for (const agent of AGENT_CATALOG) {
        try {
          await reviewAgent(workspaceId, agent.id);
        } catch (err) {
          console.warn(`[agent-self-review-scheduler] ${workspaceId}/${agent.id} failed:`, err?.message || err);
        }
      }
      lastRunWeekByWorkspace.set(workspaceId, isoWeekKey(now));
      console.log(`[agent-self-review-scheduler] weekly review complete for ${workspaceId}`);
    }
  } finally {
    ticking = false;
  }
}

export function startAgentSelfReviewScheduler() {
  if (timer) return { already: true, tickMs: TICK_MS };
  timer = setInterval(() => {
    tick().catch((err) => console.warn('[agent-self-review-scheduler] tick failed:', err?.message || err));
  }, TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();
  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][TARGET_DAY];
  console.log(
    `✓ Agent self-review scheduler every ${TICK_MS}ms, target ${dayName} ${String(TARGET_HOUR).padStart(2, '0')}:${String(TARGET_MINUTE).padStart(2, '0')} server time, per active workspace x catalog agent`
  );
  return { started: true, tickMs: TICK_MS };
}

export function stopAgentSelfReviewScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  lastRunWeekByWorkspace.clear();
}
