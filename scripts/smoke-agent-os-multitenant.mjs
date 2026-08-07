#!/usr/bin/env node
/**
 * Smoke: agent_os_by_workspace isolation (server/db.js + agentOsStore.js).
 *
 * Regression test for a real cross-tenant bug: `agent_os` used to be a single
 * shared slot in the local JSON DB, so saving/loading it for workspace B could
 * clobber or shadow workspace A's profile in the same process. This asserts
 * two concurrently-active workspaces never see each other's data.
 *
 * Usage: node scripts/smoke-agent-os-multitenant.mjs
 * No network/Supabase required — exercises the local JSON DB directly.
 */
import { saveAgentOsProfile, loadAgentOsProfile } from '../server/services/agentOsStore.js';
import { getDb, updateDb } from '../server/db.js';

const wsA = `smoke-tenant-a-${Date.now()}`;
const wsB = `smoke-tenant-b-${Date.now()}`;

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    cleanup();
    process.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

function cleanup() {
  updateDb((state) => {
    const map = { ...state.agent_os_by_workspace };
    delete map[wsA];
    delete map[wsB];
    return { ...state, agent_os_by_workspace: map };
  });
}

saveAgentOsProfile({ goal_system: { north_star_metric: 'Tenant A metric' } }, wsA);
saveAgentOsProfile({ goal_system: { north_star_metric: 'Tenant B metric' } }, wsB);

const a = loadAgentOsProfile(wsA);
const b = loadAgentOsProfile(wsB);

assert(a?.goal_system?.north_star_metric === 'Tenant A metric', 'workspace A reads its own profile');
assert(b?.goal_system?.north_star_metric === 'Tenant B metric', 'workspace B reads its own profile');
assert(a.goal_system.north_star_metric !== b.goal_system.north_star_metric, 'no cross-tenant bleed between A and B');

// Re-save A after B was written — must not disturb B (this is exactly the
// scenario that broke with the old single `agent_os` slot).
saveAgentOsProfile({ goal_system: { north_star_metric: 'Tenant A metric v2' } }, wsA);
const bAfter = loadAgentOsProfile(wsB);
assert(bAfter?.goal_system?.north_star_metric === 'Tenant B metric', 'workspace B unaffected by a later workspace A write');

// Unknown workspace must not fall back to some other tenant's data.
const unknown = loadAgentOsProfile(`smoke-unknown-${Date.now()}`);
assert(unknown === null, 'unrelated/unknown workspace id returns null, not another tenant\'s profile');

cleanup();
const db = getDb();
assert(!db.agent_os_by_workspace[wsA] && !db.agent_os_by_workspace[wsB], 'cleanup removed smoke workspaces');

console.log('ALL PASS');
process.exit(0);
