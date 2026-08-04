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
import { runMarketResearch } from '../services/marketResearch.js';
import { apifyToken, MARQQ_APIFY_ACTORS } from '../services/apifyClient.js';
import { fetchWebsiteSignals } from '../services/apifyWebsiteCrawl.js';
import { scrapeCompetitorAds } from '../services/apifyAdsIntel.js';
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
  goLiveProspect,
  getWhatsAppTemplatesForCompany,
  getWhatsAppDeliveryForRun,
  ingestWhatsAppWebhook,
  pollWhatsAppStatuses,
  generateRunEmailSequence,
  setRunEmailSequence,
  processDueOutreachSends,
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
  createLandingRun,
  getLandingRun,
  generateLandingPage,
  patchLandingPage,
  approveLandingPage,
  publishLandingPage,
} from '../services/landingStudio.js';
import {
  createLeadMagnetRun,
  getLeadMagnetRun,
  designLeadMagnet,
  generateLeadMagnetPage,
  patchLeadMagnetPage,
  approveLeadMagnet,
  publishLeadMagnet,
  captureLeadMagnetSubmission,
} from '../services/leadMagnetStudio.js';
import {
  createSocialRun,
  getSocialRun,
  runSocialBrief,
  runSocialCompose,
  patchSocialPost,
  approveSocialRun,
  goLiveSocialPost,
  getSocialPublishReadiness,
  executeSocialGoLive,
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
  listDeploymentsAsync,
  listScheduledAutomations,
  loadAgentOsProfile,
  loadAgentOsProfileAsync,
  saveAgentOsProfile,
  setAgentExecutionMode,
} from '../services/agentOsStore.js';
import { normalizeExecutionMode } from '../services/executionMode.js';
import { resolveComposioEntityIds } from '../lib/composioEntities.js';
import {
  getControlLoop,
  measureControlLoop,
  diagnoseControlLoop,
  proposeControlLoopInterventions,
  decideControlLoopIntervention,
  refreshControlLoopRoster,
} from '../services/controlLoopStore.js';
import {
  executeAgentRun,
  processDeploymentQueueTick,
  startDeploymentScheduler,
} from '../services/agentScheduler.js';
import { getAnalyticsDashboard, buildEmptyDashboard } from '../services/analyticsDashboard.js';
import { getCommandCenter } from '../services/commandCenterInsights.js';
import {
  preferencesStore,
  WORKSPACE_DEFAULT_PREFS,
  getWorkspacePreferences,
  patchWorkspacePreferences,
} from '../services/workspacePrefs.js';
import { resolveCrmDestination } from '../services/crmLeads.js';
import { resolveOutreachSpreadsheet } from '../services/googleSheetsLeads.js';
import { buildCustomer360 } from '../services/customer360.js';
import { collectTargetAccounts, runApolloSignals } from '../services/apolloSignals.js';
import {
  getWallet,
  setWalletPlan,
  getUsageSummary,
  listLedger,
  estimateFeatureCredits,
  FEATURE_ESTIMATES,
  PLAN_CREDITS,
  PLAN_LABELS,
  CREDIT_USD,
  hydrateWalletFromSupabase,
  meteredGroqChat,
  isInsufficientCredits,
  sendCreditsError,
} from '../services/credits/index.js';
import workspacesRouter from './workspaces.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { useSupabasePersistence } from '../lib/persistence.js';
import {
  upsertGtmModule,
  getActiveGtmModule,
  listGtmModules,
  lockGtmStrategy,
  createGtmModule,
  activateGtmModule,
  patchGtmModule,
  getGtmModuleById,
  GTM_MODULE_TYPES,
} from '../services/gtmModules.js';
import {
  loadAskMarqqChat,
  appendAskMarqqMessages,
} from '../services/askMarqqConversations.js';
import { upsertCompanyFromBrand, loadCompanyBrand } from '../services/companiesStore.js';
import { persistDeploymentToSupabase } from '../services/agentSupabase.js';
import { generateFullStrategyDocument } from '../services/gtmFullStrategy.js';
import {
  listScheduledContent,
  distributeContent,
  rescheduleContent,
  cancelScheduledContent,
} from '../services/contentCalendar.js';
import { getSupabaseWriteClient } from '../lib/supabase.js';

const router = express.Router();
const DEFAULT_WS = 'marqq-ws-1';

function handleStudioError(res, err, label, fallback) {
  if (isInsufficientCredits(err)) return sendCreditsError(res, err);
  console.error(label, err);
  return res.status(500).json({ ok: false, error: err?.message || fallback });
}


// Attach user when Bearer present (non-blocking for legacy routes)
router.use(optionalAuth);

// Marqq2-parity workspace membership API
router.use('/workspaces', workspacesRouter);

// Ensure scheduler is up even when API is imported by tests/smokes
startDeploymentScheduler();

/** GET /api/gtm/modules — list modules for workspace */
router.get('/gtm/modules', async (req, res) => {
  const workspaceId = String(req.query.workspaceId || '').trim();
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
  const modules = await listGtmModules(workspaceId);
  res.json({ ok: true, modules, types: GTM_MODULE_TYPES, persistence: useSupabasePersistence() });
});

/** GET /api/gtm/modules/active — active module (wizard hydrate) */
router.get('/gtm/modules/active', async (req, res) => {
  const workspaceId = String(req.query.workspaceId || '').trim();
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
  const module = await getActiveGtmModule(workspaceId);
  res.json({ ok: true, module });
});

/** POST /api/gtm/modules — create a NEW module (product / service / app / business_line) */
router.post('/gtm/modules', async (req, res) => {
  const workspaceId = String(req.body?.workspaceId || '').trim();
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
  const result = await createGtmModule({
    workspaceId,
    userId: req.authUserId || null,
    companyId: req.body?.companyId || null,
    name: req.body?.name,
    moduleType: req.body?.moduleType || req.body?.module_type,
    sourceContext: req.body?.sourceContext || req.body?.source_context || {},
    active: req.body?.active !== false,
  });
  if (!result.ok) return res.status(503).json(result);
  res.status(201).json(result);
});

/** PUT /api/gtm/modules — upsert wizard draft on a module (or active) */
router.put('/gtm/modules', async (req, res) => {
  const workspaceId = String(req.body?.workspaceId || '').trim();
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
  const result = await upsertGtmModule({
    workspaceId,
    userId: req.authUserId || null,
    moduleId: req.body?.moduleId || null,
    name: req.body?.name,
    moduleType: req.body?.moduleType || req.body?.module_type,
    status: req.body?.status || 'in_progress',
    profile: req.body?.profile || {},
    sectionState: req.body?.sectionState || req.body?.section_state || {},
    sourceContext: req.body?.sourceContext || req.body?.source_context || {},
    active: req.body?.active === true,
  });
  if (!result.ok) return res.status(503).json(result);
  res.json(result);
});

