import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { AGENT_CATALOG } from './agentOs.js';
import { meteredStudioJson } from './credits/index.js';

const AGENTS = new Map(AGENT_CATALOG.map((agent) => [agent.id, agent]));

const SPECIALIST_SETS = {
  advertising: ['dev', 'zara', 'maya', 'tara'],
  market: ['veena', 'isha', 'priya', 'maya'],
  content: ['maya', 'riya', 'sam', 'tara'],
  sales: ['arjun', 'sam', 'isha', 'dev'],
  retention: ['dev', 'isha', 'sam', 'tara'],
  launch: ['neel', 'zara', 'riya', 'sam', 'dev'],
  general: ['veena', 'isha', 'dev', 'sam', 'tara'],
};

function categoryForGoal(goal = {}) {
  const text = `${goal.id || ''} ${goal.title || ''} ${goal.category || ''}`.toLowerCase();
  if (/ads|roas|spend|campaign|channel|performance|kpi|audit/.test(text)) return 'advertising';
  if (/market|competitor|position|audience|icp/.test(text)) return 'market';
  if (/content|seo|social|message|copy|landing|offer/.test(text)) return 'content';
  if (/lead|sales|outreach|revenue/.test(text)) return 'sales';
  if (/churn|retention|lifecycle|customer/.test(text)) return 'retention';
  if (/launch|go.to.market/.test(text)) return 'launch';
  return 'general';
}

function safeObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

const GraphState = Annotation.Root({
  workspaceId: Annotation(),
  goal: Annotation(),
  brief: Annotation(),
  category: Annotation(),
  specialists: Annotation({ reducer: (_, value) => value, default: () => [] }),
  research: Annotation({ reducer: (current, value) => [...(current || []), ...(Array.isArray(value) ? value : [])], default: () => [] }),
  review: Annotation({ reducer: (_, value) => value, default: () => null }),
  synthesis: Annotation({ reducer: (_, value) => value, default: () => null }),
  errors: Annotation({ reducer: (current, value) => [...(current || []), ...(Array.isArray(value) ? value : [])], default: () => [] }),
  mock: Annotation({ reducer: (_, value) => Boolean(value), default: () => false }),
});

function specialistNode(slot) {
  return async (state) => {
    const agentId = state.specialists?.[slot];
    if (!agentId) return { research: [] };
    const agent = AGENTS.get(agentId) || { id: agentId, name: agentId, role: 'GTM specialist', purpose: 'Analyze the assigned GTM question.' };
    if (state.mock) {
      return { research: [{ agentId, agentName: agent.name, role: agent.role, result: { findings: [`Mock finding from ${agent.name}`], recommendations: [`Mock recommendation from ${agent.name}`], confidence: 'medium' }, status: 'completed' }] };
    }
    try {
      const result = await meteredStudioJson({
        workspaceId: state.workspaceId,
        feature: 'agent_execution',
        temperature: 0.25,
        max_tokens: 1400,
        meta: { graph: 'complex_gtm', node: agentId, goalId: state.goal?.id || null },
        system: `You are ${agent.name}, Marqq's ${agent.role} specialist. ${agent.purpose || ''}
Analyze only your specialist perspective. Use evidence available in the brief; distinguish facts, assumptions, and recommendations.
Return JSON only: {"findings":[],"evidence_needed":[],"recommendations":[],"risks":[],"confidence":"low|medium|high"}.`,
        user: `Complex GTM goal: ${state.goal?.title || state.goal?.id || 'unspecified'}
User brief: ${state.brief}
Your specialist assignment: ${agent.role}`,
      });
      return { research: [{ agentId, agentName: agent.name, role: agent.role, result: safeObject(result), status: 'completed' }] };
    } catch (error) {
      return { research: [{ agentId, agentName: agent.name, role: agent.role, result: null, status: 'failed', error: error.message || String(error) }], errors: [`${agentId}: ${error.message || String(error)}`] };
    }
  };
}

async function planNode(state) {
  const category = categoryForGoal(state.goal);
  return { category, specialists: SPECIALIST_SETS[category] || SPECIALIST_SETS.general };
}

async function reviewNode(state) {
  const completed = (state.research || []).filter((item) => item.status === 'completed');
  const failed = (state.research || []).filter((item) => item.status !== 'completed');
  const contradictions = [];
  const recommendations = completed.flatMap((item) => item.result?.recommendations || []);
  const confidence = completed.length >= 3 && failed.length === 0 ? 'high' : completed.length >= 2 ? 'medium' : 'low';
  return {
    review: {
      completedAgents: completed.map((item) => item.agentId),
      failedAgents: failed.map((item) => item.agentId),
      contradictions,
      recommendationCount: recommendations.length,
      confidence,
      reviewer: 'marqq-reviewer',
      note: failed.length ? 'Some specialist branches failed; synthesis must remain conditional.' : 'Specialist evidence collected for synthesis.',
    },
  };
}

