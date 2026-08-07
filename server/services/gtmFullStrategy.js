/**
 * Full 16-section GTM strategy generation with Marqq2 skill playbooks.
 * Used when mid-wizard auto-briefs were retired — final doc must still be skill-grounded.
 */
import { generateAutoSection } from './gtmAutoSections.js';
import {
  loadStrategySectionPlaybook,
  GTM_AUTO_SECTION_DEFS,
  buildPlaybookFromPack,
  TASK_SKILL_PACKS,
} from './gtmStrategySkills.js';
import { meteredStudioJson, assertCanAfford } from './credits/index.js';
import { getInjectableRulesBlock } from './agentInstructions.js';
import { SECTION_PRIMARY } from './agentOs.js';

/** Sections not covered by GTM_AUTO_SECTION_DEFS — still need skillful generation. */
const EXTRA_SECTIONS = [
  { id: 'executive_summary', title: 'Executive summary' },
  { id: 'target_customer', title: 'Target customer' },
  { id: 'product_strategy', title: 'Product strategy' },
  { id: 'pricing_monetization', title: 'Pricing & monetization' },
  { id: 'financial_plan', title: 'Financial plan' },
  { id: 'customer_success', title: 'Customer success & retention' },
  { id: 'operations_execution', title: 'Operations & execution' },
];

const EXTRA_LANES = {
  executive_summary: `EXECUTIVE SUMMARY LANE:
- 3–5 sentences: who we win first, North Star number + window, primary motion, one kill rule.
- Start with "Marqq will…". No generic consulting fluff.`,
  target_customer: `TARGET CUSTOMER LANE:
- ICP firmographics/persona, buying triggers, disqualifiers, champion vs economic buyer.
- Ground in Brand DNA ICP — no invented headcount/$ revenue bands.`,
  product_strategy: `PRODUCT / OFFER LANE:
- Offer packaging, proof assets, wedge feature vs roadmap deferrals tied to ICP JTBD.`,
  pricing_monetization: `PRICING LANE:
- Packaging/price band conditional if unproven, willingness-to-pay signal, expansion motion.`,
  financial_plan: `FINANCIAL LANE:
- Budget band from answers, CAC/payback hypotheses (conditional), spend allocation by channel.`,
  customer_success: `CUSTOMER SUCCESS LANE (bullet-heavy):
- Onboarding milestones, retention triggers, expansion plays. Prefer bullets over essays.`,
  operations_execution: `OPERATIONS LANE:
- Weekly operating cadence, owners, handoffs between marketing/sales/CS, tooling.`,
};

async function callGroq(system, user, workspaceId = 'marqq-ws-1') {
  return meteredStudioJson({
    workspaceId,
    feature: 'gtm_strategy',
    system,
    user,
    temperature: 0.35,
    meta: { feature: 'gtm_strategy' },
  });
}


function answerLabel(answers, id) {
  const a = answers?.[id];
  if (!a) return '';
  if (typeof a === 'string') return a;
  return String(a.label || a.value || '').trim();
}