/** PATCH /api/gtm/modules/:id — rename / type / set active */
router.patch('/gtm/modules/:id', async (req, res) => {
  const moduleId = String(req.params.id || '').trim();
  const workspaceId = String(req.body?.workspaceId || req.query.workspaceId || '').trim();
  if (!moduleId) return res.status(400).json({ error: 'module id required' });

  if (req.body?.active === true) {
    const result = await activateGtmModule({ workspaceId, moduleId });
    if (!result.ok) return res.status(result.error === 'Module not found' ? 404 : 503).json(result);
    return res.json(result);
  }

  const result = await patchGtmModule({
    workspaceId: workspaceId || null,
    moduleId,
    name: req.body?.name,
    moduleType: req.body?.moduleType || req.body?.module_type,
    status: req.body?.status,
    active: typeof req.body?.active === 'boolean' ? req.body.active : undefined,
    profile: req.body?.profile,
    sectionState: req.body?.sectionState || req.body?.section_state,
    sourceContext: req.body?.sourceContext || req.body?.source_context,
  });
  if (!result.ok) return res.status(result.error === 'Module not found' ? 404 : 503).json(result);
  res.json(result);
});

/** GET /api/gtm/modules/:id — one module */
router.get('/gtm/modules/:id', async (req, res) => {
  const moduleId = String(req.params.id || '').trim();
  const workspaceId = String(req.query.workspaceId || '').trim();
  if (!moduleId) return res.status(400).json({ error: 'module id required' });
  const module = await getGtmModuleById(workspaceId || null, moduleId);
  if (!module) return res.status(404).json({ error: 'Module not found' });
  res.json({ ok: true, module });
});

/** POST /api/gtm/modules/lock — lock strategy as ready+active */
router.post('/gtm/modules/lock', async (req, res) => {
  const workspaceId = String(req.body?.workspaceId || '').trim();
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
  const result = await lockGtmStrategy({
    workspaceId,
    userId: req.authUserId || null,
    moduleId: req.body?.moduleId || null,
    wizardState: req.body?.wizardState || req.body,
  });
  if (!result.ok) return res.status(503).json(result);
  res.json(result);
});

/** GET /api/ask-marqq/chat — load persisted Ask Marqq channel history */
router.get('/ask-marqq/chat', async (req, res) => {
  const workspaceId = String(req.query.workspaceId || '').trim();
  const channel = String(req.query.channel || '').trim();
  const moduleId = String(req.query.moduleId || 'active').trim() || 'active';
  if (!workspaceId || !channel) {
    return res.status(400).json({ error: 'workspaceId and channel required' });
  }
  const result = await loadAskMarqqChat({
    workspaceId,
    userId: req.authUserId || null,
    channel,
    moduleId,
  });
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

/** POST /api/ask-marqq/chat/messages — append user/assistant turns */
router.post('/ask-marqq/chat/messages', async (req, res) => {
  const workspaceId = String(req.body?.workspaceId || '').trim();
  const channel = String(req.body?.channel || '').trim();
  const moduleId = String(req.body?.moduleId || 'active').trim() || 'active';
  if (!workspaceId || !channel) {
    return res.status(400).json({ error: 'workspaceId and channel required' });
  }
  const result = await appendAskMarqqMessages({
    workspaceId,
    userId: req.authUserId || null,
    channel,
    moduleId,
    messages: req.body?.messages || [],
  });
  if (!result.ok) return res.status(503).json(result);
  res.json(result);
});

/** POST /api/ask-marqq/chat/complete — metered Groq compound chat (server-side) */
router.post('/ask-marqq/chat/complete', async (req, res) => {
  try {
    const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim();
    const systemPrompt = String(req.body?.systemPrompt || req.body?.system || '').trim();
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const payloadMessages = [];
    if (systemPrompt) payloadMessages.push({ role: 'system', content: systemPrompt });
    for (const m of messages) {
      if (!m?.role || m.content == null) continue;
      payloadMessages.push({ role: m.role, content: String(m.content) });
    }
    if (!payloadMessages.length) {
      return res.status(400).json({ ok: false, error: 'messages required' });
    }
    const model = req.body?.model || process.env.GROQ_CHAT_MODEL || 'groq/compound-mini';
    const result = await meteredGroqChat({
      workspaceId,
      feature: 'ask_marqq',
      model,
      messages: payloadMessages,
      temperature: Number(req.body?.temperature) || 0.6,
      max_tokens: Number(req.body?.max_tokens) || 2048,
      json: false,
      meta: { channel: req.body?.channel || null },
    });
    if (result.insufficientCredits) {
      return sendCreditsError(res, result);
    }
    if (!result.ok) {
      return res.status(502).json({ ok: false, error: result.error || 'Groq failed' });
    }
    const executedTools = result.raw?.choices?.[0]?.message?.executed_tools || result.raw?.executed_tools || [];
    const usedSearch = Array.isArray(executedTools)
      ? executedTools.some((t) => /search|browser|web/i.test(String(t?.type || t?.name || '')))
      : false;
    res.json({
      ok: true,
      content: result.content,
      model: result.model,
      usedSearch,
      executedTools,
      credits: result.credits,
      usage: result.usage,
    });
  } catch (err) {
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
    console.error('[ask-marqq/complete]', err);
    res.status(500).json({ ok: false, error: err?.message || 'Ask Marqq failed' });
  }
});


/** POST /api/gtm/strategy/generate — full 16-section doc with Marqq2 skill playbooks */
router.post('/gtm/strategy/generate', async (req, res) => {
  try {
    const result = await generateFullStrategyDocument(req.body || {});
    res.json(result);
  } catch (err) {
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
    console.error('[gtm/strategy/generate]', err);
    res.status(500).json({ ok: false, error: err.message || 'Strategy generation failed' });
  }
});

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
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
    console.error('[gtm/marketing-ideas/generate]', err);
    res.status(500).json({ ok: false, error: err.message || 'Marketing ideas generation failed' });
  }
});

