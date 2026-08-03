import express from 'express';
import { createReadStream } from 'node:fs';
import { getDb, updateDb } from '../db.js';
import { scrapeBrandSignals, synthesizeBrandDnaWithAi } from '../services/brandDna.js';
import {
  saveBrandDnaBinary,
  readBrandDnaManifest,
  findBrandDnaAsset,
  deleteBrandDnaAsset,
  readBrandContext,
  writeBrandContext,
} from '../services/brandStore.js';
import { transcribeSpeechWithGroq } from '../services/stt.js';
import { loadStrategySectionPlaybook } from '../services/gtmStrategySkills.js';
import { generateAutoSection } from '../services/gtmAutoSections.js';
import { generateInterviewQuestionOptions } from '../services/gtmInterviewOptions.js';
import { generateMarketingIdeas } from '../services/marketingIdeas.js';
import { defaultUiAgents, planAgentTask } from '../services/agentOs.js';
import {
  createOutreachRun,
  getOutreachRun,
  generateProspectCopy,
  patchProspect,
  saveGmailDraft,
  sendProspectEmail,
  pollGmailReplies,
  getWorkspaceSummary,
  regenerateReplyDraft,
  updateReplyDraft,
  rejectReplyDraft,
  approveReplyDraft,
} from '../services/outreach.js';
import {
  createContentRun,
  getContentRun,
  runContentResearch,
  runContentBrief,
  runContentDraft,
  patchContentArticle,
  approveContentArticle,
  publishContentArticle,
} from '../services/contentStudio.js';
import {
  createSocialRun,
  getSocialRun,
  runSocialBrief,
  runSocialCompose,
  patchSocialPost,
  approveSocialRun,
} from '../services/socialStudio.js';
import {
  createCreativeRun,
  getCreativeRun,
  runCreativeConcept,
  runCreativeImage,
  runCreativeVideo,
  pollCreativeVideo,
  approveCreativeRun,
} from '../services/creativeStudio.js';
import {
  createPaidRun,
  getPaidRun,
  patchPaidGoals,
  runPaidPlan,
  runPaidCreativeDraft,
  approvePaidRun,
} from '../services/paidStudio.js';
import {
  activateStrategyExecution,
  listDeployments,
  listScheduledAutomations,
  loadAgentOsProfile,
  saveAgentOsProfile,
} from '../services/agentOsStore.js';
import {
  executeAgentRun,
  processDeploymentQueueTick,
  startDeploymentScheduler,
} from '../services/agentScheduler.js';
import { getAnalyticsDashboard, buildEmptyDashboard } from '../services/analyticsDashboard.js';
import { getCommandCenter } from '../services/commandCenterInsights.js';

const router = express.Router();
const DEFAULT_WS = 'marqq-ws-1';

// Ensure scheduler is up even when API is imported by tests/smokes
startDeploymentScheduler();