async function generateExtraSection(def, ctx) {
  const workspaceId = ctx.workspaceId || 'marqq-ws-1';
  const skill =
    def.id === 'executive_summary'
      ? await buildPlaybookFromPack(TASK_SKILL_PACKS.gtm_strategy_doc, { label: def.id })
      : await loadStrategySectionPlaybook(def.id);
  const lane = EXTRA_LANES[def.id] || '';
  const sectionAgent = SECTION_PRIMARY[def.id] || 'neel';
  const sectionAgentRules = await getInjectableRulesBlock(workspaceId, sectionAgent);
  const system = `You are a senior GTM strategist writing an EXECUTABLE section Marqq agents will run.
Return STRICT JSON:
{
  "id": "${def.id}",
  "title": "${def.title}",
  "summary": "1-2 COMPLETE sentences starting with 'Marqq will…'",
  "bullets": ["4-8 concrete bullets with deliverables, cadences, SLAs, or kill rules"],
  "body": "4-8 COMPLETE sentences in Marqq-will voice"
}
${skill.playbook || ''}
${lane}
Rules: specific to THIS company; no hollow "develop a UVP" advice; ground in website/ICP; never invent fake funding surges.${sectionAgentRules}`;

  const user = JSON.stringify({
    sectionId: def.id,
    company: ctx.companyName,
    website: ctx.website || null,
    niche: ctx.niche,
    icp: ctx.icp,
    outcome: ctx.outcome,
    target: ctx.target,
    timeline: ctx.timeline,
    baseline: ctx.baseline,
    channel: ctx.channel,
    answers: ctx.answers,
    priorSummaries: ctx.priorSummaries || [],
  });

  try {
    const raw = await callGroq(system, user, workspaceId);
    return {
      id: def.id,
      title: def.title,
      summary: String(raw.summary || '').trim(),
      body: String(raw.body || '').trim(),
      bullets: Array.isArray(raw.bullets) ? raw.bullets.map(String).filter(Boolean).slice(0, 10) : [],
      skillIds: skill.skillIds || [],
      skillLoaded: Boolean(skill.loaded),
    };
  } catch (err) {
    console.warn(`[gtm-full] ${def.id} failed:`, err.message);
    return {
      id: def.id,
      title: def.title,
      summary: `Marqq will execute ${def.title.toLowerCase()} for ${ctx.companyName} toward ${ctx.target || ctx.outcome}.`,
      body: `Marqq will run ${def.title.toLowerCase()} for ${ctx.companyName} (${ctx.icp}) within ${ctx.timeline}.`,
      bullets: [`Outcome: ${ctx.outcome}`, `Audience: ${ctx.icp}`, `Window: ${ctx.timeline}`],
      skillIds: skill.skillIds || [],
      skillLoaded: false,
      error: err.message,
    };
  }
}

/**
 * Generate all strategy sections with skills, then assemble a document payload.
 */