/** POST /api/market/research — live competitor / category refresh (Compound Mini) */
router.post('/market/research', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await runMarketResearch({
      companyName: body.companyName || body.company || '',
      website: body.website || '',
      niche: body.niche || '',
      icp: body.icp || '',
      marketBrief: body.marketBrief || body.brief || '',
      workspaceId: body.workspaceId || body.companyId || DEFAULT_WS,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[market/research]', err);
    res.status(500).json({ ok: false, error: err.message || 'Market research failed' });
  }
});

/** GET /api/apify/status — token + wired Marqq2 actors */
router.get('/apify/status', (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(apifyToken()),
    actors: MARQQ_APIFY_ACTORS,
  });
});

/** POST /api/apify/website-signals — apify/website-content-crawler */
router.post('/apify/website-signals', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await fetchWebsiteSignals({
      website: body.website || body.url || '',
      domain: body.domain || '',
      companyName: body.companyName || body.company || '',
    });
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error('[apify/website-signals]', err);
    res.status(500).json({ ok: false, error: err.message || 'Website crawl failed' });
  }
});

/** POST /api/apify/competitor-ads — LinkedIn / Facebook / Google ad library actors */
router.post('/apify/competitor-ads', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await scrapeCompetitorAds({
      competitors: body.competitors || [],
      platforms: body.platforms,
      country: body.country,
      limit: body.limit,
    });
    const status = result.ok || (result.ads || []).length ? 200 : 400;
    res.status(status).json(result);
  } catch (err) {
    console.error('[apify/competitor-ads]', err);
    res.status(500).json({ ok: false, error: err.message || 'Competitor ads scrape failed', ads: [], results: [] });
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
  const campaigns = Array.isArray(db.campaigns) ? db.campaigns : [];
  res.json({ campaigns });
});

