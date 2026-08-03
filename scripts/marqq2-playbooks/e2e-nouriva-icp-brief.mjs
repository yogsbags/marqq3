#!/usr/bin/env node
/**
 * Real E2E: Nouriva AI (nouriva.tech) → GTM prep → lock all interview sections
 * → Build ICP brief → generate ICP artifact.
 *
 * Requires local content-engine with real env (Supabase + Groq), e.g.:
 *   node --env-file=.env.marqq-live platform/content-engine/backend-server.js
 *   BASE_URL=http://127.0.0.1:3008 node scripts/e2e-nouriva-icp-brief.mjs
 *
 * Writes output to scripts/output/nouriva-icp-brief-<ts>.json
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GTM_SECTION_ORDER } from "../platform/content-engine/gtm-wizard-routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = String(process.env.BASE_URL || "http://127.0.0.1:3008").replace(/\/$/, "");

// Nouriva AI workspace (from Supabase)
const WORKSPACE_ID = process.env.WORKSPACE_ID || "44769d4f-0c8c-4046-8a7b-ddab2feba4b3";
const USER_ID = process.env.USER_ID || "8dcc4729-afda-466c-9e3b-7621e70e0336";
const COMPANY_ID = process.env.COMPANY_ID || "b08d3df3-c1a9-4632-96ec-e6e5b703c2a0";
const WEBSITE = process.env.WEBSITE_URL || "https://nouriva.tech";
const COMPANY_NAME = process.env.COMPANY_NAME || "Nouriva AI";

function log(...args) {
  console.log(`[nouriva-e2e ${new Date().toISOString().slice(11, 19)}]`, ...args);
}

async function api(path, { method = "GET", body, timeoutMs = 180_000 } = {}) {
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
    if (!res.ok) {
      const err = new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

function pickAnswer(question) {
  const opts = Array.isArray(question.options) ? question.options : [];
  const nourivaPreferred = {
    module_type: { value: "product", label: "Product" },
    module_name: { value: "Nouriva AI", label: "Nouriva AI" },
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
    target_timeline: { value: "0_30d", label: "Next 30 days" },
    core_pain: {
      value: "labs_confusing",
      label: "Lab results are hard to translate into day-to-day food decisions",
    },
    status_quo: {
      value: "generic_apps",
      label: "Generic calorie apps + one-off dietitian visits",
    },
    cost_of_inaction: {
      value: "missed_health",
      label: "Missed early course-correction and wasted spend on untargeted supplements/diets",
    },
    differentiation: {
      value: "lab_to_plate",
      label: "Lab-report-native AI that maps biomarkers to personalized nutrition plans",
    },
    positioning_statement: {
      value: "positioning",
      label:
        "For health-conscious people with recent bloodwork, Nouriva AI turns clinical lab markers into personalized nutrition guidance — without waiting for a specialist appointment.",
    },
    elevator_pitch: {
      value: "pitch",
      label:
        "Nouriva AI reads your lab report and builds an evidence-based nutrition plan tailored to your biomarkers and goals.",
    },
    competitors: {
      value: "competitors",
      label: "Generic diet apps, calorie trackers, one-off dietitian consults",
    },
    proof: {
      value: "proof",
      label: "Lab-to-plan personalization demos and biomarker-linked recommendations",
    },
    distribution_strategy: {
      value: "product_led",
      label: "Product-led growth + paid acquisition",
    },
    marketing_assets: {
      value: "assets",
      label: "App Store / Play Store + landing pages + educational content",
    },
    content_strategy: {
      value: "edu_content",
      label: "Educational lab/nutrition content + SEO",
    },
    social_media_strategy: {
      value: "meta_ig",
      label: "Meta / Instagram health-conscious prospecting",
    },
    lead_mgmt_process: {
      value: "product_funnel",
      label: "In-app onboarding funnel with CRM sync for high-intent users",
    },
    lead_scoring: {
      value: "lab_upload",
      label: "Lab upload completed + engagement with recommendations",
    },
    tat_outreach_segment: {
      value: "trial_users",
      label: "Trial users who uploaded labs but have not converted",
    },
    lead_qualification: {
      value: "intent",
      label: "Uploaded labs + stated health goal + return visit",
    },
    priority_90d: {
      value: "acquisition",
      label: "Acquire and activate paid users from lab-upload funnel",
    },
    channel_bet: {
      value: "paid_social",
      label: "Paid social + app store optimization",
    },
    budget_band: { value: "10k_25k", label: "$10k–$25k / month" },
  };

  // Prefer LLM options that look Nouriva/health-specific; else curated fallback
  const healthHit = opts.find((o) =>
    /lab|nutrition|health|biomarker|diet|food|patient|wellness/i.test(
      `${o.label || ""} ${o.value || ""}`,
    ),
  );
  const recommended = opts.find((o) => o.recommended);
  const chosen = healthHit || recommended || opts[0];
  if (chosen && !/AI-assisted marketing|Head of Marketing|marketing OS|freelance marketers/i.test(String(chosen.label || ""))) {
    return {
      value: String(chosen.value || chosen.label),
      label: String(chosen.label || chosen.value),
    };
  }
  return (
    nourivaPreferred[question.id] || {
      value: `nouriva_${question.id}`,
      label: `Nouriva ${question.id.replace(/_/g, " ")}`,
    }
  );
}

async function waitForPrep(workspaceId, moduleId, { maxWaitMs = 8 * 60_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    // Prefer the module we just created — workspace "latest" may be an older prepared module
    const mod = await api(`/api/gtm/modules/${moduleId}`);
    const preparedAt = mod.module?.source_context?.prepared_at;
    const hasCrawl = Boolean(mod.module?.source_context?.crawlDigest);
    log("prep module poll:", JSON.stringify({ preparedAt, hasCrawl, status: mod.module?.status }));
    if (preparedAt) return mod;
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`prep timed out for module ${moduleId}`);
}

async function lockAllSections(moduleId) {
  for (const sectionId of GTM_SECTION_ORDER) {
    log(`section ${sectionId}: fetch questions`);
    let questionsPayload;
    try {
      questionsPayload = await api(`/api/gtm/sections/${sectionId}/questions`, {
        method: "POST",
        body: { moduleId },
        timeoutMs: 240_000,
      });
    } catch (err) {
      log(`questions failed for ${sectionId}, locking with fallbacks:`, err.message);
      questionsPayload = { questions: [] };
    }

    const questions = questionsPayload.questions || questionsPayload.section?.questions || [];
    // Some APIs nest under `definition.questions` + separate options map
    const defQuestions =
      questions.length > 0
        ? questions
        : (questionsPayload.definition?.questions || []).map((q) => ({
            ...q,
            options: questionsPayload.optionsByQuestionId?.[q.id] || q.options || q.fixedOptions || [],
          }));

    const answers = {};
    if (defQuestions.length) {
      for (const q of defQuestions) {
        answers[q.id] = pickAnswer(q);
      }
    } else {
      // Absolute fallback — get question ids from local catalog via a no-op lock attempt message
      throw new Error(`No questions returned for section ${sectionId}`);
    }

    log(
      `section ${sectionId}: locking with`,
      Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v.label])),
    );
    const locked = await api(`/api/gtm/sections/${sectionId}/lock`, {
      method: "POST",
      body: { moduleId, answers },
      timeoutMs: 120_000,
    });
    log(`section ${sectionId}: locked (allLocked=${locked.progress?.allLocked ?? locked.allLocked})`);
  }
}

async function main() {
  log("BASE", BASE);
  log("Nouriva workspace", WORKSPACE_ID, "company", COMPANY_ID);

  const health = await api("/health");
  log("health", health);

  // 1) Create fresh GTM module
  log("creating GTM module");
  const created = await api("/api/gtm/modules", {
    method: "POST",
    body: {
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      companyId: COMPANY_ID,
      name: `Nouriva ICP E2E ${new Date().toISOString().slice(0, 16)}`,
      moduleType: "product",
      active: true,
      sourceContext: {
        onboarding: {
          company: COMPANY_NAME,
          websiteUrl: WEBSITE,
          industry: "Healthtech / Nutrition",
          icp: "Health-conscious consumers with recent lab work",
        },
      },
    },
  });
  const moduleId = created.module?.id;
  if (!moduleId) throw new Error("module create failed");
  log("moduleId", moduleId);

  // 2) Quiet prep / crawl nouriva.tech
  log("starting prep crawl for", WEBSITE);
  const prepStart = await api("/api/gtm/prep", {
    method: "POST",
    body: {
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      companyId: COMPANY_ID,
      websiteUrl: WEBSITE,
      companyName: COMPANY_NAME,
      moduleId,
      onboarding: {
        company: COMPANY_NAME,
        websiteUrl: WEBSITE,
        industry: "Healthtech / Nutrition",
        icp: "Health-conscious consumers with recent lab work",
      },
    },
    timeoutMs: 60_000,
  }).catch(async (err) => {
    // 202 is success for async prep — fetch may throw only on !ok; handle 202 via raw if needed
    if (err.status === 202) return err.body;
    throw err;
  });
  log("prep accepted", JSON.stringify(prepStart).slice(0, 300));

  // api() throws on non-2xx — patch to accept 202
  // If we got here with 2xx, poll status anyway
  const prepStatus = await waitForPrep(WORKSPACE_ID, moduleId);
  log("prep complete", JSON.stringify({
    preparedAt: prepStatus.module?.source_context?.prepared_at,
    hasCrawl: Boolean(prepStatus.module?.source_context?.crawlDigest),
  }));

  // 3) Lock every interview section using generated options
  await lockAllSections(moduleId);

  // 4) Execute-options + Build ICP brief
  const options = await api(`/api/gtm/modules/${moduleId}/execute-options`);
  const icpOpt = (options.options || []).find((o) => o.id === "icp_brief");
  log("execute-options icp_brief", icpOpt);

  log("POST execute icp_brief");
  const executed = await api(`/api/gtm/modules/${moduleId}/execute`, {
    method: "POST",
    body: { taskId: "icp_brief" },
  });
  log("execute handoff", JSON.stringify({
    ok: executed.ok,
    kind: executed.kind,
    agentTarget: executed.agentTarget,
    deployContext: executed.deployContext,
  }, null, 2));

  // 5) Generate real ICP artifact via Company Intel (Neel / schema)
  const companyId = executed.module?.company_id || COMPANY_ID;
  log("generating ICP artifact for company", companyId);
  const generated = await api(`/api/company-intel/companies/${companyId}/generate`, {
    method: "POST",
    body: {
      type: "icps",
      inputs: {
        gtmModuleId: moduleId,
        gtmDeployContext: executed.deployContext,
        websiteUrl: WEBSITE,
        companyName: COMPANY_NAME,
        source: "gtm_icp_brief",
      },
    },
    timeoutMs: 10 * 60_000,
  });

  const artifact = generated.artifact || generated;
  const outDir = join(__dirname, "output");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `nouriva-icp-brief-${Date.now()}.json`);
  const payload = {
    website: WEBSITE,
    workspaceId: WORKSPACE_ID,
    moduleId,
    companyId,
    execute: {
      agentTarget: executed.agentTarget,
      deployContext: executed.deployContext,
      last_executed_task: executed.module?.profile?.last_executed_task,
    },
    artifact,
  };
  await writeFile(outPath, JSON.stringify(payload, null, 2));

  const data = artifact?.data || {};
  log("\n===== REAL ICP OUTPUT (summary) =====");
  log("ICPs:", (data.icps || []).map((i) => i.name).join(" | ") || "(none)");
  log("Cohorts:", (data.cohorts || []).map((c) => `${c.name} [${c.marketType}]`).join(" | ") || "(none)");
  log("scores:", JSON.stringify(data.scores || {}));
  log("full JSON →", outPath);
  console.log("\n" + JSON.stringify(data, null, 2).slice(0, 8000));
  if (JSON.stringify(data).length > 8000) console.log("\n… truncated in console; see file for full artifact");
}

// Accept HTTP 202 from prep
const _fetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const res = await _fetch(url, init);
  if (res.status === 202) {
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    return {
      ok: true,
      status: 202,
      text: async () => text,
      json: async () => json,
    };
  }
  return res;
};

main().catch((err) => {
  console.error("\n❌ E2E failed:", err.message || err);
  process.exit(1);
});