export async function generateFullStrategyDocument(input = {}) {
  const workspaceId = String(input.workspaceId || input.companyId || 'marqq-ws-1').trim();
  assertCanAfford(workspaceId, 'gtm_strategy');
  const companyName = String(input.companyName || 'Company').trim();
  const website = String(input.website || input.websiteUrl || '').trim();
  const niche = String(input.niche || input.industry || '').trim();
  const answers = input.answers && typeof input.answers === 'object' ? input.answers : {};
  const icp = answerLabel(answers, 'icp') || String(input.icp || '').trim();
  const outcome = answerLabel(answers, 'priority_90d') || String(input.outcome || '').trim();
  const target = answerLabel(answers, 'quantified_target') || String(input.target || '').trim();
  const timeline = answerLabel(answers, 'timeline_target') || String(input.timeWindow || input.timeline || '90 days').trim();
  const baseline = answerLabel(answers, 'success_baseline') || String(input.baseline || '').trim();
  const channel = answerLabel(answers, 'channel_bet') || '';

  const onboarding = {
    companyName,
    website,
    niche,
    icp,
    goals: outcome,
    quantifiedTarget: target,
    timeline,
    baseline,
  };

  const brandDna = input.brandDna || {
    companyName,
    website,
    niche,
    icp,
    brandSummary: input.brandSummary || '',
  };

  // 1) Auto sections (skillful path already in generateAutoSection)
  // generateAutoSection returns { section, skillIds, skillLoaded, ... } — unwrap.
  const autoResults = [];
  for (const def of GTM_AUTO_SECTION_DEFS) {
    try {
      const result = await generateAutoSection({
        sectionId: def.id,
        workspaceId,
        companyName,
        websiteUrl: website,
        niche,
        icp,
        onboarding,
        brandDna,
        answers,
        priorSections: autoResults.map((s) => ({
          id: s.id,
          title: s.title,
          summary: s.summary,
        })),
      });
      const section = result?.section && typeof result.section === 'object' ? result.section : result;
      autoResults.push({
        id: def.id,
        title: section?.title || def.title,
        summary: String(section?.summary || '').trim(),
        body: String(section?.body || '').trim(),
        bullets: Array.isArray(section?.bullets) ? section.bullets.map(String).filter(Boolean) : [],
        skillIds: result?.skillIds || section?.skillIds || [],
        skillLoaded: Boolean(result?.skillLoaded ?? result?.skillIds?.length),
        model: result?.model,
        usedSearch: result?.usedSearch,
      });
    } catch (err) {
      console.warn(`[gtm-full] auto ${def.id}:`, err.message);
      autoResults.push({
        id: def.id,
        title: def.title,
        summary: `Marqq will advance ${def.title.toLowerCase()} for ${companyName}.`,
        body: '',
        bullets: [],
        error: err.message,
      });
    }
  }

  const priorSummaries = autoResults.map((s) => ({
    id: s.id,
    title: s.title,
    summary: String(s.summary || '').slice(0, 220),
  }));

  // 2) Extra sections with skills
  const extraResults = [];
  for (const def of EXTRA_SECTIONS) {
    const section = await generateExtraSection(def, {
      workspaceId,
      companyName,
      website,
      niche,
      icp,
      outcome,
      target,
      timeline,
      baseline,
      channel,
      answers,
      priorSummaries: [...priorSummaries, ...extraResults.map((s) => ({
        id: s.id,
        title: s.title,
        summary: String(s.summary || '').slice(0, 220),
      }))],
    });
    extraResults.push(section);
  }

  const byId = new Map([...autoResults, ...extraResults].map((s) => [s.id, s]));
  const FULL_ORDER = [
    'executive_summary',
    'market_analysis',
    'target_customer',
    'product_strategy',
    'positioning_messaging',
    'pricing_monetization',
    'distribution_channels',
    'marketing_strategy',
    'sales_strategy',
    'customer_success',
    'launch_plan',
    'operations_execution',
    'financial_plan',
    'measurement_optimization',
    'risks_contingencies',
    'timeline_roadmap',
  ];

  const titles = {
    executive_summary: 'Executive summary',
    market_analysis: 'Market analysis',
    target_customer: 'Target customer',
    product_strategy: 'Product strategy',
    positioning_messaging: 'Positioning & messaging',
    pricing_monetization: 'Pricing & monetization',
    distribution_channels: 'Distribution & channels',
    marketing_strategy: 'Marketing strategy',
    sales_strategy: 'Sales strategy',
    customer_success: 'Customer success & retention',
    launch_plan: 'Launch plan',
    operations_execution: 'Operations & execution',
    financial_plan: 'Financial plan',
    measurement_optimization: 'Measurement & optimization',
    risks_contingencies: 'Risks & contingencies',
    timeline_roadmap: 'Timeline & roadmap',
  };

  const sections = FULL_ORDER.map((id) => {
    const s = byId.get(id) || {};
    return {
      id,
      title: s.title || titles[id] || id,
      channel: id.replace(/_/g, '-'),
      summary: String(s.summary || '').trim(),
      body: String(s.body || '').trim(),
      bullets: Array.isArray(s.bullets) ? s.bullets.map(String) : [],
      skillIds: s.skillIds || [],
      skillLoaded: Boolean(s.skillLoaded ?? s.skillIds?.length),
    };
  });

  const skillsUsed = [...new Set(sections.flatMap((s) => s.skillIds || []))];
  const skillsLoadedCount = sections.filter((s) => s.skillLoaded).length;

  const market = byId.get('market_analysis');
  const strategy = {
    title: `${companyName} GTM Strategy`,
    generatedAt: new Date().toISOString(),
    executiveSummary:
      String(byId.get('executive_summary')?.summary || market?.summary || '').trim() ||
      `Marqq will help ${companyName} pursue ${icp}, targeting ${target || outcome} over ${timeline}.`,
    nextSteps: [
      'Execute first-focus plays from Market analysis and Distribution this week',
      'Run Measurement scorecard weekly with kill rules from Risks',
      'Open agent workstreams for sections with concrete leading metrics',
    ],
    sections,
    meta: {
      skillsUsed,
      skillsLoadedCount,
      sectionCount: sections.length,
      source: 'skillful_full_generate',
    },
  };

  return {
    ok: true,
    strategy,
    autoSections: autoResults,
    skillsUsed,
    skillsLoadedCount,
  };
}