// POST create campaign
router.post('/campaigns', (req, res) => {
  const { name, objective, channels, budget } = req.body;
  const db = updateDb(state => {
    const newCamp = {
      id: `c${(state.campaigns || []).length + 1}`,
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
    return { ...state, campaigns: [newCamp, ...(state.campaigns || [])] };
  });
  res.json({ ok: true, campaign: db.campaigns[0], campaigns: db.campaigns });
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
router.get('/agents/deployments', async (req, res) => {
  const workspaceId = String(req.query?.workspaceId || DEFAULT_WS).trim();
  const status = req.query?.status ? String(req.query.status) : null;
  const deployments = await listDeploymentsAsync({ workspaceId, status });
  res.json({ ok: true, deployments });
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
  void persistDeploymentToSupabase(entry);
  processDeploymentQueueTick().catch(() => {});
  res.json({ ok: true, deployment: entry });
});

/** PATCH /api/agents/deployments/:id — pause | resume | stop | reschedule */
router.patch('/agents/deployments/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  const action = String(req.body?.action || '').toLowerCase();
  let updated = null;
  updateDb((state) => {
    const queue = (state.agent_deployments || []).map((row) => {
      if (String(row.id) !== id) return row;
      if (action === 'pause') updated = { ...row, status: 'paused', updatedAt: new Date().toISOString() };
      else if (action === 'resume') {
        updated = {
          ...row,
          status: 'active',
          scheduledFor: row.scheduledFor || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else if (action === 'stop') {
        updated = { ...row, status: 'stopped', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      } else if (action === 'reschedule') {
        const scheduledFor = req.body?.scheduledFor || req.body?.publishAt;
        if (!scheduledFor) return row;
        updated = {
          ...row,
          status: ['paused', 'stopped', 'completed', 'failed'].includes(row.status) ? 'pending' : row.status || 'pending',
          scheduledFor: new Date(scheduledFor).toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else {
        updated = { ...row, ...req.body, id: row.id, updatedAt: new Date().toISOString() };
      }
      if (updated) void persistDeploymentToSupabase(updated);
      return updated || row;
    });
    return { ...state, agent_deployments: queue };
  });
  if (!updated) return res.status(404).json({ ok: false, error: 'Deployment not found' });
  res.json({ ok: true, deployment: updated });
});

/** Content calendar (Marqq2 content-studio scheduled posts) */
router.get('/content-studio/scheduled', async (req, res) => {
  try {
    const companyId = String(req.query.companyId || req.query.workspaceId || '').trim();
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });
    const result = await listScheduledContent(companyId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to list scheduled content' });
  }
});

router.post('/content-studio/distribute', async (req, res) => {
  try {
    const result = await distributeContent({
      companyId: req.body?.companyId || req.body?.workspaceId,
      action: req.body?.action || req.body?.mode,
      live: req.body?.live,
      platform: req.body?.platform,
      publishAt: req.body?.publishAt,
      payload: req.body?.payload || {},
      connector: req.body?.connector || null,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Distribute failed' });
  }
});

router.patch('/content-studio/scheduled/:id', async (req, res) => {
  try {
    const companyId = String(req.body?.companyId || req.query?.companyId || '').trim();
    const item = await rescheduleContent(req.params.id, companyId, req.body?.publishAt);
    res.json({ ok: true, item });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Reschedule failed' });
  }
});

router.delete('/content-studio/scheduled/:id', async (req, res) => {
  try {
    const companyId = String(req.query.companyId || req.body?.companyId || '').trim();
    const item = await cancelScheduledContent(req.params.id, companyId);
    res.json({ ok: true, item });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Cancel failed' });
  }
});

/** Competitor alerts webhook (n8n / monitoring) — Marqq2 parity */
router.post('/competitor-alerts/webhook', async (req, res) => {
  try {
    const sb = getSupabaseWriteClient();
    if (!sb) return res.status(503).json({ error: 'Database not available' });
    const body = req.body || {};
    const userId = body.user_id || body.userId;
    if (!userId) return res.status(400).json({ error: 'user_id required' });
    const row = {
      user_id: userId,
      workspace_id: body.workspace_id || body.workspaceId || null,
      competitor_name: body.competitor_name || body.competitorName || 'Competitor',
      alert_type: body.alert_type || body.alertType || 'news',
      title: body.title || 'Competitor update',
      summary: body.summary || '',
      full_content: body.full_content || body.fullContent || null,
      source_url: body.source_url || body.sourceUrl || '',
      source_domain: body.source_domain || body.sourceDomain || null,
      published_at: body.published_at || body.publishedAt || null,
      detected_at: body.detected_at || body.detectedAt || new Date().toISOString(),
      sentiment: body.sentiment || 'neutral',
      priority: body.priority || 'medium',
      read: false,
      dismissed: false,
      archived: false,
      content_hash: body.content_hash || body.contentHash || null,
    };
    const { data, error } = await sb.from('competitor_alerts').insert(row).select().single();
    if (error) {
      if (error.code === '42P01') {
        return res.status(503).json({ error: 'competitor_alerts table missing — run Marqq2 migrations' });
      }
      return res.status(500).json({ error: error.message });
    }
    res.json({ ok: true, alert: data });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Webhook failed' });
  }
});

router.post('/agents/scheduler/tick', async (req, res) => {
  const force = Boolean(req.body?.force);
  const workspaceId = String(req.body?.workspaceId || req.query?.workspaceId || '').trim() || null;
  const result = await processDeploymentQueueTick({ force, workspaceId });
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
    const revisedSectionId = String(req.body?.revisedSectionId || '').trim() || null;
    const result = activateStrategyExecution({
      strategy: req.body?.strategy,
      agentOs: req.body?.agentOs || null,
      workspaceId,
      companyId: workspaceId,
      revisedSectionId,
    });
    // Kick an immediate tick so drafts appear without waiting a full minute
    processDeploymentQueueTick({ force: true, workspaceId }).catch(() => {});
    res.json(result);
  } catch (err) {
    console.error('[strategy/activate]', err);
    res.status(400).json({ ok: false, error: err?.message || 'Activate failed' });
  }
});

router.get('/agent-os', async (req, res) => {
  const workspaceId = String(req.query?.workspaceId || DEFAULT_WS).trim();
  const os = await loadAgentOsProfileAsync(workspaceId);
  res.json({ ok: true, agentOs: os });
});

router.post('/agent-os', (req, res) => {
  const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim();
  const saved = saveAgentOsProfile(req.body?.agentOs || req.body, workspaceId);
  res.json({ ok: true, agentOs: saved });
});

/** PATCH/POST /api/agent-os/execution-mode — human_gated | autonomous */
router.post('/agent-os/execution-mode', (req, res) => {
  try {
    const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim();
    const mode = normalizeExecutionMode(
      req.body?.executionMode ?? req.body?.execution_mode ?? req.body?.mode
    );
    const result = setAgentExecutionMode(workspaceId, mode, {
      approvePending: req.body?.approvePending !== false,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || 'Failed to set execution mode' });
  }
});

router.patch('/agent-os/execution-mode', (req, res) => {
  try {
    const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim();
    const mode = normalizeExecutionMode(
      req.body?.executionMode ?? req.body?.execution_mode ?? req.body?.mode
    );
    const result = setAgentExecutionMode(workspaceId, mode, {
      approvePending: req.body?.approvePending !== false,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || 'Failed to set execution mode' });
  }
});

/** ── Credits / metering (Groq tokens + Fal USD → credits) ── */
router.get('/credits', async (req, res) => {
  const workspaceId = String(req.query?.workspaceId || DEFAULT_WS).trim();
  try {
    await hydrateWalletFromSupabase(workspaceId);
  } catch {
    /* local wallet fallback */
  }
  const summary = getUsageSummary(workspaceId);
  res.json({
    ok: true,
    workspaceId,
    creditUsd: CREDIT_USD,
    plans: PLAN_CREDITS,
    planLabels: PLAN_LABELS,
    featureEstimates: FEATURE_ESTIMATES,
    ...summary,
  });
});

router.get('/credits/ledger', (req, res) => {
  const workspaceId = String(req.query?.workspaceId || DEFAULT_WS).trim();
  const limit = Number(req.query?.limit || 50);
  res.json({ ok: true, workspaceId, ledger: listLedger(workspaceId, { limit }) });
});

router.post('/credits/plan', (req, res) => {
  try {
    const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim();
    const plan = req.body?.plan || 'workspace';
    const wallet = setWalletPlan(workspaceId, plan);
    res.json({ ok: true, wallet });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || 'Failed to set plan' });
  }
});

router.post('/credits/estimate', (req, res) => {
  const feature = req.body?.feature || 'groq_chat';
  const estimatedCredits = estimateFeatureCredits(feature, {
    estimatedCredits: req.body?.estimatedCredits,
  });
  const wallet = getWallet(String(req.body?.workspaceId || DEFAULT_WS).trim());
  res.json({
    ok: true,
    feature,
    estimatedCredits,
    wallet,
    canAfford:
      wallet.credits_remaining === -1 ||
      wallet.credits_remaining - (wallet.credits_reserved || 0) >= estimatedCredits,
  });
});

/** ── Control loop: Measure → Diagnose → Recommend → Approve → Execute (Marqq2) ── */
router.get('/control-loop', async (req, res) => {
  try {
    const workspaceId = String(req.query?.workspaceId || DEFAULT_WS).trim();
    const data = await getControlLoop(workspaceId);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err?.message || 'Failed to load control loop' });
  }
});

router.post('/control-loop/measure', async (req, res) => {
  try {
    const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim();
    const data = await measureControlLoop(workspaceId, {
      period: req.body?.period,
      actual: req.body?.actual,
      funnelActuals: req.body?.funnelActuals,
    });
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, error: err?.message || 'Measure failed' });
  }
});

router.post('/control-loop/diagnose', async (req, res) => {
  try {
    const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim();
    const data = await diagnoseControlLoop(workspaceId, { notes: req.body?.notes });
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err?.message || 'Diagnose failed' });
  }
});

router.post('/control-loop/interventions', async (req, res) => {
  try {
    const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim();
    const data = await proposeControlLoopInterventions(workspaceId, {
      diagnosis: req.body?.diagnosis,
    });
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err?.message || 'Propose failed' });
  }
});

router.post('/control-loop/interventions/:interventionId/decide', async (req, res) => {
  try {
    const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim();
    const data = await decideControlLoopIntervention(
      workspaceId,
      req.params.interventionId,
      req.body?.decision
    );
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err?.message || 'Decide failed' });
  }
});

router.post('/control-loop/roster/refresh', async (req, res) => {
  try {
    const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim();
    const data = await refreshControlLoopRoster(workspaceId);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err?.message || 'Roster refresh failed' });
  }
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

/** PATCH /api/automations/scheduled/:id — pause / resume */
router.patch('/automations/scheduled/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  const companyId = String(req.body?.companyId || req.query?.companyId || DEFAULT_WS).trim();
  let updated = null;
  updateDb((state) => {
    const autos = (state.scheduled_automations || []).map((row) => {
      if (String(row.automation_id || row.id) !== id) return row;
      if (companyId && row.company_id && row.company_id !== companyId) return row;
      updated = {
        ...row,
        active: req.body?.active != null ? Boolean(req.body.active) : !row.active,
        updated_at: new Date().toISOString(),
      };
      return updated;
    });
    return { ...state, scheduled_automations: autos };
  });
  if (!updated) return res.status(404).json({ ok: false, error: 'Automation not found' });
  res.json({ ok: true, automation: updated });
});

