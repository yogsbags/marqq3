#!/usr/bin/env node
/**
 * Backend contract E2E for Nouriva AI:
 *
 * onboarding context → GTM prep → goal-first questions → strategy draft
 * generation/approval → final GTM strategy document → quality review.
 *
 * Run with the content-engine backend using real Supabase/Groq credentials:
 *   node --env-file=.env.marqq-live platform/content-engine/backend-server.js
 *   BASE_URL=http://127.0.0.1:3008 node scripts/e2e-nouriva-gtm-strategy.mjs
 *
 * This intentionally bypasses the browser and tests the API contract directly.
 * It creates a clearly named GTM module for traceability.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GTM_SECTION_ORDER } from "../platform/content-engine/gtm-wizard-routes.js";

const __dirname = join(fileURLToPath(new URL(".", import.meta.url)));
const BASE = String(process.env.BASE_URL || "http://127.0.0.1:3008").replace(/\/$/, "");
const WORKSPACE_ID = process.env.WORKSPACE_ID || "44769d4f-0c8c-4046-8a7b-ddab2feba4b3";
const USER_ID = process.env.USER_ID || "8dcc4729-afda-466c-9e3b-7621e70e0336";
const COMPANY_ID = process.env.COMPANY_ID || "b08d3df3-c1a9-4632-96ec-e6e5b703c2a0";
const WEBSITE = process.env.WEBSITE_URL || "https://nouriva.tech";
const COMPANY_NAME = process.env.COMPANY_NAME || "Nouriva AI";
const IS_NOURIVA = /nouriva/i.test(`${WEBSITE} ${COMPANY_NAME}`);
const COMPANY_SLUG = COMPANY_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
const OUT_DIR = process.env.OUT_DIR || join(__dirname, "output");
const PREP_TIMEOUT_MS = Number(process.env.PREP_TIMEOUT_MS || 8 * 60_000);
const REVISION_TEST = process.env.REVISION_TEST === "1";

let PREFERRED = {
  module_type: ["product", "Product"],
  module_name: ["Nouriva AI", "Nouriva AI"],
  category: ["healthtech_nutrition", "Healthtech / AI nutrition"],
  one_liner: ["lab_to_plan", "AI nutrition that turns lab reports into personalized meal guidance"],
  business_model: ["saas_subscription", "SaaS / subscription"],
  pricing_strategy: ["freemium_trial", "Freemium or free trial"],
  top_benefits: ["personalized_lab_guidance", "Personalized guidance from lab markers"],
  validation_evidence: ["interviews_usage", "User interviews / usage data"],
  business_stage: ["early_traction", "Early traction"],
  geography: ["india", "India"],
  market_timing: ["preventive_health", "Growing demand for practical preventive health guidance"],
  icp: ["health_conscious_lab_users", "Health-conscious consumers with recent lab work seeking personalized nutrition"],
  persona: ["consumer_self", "Individual consumer / self-serve purchaser"],
  jtbd: ["translate_labs", "Translate confusing lab biomarkers into clear food choices"],
  target_timeline: ["0_30d", "Next 30 days"],
  buying_triggers: ["recent_lab_report", "Received a recent lab report and wants to act on it"],
  not_a_fit: ["acute_clinical_care", "Users seeking acute clinical diagnosis or emergency medical care"],
  core_pain: ["labs_confusing", "Lab results are hard to translate into day-to-day food decisions"],
  status_quo: ["generic_apps", "Generic calorie apps + one-off dietitian visits"],
  cost_of_inaction: ["missed_health", "Missed early course-correction and wasted spend on untargeted diets"],
  differentiation: ["lab_to_plate", "Lab-report-native AI that maps biomarkers to personalized nutrition plans"],
  positioning_statement: ["positioning", "For health-conscious people with recent bloodwork, Nouriva AI turns clinical lab markers into personalized nutrition guidance without waiting for a specialist appointment."],
  elevator_pitch: ["pitch", "Nouriva AI reads a lab report and builds an evidence-based nutrition plan tailored to biomarkers and health goals."],
  competitors: ["alternatives", "Generic diet apps, calorie trackers, one-off dietitian consults, and untargeted supplement plans"],
  proof: ["proof", "Lab-to-plan personalization demos and biomarker-linked recommendations"],
  distribution_strategy: ["product_led", "Product-led growth with paid acquisition"],
  marketing_assets: ["app_landing_content", "App store pages, landing pages, and educational content"],
  content_strategy: ["edu_content", "Educational lab and nutrition content plus SEO"],
  social_media_strategy: ["meta_ig", "Meta and Instagram health-conscious prospecting"],
  lead_mgmt_process: ["product_funnel", "In-app onboarding funnel with CRM sync for high-intent users"],
  lead_scoring: ["lab_upload", "Lab upload completed plus engagement with recommendations"],
  tat_outreach_segment: ["trial_users", "Trial users who uploaded labs but have not converted"],
  lead_qualification: ["intent", "Uploaded labs plus stated health goal and return visit"],
  priority_90d: ["activation", "Acquire and activate paid users from the lab-upload funnel"],
  timeline_target: ["90d", "90 days"],
  quantified_target: ["500_activated_paid_users", "500 activated paid users within 90 days"],
  channel_bet: ["paid", "Paid acquisition"],
  budget_band: ["5_20l", "₹5–20L / $6–25k"],
  success_baseline: ["baseline_week_one", "0 confirmed baseline; establish the baseline in week one"],
  strategy_depth: ["practical_90d", "Practical 90-day execution plan"],
};

if (!IS_NOURIVA) {
  PREFERRED = {
    module_type: ["service", "Service business"],
    module_name: [COMPANY_NAME, COMPANY_NAME],
    category: ["management_consulting", "Management / strategy consulting"],
    one_liner: ["strategy_execution", "Strategy, AI solutions, and digital transformation consulting that turns business priorities into executable outcomes"],
    business_model: ["b2b_services", "B2B consulting / project-based services"],
    pricing_strategy: ["consulting_engagement", "Consulting engagements and retainers"],
    top_benefits: ["strategy_execution", "Clear strategy, practical execution, and measurable business transformation"],
    validation_evidence: ["client_work", "Client work, case studies, and leadership referrals"],
    business_stage: ["growth", "Growth / expanding client base"],
    geography: ["india", "India"],
    market_timing: ["ai_transformation", "Organizations need practical AI adoption and digital transformation with measurable ROI"],
    icp: ["mid_large_leadership", "Founders, promoters, boards, and leadership teams in mid-to-large enterprises and MNCs"],
    persona: ["decision_maker", "Founder, promoter, board member, or senior business leader"],
    jtbd: ["execute_transformation", "Turn strategic priorities and transformation ambitions into an executable roadmap"],
    target_timeline: ["0_90d", "Next 90 days"],
    buying_triggers: ["transformation_priority", "A strategic transformation, growth, efficiency, or AI initiative needs executive support"],
    not_a_fit: ["low_commitment", "Buyers seeking low-cost generic advice without leadership access or execution commitment"],
    core_pain: ["strategy_execution_gap", "Strategy is disconnected from execution, governance, and measurable ROI"],
    status_quo: ["internal_teams", "Internal teams, large global consultancies, or fragmented specialist vendors"],
    cost_of_inaction: ["slow_transformation", "Slow decisions, fragmented execution, and missed value-creation opportunities"],
    differentiation: ["senior_practical", "Senior-led, practical, ROI-first consulting tailored to the Indian operating context"],
    positioning_statement: ["positioning", `For founders, boards, and leadership teams, ${COMPANY_NAME} combines strategic thinking with hands-on execution across management, AI, and digital transformation.`],
    elevator_pitch: ["pitch", `${COMPANY_NAME} helps organizations make clearer strategic decisions and execute transformation initiatives with practical roadmaps, governance, and measurable outcomes.`],
    competitors: ["alternatives", "Large global consulting firms, boutique strategy firms, internal transformation teams, and specialist digital agencies"],
    proof: ["client_outcomes", "Senior consultant experience, client outcomes, case studies, and implementation track record"],
    distribution_strategy: ["founder_led", "Founder-led thought leadership, referrals, partnerships, and targeted account-based outreach"],
    marketing_assets: ["case_studies", "Case studies, executive insights, service pages, diagnostic workshops, and transformation playbooks"],
    content_strategy: ["executive_insights", "Executive content on strategy execution, AI adoption, operating models, and digital transformation"],
    social_media_strategy: ["linkedin", "LinkedIn thought leadership and account-based executive engagement"],
    lead_mgmt_process: ["consultative_pipeline", "Qualification-led CRM pipeline from executive conversation to diagnostic and proposal"],
    lead_scoring: ["executive_fit", "Leadership access, strategic urgency, budget authority, and defined transformation outcome"],
    tat_outreach_segment: ["warm_accounts", "Warm referral and target accounts with active transformation priorities"],
    lead_qualification: ["business_case", "Clear business problem, executive sponsor, measurable outcome, and willingness to act"],
    priority_90d: ["qualified_pipeline", "Build a qualified executive pipeline and convert priority accounts into paid diagnostic or transformation engagements"],
    timeline_target: ["90d", "90 days"],
    quantified_target: ["10_qualified_engagements", "10 qualified executive engagements within 90 days"],
    channel_bet: ["linkedin_referrals", "LinkedIn thought leadership plus founder/referral partnerships"],
    budget_band: ["10_50l", "₹10–50L / $12–60k"],
    success_baseline: ["establish_week_one", "Establish baseline in week one from pipeline and CRM review"],
    strategy_depth: ["practical_90d", "Practical 90-day execution plan"],
  };
}

const OUTPUTS = {
  goals: ["financial_plan", "customer_success", "operations_execution"],
  module: [],
  offer: ["product_strategy", "pricing_monetization"],
  audience: ["target_customer"],
};

function log(...args) {
  console.log(`[${COMPANY_SLUG}-gtm ${new Date().toISOString().slice(11, 19)}]`, ...args);
}

async function api(path, { method = "GET", body, timeoutMs = 180_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    // Prep is intentionally asynchronous.
    if (!response.ok && response.status !== 202) {
      const error = new Error(`${method} ${path} → ${response.status}: ${JSON.stringify(data).slice(0, 800)}`);
      error.status = response.status;
      error.body = data;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function answerFor(question) {
  const preferred = PREFERRED[question.id];
  if (preferred) return { value: preferred[0], label: preferred[1] };

  const options = Array.isArray(question.options) ? question.options : [];
  const selected = options.find((option) => option.recommended) || options[0];
  if (selected) return { value: String(selected.value), label: String(selected.label || selected.value) };

  return {
    value: `nouriva_${question.id}`,
    label: `Nouriva-specific answer for ${String(question.id).replace(/_/g, " ")}`,
  };
}

function answerMap(questions) {
  return Object.fromEntries(questions.map((question) => [question.id, answerFor(question)]));
}

async function waitForPrep(moduleId) {
  const started = Date.now();
  while (Date.now() - started < PREP_TIMEOUT_MS) {
    const data = await api(`/api/gtm/modules/${moduleId}`);
    const module = data.module || {};
    if (module.source_context?.prepared_at) return data;
    log("waiting for prep", JSON.stringify({ status: module.status, hasCrawl: Boolean(module.source_context?.crawlDigest) }));
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`GTM prep timed out after ${PREP_TIMEOUT_MS}ms`);
}

function collectQualityFlags(strategy, markdown) {
  const alignment = strategy?.goalAlignment || {};
  const text = JSON.stringify(strategy || {}) + "\n" + String(markdown || "");
  const flags = [];
  if (!alignment.north_star_metric) flags.push("Missing north_star_metric");
  if (!alignment.metric_definition) flags.push("Missing metric_definition");
  if (!alignment.quantified_target) flags.push("Missing quantified_target");
  if (!alignment.timeline_target) flags.push("Missing timeline_target");
  if (IS_NOURIVA && !/500|activated paid users/i.test(String(alignment.quantified_target || text))) flags.push("Nouriva quantified target was not preserved");
  if (!IS_NOURIVA && !new RegExp(`${COMPANY_NAME.split(/\s+/)[0]}|consulting|strategy|transformation|AI`, "i").test(text)) flags.push("Strategy is not grounded in The Elevate context");
  if (IS_NOURIVA && !/nouriva|nutrition|lab|biomarker/i.test(text)) flags.push("Strategy is not grounded in Nouriva context");
  if (/final answer.{0,100}final answer.{0,100}final answer/i.test(text)) flags.push("Repeated final-answer boilerplate detected");
  if (/your company|your industry|the stated geography|generic lead goals/i.test(text)) flags.push("Unresolved generic placeholder language detected");
  if (!Array.isArray(strategy?.sections) || strategy.sections.length < 10) flags.push("Final strategy has too few sections");
  const sectionTargets = Array.isArray(alignment.sectionTargets) ? alignment.sectionTargets : [];
  if (sectionTargets.length !== 16) flags.push(`Expected 16 section targets, got ${sectionTargets.length}`);
  const malformedTargets = sectionTargets.filter((target) =>
    !target?.metric || !target?.owner || !target?.byWhen ||
    /^Leading indicator for /i.test(String(target?.metric || "")) ||
    /^Accountable functional lead$/i.test(String(target?.owner || "")) ||
    /^\s*\d+(?:\.\d+)?\s*(contracts?|users?|customers?|ap[u]?s?|leads?)\b/i.test(String(target?.contribution || "")) ||
    /share of (the )?(north[- ]star|target)/i.test(String(target?.contribution || ""))
  );
  if (malformedTargets.length) flags.push(`Malformed or arbitrary section targets: ${malformedTargets.map((target) => target.sectionId).join(", ")}`);
  const emptySections = (strategy?.sections || [])
    .filter((section) => !String(section?.summary || section?.body || "").trim() && !(section?.bullets || []).length)
    .map((section) => section.id);
  if (emptySections.length) flags.push(`Empty strategy sections: ${emptySections.join(", ")}`);
  return flags;
}

async function main() {
  log("base", BASE);
  const health = await api("/health");
  log("health", JSON.stringify(health));

  const onboarding = {
    company: COMPANY_NAME,
    websiteUrl: WEBSITE,
    industry: IS_NOURIVA ? "Consumer health technology and AI nutrition" : "Management consulting, AI solutions consulting, and digital transformation",
    icp: IS_NOURIVA ? "Health-conscious adults with recent lab reports who want practical personalized nutrition guidance" : "Founders, promoters, boards, and leadership teams in mid-to-large enterprises, MNCs, and Indian family-owned businesses",
    primaryGoal: IS_NOURIVA ? "Acquire and activate paid users from the lab-upload funnel" : "Build qualified executive pipeline and convert priority accounts into paid consulting engagements",
    timelineTarget: "Next 90 days",
    quantifiedTarget: IS_NOURIVA ? "500 activated paid users within 90 days" : "10 qualified executive engagements within 90 days",
    successBaseline: IS_NOURIVA ? "0 confirmed baseline; establish it in week one" : "Establish baseline in week one from current pipeline, referrals, and conversion rates",
    connectedIntegrations: "ga4,linkedin,hubspot",
  };

  const created = await api("/api/gtm/modules", {
    method: "POST",
    body: {
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      companyId: COMPANY_ID,
      name: `${COMPANY_NAME} GTM Backend E2E ${new Date().toISOString().replace(/[:.]/g, "-")}`,
      moduleType: "product",
      active: true,
      sourceContext: { onboarding },
    },
  });
  const moduleId = created.module?.id;
  if (!moduleId) throw new Error("Module creation did not return an id");
  log("created module", moduleId);

  if (created.progress?.sections?.[0]?.id !== "goals") {
    throw new Error(`Goal-first ordering failed: first section was ${created.progress?.sections?.[0]?.id || "missing"}`);
  }

  await api("/api/gtm/prep", {
    method: "POST",
    body: {
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      companyId: COMPANY_ID,
      websiteUrl: WEBSITE,
      companyName: COMPANY_NAME,
      moduleId,
      onboarding,
    },
    timeoutMs: 60_000,
  });
  const prepared = await waitForPrep(moduleId);
  log("prep complete", JSON.stringify({ preparedAt: prepared.module?.source_context?.prepared_at, hasCrawl: Boolean(prepared.module?.source_context?.crawlDigest) }));

  const approved = [];
  const sectionResults = [];
  let northStarDraft = null;

  for (const sectionId of GTM_SECTION_ORDER) {
    const questionPayload = await api(`/api/gtm/sections/${sectionId}/questions`, {
      method: "POST",
      body: { moduleId },
      timeoutMs: 240_000,
    });
    const questions = questionPayload.questions || [];
    if (!questions.length) throw new Error(`No questions returned for ${sectionId}`);
    const answers = answerMap(questions);
    log(sectionId, "questions", questions.length, "answers", Object.keys(answers).length);

    const outputs = OUTPUTS[sectionId] || [];
    if (!outputs.length) {
      const locked = await api(`/api/gtm/sections/${sectionId}/lock`, {
        method: "POST",
        body: { moduleId, answers },
        timeoutMs: 120_000,
      });
      sectionResults.push({ sectionId, questions: questions.length, locked: true, next: locked.nextSectionId });
      continue;
    }

    for (let index = 0; index < outputs.length; index += 1) {
      const strategySectionId = outputs[index];
      const generated = await api(`/api/gtm/modules/${moduleId}/strategy-sections/generate`, {
        method: "POST",
        body: {
          interviewSectionId: sectionId,
          strategySectionId,
          answers,
          priorSections: approved,
        },
        timeoutMs: 300_000,
      });
      let draft = generated.section;
      if (!draft?.id || !draft.summary || !draft.body) {
        throw new Error(`Incomplete ${strategySectionId} draft: ${JSON.stringify(draft).slice(0, 800)}`);
      }

      if (REVISION_TEST && strategySectionId === "target_customer") {
        const revised = await api(`/api/gtm/modules/${moduleId}/strategy-sections/generate`, {
          method: "POST",
          body: {
            interviewSectionId: sectionId,
            strategySectionId,
            answers,
            priorSections: approved,
            revisionPrompt: "Narrow the ICP to Indian B2B SaaS companies with 20–200 employees and prioritize CFO buyers. Keep the target achievable with a lean sales team.",
            currentDraft: draft,
          },
          timeoutMs: 300_000,
        });
        draft = revised.section;
        if (!draft?.revisionNote) throw new Error("Revision test did not return revisionNote");
        if (!(draft.affectedSections || []).includes("positioning_messaging")) {
          throw new Error(`Revision test did not identify positioning dependency: ${JSON.stringify(draft.affectedSections || [])}`);
        }
        log("revision applied", strategySectionId, JSON.stringify({
          revisionNote: draft.revisionNote,
          affectedSections: draft.affectedSections || [],
        }));
      }
      if (sectionId === "goals" && !northStarDraft) northStarDraft = draft;

      const approval = await api(`/api/gtm/modules/${moduleId}/strategy-sections/approve`, {
        method: "POST",
        body: {
          section: { ...draft, approvedAt: new Date().toISOString() },
          interviewSectionId: sectionId,
          answers,
          lockInterview: index === outputs.length - 1,
        },
        timeoutMs: 120_000,
      });
      approved.push(approval.section);
      sectionResults.push({ sectionId, strategySectionId, approved: true, locked: index === outputs.length - 1 });
      log("approved", sectionId, strategySectionId, "locked", index === outputs.length - 1);
    }
  }

  const executeOptions = await api(`/api/gtm/modules/${moduleId}/execute-options`);
  const strategyOption = (executeOptions.options || []).find((option) => option.id === "gtm_strategy_doc");
  if (!strategyOption) throw new Error("GTM strategy document was not offered after locking all sections");

  const executed = await api(`/api/gtm/modules/${moduleId}/execute`, {
    method: "POST",
    body: { taskId: "gtm_strategy_doc" },
    timeoutMs: 600_000,
  });
  const strategy = executed.strategy;
  const markdown = executed.markdown || "";
  const flags = collectQualityFlags(strategy, markdown);

  const output = {
    company: COMPANY_NAME,
    website: WEBSITE,
    workspaceId: WORKSPACE_ID,
    companyId: COMPANY_ID,
    moduleId,
    sectionOrder: GTM_SECTION_ORDER,
    onboarding,
    prep: {
      preparedAt: prepared.module?.source_context?.prepared_at,
      hasCrawl: Boolean(prepared.module?.source_context?.crawlDigest),
    },
    northStarDraft: northStarDraft
      ? {
          proposedNorthStar: northStarDraft.proposedNorthStar,
          proposedGoalSystem: northStarDraft.proposedGoalSystem,
          summary: northStarDraft.summary,
        }
      : null,
    sectionResults,
    strategy,
    markdown,
    qualityFlags: flags,
    generatedAt: new Date().toISOString(),
  };

  await mkdir(OUT_DIR, { recursive: true });
  const stamp = Date.now();
  const jsonPath = join(OUT_DIR, `${COMPANY_SLUG}-gtm-strategy-${stamp}.json`);
  const mdPath = join(OUT_DIR, `${COMPANY_SLUG}-gtm-strategy-${stamp}.md`);
  await writeFile(jsonPath, JSON.stringify(output, null, 2));
  await writeFile(mdPath, markdown);

  log("strategy alignment", JSON.stringify(strategy?.goalAlignment || {}, null, 2));
  log("sections", strategy?.sections?.length || 0, "approved drafts", approved.length);
  log("quality flags", flags.length ? flags.join(" | ") : "none");
  log("JSON", jsonPath);
  log("Markdown", mdPath);

  if (flags.length) {
    throw new Error(`${COMPANY_NAME} GTM output failed quality review: ${flags.join("; ")}`);
  }
}

main().catch((error) => {
  console.error(`\n❌ ${COMPANY_NAME} GTM backend E2E failed:`, error.message || error);
  process.exit(1);
});