/** GET /api/gtm/strategy-section-skills/:sectionId — Marqq2 skill playbook for Goals drafts */
router.get('/gtm/strategy-section-skills/:sectionId', async (req, res) => {
  try {
    const sectionId = String(req.params.sectionId || '').trim();
    if (!sectionId) return res.status(400).json({ ok: false, error: 'sectionId required' });
    const result = await loadStrategySectionPlaybook(sectionId);
    res.json({ ok: true, sectionId, ...result });
  } catch (err) {
    console.error('[gtm/strategy-section-skills]', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to load skills', playbook: '' });
  }
});

/** POST /api/gtm/auto-sections/generate — GTM Wizard market→timeline briefs */
router.post('/gtm/auto-sections/generate', async (req, res) => {
  try {
    const result = await generateAutoSection(req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[gtm/auto-sections/generate]', err);
    if (err.status === 400) {
      return res.status(400).json({ ok: false, error: err.message, allowed: err.allowed });
    }
    res.status(500).json({ ok: false, error: err.message || 'Generation failed' });
  }
});

/** POST /api/gtm/interview/question-options — LLM options for one interview question */
router.post('/gtm/interview/question-options', async (req, res) => {
  try {
    const { question, draftAnswers, context } = req.body || {};
    if (!question || !question.id || !question.question) {
      return res.status(400).json({ ok: false, error: 'question.id and question.question required' });
    }
    const options = await generateInterviewQuestionOptions({ question, draftAnswers, context });
    res.json({ ok: true, questionId: question.id, options });
  } catch (err) {
    console.error('[gtm/interview/question-options]', err);
    res.status(500).json({ ok: false, error: err.message || 'Option generation failed', options: [] });
  }
});

/** POST /api/gtm/marketing-ideas/generate — marketing-ideas skill vs locked GTM strategy */
router.post('/gtm/marketing-ideas/generate', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await generateMarketingIdeas({
      strategy: body.strategy || null,
      companyName: body.companyName || body.company || '',
      website: body.website || '',
      niche: body.niche || '',
      icp: body.icp || '',
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[gtm/marketing-ideas/generate]', err);
    res.status(500).json({ ok: false, error: err.message || 'Marketing ideas generation failed' });
  }
});


// GET workspace & dashboard overview
router.get('/dashboard', (req, res) => {
  const db = getDb();
  res.json({
    workspace: db.workspace,
    kpis: db.kpis,
    changes: db.changes,
    priorities: db.priorities,
    campaigns: db.campaigns,
    agents: defaultUiAgents().slice(0, 3)
  });
});

// GET all campaigns
router.get('/campaigns', (req, res) => {
  const db = getDb();
  res.json(db.campaigns);
});

// POST create campaign
router.post('/campaigns', (req, res) => {
  const { name, objective, channels, budget } = req.body;
  const db = updateDb(state => {
    const newCamp = {
      id: `c${state.campaigns.length + 1}`,
      name: name || 'New Campaign',
      objective: objective || 'Pipeline',
      channels: channels || 'Multi-channel',
      status: 'Live',
      budget: budget || '$50K',
      spend: '$0',
      roas: '1.0x',
      owner: 'S. Cole',
      updated: 'Just now',
      conversions: '0',
      pacing: '0%',
      risk: 'No active risks.',
      channelList: [{ name: 'Paid Ads', share: '60%' }, { name: 'Email', share: '40%' }]
    };
    return { ...state, campaigns: [newCamp, ...state.campaigns] };
  });
  res.json(db.campaigns[0]);
});

// GET agents
router.get('/agents', (req, res) => {
  const db = getDb();
  const agents = defaultUiAgents();
  // Prefer seeded logs keyed by catalog id; fall back to legacy a2/a5
  const agentLogs = {
    ...(db.agentLogs || {}),
  };
  if (agentLogs.a2 && !agentLogs.dev) agentLogs.dev = agentLogs.a2;
  if (agentLogs.a5 && !agentLogs.arjun) agentLogs.arjun = agentLogs.a5;
  res.json({ agents, agentLogs });
});

// Static agent paths MUST be registered before /agents/:id
router.get('/agents/deployments', (req, res) => {
  const workspaceId = String(req.query?.workspaceId || DEFAULT_WS).trim();
  const status = req.query?.status ? String(req.query.status) : null;
  res.json({ ok: true, deployments: listDeployments({ workspaceId, status }) });
});

router.post('/agents/deployments', (req, res) => {
  const workspaceId = String(req.body?.workspaceId || req.body?.companyId || DEFAULT_WS).trim();
  const agentName = String(req.body?.agentName || '').trim().toLowerCase();
  if (!agentName) return res.status(400).json({ ok: false, error: 'agentName required' });
  const id = `dep_${Date.now().toString(36)}`;
  const entry = {
    id,
    agentName,
    agentDisplayName: req.body?.agentDisplayName || agentName,
    workspaceId,
    companyId: workspaceId,
    sectionId: req.body?.sectionId || null,
    sectionTitle: req.body?.sectionTitle || req.body?.sectionId || 'Manual deployment',
    summary: req.body?.summary || '',
    bullets: Array.isArray(req.body?.bullets) ? req.body.bullets : [],
    openScreen: req.body?.openScreen || null,
    scheduleMode: req.body?.scheduleMode || 'once',
    recurrenceMinutes: Number(req.body?.recurrenceMinutes || 10080),
    deliveryMode: req.body?.deliveryMode || 'draft',
    status: 'pending',
    createdAt: new Date().toISOString(),
    scheduledFor: req.body?.scheduledFor || new Date().toISOString(),
    runCount: 0,
    triggeredBy: 'api',
  };
  updateDb((state) => ({
    ...state,
    agent_deployments: [entry, ...(state.agent_deployments || [])],
  }));
  processDeploymentQueueTick().catch(() => {});
  res.json({ ok: true, deployment: entry });
});

router.post('/agents/scheduler/tick', async (_req, res) => {
  const result = await processDeploymentQueueTick();
  res.json({ ok: true, ...result });
});

// GET agent logs & stats
router.get('/agents/:id', (req, res) => {
  const db = getDb();
  const agents = defaultUiAgents();
  const agent = agents.find((a) => a.id === req.params.id) || agents[0];
  const logs =
    db.agentLogs?.[agent.id] ||
    (agent.id === 'dev' ? db.agentLogs?.a2 : null) ||
    (agent.id === 'arjun' ? db.agentLogs?.a5 : null) ||
    [];
  res.json({ agent, logs });
});

// POST plan agent task (no LLM run — architecture contract)
router.post('/agents/plan', (req, res) => {
  const { target, sectionId, screenId, goalSystem, roster } = req.body || {};
  const plan = planAgentTask({ target, sectionId, screenId, goalSystem, roster });
  res.json({ plan });
});

/** POST /api/strategy/activate — persist Agent OS + seed scheduled deployments from locked GTM */
router.post('/strategy/activate', (req, res) => {
  try {
    const workspaceId = String(req.body?.workspaceId || req.body?.companyId || DEFAULT_WS).trim();
    const result = activateStrategyExecution({
      strategy: req.body?.strategy,
      agentOs: req.body?.agentOs || null,
      workspaceId,
      companyId: workspaceId,
    });
    // Kick an immediate tick so drafts appear without waiting a full minute
    processDeploymentQueueTick().catch(() => {});
    res.json(result);
  } catch (err) {
    console.error('[strategy/activate]', err);
    res.status(400).json({ ok: false, error: err?.message || 'Activate failed' });
  }
});

router.get('/agent-os', (req, res) => {
  const workspaceId = String(req.query?.workspaceId || DEFAULT_WS).trim();
  const os = loadAgentOsProfile(workspaceId);
  res.json({ ok: true, agentOs: os });
});

router.post('/agent-os', (req, res) => {
  const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim();
  const saved = saveAgentOsProfile(req.body?.agentOs || req.body, workspaceId);
  res.json({ ok: true, agentOs: saved });
});

router.post('/agents/:name/run', async (req, res) => {
  try {
    const result = await executeAgentRun({
      agentName: req.params.name,
      company_id: req.body?.company_id || req.body?.companyId || DEFAULT_WS,
      query: req.body?.query || '',
      deployment_id: req.body?.deployment_id || req.body?.deploymentId || null,
      delivery_mode: req.body?.delivery_mode || req.body?.deliveryMode || 'draft',
      triggered_by: req.body?.triggered_by || 'api',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || 'Agent run failed' });
  }
});

router.get('/automations/scheduled', (req, res) => {
  const companyId = String(req.query?.companyId || DEFAULT_WS).trim();
  res.json({ ok: true, automations: listScheduledAutomations(companyId) });
});

// POST decision approve/dismiss
router.post('/approvals/decide', (req, res) => {
  const { id, decision } = req.body; // 'approved' or 'rejected'
  const db = updateDb((state) => {
    const nextApproved = { ...state.approvedActions, [id]: decision };
    const approvals = (state.approvals || []).map((a) =>
      a.id === id ? { ...a, status: decision, decidedAt: new Date().toISOString() } : a
    );
    return { ...state, approvedActions: nextApproved, approvals };
  });
  res.json({ success: true, approvedActions: db.approvedActions });
});

// GET approvals queue
router.get('/approvals', (req, res) => {
  const db = getDb();
  res.json({
    approvals: db.approvals,
    approvedActions: db.approvedActions
  });
});

// GET prospects & outreach (legacy mock list)
router.get('/outreach/prospects', (req, res) => {
  const db = getDb();
  res.json(db.prospects);
});

/** POST /api/outreach/runs — Apollo fetch into a run */
router.post('/outreach/runs', async (req, res) => {
  try {
    const run = await createOutreachRun(req.body || {});
    res.json({
      ok: true,
      runId: run.id,
      run: {
        id: run.id,
        companyName: run.companyName,
        source: run.source,
        contactChannels: run.contactChannels,
        titles: run.titles,
      },
      prospects: run.prospects,
    });
  } catch (err) {
    console.error('[outreach/runs]', err);
    res.status(500).json({ ok: false, error: err.message || 'Fetch prospects failed' });
  }
});

router.get('/outreach/runs/:runId', (req, res) => {
  const run = getOutreachRun(req.params.runId);
  if (!run) return res.status(404).json({ ok: false, error: 'Run not found' });
  const sent = (run.prospects || [])
    .filter((p) => p.sent_at || p.status === 'sent' || p.status === 'replied')
    .map((p) => ({
      id: `sent-${p.id}-${p.sent_at || p.id}`,
      prospectId: p.id,
      prospectName: p.full_name,
      to: p.send_meta?.to || p.email,
      subject: p.subject,
      body: p.body,
      sentAt: p.sent_at,
      threadId: p.gmail_thread_id || null,
      test: Boolean(p.send_meta?.test),
    }));
  res.json({
    ok: true,
    run,
    prospects: run.prospects,
    replies: (run.replies || []).filter((r) => r.prospectId),
    sent,
  });
});

router.patch('/outreach/runs/:runId/prospects/:prospectId', (req, res) => {
  try {
    const prospect = patchProspect(req.params.runId, req.params.prospectId, req.body || {});
    res.json({ ok: true, prospect });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/outreach/runs/:runId/prospects/:prospectId/copy', async (req, res) => {
  try {
    const prospect = await generateProspectCopy(req.params.runId, req.params.prospectId, {
      channels: req.body?.channels,
    });
    res.json({ ok: true, prospect });
  } catch (err) {
    console.error('[outreach/copy]', err);
    res.status(500).json({ ok: false, error: err.message || 'Copy generation failed' });
  }
});

router.post('/outreach/runs/:runId/prospects/:prospectId/gmail-draft', async (req, res) => {
  try {
    const result = await saveGmailDraft(req.params.runId, req.params.prospectId, req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[outreach/gmail-draft]', err);
    res.status(500).json({ ok: false, error: err.message || 'Gmail draft failed' });
  }
});

router.post('/outreach/runs/:runId/prospects/:prospectId/send-now', async (req, res) => {
  try {
    const result = await sendProspectEmail(req.params.runId, req.params.prospectId, {
      subject: req.body?.subject,
      body: req.body?.body,
      testTo: req.body?.testTo || req.body?.test_to || process.env.OUTREACH_TEST_TO || null,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[outreach/send-now]', err);
    res.status(500).json({ ok: false, error: err.message || 'Send failed' });
  }
});

router.post('/outreach/runs/:runId/poll-gmail-replies', async (req, res) => {
  try {
    const result = await pollGmailReplies(req.params.runId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[outreach/poll-gmail-replies]', err);
    res.status(500).json({ ok: false, error: err.message || 'Poll failed' });
  }
});

router.post('/outreach/runs/:runId/replies/:replyId/regenerate-draft', async (req, res) => {
  try {
    const result = await regenerateReplyDraft(req.params.runId, req.params.replyId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[outreach/regenerate-draft]', err);
    res.status(500).json({ ok: false, error: err.message || 'Regenerate failed' });
  }
});

router.patch('/outreach/runs/:runId/replies/:replyId/draft', (req, res) => {
  try {
    const reply = updateReplyDraft(req.params.runId, req.params.replyId, req.body || {});
    res.json({ ok: true, reply });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/outreach/runs/:runId/replies/:replyId/reject', (req, res) => {
  try {
    const reply = rejectReplyDraft(req.params.runId, req.params.replyId);
    res.json({ ok: true, reply });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/outreach/runs/:runId/replies/:replyId/approve', async (req, res) => {
  try {
    const result = await approveReplyDraft(req.params.runId, req.params.replyId, {
      send: req.body?.send !== false,
      testTo: req.body?.testTo || req.body?.test_to || process.env.OUTREACH_TEST_TO || null,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[outreach/approve-reply]', err);
    res.status(500).json({ ok: false, error: err.message || 'Approve/send failed' });
  }
});

router.get('/outreach/workspaces/:workspaceId/summary', (req, res) => {
  res.json({ ok: true, ...getWorkspaceSummary(req.params.workspaceId) });
});

// ── Content Studio (SEO → Blog) ─────────────────────────────────────────────

router.post('/content/runs', async (req, res) => {
  try {
    const run = await createContentRun(req.body || {});
    res.json({ ok: true, runId: run.id, run });
  } catch (err) {
    console.error('[content/runs]', err);
    res.status(500).json({ ok: false, error: err.message || 'Create content run failed' });
  }
});

router.get('/content/runs/:runId', (req, res) => {
  const run = getContentRun(req.params.runId);
  if (!run) return res.status(404).json({ ok: false, error: 'Run not found' });
  res.json({
    ok: true,
    run: {
      id: run.id,
      workspaceId: run.workspaceId,
      companyId: run.companyId,
      companyName: run.companyName,
      domain: run.domain,
      marketType: run.marketType,
      brandContext: run.brandContext,
      status: run.status,
      step: run.step,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      plan: run.plan,
      brief: run.brief,
      article: run.article,
      skills: run.skills,
    },
  });
});

router.post('/content/runs/:runId/research', async (req, res) => {
  try {
    const result = await runContentResearch(req.params.runId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[content/research]', err);
    res.status(500).json({ ok: false, error: err.message || 'Research failed' });
  }
});

router.post('/content/runs/:runId/brief', async (req, res) => {
  try {
    const result = await runContentBrief(req.params.runId, req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[content/brief]', err);
    res.status(500).json({ ok: false, error: err.message || 'Brief failed' });
  }
});

router.post('/content/runs/:runId/draft', async (req, res) => {
  try {
    const result = await runContentDraft(req.params.runId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[content/draft]', err);
    res.status(500).json({ ok: false, error: err.message || 'Draft failed' });
  }
});

router.patch('/content/runs/:runId/article', (req, res) => {
  try {
    const result = patchContentArticle(req.params.runId, req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/content/runs/:runId/approve', (req, res) => {
  try {
    const result = approveContentArticle(req.params.runId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/content/runs/:runId/publish', async (req, res) => {
  try {
    const result = await publishContentArticle(req.params.runId, {
      publish_live: req.body?.publish_live === true,
      repo_owner: req.body?.repo_owner,
      repo_name: req.body?.repo_name,
      branch: req.body?.branch,
      path_prefix: req.body?.path_prefix,
      public_base: req.body?.public_base,
      deploy_provider: req.body?.deploy_provider,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[content/publish]', err);
    res.status(err.publish ? 400 : 500).json({
      ok: false,
      error: err.message || 'Publish failed',
      publish: err.publish || null,
    });
  }
});

// ── Social Studio (Kiran text) ──────────────────────────────────────────────

router.post('/social/runs', async (req, res) => {
  try {
    const run = await createSocialRun(req.body || {});
    res.json({ ok: true, runId: run.id, run });
  } catch (err) {
    console.error('[social/runs]', err);
    res.status(500).json({ ok: false, error: err.message || 'Create social run failed' });
  }
});

router.get('/social/runs/:runId', (req, res) => {
  const run = getSocialRun(req.params.runId);
  if (!run) return res.status(404).json({ ok: false, error: 'Run not found' });
  res.json({ ok: true, run });
});

router.post('/social/runs/:runId/brief', async (req, res) => {
  try {
    const result = await runSocialBrief(req.params.runId, req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[social/brief]', err);
    res.status(500).json({ ok: false, error: err.message || 'Brief failed' });
  }
});

router.post('/social/runs/:runId/compose', async (req, res) => {
  try {
    const result = await runSocialCompose(req.params.runId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[social/compose]', err);
    res.status(500).json({ ok: false, error: err.message || 'Compose failed' });
  }
});

router.patch('/social/runs/:runId/posts/:postId', (req, res) => {
  try {
    const result = patchSocialPost(req.params.runId, req.params.postId, req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/social/runs/:runId/approve', (req, res) => {
  try {
    const result = approveSocialRun(req.params.runId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── Creative Studio (image + video) ─────────────────────────────────────────

router.post('/creative/runs', async (req, res) => {
  try {
    const run = await createCreativeRun(req.body || {});
    res.json({ ok: true, runId: run.id, run });
  } catch (err) {
    console.error('[creative/runs]', err);
    res.status(500).json({ ok: false, error: err.message || 'Create creative run failed' });
  }
});

router.get('/creative/runs/:runId', (req, res) => {
  const run = getCreativeRun(req.params.runId);
  if (!run) return res.status(404).json({ ok: false, error: 'Run not found' });
  res.json({ ok: true, run });
});

router.post('/creative/runs/:runId/concept', async (req, res) => {
  try {
    const result = await runCreativeConcept(req.params.runId, req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[creative/concept]', err);
    res.status(500).json({ ok: false, error: err.message || 'Concept failed' });
  }
});

router.post('/creative/runs/:runId/image', async (req, res) => {
  try {
    const result = await runCreativeImage(req.params.runId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[creative/image]', err);
    res.status(500).json({ ok: false, error: err.message || 'Image failed' });
  }
});

router.post('/creative/runs/:runId/video', async (req, res) => {
  try {
    const result = await runCreativeVideo(req.params.runId, {
      generate: req.body?.generate !== false,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[creative/video]', err);
    res.status(500).json({ ok: false, error: err.message || 'Video failed' });
  }
});

router.post('/creative/runs/:runId/video/poll', async (req, res) => {
  try {
    const result = await pollCreativeVideo(req.params.runId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[creative/video/poll]', err);
    res.status(500).json({ ok: false, error: err.message || 'Video poll failed' });
  }
});

router.post('/creative/runs/:runId/approve', (req, res) => {
  try {
    const result = approveCreativeRun(req.params.runId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── Paid Studio (Zara draft Meta campaign) ──────────────────────────────────

router.post('/paid/runs', async (req, res) => {
  try {
    const run = await createPaidRun(req.body || {});
    res.json({ ok: true, runId: run.id, run });
  } catch (err) {
    console.error('[paid/runs]', err);
    res.status(500).json({ ok: false, error: err.message || 'Create paid run failed' });
  }
});

router.get('/paid/runs/:runId', (req, res) => {
  const run = getPaidRun(req.params.runId);
  if (!run) return res.status(404).json({ ok: false, error: 'Run not found' });
  res.json({ ok: true, run });
});

router.patch('/paid/runs/:runId/goals', (req, res) => {
  try {
    const result = patchPaidGoals(req.params.runId, req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/paid/runs/:runId/plan', async (req, res) => {
  try {
    const result = await runPaidPlan(req.params.runId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[paid/plan]', err);
    res.status(500).json({ ok: false, error: err.message || 'Plan failed' });
  }
});

router.post('/paid/runs/:runId/creative-draft', async (req, res) => {
  try {
    const result = await runPaidCreativeDraft(req.params.runId, {
      generateImage: req.body?.generateImage !== false,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[paid/creative-draft]', err);
    res.status(500).json({ ok: false, error: err.message || 'Creative draft failed' });
  }
});

router.post('/paid/runs/:runId/approve', (req, res) => {
  try {
    const result = approvePaidRun(req.params.runId);
    if (result.run?.creativeDraft?.meta_campaign_id || result.run?.creativeDraft?.meta_ad_id) {
      return res.status(500).json({ ok: false, error: 'Safety: Meta IDs present on draft approve' });
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// POST Ask Marqq AI query
router.post('/ai/ask', (req, res) => {
  const { query } = req.body;
  const q = (query || '').toLowerCase();
  
  let responseText = `Based on your telemetry, Marqq processed "${query}". All guardrails remain active and ROI metrics are on track.`;
  let confidence = '91% confidence';
  let sources = 'Campaign Agent, Paid Search Analytics';
  let hasAction = false;
  let actionLabel = '';

  if (q.includes('cac') || q.includes('paid search') || q.includes('spend')) {
    responseText = 'CAC rose 18% because two exact-match keyword groups ("clinical scheduling", "patient intake software") saw a 34% CPC increase after a competitor entered the auction. Conversion rate held steady, so this is a bidding problem, not a quality problem.';
    confidence = '94% confidence';
    sources = 'Google Ads account, Research Agent competitor scan';
    hasAction = true;
    actionLabel = 'Shift $12K budget into LinkedIn ABM';
  } else if (q.includes('lead') || q.includes('prospect') || q.includes('outreach')) {
    responseText = 'We identified 14 accounts surging in intent over the last 48 hours. Outreach Agent Arjun has pre-drafted 3-touch intro sequences across Email and LinkedIn.';
    confidence = '89% confidence';
    sources = 'CRM Sync, Intent Data Feed, Arjun Agent';
    hasAction = true;
    actionLabel = 'Approve 14 outbound sequences';
  }

  res.json({
    sender: 'Marqq',
    text: responseText,
    confidence,
    sources,
    hasAction,
    actionLabel,
    time: 'Just now'
  });
});

// GET tasks & update tasks
router.get('/tasks', (req, res) => {
  const db = getDb();
  res.json(db.tasks);
});

// ── Composio Integration Endpoints ──────────────────────────────
const COMPOSIO_V3 = 'https://backend.composio.dev/api/v3';

const CONNECTOR_APP_MAP = {
  google_ads: 'googleads',
  meta_ads: 'metaads',
  linkedin_ads: 'linkedinads',
  linkedin: 'linkedin',
  hubspot: 'hubspot',
  salesforce: 'salesforce',
  ga4: 'google_analytics',
  gsc: 'google_search_console',
  google_sheets: 'googlesheets',
  google_drive: 'googledrive',
  apollo: 'apollo',
  gmail: 'gmail',
  slack: 'slack',
  github: 'github'
};

const AUTH_CONFIG_ENV_KEYS = {
  google_ads: 'COMPOSIO_GOOGLE_ADS_AUTH_CONFIG_ID',
  meta_ads: 'COMPOSIO_META_ADS_AUTH_CONFIG_ID',
  linkedin_ads: 'COMPOSIO_LINKEDIN_ADS_AUTH_CONFIG_ID',
  linkedin: 'COMPOSIO_LINKEDIN_AUTH_CONFIG_ID',
  hubspot: 'COMPOSIO_HUBSPOT_AUTH_CONFIG_ID',
  salesforce: 'COMPOSIO_SALESFORCE_AUTH_CONFIG_ID',
  ga4: 'COMPOSIO_GOOGLE_ANALYTICS_AUTH_CONFIG_ID',
  gsc: 'COMPOSIO_GOOGLE_SEARCH_CONSOLE_AUTH_CONFIG_ID',
  google_sheets: 'COMPOSIO_GOOGLE_SHEETS_AUTH_CONFIG_ID',
  google_drive: 'COMPOSIO_GOOGLE_DRIVE_AUTH_CONFIG_ID',
  apollo: 'COMPOSIO_APOLLO_AUTH_CONFIG_ID',
  gmail: 'COMPOSIO_GMAIL_AUTH_CONFIG_ID',
  slack: 'COMPOSIO_SLACK_AUTH_CONFIG_ID',
  github: 'COMPOSIO_GITHUB_AUTH_CONFIG_ID'
};

function getAuthConfigId(connectorId) {
  const envKey = AUTH_CONFIG_ENV_KEYS[connectorId] || `COMPOSIO_${String(connectorId).toUpperCase()}_AUTH_CONFIG_ID`;
  const value = process.env[envKey];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Extra Composio user_ids to merge when listing connectors (e.g. Marqq2 company UUID). */
function getComposioEntityAliases(companyId) {
  const aliases = new Set([String(companyId || '').trim()].filter(Boolean));
  const raw = process.env.COMPOSIO_ENTITY_ALIASES || '';
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (id) aliases.add(id);
  }
  // Always share Marqq2 Nouriva/company connections with default workspace
  if (companyId === DEFAULT_WS || companyId === 'default') {
    aliases.add('b08d3df3-c1a9-4632-96ec-e6e5b703c2a0');
  }
  return [...aliases];
}

function mapConnectedAccounts(items, connectedMap) {
  for (const acct of items || []) {
    const toolkitSlug = String(acct.toolkit?.slug || acct.toolkit_slug || acct.appName || '').toLowerCase();
    const statusUpper = String(acct.status || '').toUpperCase();
    const isActive = statusUpper === 'ACTIVE' || statusUpper === 'CONNECTED' || statusUpper === 'SUCCESS';
    for (const [connId, appName] of Object.entries(CONNECTOR_APP_MAP)) {
      const app = String(appName || '').toLowerCase();
      // Prefer exact toolkit match so linkedin ≠ linkedinads
      const exact = toolkitSlug === app || toolkitSlug === connId;
      const loose =
        !exact &&
        (toolkitSlug.includes(app) || toolkitSlug.includes(connId.toLowerCase()));
      // Avoid linkedin matching linkedinads via includes('linkedin')
      if (connId === 'linkedin' && toolkitSlug.includes('ads')) continue;
      if (connId === 'linkedin_ads' && toolkitSlug === 'linkedin') continue;
      if (!exact && !loose) continue;
      const prev = connectedMap.get(connId);
      // Never let an expired/inactive account overwrite an active one
      if (prev?.connected && !isActive) continue;
      if (prev?.connected && isActive && !exact) continue;
      connectedMap.set(connId, {
        connected: isActive,
        status: isActive ? 'active' : (acct.status?.toLowerCase() || 'connected'),
        connectedAccountId: acct.id || null,
      });
    }
  }
}

// GET /api/integrations?companyId=X
router.get('/integrations', async (req, res) => {
  const companyId = req.query.companyId || req.query.userId || 'default';
  const apiKey = process.env.COMPOSIO_API_KEY;

  const defaultConnectors = [
    { id: 'google_ads', name: 'Google Ads', connected: false, status: 'not_connected' },
    { id: 'linkedin', name: 'LinkedIn', connected: false, status: 'not_connected' },
    { id: 'linkedin_ads', name: 'LinkedIn Ads', connected: false, status: 'not_connected' },
    { id: 'meta_ads', name: 'Meta Ads', connected: false, status: 'not_connected' },
    { id: 'salesforce', name: 'Salesforce CRM', connected: false, status: 'not_connected' },
    { id: 'hubspot', name: 'HubSpot CRM', connected: false, status: 'not_connected' },
    { id: 'ga4', name: 'Google Analytics', connected: false, status: 'not_connected' },
    { id: 'gsc', name: 'Google Search Console', connected: false, status: 'not_connected' },
    { id: 'google_sheets', name: 'Google Sheets', connected: false, status: 'not_connected' },
    { id: 'google_drive', name: 'Google Drive', connected: false, status: 'not_connected' },
    { id: 'apollo', name: 'Apollo', connected: false, status: 'not_connected' },
    { id: 'gmail', name: 'Gmail', connected: false, status: 'not_connected' },
  ];

  if (!apiKey) {
    return res.json({ connectors: defaultConnectors });
  }

  try {
    const connectedMap = new Map();
    const entityIds = getComposioEntityAliases(companyId);
    let anyOk = false;
    for (const entityId of entityIds) {
      const compRes = await fetch(`${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(entityId)}&limit=100`, {
        headers: { 'x-api-key': apiKey }
      });
      if (!compRes.ok) continue;
      anyOk = true;
      const data = await compRes.json();
      mapConnectedAccounts(data.items || [], connectedMap);
    }
    if (!anyOk) {
      return res.json({ connectors: defaultConnectors });
    }
    const merged = defaultConnectors.map(c => ({
      ...c,
      ...(connectedMap.get(c.id) || {})
    }));
    res.json({ connectors: merged });
  } catch (err) {
    res.json({ connectors: defaultConnectors });
  }
});

function extractRedirectUrl(data) {
  if (!data || typeof data !== 'object') return null;
  return (
    data.link ||
    data.redirectUrl ||
    data.redirect_url ||
    data.redirectURI ||
    data.redirect_uri ||
    data?.connection?.redirectUrl ||
    data?.connection?.redirect_url ||
    data?.data?.link ||
    data?.data?.redirectUrl ||
    data?.data?.redirect_url ||
    null
  );
}

// POST /api/integrations/connect
router.post('/integrations/connect', async (req, res) => {
  const { companyId, connectorId } = req.body;
  const apiKey = process.env.COMPOSIO_API_KEY;
  const authConfigId = getAuthConfigId(connectorId);

  if (!companyId || !connectorId || !apiKey || !authConfigId) {
    return res.json({ ok: false, error: 'Composio configuration missing' });
  }

  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  try {
    const compRes = await fetch(`${COMPOSIO_V3}/connected_accounts/link`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth_config_id: authConfigId,
        user_id: companyId,
        callback_url: `${appUrl}/onboarding`,
        allow_multiple: false
      })
    });
    const data = await compRes.json().catch(() => ({}));
    if (!compRes.ok) {
      const errMsg = data?.error?.message || data?.message || 'Composio connect failed';
      console.error(`[composio] connect failed for ${connectorId} / ${authConfigId}:`, errMsg);
      return res.json({ ok: false, error: errMsg });
    }
    const redirectUrl = extractRedirectUrl(data);
    if (!redirectUrl) {
      return res.json({ ok: false, error: 'No OAuth redirect URL returned' });
    }
    res.json({ ok: true, redirectUrl, status: 'pending' });
  } catch (err) {
    console.error(`[composio] connect exception for ${connectorId}:`, err?.message || err);
    res.json({ ok: false, error: err?.message || 'Composio connect failed' });
  }
});

// In-memory connector preferences store per companyId
const preferencesStore = new Map();

const NOURIVA_DEFAULT_PREFS = {
  google_ads_customer_id: '842-192-3841',
  meta_ads_account_id: 'act_1721558035534754',
  linkedin_ads_account_id: '503920194',
  ga4_property_id: 'properties/534425303',
  gsc_site_url: 'https://nouriva.tech/',
  google_sheets_spreadsheet_id: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1VcoUynWArCt6RaKdSHfOfb0pPka3nPd0AzA28NeKAxk',
  salesforce_account_id: '00D5e0000014abc',
  hubspot_account_id: '29401928',
};

/** GET /api/analytics/dashboard — live GSC + Meta (+ GA4 status) scorecard */
router.get('/analytics/dashboard', async (req, res) => {
  try {
    const companyId = String(req.query.companyId || req.query.workspaceId || DEFAULT_WS).trim();
    const period = String(req.query.period || '30d');
    const prefs = preferencesStore.get(companyId) || {};
    const data = await getAnalyticsDashboard({
      companyId,
      period,
      ga4PropertyId: req.query.ga4PropertyId || null,
      gscSiteUrl: req.query.gscSiteUrl || null,
      metaAdsAccount: req.query.metaAdsAccount || null,
      googleAdsCustomer: req.query.googleAdsCustomer || null,
      preferences: { ...NOURIVA_DEFAULT_PREFS, ...prefs },
    });
    res.json(data);
  } catch (err) {
    console.error('[analytics/dashboard]', err);
    res.json({
      ...buildEmptyDashboard(String(req.query.period || '30d')),
      dataNote: err?.message || 'Analytics dashboard failed',
    });
  }
});

/**
 * GET/POST /api/command-center — AI insights home payload.
 * POST body may include strategy context: northStar, loopStatus, bottleneck, highPriorityAgents, nextBestAction
 */
async function handleCommandCenter(req, res) {
  try {
    const companyId = String(
      req.body?.companyId || req.query.companyId || req.query.workspaceId || DEFAULT_WS
    ).trim();
    const period = String(req.body?.period || req.query.period || '30d');
    const prefs = preferencesStore.get(companyId) || {};
    const withLlm = String(req.body?.withLlm ?? req.query.withLlm ?? '1') !== '0';
    const context = {
      northStar: req.body?.northStar || req.query.northStar || null,
      quantifiedTarget: req.body?.quantifiedTarget || null,
      loopStatus: req.body?.loopStatus || null,
      bottleneck: req.body?.bottleneck || null,
      diagnosisSummary: req.body?.diagnosisSummary || null,
      periodLabel: req.body?.periodLabel || null,
      highPriorityAgents: req.body?.highPriorityAgents || [],
      nextBestAction: req.body?.nextBestAction || null,
    };
    const data = await getCommandCenter({
      companyId,
      period,
      preferences: { ...NOURIVA_DEFAULT_PREFS, ...prefs },
      context,
      withLlm,
    });
    res.json(data);
  } catch (err) {
    console.error('[command-center]', err);
    res.status(500).json({ ok: false, error: err?.message || 'Command center failed' });
  }
}

router.get('/command-center', handleCommandCenter);
router.post('/command-center', handleCommandCenter);

// GET /api/integrations/preferences?companyId=X
router.get('/integrations/preferences', (req, res) => {
  const companyId = req.query.companyId || req.query.userId || 'default';
  const prefs = preferencesStore.get(companyId) || { ...NOURIVA_DEFAULT_PREFS };
  res.json({ preferences: prefs });
});

// POST /api/integrations/preferences  { companyId, ...prefs }
router.post('/integrations/preferences', (req, res) => {
  const companyId = req.body.companyId || 'default';
  const current = preferencesStore.get(companyId) || {};
  const patch = req.body;
  delete patch.companyId;
  const updated = { ...current, ...patch };
  preferencesStore.set(companyId, updated);
  res.json({ ok: true, preferences: updated });
});

// POST /api/brand-dna
router.post('/brand-dna', async (req, res) => {
  const companyName = String(req.body?.companyName || req.body?.company || '').trim();
  const websiteUrl = String(req.body?.websiteUrl || req.body?.website || '').trim();
  const industry = String(req.body?.industry || req.body?.niche || '').trim();
  const icp = String(req.body?.icp || '').trim();
  const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim() || DEFAULT_WS;

  try {
    const signals = await scrapeBrandSignals(websiteUrl);
    const brandDna = await synthesizeBrandDnaWithAi({
      companyName,
      websiteUrl,
      industry,
      icp,
      signals
    });
    try {
      await writeBrandContext(workspaceId, {
        companyName,
        website: websiteUrl,
        niche: industry,
        icp,
        brandSummary: brandDna?.businessSummary || brandDna?.brandSummary || '',
        positioningTags: brandDna?.positioningTags || [],
        colors: brandDna?.colors || signals?.colors || [],
        fonts: brandDna?.fonts || signals?.fonts || '',
        brandTagline: brandDna?.brandTagline || '',
        toneOfVoice: brandDna?.toneOfVoice || '',
        logoUrl: signals?.logoUrl || signals?.faviconUrl || '',
      });
    } catch (persistErr) {
      console.warn('[brand-dna] context persist skipped:', persistErr.message);
    }
    res.json({ ok: true, brandDna, signals });
  } catch (err) {
    console.error('[brand-dna] route exception:', err);
    res.json({
      ok: false,
      brandDna: {
        companyName: companyName || 'Elevate',
        brandSummary: `Clinically credible ${industry || 'healthcare'} platform for ${icp || 'mid-market clinics'}.`,
        positioningTags: ['GROWTH ENABLEMENT', 'DIGITAL TRANSFORMATION', 'INDUSTRY EXPERTISE'],
        colors: ['#ff6a00', '#f2790a', '#191613'],
        fonts: 'Archivo · headings & body'
      }
    });
  }
});

// GET /api/brand-dna/context
router.get('/brand-dna/context', async (req, res) => {
  const workspaceId = String(req.query?.workspaceId || DEFAULT_WS).trim() || DEFAULT_WS;
  const context = await readBrandContext(workspaceId);
  res.json({ ok: true, context: context || null });
});

// POST /api/brand-dna/context
router.post('/brand-dna/context', async (req, res) => {
  try {
    const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim() || DEFAULT_WS;
    const { workspaceId: _ws, ...patch } = req.body || {};
    const context = await writeBrandContext(workspaceId, patch);
    res.json({ ok: true, context });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Failed to save brand context' });
  }
});

// GET /api/brand-dna/knowledge-base
router.get('/brand-dna/knowledge-base', async (req, res) => {
  const workspaceId = String(req.query?.workspaceId || DEFAULT_WS).trim() || DEFAULT_WS;
  const files = await readBrandDnaManifest(workspaceId);
  res.json({
    ok: true,
    files: files.map(({ path, ...rest }) => rest),
  });
});

// POST /api/brand-dna/knowledge-base
router.post('/brand-dna/knowledge-base', async (req, res) => {
  try {
    const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim() || DEFAULT_WS;
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    if (!files.length) {
      return res.status(400).json({ ok: false, error: 'files array is required' });
    }
    const created = [];
    for (const f of files) {
      const file = await saveBrandDnaBinary({
        workspaceId,
        name: f.name,
        mime: f.mime,
        size: f.size,
        base64: f.base64,
        category: f.category || 'brand_knowledge',
        transcript: f.transcript,
      });
      const { path, ...publicFile } = file;
      created.push(publicFile);
    }
    const ctx = (await readBrandContext(workspaceId)) || {};
    const prev = Array.isArray(ctx.knowledgeFiles) ? ctx.knowledgeFiles : [];
    await writeBrandContext(workspaceId, { knowledgeFiles: [...created, ...prev] });
    res.json({ ok: true, files: created });
  } catch (err) {
    console.error('[brand-dna/kb]', err);
    res.status(400).json({ ok: false, error: err.message || 'Upload failed' });
  }
});

// DELETE /api/brand-dna/knowledge-base/:fileId — permanent remove (fixes UI-only deletes coming back)
router.delete('/brand-dna/knowledge-base/:fileId', async (req, res) => {
  try {
    const workspaceId = String(req.query?.workspaceId || req.body?.workspaceId || DEFAULT_WS).trim() || DEFAULT_WS;
    const fileId = String(req.params.fileId || '').trim();
    if (!fileId) return res.status(400).json({ ok: false, error: 'fileId required' });
    const result = await deleteBrandDnaAsset(workspaceId, fileId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[brand-dna/kb delete]', err);
    res.status(400).json({ ok: false, error: err.message || 'Delete failed' });
  }
});

// POST /api/brand-dna/logo
router.post('/brand-dna/logo', async (req, res) => {
  try {
    const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim() || DEFAULT_WS;
    const file = await saveBrandDnaBinary({
      workspaceId,
      name: req.body?.name || 'logo.png',
      mime: req.body?.mime || 'image/png',
      size: req.body?.size || 0,
      base64: req.body?.base64,
      category: 'logo',
    });
    await writeBrandContext(workspaceId, { logoUrl: file.url });
    const { path, ...publicFile } = file;
    res.json({ ok: true, logoUrl: file.url, file: publicFile });
  } catch (err) {
    console.error('[brand-dna/logo]', err);
    res.status(400).json({ ok: false, error: err.message || 'Logo upload failed' });
  }
});

// GET /api/brand-dna/assets/:workspaceId/:fileId
router.get('/brand-dna/assets/:workspaceId/:fileId', async (req, res) => {
  const file = await findBrandDnaAsset(req.params.workspaceId, req.params.fileId);
  if (!file) return res.status(404).json({ ok: false, error: 'Asset not found' });
  res.setHeader('Content-Type', file.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name || 'file')}"`);
  createReadStream(file.path).pipe(res);
});

// POST /api/voicebot/stt
router.post('/voicebot/stt', async (req, res) => {
  try {
    const audioBase64 = req.body?.audioBase64 || req.body?.base64;
    const mimeType = req.body?.mimeType || req.body?.mime || 'audio/webm';
    const language = req.body?.language || 'en';
    const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim() || DEFAULT_WS;
    const result = await transcribeSpeechWithGroq({ audioBase64, mimeType, language });

    if (result.transcript && audioBase64) {
      try {
        const file = await saveBrandDnaBinary({
          workspaceId,
          name: `voice-note-${Date.now()}.webm`,
          mime: mimeType,
          size: Math.ceil((String(audioBase64).length * 3) / 4),
          base64: audioBase64,
          category: 'voice_note',
          transcript: result.transcript,
        });
        const ctx = (await readBrandContext(workspaceId)) || {};
        const prev = String(ctx.voiceTranscript || '').trim();
        await writeBrandContext(workspaceId, {
          voiceTranscript: prev ? `${prev}\n\n${result.transcript}` : result.transcript,
        });
        result.fileId = file.id;
      } catch (storeErr) {
        console.warn('[voicebot/stt] store skipped:', storeErr.message);
      }
    }

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[voicebot/stt]', err);
    res.status(400).json({ ok: false, error: err.message || 'Transcription failed', transcript: '' });
  }
});

export default router;