/** POST /api/automations/scheduled/:id/run — force-due + tick (enqueue deployment) */
router.post('/automations/scheduled/:id/run', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const companyId = String(req.body?.companyId || req.query?.companyId || DEFAULT_WS).trim();
    let found = false;
    updateDb((state) => {
      const autos = (state.scheduled_automations || []).map((row) => {
        if (String(row.automation_id || row.id) !== id) return row;
        if (companyId && row.company_id && row.company_id !== companyId) return row;
        found = true;
        return {
          ...row,
          active: true,
          next_run: new Date(Date.now() - 1000).toISOString(),
          updated_at: new Date().toISOString(),
        };
      });
      return { ...state, scheduled_automations: autos };
    });
    if (!found) return res.status(404).json({ ok: false, error: 'Automation not found' });
    const result = await processDeploymentQueueTick({ force: true, workspaceId: companyId });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Run failed' });
  }
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
        crm_sync: run.crm_sync || null,
      },
      prospects: run.prospects,
      crm_sync: run.crm_sync || null,
    });
  } catch (err) {
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
    console.error('[outreach/runs]', err);
    res.status(500).json({ ok: false, error: err.message || 'Fetch prospects failed' });
  }
});

router.get('/outreach/runs/:runId', async (req, res) => {
  const run = await getOutreachRun(req.params.runId);
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
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
    console.error('[outreach/copy]', err);
    res.status(500).json({ ok: false, error: err.message || 'Copy generation failed' });
  }
});

