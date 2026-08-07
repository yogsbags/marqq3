/**
 * Co-founder Digest Scheduler — per-workspace daily cron, mirroring marqq-2's
 * Python APScheduler roster (one digest per tenant per day) but implemented
 * the way this codebase already does scheduling: a plain `setInterval` tick
 * that checks wall-clock time, matching the existing
 * agentScheduler.js#startOutreachDueScheduler pattern (no new cron dependency).
 *
 * Tenants are discovered from Supabase `workspaces` (workspaceRegistry.js) —
 * this repo is multi-tenant at the Supabase layer already (confirmed live:
 * workspaces table currently holds multiple real tenants); this scheduler is
 * what makes the digest feature actually iterate over all of them instead of
 * assuming a single hardcoded workspace.
 */
import { listActiveWorkspaceIds } from './workspaceRegistry.js';
import { generateCofounderDigest } from './cofounderDigest.js';

const TICK_MS = Math.max(30_000, Number(process.env.COFOUNDER_DIGEST_TICK_MS || 60_000));
const TARGET_HOUR = Number.isFinite(Number(process.env.COFOUNDER_DIGEST_HOUR))
  ? Number(process.env.COFOUNDER_DIGEST_HOUR)
  : 11;
const TARGET_MINUTE = Number.isFinite(Number(process.env.COFOUNDER_DIGEST_MINUTE))
  ? Number(process.env.COFOUNDER_DIGEST_MINUTE)
  : 30;

let timer = null;
let ticking = false;
/** workspaceId -> 'YYYY-MM-DD' of the last day a digest was generated, so a
 * tick landing inside the same target minute twice doesn't double-fire. */
const lastRunDateByWorkspace = new Map();

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isTargetMinute(date = new Date()) {
  return date.getHours() === TARGET_HOUR && date.getMinutes() === TARGET_MINUTE;
}

/**
 * Run the digest job for every known workspace once. Exposed directly (not
 * just via the interval) so tests / a manual "generate now" trigger can call
 * it without waiting for the clock.
 */
export async function runDigestForAllWorkspaces({ force = false } = {}) {
  const workspaceIds = await listActiveWorkspaceIds();
  const results = [];
  for (const workspaceId of workspaceIds) {
    try {
      const result = await generateCofounderDigest(workspaceId, { force });
      results.push(result);
      if (result?.ok && !result.skipped) {
        lastRunDateByWorkspace.set(workspaceId, todayKey());
      }
    } catch (err) {
      console.warn(`[cofounder-digest-scheduler] ${workspaceId} failed:`, err?.message || err);
      results.push({ ok: false, workspaceId, error: err?.message || String(err) });
    }
  }
  return results;
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const now = new Date();
    if (!isTargetMinute(now)) return;

    const workspaceIds = await listActiveWorkspaceIds();
    const due = workspaceIds.filter((id) => lastRunDateByWorkspace.get(id) !== todayKey(now));
    if (!due.length) return;

    for (const workspaceId of due) {
      try {
        const result = await generateCofounderDigest(workspaceId);
        lastRunDateByWorkspace.set(workspaceId, todayKey(now));
        if (result?.ok && !result.skipped) {
          console.log(`[cofounder-digest-scheduler] digest generated for ${workspaceId}`);
        }
      } catch (err) {
        console.warn(`[cofounder-digest-scheduler] ${workspaceId} failed:`, err?.message || err);
      }
    }
  } finally {
    ticking = false;
  }
}

export function startCofounderDigestScheduler() {
  if (timer) return { already: true, tickMs: TICK_MS };
  timer = setInterval(() => {
    tick().catch((err) => console.warn('[cofounder-digest-scheduler] tick failed:', err?.message || err));
  }, TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(
    `✓ Co-founder digest scheduler every ${TICK_MS}ms, target ${String(TARGET_HOUR).padStart(2, '0')}:${String(TARGET_MINUTE).padStart(2, '0')} server time, per active Supabase workspace`
  );
  return { started: true, tickMs: TICK_MS, targetHour: TARGET_HOUR, targetMinute: TARGET_MINUTE };
}

export function stopCofounderDigestScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  lastRunDateByWorkspace.clear();
}

/** Test/debug hook — inspect what the scheduler currently thinks it already ran today. */
export function _debugLastRunDates() {
  return Object.fromEntries(lastRunDateByWorkspace);
}
