#!/usr/bin/env node
/**
 * E2E: nouriva.tech through onboarding-shaped GTM flow
 *
 * 1) Brand DNA scrape
 * 2) Generate 9 auto GTM strategy sections (sequential, with priors)
 * 3) Create GTM module + quiet site prep
 * 4) Lock interview sections with Nouriva answers
 * 5) Approve auto sections onto the module
 * 6) Assemble full GTM strategy document (+ control loop + LLM agent roster)
 * 7) Write JSON + markdown report with quality flags
 *
 * Requires content-engine with Supabase + Groq, e.g.:
 *   node --env-file=.env.marqq-live platform/content-engine/backend-server.js
 *
 * Run:
 *   BASE_URL=http://127.0.0.1:3008 node scripts/e2e-nouriva-onboarding-gtm.mjs
 *   npm run test:nouriva:gtm
 *
 * Optional:
 *   SKIP_PREP=1          skip crawl wait (faster, thinner context)
 *   SKIP_AUTO_SECTIONS=1 skip the 9 auto-section generations
 *   SECTIONS=market_analysis,positioning_messaging  only these auto sections
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GTM_AUTO_STRATEGY_SECTIONS,
  GTM_SECTION_ORDER,
} from "../platform/content-engine/gtm-wizard-routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = String(process.env.BASE_URL || "http://127.0.0.1:3008").replace(/\/$/, "");

const WORKSPACE_ID = process.env.WORKSPACE_ID || "44769d4f-0c8c-4046-8a7b-ddab2feba4b3";
const USER_ID = process.env.USER_ID || "8dcc4729-afda-466c-9e3b-7621e70e0336";
const COMPANY_ID = process.env.COMPANY_ID || "b08d3df3-c1a9-4632-96ec-e6e5b703c2a0";
const WEBSITE = process.env.WEBSITE_URL || "https://nouriva.tech";
const COMPANY_NAME = process.env.COMPANY_NAME || "Nouriva AI";

const ONBOARDING = {
  company: COMPANY_NAME,
  websiteUrl: WEBSITE,
  industry: "Consumer health technology and AI nutrition",
  icp: "Health-conscious adults with recent lab reports who want practical personalized nutrition guidance",
  primaryGoal: "Acquire and activate paid users from the lab-upload funnel",
  quantifiedTarget: "500 activated paid users in 90 days",
  timelineTarget: "Next 90 days",
  successBaseline: "0 confirmed baseline; establish in week one",
};

const MARKET_ANALYSIS_TACTICAL_RE =
  /\b(roi calculator|case[- ]study library|sales script|objection[- ]handling|landing page|webinar|outreach cadence|ad budget|linkedin ads|content calendar|pilot onboarding|equip the sales|create a rapid|launch a \d+-week)\b/i;

function log(...args) {
  console.log(`[nouriva-gtm ${new Date().toISOString().slice(11, 19)}]`, ...args);
}

function looksTruncated(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (/[,:;–—\-]$/.test(t)) return true;
  if (/\b(a|an|the|and|or|to|for|with|of|as|create|clear)\s*$/i.test(t)) return true;
  if (t.length > 40 && !/[.!?]"?$/.test(t)) return true;
  return false;
}

async function api(path, { method = "GET", body, timeoutMs = 240_000, okStatuses } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      signal: ctrl.signal,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    const allowed = okStatuses || [200, 201, 202];
    if (!allowed.includes(res.status)) {
      const err = new Error(
        `${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 600)}`
      );
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return { status: res.status, body: json };
  } finally {
    clearTimeout(t);
  }
}

function pickAnswer(question) {
  const opts = Array.isArray(question.options) ? question.options : [];
  const nourivaPreferred = {
    module_type: { value: "product", label: "Product" },
    module_name: { value: "Nouriva AI", label: "Nouriva AI" },
    one_sentence_desc: {
      value: "AI nutrition from lab reports",
      label: "AI that turns lab reports into personalized meal guidance",
    },
    category: { value: "healthtech_nutrition", label: "Healthtech / AI nutrition" },
    one_liner: {
      value: "AI nutrition that turns lab reports into personalized meal guidance.",
      label: "AI nutrition that turns lab reports into personalized meal guidance.",
    },
    business_model: { value: "saas_subscription", label: "SaaS / subscription" },
    pricing_strategy: { value: "freemium_trial", label: "Freemium or free trial" },
    icp: {
      value: "health_conscious_lab_users",
      label: "Health-conscious consumers with recent lab work seeking personalized nutrition",
    },
    persona: { value: "consumer_self", label: "Individual consumer / self-serve purchaser" },
    jtbd: {
      value: "translate_labs",
      label: "Translate confusing lab biomarkers into clear food choices",
    },
    priority_90d: {
      value: "activation",
      label: "Acquire and activate paid users from the lab-upload funnel",
    },
    quantified_target: {
      value: "500_activated",
      label: "500 activated paid users in 90 days",
    },
    timeline_target: { value: "90d", label: "Next 90 days" },
    channel_bet: {
      value: "paid_social_aso",
      label: "Paid social + app store optimization",
    },
    budget_band: { value: "10k_25k", label: "$10k–$25k / month" },
  };

  const healthHit = opts.find((o) =>
    /lab|nutrition|health|biomarker|diet|food|wellness|consumer|activation|app/i.test(
      `${o.label || ""} ${o.value || ""}`
    )
  );
  const recommended = opts.find((o) => o.recommended);
  const chosen = healthHit || recommended || opts[0];
  if (
    chosen &&
    !/AI-assisted marketing|Head of Marketing|marketing OS|freelance marketers/i.test(
      String(chosen.label || "")
    )
  ) {
    return {
      value: String(chosen.value || chosen.label),
      label: String(chosen.label || chosen.value),
    };
  }
  return (
    nourivaPreferred[question.id] || {
      value: `nouriva_${question.id}`,
      label: `Nouriva ${String(question.id || "").replace(/_/g, " ")}`,
    }
  );
}

async function waitForPrep(moduleId, { maxWaitMs = 8 * 60_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const { body } = await api(`/api/gtm/modules/${moduleId}`);
    const preparedAt = body.module?.source_context?.prepared_at;
    const hasCrawl = Boolean(body.module?.source_context?.crawlDigest);
    log("prep poll", { preparedAt: Boolean(preparedAt), hasCrawl, status: body.module?.status });
    if (preparedAt) return body;
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`prep timed out for module ${moduleId}`);
}

async function lockAllSections(moduleId) {
  for (const sectionId of GTM_SECTION_ORDER) {
    log(`lock ${sectionId}: fetch questions`);
    let questionsPayload;
    try {
      const { body } = await api(`/api/gtm/sections/${sectionId}/questions`, {
        method: "POST",
        body: { moduleId },
        timeoutMs: 240_000,
      });
      questionsPayload = body;
    } catch (err) {
      log(`questions failed for ${sectionId}:`, err.message);
      questionsPayload = { questions: [] };
    }

    const questions = questionsPayload.questions || questionsPayload.section?.questions || [];
    const defQuestions =
      questions.length > 0
        ? questions
        : (questionsPayload.definition?.questions || []).map((q) => ({
            ...q,
            options:
              questionsPayload.optionsByQuestionId?.[q.id] || q.options || q.fixedOptions || [],
          }));

    if (!defQuestions.length) {
      throw new Error(`No questions returned for section ${sectionId}`);
    }

    const answers = {};
    for (const q of defQuestions) answers[q.id] = pickAnswer(q);

    const { body: locked } = await api(`/api/gtm/sections/${sectionId}/lock`, {
      method: "POST",
      body: { moduleId, answers },
      timeoutMs: 120_000,
    });
    log(`lock ${sectionId}: ok (allLocked=${locked.progress?.allLocked ?? locked.allLocked})`);
  }
}

function reviewAutoSection(section) {
  const flags = [];
  if (!section?.summary) flags.push("missing summary");
  if (!section?.bullets?.length) flags.push("missing bullets");
  if (looksTruncated(section.summary)) flags.push("truncated summary");
  if (looksTruncated(section.body)) flags.push("truncated body");
  if (section.id === "market_analysis") {
    const tactical = (section.bullets || []).filter((b) => MARKET_ANALYSIS_TACTICAL_RE.test(b));
    if (tactical.length >= 2) {
      flags.push(`market_analysis off-lane tactical plays (${tactical.length})`);
    }
    const decisionish = (section.bullets || []).filter((b) =>
      /beachhead|why now|sequence|depriorit/i.test(b)
    );
    if (decisionish.length < 2) {
      flags.push("market_analysis missing beachhead/sequence/deprioritize structure");
    }
  }
  return flags;
}

function sectionToMd(section) {
  const lines = [
    `### ${section.title || section.id}`,
    "",
    `**Recommendation:** ${section.summary || ""}`,
    "",
    ...(section.bullets || []).map((b) => `- ${b}`),
    "",
    section.body || "",
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const startedAt = new Date().toISOString();
  const report = {
    company: COMPANY_NAME,
    website: WEBSITE,
    baseUrl: BASE,
    startedAt,
    steps: [],
    flags: [],
    brandDna: null,
    autoSections: [],
    moduleId: null,
    strategy: null,
    agentRoster: null,
    controlLoop: null,
  };

  log("BASE", BASE);
  log("workspace", WORKSPACE_ID);

  const health = await api("/health");
  log("health", health.body);
  report.steps.push({ step: "health", ok: true });

  // ── 1) Brand DNA ──────────────────────────────────────────────────────────
  log("Brand DNA for", WEBSITE);
  const { body: dnaBody } = await api("/api/brand-dna", {
    method: "POST",
    body: {
      companyName: COMPANY_NAME,
      websiteUrl: WEBSITE,
      industry: ONBOARDING.industry,
      icp: ONBOARDING.icp,
    },
    timeoutMs: 300_000,
  });
  const brandDna = dnaBody.brandDna || dnaBody;
  report.brandDna = {
    companyName: brandDna.companyName,
    websiteUrl: brandDna.websiteUrl,
    brandTagline: brandDna.brandTagline,
    businessSummary: String(brandDna.businessSummary || "").slice(0, 500),
    toneOfVoice: brandDna.toneOfVoice,
    colors: brandDna.colors,
    fonts: brandDna.fonts,
  };
  report.steps.push({ step: "brand_dna", ok: Boolean(brandDna.companyName || brandDna.websiteUrl) });
  log("Brand DNA ok:", brandDna.companyName, String(brandDna.brandTagline || "").slice(0, 80));

  // ── 2) Auto GTM sections (onboarding review path) ─────────────────────────
  const sectionFilter = String(process.env.SECTIONS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const autoDefs = process.env.SKIP_AUTO_SECTIONS
    ? []
    : GTM_AUTO_STRATEGY_SECTIONS.filter(
        (d) => !sectionFilter.length || sectionFilter.includes(d.id)
      );

  const prior = [];
  for (const def of autoDefs) {
    log(`auto-section ${def.id}`);
    const { body } = await api("/api/gtm/auto-sections/generate", {
      method: "POST",
      body: {
        sectionId: def.id,
        companyName: COMPANY_NAME,
        websiteUrl: WEBSITE,
        industry: ONBOARDING.industry,
        icp: ONBOARDING.icp,
        brandDna,
        onboarding: ONBOARDING,
        priorSections: prior,
      },
      timeoutMs: 300_000,
    });
    const section = body.section;
    const flags = reviewAutoSection(section);
    if (body.degraded) flags.push("degraded generation");
    report.autoSections.push({
      id: section.id,
      title: section.title,
      summary: section.summary,
      bullets: section.bullets,
      body: section.body,
      model: body.model || null,
      degraded: Boolean(body.degraded),
      flags,
    });
    report.flags.push(...flags.map((f) => `${section.id}: ${f}`));
    prior.push(section);
    log(
      `  → ${String(section.summary || "").slice(0, 100)}… flags=${flags.length ? flags.join("; ") : "none"}`
    );
  }
  report.steps.push({ step: "auto_sections", ok: true, count: report.autoSections.length });

  // ── 3) Create module + prep ───────────────────────────────────────────────
  log("creating GTM module");
  const { body: created } = await api("/api/gtm/modules", {
    method: "POST",
    body: {
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      companyId: COMPANY_ID,
      name: `Nouriva Onboarding GTM ${new Date().toISOString().slice(0, 16)}`,
      moduleType: "product",
      active: true,
      sourceContext: {
        onboarding: ONBOARDING,
        brandDna: report.brandDna,
      },
    },
  });
  const moduleId = created.module?.id;
  if (!moduleId) throw new Error("module create failed");
  report.moduleId = moduleId;
  log("moduleId", moduleId);
  report.steps.push({ step: "create_module", ok: true, moduleId });

  if (!process.env.SKIP_PREP) {
    log("starting prep crawl");
    await api("/api/gtm/prep", {
      method: "POST",
      body: {
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        companyId: COMPANY_ID,
        websiteUrl: WEBSITE,
        companyName: COMPANY_NAME,
        moduleId,
        onboarding: ONBOARDING,
      },
      timeoutMs: 60_000,
    });
    await waitForPrep(moduleId);
    report.steps.push({ step: "prep", ok: true });
  } else {
    report.steps.push({ step: "prep", ok: true, skipped: true });
  }

  // ── 4) Lock interview sections ────────────────────────────────────────────
  await lockAllSections(moduleId);
  report.steps.push({ step: "lock_interview", ok: true });

  // ── 5) Approve auto sections onto module ──────────────────────────────────
  for (const section of prior) {
    log(`approve ${section.id}`);
    await api(`/api/gtm/modules/${moduleId}/strategy-sections/approve`, {
      method: "POST",
      body: { section },
      timeoutMs: 60_000,
    });
  }
  report.steps.push({ step: "approve_auto_sections", ok: true, count: prior.length });

  // ── 6) Assemble strategy document ─────────────────────────────────────────
  log("assemble GTM strategy document");
  const { body: executed } = await api(`/api/gtm/modules/${moduleId}/execute`, {
    method: "POST",
    body: { taskId: "gtm_strategy_doc" },
    timeoutMs: 360_000,
  });
  report.strategy = {
    title: executed.strategy?.title || null,
    executiveSummary: executed.strategy?.executiveSummary || null,
    goalAlignment: executed.strategy?.goalAlignment || executed.module?.profile?.goal_system || null,
    sectionCount: (executed.strategy?.sections || []).length,
    sectionIds: (executed.strategy?.sections || []).map((s) => s.id),
    markdown: executed.markdown || null,
  };
  report.controlLoop = executed.controlLoop || executed.module?.profile?.control_loop || null;
  report.agentRoster =
    executed.agentRoster || executed.module?.profile?.agent_roster || null;
  report.steps.push({
    step: "strategy_document",
    ok: Boolean(executed.strategy?.executiveSummary || executed.markdown),
  });

  // Refresh roster explicitly (LLM path)
  try {
    const { body: rosterBody } = await api(`/api/gtm/modules/${moduleId}/agent-roster/refresh`, {
      method: "POST",
      body: {},
      timeoutMs: 180_000,
    });
    report.agentRoster = rosterBody.agentRoster || report.agentRoster;
    report.steps.push({
      step: "agent_roster",
      ok: true,
      source: report.agentRoster?.source || null,
      highPriority: report.agentRoster?.highPriority || [],
    });
  } catch (err) {
    report.flags.push(`agent_roster refresh failed: ${err.message}`);
    report.steps.push({ step: "agent_roster", ok: false, error: err.message });
  }

  // ── Quality checks on final strategy ──────────────────────────────────────
  const strategyText = [
    report.strategy?.executiveSummary,
    report.strategy?.markdown,
    JSON.stringify(report.strategy?.goalAlignment || {}),
  ].join("\n");

  if (!/nouriva|nutrition|lab|biomarker|meal|activated/i.test(strategyText)) {
    report.flags.push("Final strategy not grounded in Nouriva / nutrition context");
  }
  if (!/500|activated|north.?star|quantified/i.test(strategyText)) {
    report.flags.push("North Star / quantified target weak or missing");
  }
  const archetype = String(report.strategy?.goalAlignment?.business_archetype || "").toLowerCase();
  if (archetype && !/consumer|product|app|b2c|hybrid/.test(archetype)) {
    report.flags.push(`Unexpected archetype for consumer app: ${archetype}`);
  }

  report.completedAt = new Date().toISOString();

  const outDir = join(__dirname, "output");
  await mkdir(outDir, { recursive: true });
  const stamp = Date.now();
  const jsonPath = join(outDir, `nouriva-onboarding-gtm-${stamp}.json`);
  const mdPath = join(outDir, `nouriva-onboarding-gtm-${stamp}.md`);

  await writeFile(jsonPath, JSON.stringify(report, null, 2));

  const md = [
    `# Nouriva onboarding → GTM strategy E2E`,
    ``,
    `- Company: ${COMPANY_NAME}`,
    `- Website: ${WEBSITE}`,
    `- Module: \`${moduleId}\``,
    `- Started: ${startedAt}`,
    `- Completed: ${report.completedAt}`,
    `- Flags: ${report.flags.length ? report.flags.join("; ") : "none"}`,
    ``,
    `## Brand DNA`,
    ``,
    `- Tagline: ${report.brandDna?.brandTagline || "—"}`,
    `- Summary: ${report.brandDna?.businessSummary || "—"}`,
    `- Tone: ${report.brandDna?.toneOfVoice || "—"}`,
    ``,
    `## Auto sections`,
    ``,
    ...report.autoSections.map(sectionToMd),
    `## Goal alignment`,
    ``,
    "```json",
    JSON.stringify(report.strategy?.goalAlignment || {}, null, 2),
    "```",
    ``,
    `## Agent roster`,
    ``,
    `- Source: ${report.agentRoster?.source || "—"}`,
    `- Archetype: ${report.agentRoster?.archetypeKey || "—"}`,
    `- High priority: ${(report.agentRoster?.highPriority || []).join(", ") || "—"}`,
    `- Rationale: ${report.agentRoster?.rationale || "—"}`,
    ``,
    ...((report.agentRoster?.agents || [])
      .filter((a) => a.status === "high_priority" || a.status === "activated")
      .map(
        (a) =>
          `- **${a.name}** (${a.status}${a.specialist_label ? ` · ${a.specialist_label}` : ""}): ${a.mission || a.reason}`
      )),
    ``,
    `## Strategy`,
    ``,
    report.strategy?.markdown || report.strategy?.executiveSummary || "_No markdown returned_",
    ``,
  ].join("\n");

  await writeFile(mdPath, md);

  log("wrote", jsonPath);
  log("wrote", mdPath);
  log("flags", report.flags.length ? report.flags : "none");
  log(
    "roster",
    report.agentRoster?.source,
    "high=",
    (report.agentRoster?.highPriority || []).join(",")
  );

  if (report.flags.length) {
    process.exitCode = 2;
    console.error("\nQuality flags present — inspect report before trusting output.\n");
  } else {
    console.log("\nOK — Nouriva onboarding → GTM strategy completed without quality flags.\n");
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