router.post('/outreach/runs/:runId/prospects/:prospectId/gmail-draft', async (req, res) => {
  try {
    const result = await saveGmailDraft(req.params.runId, req.params.prospectId, req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
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
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
    console.error('[outreach/send-now]', err);
    res.status(500).json({ ok: false, error: err.message || 'Send failed' });
  }
});

/** Instantly / HeyReach / WhatsApp go-live (delivery: draft|live) */
router.post('/outreach/runs/:runId/prospects/:prospectId/go-live', async (req, res) => {
  try {
    const result = await goLiveProspect(req.params.runId, req.params.prospectId, req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[outreach/go-live]', err);
    res.status(400).json({ ok: false, error: err.message || 'Go-live failed' });
  }
});

/** Generate 4-step email sequence (first + 3 follow-ups) for Instantly / Gmail drip */
router.post('/outreach/runs/:runId/generate-sequence', async (req, res) => {
  try {
    const result = await generateRunEmailSequence(req.params.runId, req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[outreach/generate-sequence]', err);
    res.status(400).json({ ok: false, error: err.message || 'Sequence generation failed' });
  }
});

router.put('/outreach/runs/:runId/sequence', (req, res) => {
  try {
    const emails = req.body?.sequence_emails || req.body?.emails || req.body;
    const result = setRunEmailSequence(req.params.runId, emails);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/** Process due Gmail drip sends (also runs on a 60s scheduler) */
router.post('/outreach/process-due', async (req, res) => {
  try {
    const result = await processDueOutreachSends();
    res.json({ ok: true, ...result });
  } catch (err) {
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
    console.error('[outreach/process-due]', err);
    res.status(500).json({ ok: false, error: err.message || 'Process-due failed' });
  }
});

/** Approved WhatsApp message templates for the connected WABA */
router.get('/outreach/whatsapp/templates', async (req, res) => {
  try {
    const companyId = String(req.query.companyId || 'marqq-ws-1').trim();
    const data = await getWhatsAppTemplatesForCompany(companyId);
    res.json({ ok: !data.error, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Template list failed', templates: [] });
  }
});

/** Delivery statuses + inbound for a run (Meta webhook + in-memory index) */
router.get('/outreach/runs/:runId/whatsapp/statuses', (req, res) => {
  try {
    res.json({ ok: true, ...getWhatsAppDeliveryForRun(req.params.runId) });
  } catch (err) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

router.post('/outreach/whatsapp/poll-statuses', async (req, res) => {
  try {
    const companyId = String(req.body?.companyId || req.query.companyId || 'marqq-ws-1').trim();
    const result = await pollWhatsAppStatuses(companyId);
    res.json({ ok: Boolean(result.ok), ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Poll failed' });
  }
});

router.post('/outreach/runs/:runId/poll-gmail-replies', async (req, res) => {
  try {
    const result = await pollGmailReplies(req.params.runId);
    res.json({ ok: true, ...result });
  } catch (err) {
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
    console.error('[outreach/poll-gmail-replies]', err);
    res.status(500).json({ ok: false, error: err.message || 'Poll failed' });
  }
});

router.post('/outreach/runs/:runId/replies/:replyId/regenerate-draft', async (req, res) => {
  try {
    const result = await regenerateReplyDraft(req.params.runId, req.params.replyId);
    res.json({ ok: true, ...result });
  } catch (err) {
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
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
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
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
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
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
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
    console.error('[content/research]', err);
    res.status(500).json({ ok: false, error: err.message || 'Research failed' });
  }
});

router.post('/content/runs/:runId/brief', async (req, res) => {
  try {
    const result = await runContentBrief(req.params.runId, req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
    console.error('[content/brief]', err);
    res.status(500).json({ ok: false, error: err.message || 'Brief failed' });
  }
});

router.post('/content/runs/:runId/draft', async (req, res) => {
  try {
    const result = await runContentDraft(req.params.runId);
    res.json({ ok: true, ...result });
  } catch (err) {
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
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

// ── Landing Pages (Tara + Sam · page-cro / copywriting / form-cro) ───────────

router.post('/landing/runs', (req, res) => {
  try {
    const run = createLandingRun(req.body || {});
    res.json({ ok: true, runId: run.id, run });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/landing/runs/:runId', (req, res) => {
  const run = getLandingRun(req.params.runId);
  if (!run) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, run });
});

router.post('/landing/runs/:runId/generate', async (req, res) => {
  try {
    const run = await generateLandingPage(req.params.runId, req.body || {});
    res.json({ ok: true, run });
  } catch (err) {
    console.error('[landing/generate]', err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.patch('/landing/runs/:runId/page', (req, res) => {
  try {
    const run = patchLandingPage(req.params.runId, req.body || {});
    res.json({ ok: true, run });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/landing/runs/:runId/approve', (req, res) => {
  try {
    const run = approveLandingPage(req.params.runId);
    res.json({ ok: true, run });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/landing/runs/:runId/publish', async (req, res) => {
  try {
    const result = await publishLandingPage(req.params.runId, {
      publish_live: req.body?.publish_live === true,
      ...req.body,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[landing/publish]', err);
    res.status(400).json({ ok: false, error: err.message, publish: err.publish || null });
  }
});

// ── Lead Magnets (Riya concept · Tara/Sam gated LP) ─────────────────────────

router.post('/lead-magnets/runs', (req, res) => {
  try {
    const run = createLeadMagnetRun(req.body || {});
    res.json({ ok: true, runId: run.id, run });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/lead-magnets/runs/:runId', (req, res) => {
  const run = getLeadMagnetRun(req.params.runId);
  if (!run) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, run });
});

router.post('/lead-magnets/runs/:runId/design', async (req, res) => {
  try {
    const run = await designLeadMagnet(req.params.runId, req.body || {});
    res.json({ ok: true, run });
  } catch (err) {
    console.error('[lead-magnets/design]', err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/lead-magnets/runs/:runId/generate', async (req, res) => {
  try {
    const run = await generateLeadMagnetPage(req.params.runId, req.body || {});
    res.json({ ok: true, run });
  } catch (err) {
    console.error('[lead-magnets/generate]', err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.patch('/lead-magnets/runs/:runId/page', (req, res) => {
  try {
    const run = patchLeadMagnetPage(req.params.runId, req.body || {});
    res.json({ ok: true, run });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/lead-magnets/runs/:runId/approve', (req, res) => {
  try {
    const run = approveLeadMagnet(req.params.runId);
    res.json({ ok: true, run });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/lead-magnets/runs/:runId/publish', async (req, res) => {
  try {
    const result = await publishLeadMagnet(req.params.runId, {
      publish_live: req.body?.publish_live === true,
      ...req.body,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[lead-magnets/publish]', err);
    res.status(400).json({ ok: false, error: err.message, publish: err.publish || null });
  }
});

/** Public lead magnet form capture → Sheets/CRM */
router.post('/leads/capture', async (req, res) => {
  try {
    const result = await captureLeadMagnetSubmission(req.body || {});
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    console.error('[leads/capture]', err);
    res.status(500).json({ ok: false, error: err.message || 'Capture failed' });
  }
});

// ── Social Studio (Kiran text) ──────────────────────────────────────────────

router.post('/social/runs', async (req, res) => {
  try {
    const run = await createSocialRun(req.body || {});
    res.json({ ok: true, runId: run.id, run });
  } catch (err) {
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
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
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
    console.error('[social/brief]', err);
    res.status(500).json({ ok: false, error: err.message || 'Brief failed' });
  }
});

router.post('/social/runs/:runId/compose', async (req, res) => {
  try {
    const result = await runSocialCompose(req.params.runId);
    res.json({ ok: true, ...result });
  } catch (err) {
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
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

/** Per-post Composio publish (LinkedIn / IG / FB / X / YouTube) */
router.post('/social/runs/:runId/posts/:postId/go-live', async (req, res) => {
  try {
    const result = await goLiveSocialPost(req.params.runId, req.params.postId, req.body || {});
    res.json({ ok: Boolean(result.result?.ok), ...result });
  } catch (err) {
    console.error('[social/go-live]', err);
    res.status(400).json({ ok: false, error: err.message || 'Social go-live failed' });
  }
});

router.get('/social/publish-readiness', async (req, res) => {
  try {
    const companyId = String(req.query.companyId || 'marqq-ws-1').trim();
    const data = await getSocialPublishReadiness(companyId);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** Agent / generic outcome go-live for organic social kinds */
router.post('/outcomes/go-live', async (req, res) => {
  try {
    const body = req.body || {};
    const kind = String(body.kind || '').toLowerCase();
    const socialKinds = new Set(['linkedin', 'instagram', 'facebook', 'twitter', 'x', 'youtube', 'social']);
    if (!socialKinds.has(kind)) {
      return res.status(400).json({
        ok: false,
        error: `This endpoint publishes organic social only (${[...socialKinds].join(', ')}). Got: ${kind || '(empty)'}`,
      });
    }
    const result = await executeSocialGoLive({
      kind,
      workspaceId: body.workspaceId || body.companyId || 'marqq-ws-1',
      companyId: body.companyId || body.workspaceId || 'marqq-ws-1',
      preferredConnector: body.preferredConnector,
      delivery: body.delivery || 'live',
      payload: body.payload || body,
    });
    res.json({ ok: Boolean(result.ok), ...result });
  } catch (err) {
    console.error('[outcomes/go-live]', err);
    res.status(500).json({ ok: false, error: err.message || 'Go-live failed' });
  }
});

// ── Creative Studio (image + video) ─────────────────────────────────────────

router.post('/creative/runs', async (req, res) => {
  try {
    const run = await createCreativeRun(req.body || {});
    res.json({ ok: true, runId: run.id, run });
  } catch (err) {
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
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
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
    console.error('[creative/concept]', err);
    res.status(500).json({ ok: false, error: err.message || 'Concept failed' });
  }
});

router.post('/creative/runs/:runId/image', async (req, res) => {
  try {
    const result = await runCreativeImage(req.params.runId);
    res.json({ ok: true, ...result });
  } catch (err) {
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
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
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
    console.error('[creative/video]', err);
    res.status(500).json({ ok: false, error: err.message || 'Video failed' });
  }
});

router.post('/creative/runs/:runId/video/poll', async (req, res) => {
  try {
    const result = await pollCreativeVideo(req.params.runId);
    res.json({ ok: true, ...result });
  } catch (err) {
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
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
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
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
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
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
    if (isInsufficientCredits(err)) return sendCreditsError(res, err);
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
  const tasks = Array.isArray(db.tasks) ? db.tasks : [];
  res.json({ tasks });
});

router.patch('/tasks/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  let updated = null;
  const db = updateDb((state) => {
    const tasks = (state.tasks || []).map((t) => {
      if (String(t.id) !== id) return t;
      updated = { ...t, ...req.body, id: t.id, updatedAt: new Date().toISOString() };
      return updated;
    });
    return { ...state, tasks };
  });
  if (!updated) return res.status(404).json({ ok: false, error: 'Task not found' });
  res.json({ ok: true, task: updated, tasks: db.tasks });
});

// ── Composio Integration Endpoints ──────────────────────────────
const COMPOSIO_V3 = 'https://backend.composio.dev/api/v3';

const CONNECTOR_APP_MAP = {
  google_ads: 'googleads',
  meta_ads: 'metaads',
  linkedin_ads: 'linkedinads',
  linkedin: 'linkedin',
  facebook: 'facebook',
  instagram: 'instagram',
  twitter: 'twitter',
  youtube: 'youtube',
  hubspot: 'hubspot',
  salesforce: 'salesforce',
  ga4: 'google_analytics',
  gsc: 'google_search_console',
  google_sheets: 'googlesheets',
  google_drive: 'googledrive',
  instantly: 'instantly',
  heyreach: 'heyreach',
  whatsapp: 'whatsapp',
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
  facebook: 'COMPOSIO_FACEBOOK_AUTH_CONFIG_ID',
  instagram: 'COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID',
  twitter: 'COMPOSIO_TWITTER_AUTH_CONFIG_ID',
  youtube: 'COMPOSIO_YOUTUBE_AUTH_CONFIG_ID',
  hubspot: 'COMPOSIO_HUBSPOT_AUTH_CONFIG_ID',
  salesforce: 'COMPOSIO_SALESFORCE_AUTH_CONFIG_ID',
  ga4: 'COMPOSIO_GOOGLE_ANALYTICS_AUTH_CONFIG_ID',
  gsc: 'COMPOSIO_GOOGLE_SEARCH_CONSOLE_AUTH_CONFIG_ID',
  google_sheets: 'COMPOSIO_GOOGLE_SHEETS_AUTH_CONFIG_ID',
  google_drive: 'COMPOSIO_GOOGLE_DRIVE_AUTH_CONFIG_ID',
  instantly: 'COMPOSIO_INSTANTLY_AUTH_CONFIG_ID',
  heyreach: 'COMPOSIO_HEYREACH_AUTH_CONFIG_ID',
  whatsapp: 'COMPOSIO_WHATSAPP_AUTH_CONFIG_ID',
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

/** Extra Composio user_ids — opt-in demo sharing only (see COMPOSIO_SHARE_DEMO_ENTITIES). */
function getComposioEntityAliases(companyId) {
  return resolveComposioEntityIds(companyId);
}

function mapConnectedAccounts(items, connectedMap, allowedEntityIds = null) {
  const allowed =
    Array.isArray(allowedEntityIds) && allowedEntityIds.length
      ? new Set(allowedEntityIds.map(String))
      : null;
  for (const acct of items || []) {
    const owner = String(acct.user_id || acct.userId || '').trim();
    // Composio list often ignores user_id query — enforce tenant isolation here.
    if (allowed && owner && !allowed.has(owner)) continue;
    if (allowed && !owner) continue;
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
    { id: 'facebook', name: 'Facebook', connected: false, status: 'not_connected' },
    { id: 'instagram', name: 'Instagram', connected: false, status: 'not_connected' },
    { id: 'twitter', name: 'X (Twitter)', connected: false, status: 'not_connected' },
    { id: 'youtube', name: 'YouTube', connected: false, status: 'not_connected' },
    { id: 'meta_ads', name: 'Meta Ads', connected: false, status: 'not_connected' },
    { id: 'salesforce', name: 'Salesforce CRM', connected: false, status: 'not_connected' },
    { id: 'hubspot', name: 'HubSpot CRM', connected: false, status: 'not_connected' },
    { id: 'ga4', name: 'Google Analytics', connected: false, status: 'not_connected' },
    { id: 'gsc', name: 'Google Search Console', connected: false, status: 'not_connected' },
    { id: 'google_sheets', name: 'Google Sheets', connected: false, status: 'not_connected' },
    { id: 'google_drive', name: 'Google Drive', connected: false, status: 'not_connected' },
    { id: 'instantly', name: 'Instantly', connected: false, status: 'not_connected' },
    { id: 'heyreach', name: 'HeyReach', connected: false, status: 'not_connected' },
    { id: 'whatsapp', name: 'WhatsApp', connected: false, status: 'not_connected' },
    { id: 'apollo', name: 'Apollo', connected: false, status: 'not_connected' },
    { id: 'gmail', name: 'Gmail', connected: false, status: 'not_connected' },
    { id: 'github', name: 'GitHub', connected: false, status: 'not_connected' },
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
      mapConnectedAccounts(data.items || [], connectedMap, entityIds);
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
  const authEnvKey =
    AUTH_CONFIG_ENV_KEYS[connectorId] ||
    `COMPOSIO_${String(connectorId || '').toUpperCase()}_AUTH_CONFIG_ID`;

  if (!companyId || !connectorId) {
    return res.json({ ok: false, error: 'companyId and connectorId are required' });
  }
  if (!apiKey) {
    return res.json({ ok: false, error: 'COMPOSIO_API_KEY is not configured' });
  }
  if (!authConfigId) {
    return res.json({
      ok: false,
      error: `${authEnvKey} is not configured — set it in the server environment to enable ${connectorId} OAuth`,
    });
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
        // Marqq2-style callback: popup lands here, posts success to opener, then closes
        callback_url: `${appUrl}/integrations?connected=${encodeURIComponent(connectorId)}`,
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
      preferences: { ...WORKSPACE_DEFAULT_PREFS, ...prefs },
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
 * Server hydrates durable Agent OS / control-loop; optional body fields are soft overrides.
 */
async function handleCommandCenter(req, res) {
  try {
    const companyId = String(
      req.body?.companyId || req.query.companyId || req.query.workspaceId || req.body?.workspaceId || DEFAULT_WS
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
      attainmentPct: req.body?.attainmentPct ?? null,
      recoveryRecommendation: req.body?.recoveryRecommendation || null,
      recoveryShortfall: req.body?.recoveryShortfall ?? null,
      recoveryRequiredPerPeriod: req.body?.recoveryRequiredPerPeriod ?? null,
      openInterventions: req.body?.openInterventions || null,
      highPriorityAgents: req.body?.highPriorityAgents || [],
      nextBestAction: req.body?.nextBestAction || null,
    };
    const data = await getCommandCenter({
      companyId,
      period,
      preferences: { ...WORKSPACE_DEFAULT_PREFS, ...prefs },
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
  res.json({ preferences: getWorkspacePreferences(companyId) });
});

// POST /api/integrations/preferences  { companyId, ...prefs }
router.post('/integrations/preferences', (req, res) => {
  const companyId = req.body.companyId || 'default';
  const patch = { ...(req.body || {}) };
  delete patch.companyId;
  const updated = patchWorkspacePreferences(companyId, patch);
  res.json({ ok: true, preferences: updated });
});

/** CRM destination: HubSpot / Salesforce / Google Sheets fallback */
router.get('/crm/destination', async (req, res) => {
  try {
    const companyId = String(req.query.companyId || req.query.workspaceId || 'marqq-ws-1').trim();
    const dest = await resolveCrmDestination(companyId);
    let sheets = null;
    if (dest.destination === 'google_sheets') {
      sheets = await resolveOutreachSpreadsheet(companyId, { createIfMissing: true });
    } else if (!dest.destination) {
      sheets = await resolveOutreachSpreadsheet(companyId, { createIfMissing: false });
    }
    res.json({
      ok: true,
      ...dest,
      sheets: sheets?.ok
        ? {
            spreadsheetId: sheets.spreadsheetId,
            worksheet: sheets.worksheet,
            url: `https://docs.google.com/spreadsheets/d/${sheets.spreadsheetId}`,
            created: Boolean(sheets.created),
          }
        : sheets,
      preferences: getWorkspacePreferences(companyId),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'CRM destination failed' });
  }
});

/** Customer 360 — Sheets CRM leads + outreach prospects unified */
router.get('/customer360', async (req, res) => {
  try {
    const companyId = String(req.query.companyId || req.query.workspaceId || 'marqq-ws-1').trim();
    const limit = Number(req.query.limit) || 75;
    const payload = await buildCustomer360(companyId, { limit });
    res.json(payload);
  } catch (err) {
    console.error('[customer360]', err);
    res.status(500).json({ ok: false, error: err.message || 'Customer 360 failed' });
  }
});

/** Apollo Signals — ICP account watchlist for news / jobs / org enrich */
router.get('/apollo/signals/accounts', async (req, res) => {
  try {
    const companyId = String(req.query.companyId || req.query.workspaceId || DEFAULT_WS).trim();
    const limit = Number(req.query.limit) || 15;
    const accounts = await collectTargetAccounts(companyId, { limit });
    res.json({ ok: true, companyId, accounts, count: accounts.length });
  } catch (err) {
    console.error('[apollo/signals/accounts]', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to list signal accounts' });
  }
});

router.post('/apollo/signals', async (req, res) => {
  try {
    const companyId = String(req.body?.companyId || req.body?.workspaceId || DEFAULT_WS).trim();
    const payload = await runApolloSignals({
      companyId,
      accounts: req.body?.accounts || null,
      limit: req.body?.limit,
      refresh: Boolean(req.body?.refresh),
      signalTypes: req.body?.signalTypes,
    });
    res.json(payload);
  } catch (err) {
    console.error('[apollo/signals]', err);
    res.status(err.status || 500).json({ ok: false, error: err.message || 'Apollo signals failed' });
  }
});

/** Manual CRM/Sheets sync for prospects (smoke + CRM screen) */
router.post('/crm/sync-leads', async (req, res) => {
  try {
    const companyId = String(req.body?.companyId || req.body?.workspaceId || 'marqq-ws-1').trim();
    const prospects = Array.isArray(req.body?.prospects) ? req.body.prospects : [];
    if (!prospects.length) {
      return res.status(400).json({ ok: false, error: 'prospects[] required' });
    }
    const { syncProspectsToCrm } = await import('../services/crmLeads.js');
    const run = {
      id: req.body?.runId || `crm_${Date.now()}`,
      companyId,
      workspaceId: companyId,
      companyName: req.body?.companyName || 'Nouriva AI',
      source: req.body?.source || 'crm_sync',
    };
    const result = await syncProspectsToCrm(run, prospects, {
      status: req.body?.status || 'fetched',
      next_action: req.body?.next_action || 'awaiting_copy',
      source: req.body?.source || 'crm_sync',
      channel: req.body?.channel || 'email',
    });
    res.json({ ok: Boolean(result?.ok), run, ...result });
  } catch (err) {
    console.error('[crm/sync-leads]', err);
    res.status(500).json({ ok: false, error: err.message || 'CRM sync failed' });
  }
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
      await upsertCompanyFromBrand({
        workspaceId,
        context: {
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
        },
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
        companyName: companyName || 'Your company',
        brandSummary: `${companyName || 'Company'} — ${industry || 'B2B'} for ${icp || 'target buyers'}.`,
        positioningTags: ['Clear', 'Credible', 'Execution-focused'],
        colors: ['#ff6a00', '#f2790a', '#191613'],
        fonts: 'Archivo · headings & body'
      }
    });
  }
});

// GET /api/brand-dna/context
router.get('/brand-dna/context', async (req, res) => {
  const workspaceId = String(req.query?.workspaceId || DEFAULT_WS).trim() || DEFAULT_WS;
  const context = await loadCompanyBrand(workspaceId);
  res.json({ ok: true, context: context || null });
});

// POST /api/brand-dna/context
router.post('/brand-dna/context', async (req, res) => {
  try {
    const workspaceId = String(req.body?.workspaceId || DEFAULT_WS).trim() || DEFAULT_WS;
    const { workspaceId: _ws, ...patch } = req.body || {};
    const result = await upsertCompanyFromBrand({ workspaceId, context: patch });
    res.json({ ok: true, context: result.context, supabase: result.supabase });
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

// ── Outreach provider webhooks (MVP stubs — reply ingest later) ─────────────
router.post('/webhooks/instantly', (req, res) => {
  console.log('[webhook/instantly]', Object.keys(req.body || {}));
  res.json({ ok: true, received: true });
});

router.post('/webhooks/heyreach', (req, res) => {
  const secret = process.env.HEYREACH_WEBHOOK_SECRET || process.env.OUTREACH_WEBHOOK_SECRET;
  if (secret) {
    const got = req.get('x-heyreach-secret') || req.query.secret;
    if (got !== secret) return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  console.log('[webhook/heyreach]', Object.keys(req.body || {}));
  res.json({ ok: true, received: true });
});

router.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.OUTREACH_WEBHOOK_SECRET;
  if (mode === 'subscribe' && expected && token === expected) {
    return res.status(200).send(String(challenge || ''));
  }
  if (mode === 'subscribe' && !expected) {
    return res.status(200).send(String(challenge || ''));
  }
  res.status(403).send('Forbidden');
});

router.post('/webhooks/whatsapp', (req, res) => {
  try {
    const result = ingestWhatsAppWebhook(req.body || {});
    console.log('[webhook/whatsapp]', result.status, result.results?.length || 0);
    // Always 200 so Meta / Composio keep the subscription
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[webhook/whatsapp]', err);
    res.status(200).json({ ok: false, error: err.message || 'WhatsApp webhook failed' });
  }
});

export default router;