async function synthesizeNode(state) {
  if (state.mock) {
    return { synthesis: { summary: 'Mock complex GTM synthesis', prioritized_actions: [{ owner: 'neel', action: 'Review specialist findings', why: 'Smoke test', metric: 'completion', risk: 'none' }], confidence: 'medium' } };
  }
  const result = await meteredStudioJson({
    workspaceId: state.workspaceId,
    feature: 'agent_execution',
    temperature: 0.2,
    max_tokens: 2200,
    meta: { graph: 'complex_gtm', node: 'synthesis', goalId: state.goal?.id || null },
    system: `You are Neel, Marqq's lead GTM strategist. Synthesize the specialist work into one goal-aligned operating plan.
Do not invent evidence. Mark assumptions and unresolved data. Return JSON only:
{"summary":"string","north_star_metric":"string","diagnosis":[],"prioritized_actions":[{"owner":"agent","action":"string","why":"string","metric":"string","risk":"string"}],"experiments":[],"required_connectors":[],"approval_requirements":[],"next_review":"string","confidence":"low|medium|high"}.`,
    user: `Goal: ${state.goal?.title || state.goal?.id || 'Complex GTM goal'}
Brief: ${state.brief}
Specialist evidence:
${JSON.stringify(state.research).slice(0, 24000)}
Reviewer assessment:
${JSON.stringify(state.review).slice(0, 8000)}`,
  });
  return { synthesis: safeObject(result) };
}

let compiledGraph;
let checkpointerPromise;

function getCheckpointConnectionString() {
  return String(
    process.env.LANGGRAPH_POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    ''
  ).trim();
}

async function getCheckpointer() {
  if (checkpointerPromise) return checkpointerPromise;
  const connectionString = getCheckpointConnectionString();
  if (!connectionString) {
    checkpointerPromise = Promise.resolve(new MemorySaver());
    return checkpointerPromise;
  }
  checkpointerPromise = (async () => {
    try {
      const saver = PostgresSaver.fromConnString(connectionString, { schema: process.env.LANGGRAPH_POSTGRES_SCHEMA || 'public' });
      await saver.setup();
      return saver;
    } catch (error) {
      console.warn('[complex-gtm-graph] Postgres checkpointer unavailable; using in-memory checkpoints:', error.message || error);
      return new MemorySaver();
    }
  })();
  return checkpointerPromise;
}

async function getGraph() {
  if (compiledGraph) return compiledGraph;
  const builder = new StateGraph(GraphState)
    .addNode('plan_node', planNode)
    .addNode('specialist_0', specialistNode(0))
    .addNode('specialist_1', specialistNode(1))
    .addNode('specialist_2', specialistNode(2))
    .addNode('specialist_3', specialistNode(3))
    .addNode('specialist_4', specialistNode(4))
    .addNode('review_node', reviewNode)
    .addNode('synthesis_node', synthesizeNode)
    .addEdge(START, 'plan_node')
    .addEdge('plan_node', 'specialist_0')
    .addEdge('plan_node', 'specialist_1')
    .addEdge('plan_node', 'specialist_2')
    .addEdge('plan_node', 'specialist_3')
    .addEdge('plan_node', 'specialist_4')
    .addEdge('specialist_0', 'review_node')
    .addEdge('specialist_1', 'review_node')
    .addEdge('specialist_2', 'review_node')
    .addEdge('specialist_3', 'review_node')
    .addEdge('specialist_4', 'review_node')
    .addEdge('review_node', 'synthesis_node')
    .addEdge('synthesis_node', END);
  compiledGraph = builder.compile({ checkpointer: await getCheckpointer() });
  return compiledGraph;
}

export function isComplexGtmGoal({ goal, brief = '' } = {}) {
  const text = `${goal?.title || ''} ${goal?.id || ''} ${brief}`.toLowerCase();
  return Boolean(goal) && (String(brief).length >= 120 || /overall|full|comprehensive|multi.channel|strategy|optimize|launch|reduce|improve/.test(text));
}

export async function runComplexGtmGoalGraph({ workspaceId, goal, brief, runId = null, mock = false } = {}) {
  if (!workspaceId) throw new Error('workspaceId required');
  if (!goal) throw new Error('goal required');
  const threadId = `complex-gtm:${String(workspaceId).trim()}:${String(runId || `${goal.id || 'goal'}:${Date.now()}`).trim()}`;
  const result = await (await getGraph()).invoke(
    { workspaceId, goal, brief: String(brief || '').trim() || goal.title, mock },
    { configurable: { thread_id: threadId, checkpoint_ns: 'complex_gtm' } }
  );
  return {
    graph: 'complex_gtm',
    goalId: goal.id || null,
    category: result.category,
    specialists: result.specialists,
    research: result.research,
    review: result.review,
    synthesis: result.synthesis,
    errors: result.errors || [],
    threadId,
  };
}
