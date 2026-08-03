import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, '../data/marqq-db.json');

/** Bump to wipe legacy Elevate / Atlas / clinic mock rows from persisted DB. */
const SEED_VERSION = 'clean-workspace-v1';

const initialData = {
  seedVersion: SEED_VERSION,
  workspace: {
    name: 'Workspace',
    user: { name: 'Owner', email: '', role: 'Owner', avatar: 'OW' },
    creditBalance: null,
    usage: [],
    invoices: [],
  },
  kpis: [],
  changes: [],
  priorities: [],
  campaigns: [],
  agents: [],
  agentLogs: {},
  approvedActions: {},
  approvals: [],
  prospects: [],
  contentItems: [],
  tasks: [],
};

function ensureDb() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
  }
}

function withAgentDefaults(data) {
  return {
    ...data,
    agent_os: data.agent_os ?? null,
    agent_deployments: Array.isArray(data.agent_deployments) ? data.agent_deployments : [],
    scheduled_automations: Array.isArray(data.scheduled_automations)
      ? data.scheduled_automations
      : [],
    automation_runs: Array.isArray(data.automation_runs) ? data.automation_runs : [],
  };
}

function migrateIfNeeded(data) {
  if (data?.seedVersion === SEED_VERSION) return withAgentDefaults(data);
  const next = withAgentDefaults({
    ...initialData,
    // Keep real agent OS / deployments if already generated from strategy
    agent_os: data?.agent_os ?? null,
    agent_deployments: Array.isArray(data?.agent_deployments) ? data.agent_deployments : [],
    scheduled_automations: Array.isArray(data?.scheduled_automations)
      ? data.scheduled_automations
      : [],
    automation_runs: Array.isArray(data?.automation_runs) ? data.automation_runs : [],
  });
  fs.writeFileSync(DB_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function getDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return migrateIfNeeded(JSON.parse(raw));
  } catch (err) {
    return withAgentDefaults(initialData);
  }
}

export function updateDb(updater) {
  const current = getDb();
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  if (!next.seedVersion) next.seedVersion = SEED_VERSION;
  fs.writeFileSync(DB_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
