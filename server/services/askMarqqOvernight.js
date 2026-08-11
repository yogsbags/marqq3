/**
 * Ask Marqq -> overnight agent work.
 *
 * The Mengo-style ask ("plan my product launch") shouldn't block on a
 * synchronous chat reply — it should hand off to the agent roster and let the
 * co-founder digest report back once it's done. Rather than building new
 * queue/worker infrastructure, this reuses what already exists and is already
 * polled every ~60s: agentScheduler.js's `agent_deployments` queue (the same
 * mechanism `seedDeploymentsFromStrategy` uses for GTM section drafts).
 */
import { randomUUID } from 'node:crypto';
import { getDb, updateDb } from '../db.js';
import { ensureAgentCollections } from './agentOsStore.js';
import { AGENT_CATALOG, planAgentTask } from './agentOs.js';
import { persistDeploymentToSupabase } from './agentSupabase.js';
import { routeVeenaGoal } from './veenaGoalRouter.js';

const AGENT_BY_ID = new Map(AGENT_CATALOG.map((a) => [a.id, a]));

/** Ask Marqq channel id -> GTM section id (agentOsStore.js#SECTION_OWNERSHIP /
 * agentOs.js#SECTION_PRIMARY use underscored section ids). */
const CHANNEL_TO_SECTION = {
  'executive-summary': 'executive_summary',
  'market-analysis': 'market_analysis',
  'target-customer': 'target_customer',
  'product-strategy': 'product_strategy',
  'positioning-messaging': 'positioning_messaging',
  'pricing-monetization': 'pricing_monetization',
  'distribution-channels': 'distribution_channels',
  'marketing-strategy': 'marketing_strategy',
  'sales-strategy': 'sales_strategy',
  'customer-success-retention': 'customer_success',
  'launch-plan': 'launch_plan',
  'operations-execution': 'operations_execution',
  'financial-plan': 'financial_plan',
  'measurement-optimization': 'measurement_optimization',
  'risks-contingencies': 'risks_contingencies',
  'timeline-roadmap': 'timeline_roadmap',
};

function nowIso() {
  return new Date().toISOString();
}

function agentMeta(agentId) {
  return (
    AGENT_BY_ID.get(agentId) || {
      id: agentId,
      name: agentId,
      role: 'Agent',
      avatarColor: '#888',
    }
  );
}

/**
 * Queue a big/multi-part chat ask as an overnight agent deployment instead of
 * answering synchronously. Returns immediately; the existing deployment
 * scheduler tick (agentScheduler.js) picks it up within ~60s, and the result
 * surfaces later in agent_notifications + the next co-founder digest.
 */
export function queueOvernightAsk({
  workspaceId,
  companyId,
  channel = 'general',
  message,
  agentName = null,
} = {}) {
  const ws = String(workspaceId || companyId || '').trim();
  if (!ws) throw new Error('workspaceId required');
  const text = String(message || '').trim();
  if (!text) throw new Error('message required');

  const routed = routeVeenaGoal(text, { channel });
  const routedGoal = routed.matched ? routed.goal : null;
  const sectionId = routedGoal?.sectionId || CHANNEL_TO_SECTION[channel] || null;
  const plan = planAgentTask({
    sectionId,
    target: routedGoal?.target || null,
  });
  const requestedAgent = String(agentName || '').toLowerCase();
  const resolvedAgentId = requestedAgent && AGENT_BY_ID.has(requestedAgent)
    ? requestedAgent
    : routedGoal?.agentName || plan.agentName || 'neel';
  const meta = agentMeta(resolvedAgentId);

  const id = `dep_ask_${randomUUID().slice(0, 8)}`;
  const entry = {
    id,
    agentName: resolvedAgentId,
    agentDisplayName: meta.name,
    agentTarget: routedGoal?.target || plan?.target || null,
    goalId: routedGoal?.id || null,
    goalTitle: routedGoal?.title || null,
    goalCategory: routedGoal?.category || null,
    routingConfidence: routed.confidence || 0,
    routingReason: routed.reason || null,
    requiredConnectors: plan?.requiredConnectors || [],
    optionalConnectors: plan?.optionalConnectors || [],
    workspaceId: ws,
    companyId: companyId || ws,
    sectionId,
    sectionTitle: text.slice(0, 80) || `${meta.name}: overnight ask`,
    summary: text.slice(0, 400),
    bullets: [],
    tasks: [],
    openScreen: meta.openScreen || 'orchestration',
    scheduleMode: 'once',
    recurrenceMinutes: 0,
    deliveryMode: 'draft',
    status: 'pending',
    createdAt: nowIso(),
    scheduledFor: nowIso(),
    runCount: 0,
    triggeredBy: 'ask_marqq_overnight',
    channel,
  };

  updateDb((state) => {
    const next = ensureAgentCollections(state);
    const queue = [entry, ...next.agent_deployments];
    const task = {
      id: `t_${id}`,
      title: `${meta.name}: ${entry.sectionTitle}`,
      assignee: meta.name,
      avatarColor: meta.avatarColor,
      avatarLetter: String(meta.name || 'A')[0],
      due: 'Next scheduler tick',
      priority: 'Medium',
      priorityClass: 'tag tag-outline',
      status: 'Scheduled',
      deploymentId: id,
      sectionId,
      agentName: resolvedAgentId,
    };
    const tasks = [task, ...(next.tasks || [])].slice(0, 80);
    return { ...next, agent_deployments: queue, tasks };
  });

  void persistDeploymentToSupabase(entry);

  return {
    ok: true,
    deploymentId: id,
    agentName: resolvedAgentId,
    agentDisplayName: meta.name,
    openScreen: entry.openScreen,
    message: `Got it — ${meta.name} will work on this and it'll be in your next co-founder digest (and the Approvals queue) once ready. No live spend/publish without your review.`,
    goalId: entry.goalId,
    goalTitle: entry.goalTitle,
    routingConfidence: entry.routingConfidence,
    requiredConnectors: entry.requiredConnectors,
  };
}

/** List queued/most-recent overnight asks for a workspace (Ask Marqq UI polling / debugging). */
export function listOvernightAsks({ workspaceId, limit = 20 } = {}) {
  const ws = String(workspaceId || '').trim();
  const db = ensureAgentCollections(getDb());
  return db.agent_deployments
    .filter((d) => d.triggeredBy === 'ask_marqq_overnight' && (!ws || d.workspaceId === ws))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, limit);
}
