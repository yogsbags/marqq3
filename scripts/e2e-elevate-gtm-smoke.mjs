#!/usr/bin/env node
/**
 * Elevate E2E smoke: onboarding Brand DNA → auto sections → Goals strategy drafts.
 *
 *   node scripts/e2e-elevate-gtm-smoke.mjs
 *
 * Requires: backend on BASE_URL (default http://127.0.0.1:3001) + GROQ key in .env
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE = String(process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function loadEnv() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const GROQ_KEY = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || "";
const COMPANY = {
  companyName: "Elevate",
  websiteUrl: "https://theelevate.co.in",
  industry: "Management strategy, AI solutions & digital transformation consulting",
  icp: "Growth-stage companies and mid-market leaders seeking strategy-to-execution partners",
  outcome: "Grow qualified leads from strategy and AI transformation buyers",
  timeWindow: "90 days",
  target: "5 qualified leads per month",
  baseline: "1 qualified lead per month",
  workspaceId: "marqq-ws-1",
};

const AUTO_SECTIONS = [
  "market_analysis",
  "positioning_messaging",
  "distribution_channels",
  "marketing_strategy",
  "sales_strategy",
  "launch_plan",
  "measurement_optimization",
  "risks_contingencies",
  "timeline_roadmap",
];

const GOALS_SECTIONS = ["financial_plan", "customer_success", "operations_execution"];

const results = [];
let failed = 0;

function ok(name, detail = "") {
  results.push({ name, status: "pass", detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  failed += 1;
  results.push({ name, status: "fail", detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 400) };
  }
  return { res, data };
}

function looksLikeCs(blob) {
  const t = String(blob || "").toLowerCase();
  const cs = ["activation", "time-to-value", "retention", "expansion", "health score"].filter((k) =>
    t.includes(k)
  ).length;
  const ops = ["raci", "scorecard", "stack", "standup", "crm hygiene"].filter((k) => t.includes(k))
    .length;
  return cs >= 3 && ops < 2;
}

async function generateGoalsSection(sectionId, prior, brandDna, answers) {
  const skillRes = await jsonFetch(`${BASE}/api/gtm/strategy-section-skills/${sectionId}`);
  const playbook = skillRes.data?.playbook || "";
  const skillIds = skillRes.data?.skillIds || [];

  const lane =
    sectionId === "financial_plan"
      ? "FINANCE ONLY: for zero budget use capacity/hours ceilings, weekly output SLA, and kill rules — concrete bullets not labels. Not CS or ops."
      : sectionId === "customer_success"
        ? "CS ONLY for consulting: REQUIRED themes = kickoff checklist, first-value milestone (14–30d), retainer/expansion gate, weekly at-risk review. FORBIDDEN: health scorecard, SaaS activation, in-app onboarding. Bullet-heavy. Not ops/finance."
        : "OPS ONLY: RACI, stack readiness, weekly scorecard. Never Activation/Expansion/Retention/health scores.";

  const system = `You are a senior GTM strategist. Generate ONE strategy section.
${lane}
BUYER vs SELLER: Elevate sells consulting/strategy execution TO mid-market/growth leaders — not to "AI companies" as peers.
VOICE: "Marqq will…" — never "Elevate should…".
NO invented funding surges.
Return STRICT JSON: {"id":"${sectionId}","title":string,"summary":string,"bullets":string[],"body":string,"subsections":[{"title":string,"body":string,"bullets":string[]}]}
${playbook ? `\n${playbook.slice(0, 6000)}\n` : ""}`;

  const user = JSON.stringify({
    companyName: COMPANY.companyName,
    website: COMPANY.websiteUrl,
    industry: COMPANY.industry,
    icp: COMPANY.icp,
    businessMotion: "services_consulting",
    brandDna: brandDna
      ? {
          companyName: brandDna.companyName,
          brandTagline: brandDna.brandTagline,
          toneOfVoice: brandDna.toneOfVoice,
          businessSummary: brandDna.businessSummary || brandDna.brandSummary,
        }
      : null,
    answers,
    priorApprovedSections: prior.map((s) => ({
      id: s.id,
      title: s.title,
      summary: s.summary,
    })),
    skillIds,
  });

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 2200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  return JSON.parse(raw);
}

function evaluateQuality({ brandDna, autoApproved, goalsDrafts }) {
  console.log("\n[5] Quality evaluation");
  const market = autoApproved.find((s) => s.id === "market_analysis");
  const sales = autoApproved.find((s) => s.id === "sales_strategy");
  const cs = goalsDrafts.find((s) => s.id === "customer_success");
  const ops = goalsDrafts.find((s) => s.id === "operations_execution");
  const fin = goalsDrafts.find((s) => s.id === "financial_plan");

  const marketBlob = [market?.summary, ...(market?.bullets || []), market?.body].join(" ");
  if (/ai and digital transformation companies|digital transformation companies/i.test(marketBlob)) {
    fail("quality:market beachhead", "still treats peer AI/DT companies as buyers");
  } else if (
    /beachhead|starting market|first focus|primary (?:customer )?segment/i.test(marketBlob) &&
    /mid-market|growth-stage|leaders|seeking|buyers|clients/i.test(marketBlob)
  ) {
    ok("quality:market beachhead", "buyer-shaped");
  } else {
    fail("quality:market beachhead", "missing clear starting market");
  }

  if (/recent (?:surge|funding)|surge in demand|recent funding and partnerships/i.test(marketBlob)) {
    fail("quality:no invented surge", "invented market event still present");
  } else {
    ok("quality:no invented surge");
  }

  if (brandDna?.brandTagline && /strategy meets execution/i.test(brandDna.brandTagline)) {
    ok("quality:brand tagline", brandDna.brandTagline);
  } else {
    fail(
      "quality:brand tagline",
      `expected Strategy Meets Execution, got "${brandDna?.brandTagline || ""}"`
    );
  }

  if (/\bThe Elevate\b/.test(brandDna?.businessSummary || brandDna?.brandSummary || "")) {
    fail("quality:brand grammar", "The Elevate");
  } else {
    ok("quality:brand grammar");
  }

  const salesBlob = [sales?.summary, ...(sales?.bullets || []), sales?.body].join(" ").toLowerCase();
  if (/\b(qualif|sla|objection|discovery|proposal|tat|stage)\b/.test(salesBlob)) {
    ok("quality:sales process");
  } else {
    fail("quality:sales process", "missing qualification/SLA/objections");
  }

  const marketing = autoApproved.find((s) => s.id === "marketing_strategy");
  const distribution = autoApproved.find((s) => s.id === "distribution_channels");
  const mktBlob = [marketing?.summary, ...(marketing?.bullets || [])].join(" ").toLowerCase();
  const distBlob = [distribution?.summary, ...(distribution?.bullets || [])].join(" ").toLowerCase();
  const channelWords = ["linkedin", "referral", "google ads", "industry events", "podcast"];
  const mChannels = channelWords.filter((w) => mktBlob.includes(w));
  const dChannels = channelWords.filter((w) => distBlob.includes(w));
  const channelOverlap = mChannels.filter((w) => dChannels.includes(w)).length;
  const hasStrongSpine =
    /\b(campaign spine|offer|narrative|experiment|proof series|message angle|diagnostic|scoped pilot|kill rules)\b/.test(
      mktBlob
    );
  if (channelOverlap >= 3 && !hasStrongSpine) {
    fail("quality:marketing≠distribution", "marketing still restates channel list");
  } else if (hasStrongSpine) {
    ok("quality:marketing≠distribution", "campaign spine present");
  } else {
    fail("quality:marketing≠distribution", "missing campaign/offer/experiment spine");
  }

  const launch = autoApproved.find((s) => s.id === "launch_plan");
  const launchBlob = [launch?.summary, ...(launch?.bullets || []), launch?.body].join(" ").toLowerCase();
  const productHuntMention = /\bproduct hunt\b/.test(launchBlob);
  const productHuntDeprioritized = /depriorit\w*.{0,80}product hunt|product hunt.{0,40}depriorit/i.test(
    launchBlob
  );
  if (productHuntMention && !productHuntDeprioritized) {
    fail("quality:launch services-shaped", "Product Hunt / consumer launch still present");
  } else if (/\b(orb framework|alpha launch)\b/.test(launchBlob)) {
    fail("quality:launch services-shaped", "consumer launch framework still present");
  } else if (/\b(pre-?launch|post-?launch|wk\s*\d|week[s]?\s*\d)\b/.test(launchBlob)) {
    ok("quality:launch services-shaped", "phased + time-boxed");
  } else {
    fail("quality:launch services-shaped", "missing pre/launch/post or week milestones");
  }

  const timeline = autoApproved.find((s) => s.id === "timeline_roadmap");
  const timelineBlob = [timeline?.summary, ...(timeline?.bullets || [])].join(" ");
  const weekNums = [...timelineBlob.matchAll(/week[s]?\s*(\d+)\s*[-–—]?\s*(\d+)?/gi)].flatMap((m) =>
    [m[1], m[2]].filter(Boolean).map(Number)
  );
  const maxWeek = weekNums.length ? Math.max(...weekNums) : 0;
  if (maxWeek > 14) fail("quality:timeline ≤90d", `max week ${maxWeek}`);
  else ok("quality:timeline ≤90d", maxWeek ? `max week ${maxWeek}` : "ok");

  const allAuto = autoApproved.map((s) => s.summary || "").join("\n");
  const elevateShould = (allAuto.match(/\bElevate should\b/gi) || []).length;
  if (elevateShould >= 3) fail("quality:voice", `${elevateShould}× "Elevate should"`);
  else ok("quality:voice", `${elevateShould}× Elevate should (ok if ≤2)`);

  const csBlob = [cs?.summary, ...(cs?.bullets || [])].join(" ").toLowerCase();
  if (/\b(health score|health scorecard)\b/.test(csBlob) && !/\b(kickoff|first value|milestone)\b/.test(csBlob)) {
    fail("quality:cs consulting-shaped", "SaaS health-score CS without kickoff/first-value");
  } else if (/\b(kickoff|first value|engagement|retainer|milestone)\b/.test(csBlob)) {
    ok("quality:cs consulting-shaped");
  } else if (/\bactivation\b/.test(csBlob) && /\bhealth score\b/.test(csBlob)) {
    fail("quality:cs consulting-shaped", "still SaaS activation/health-score heavy");
  } else {
    fail("quality:cs consulting-shaped", "missing consulting CS motifs");
  }

  const opsBlob = [ops?.summary, ...(ops?.bullets || [])].join(" ").toLowerCase();
  if (looksLikeCs(opsBlob)) fail("quality:ops≠cs", "ops still looks like CS");
  else ok("quality:ops≠cs");

  const finBlob = [fin?.summary, ...(fin?.bullets || [])].join(" ").toLowerCase();
  if (/zero|organic|capacity|owned/.test(finBlob)) ok("quality:finance zero-budget aware");
  else fail("quality:finance zero-budget aware", "missing zero/organic framing");

  // Executable-by-Marqq checks
  const positioning = autoApproved.find((s) => s.id === "positioning_messaging");
  const posBlob = [positioning?.summary, ...(positioning?.bullets || [])].join(" ").toLowerCase();
  if (/\b(claim|hook|proof|counter)\b/.test(posBlob)) ok("quality:positioning assets");
  else fail("quality:positioning assets", "missing claim/hook/proof/counter");

  if (/\b(\d+\s*[×x]\/week|per week|warm|cadence|kill)\b/.test(distBlob)) {
    ok("quality:distribution cadence");
  } else {
    fail("quality:distribution cadence", "missing weekly cadence / kill rule");
  }

  const measurement = autoApproved.find((s) => s.id === "measurement_optimization");
  const measBlob = [measurement?.summary, ...(measurement?.bullets || [])].join(" ").toLowerCase();
  if (
    /\b(qualified leads?|primary kpi)\b/.test(measBlob) &&
    /\b(weekly|scorecard|kill|double)\b/.test(measBlob)
  ) {
    ok("quality:measurement scorecard");
  } else {
    fail("quality:measurement scorecard", "missing primary KPI + weekly kill/double loop");
  }

  const risks = autoApproved.find((s) => s.id === "risks_contingencies");
  const riskBlob = [risks?.summary, ...(risks?.bullets || [])].join(" ").toLowerCase();
  if (/\b(if |when |by week|kill|pivot)\b/.test(riskBlob)) ok("quality:risks if/then");
  else fail("quality:risks if/then", "missing trigger → action rules");

  const tlBlob = timelineBlob.toLowerCase();
  const tlMeta =
    (
      tlBlob.match(
        /\b(market analysis|positioning|distribution channels|marketing strategy|sales strategy|launch plan)\b/g
      ) || []
    ).length >= 3;
  const tlExec = /\b(icp|offer|outreach|discovery|warm|kill|qualified)\b/.test(tlBlob);
  if (tlMeta && !tlExec) fail("quality:timeline executable", "meta section-name roadmap");
  else if (tlExec) ok("quality:timeline executable");
  else fail("quality:timeline executable", "missing shippable fortnight outcomes");

  const execSections = autoApproved.filter((s) => {
    const b = [s.summary, ...(s.bullets || [])].join(" ").toLowerCase();
    return /\b(marqq will|week|wk|sla|kill|cadence|ship|publish|book|outreach|scorecard)\b/.test(b);
  });
  if (execSections.length >= 7) ok("quality:executable plan", `${execSections.length}/9 sections actionable`);
  else fail("quality:executable plan", `only ${execSections.length}/9 sections look executable`);

  // Zero-cash realism: no invented paid $ budgets in distribution/marketing
  const moneyBlob = `${distBlob}\n${mktBlob}`;
  if (/\$\s*\d+|weekly budget of\s*\$/i.test(moneyBlob)) {
    fail("quality:zero-cash realism", "invented paid $ budget under zero-cash plan");
  } else {
    ok("quality:zero-cash realism");
  }
}

async function main() {
  console.log(`\nElevate GTM E2E smoke → ${BASE}\n`);
  mkdirSync(OUT_DIR, { recursive: true });

  // 0) Health
  {
    const { res, data } = await jsonFetch(`${BASE}/health`);
    if (res.ok && data?.status === "ok") ok("backend health");
    else fail("backend health", JSON.stringify(data));
  }

  if (!GROQ_KEY) {
    fail("groq key", "GROQ_API_KEY / VITE_GROQ_API_KEY missing");
    process.exit(1);
  }
  ok("groq key present");

  // 1) Brand DNA (onboarding step)
  let brandDna = null;
  let signals = null;
  {
    console.log("\n[1] Brand DNA");
    const { res, data } = await jsonFetch(`${BASE}/api/brand-dna`, {
      method: "POST",
      body: JSON.stringify({
        companyName: COMPANY.companyName,
        websiteUrl: COMPANY.websiteUrl,
        industry: COMPANY.industry,
        icp: COMPANY.icp,
        workspaceId: COMPANY.workspaceId,
      }),
    });
    brandDna = data?.brandDna || null;
    signals = data?.signals || null;
    if (brandDna && (brandDna.brandTagline || brandDna.businessSummary || brandDna.brandSummary)) {
      ok(
        "brand-dna synthesize",
        `${brandDna.brandTagline || "no tagline"} · colors=${(brandDna.colors || []).length}`
      );
    } else if (res.ok && brandDna) {
      ok("brand-dna synthesize (thin)", "got object but sparse fields");
    } else {
      fail("brand-dna synthesize", JSON.stringify(data)?.slice(0, 200));
    }

    const ctx = await jsonFetch(
      `${BASE}/api/brand-dna/context?workspaceId=${encodeURIComponent(COMPANY.workspaceId)}`
    );
    if (ctx.res.ok && ctx.data) ok("brand-dna context persisted");
    else fail("brand-dna context", String(ctx.res.status));
  }

  // 2) Auto sections (onboarding GTM drafts)
  console.log("\n[2] Auto strategy sections (9)");
  const autoApproved = [];
  for (const sectionId of AUTO_SECTIONS) {
    const t0 = Date.now();
    const { res, data } = await jsonFetch(`${BASE}/api/gtm/auto-sections/generate`, {
      method: "POST",
      body: JSON.stringify({
        sectionId,
        companyName: COMPANY.companyName,
        websiteUrl: COMPANY.websiteUrl,
        industry: COMPANY.industry,
        icp: COMPANY.icp,
        brandDna: {
          companyName: COMPANY.companyName,
          websiteUrl: COMPANY.websiteUrl,
          brandTagline: brandDna?.brandTagline,
          businessSummary: brandDna?.businessSummary || brandDna?.brandSummary,
          toneOfVoice: brandDna?.toneOfVoice,
          colors: brandDna?.colors,
          fonts: brandDna?.fonts,
        },
        onboarding: {
          company: COMPANY.companyName,
          websiteUrl: COMPANY.websiteUrl,
          industry: COMPANY.industry,
          icp: COMPANY.icp,
          primaryGoal: COMPANY.outcome,
          goals: COMPANY.outcome,
          timelineTarget: COMPANY.timeWindow,
          quantifiedTarget: COMPANY.target,
          successBaseline: COMPANY.baseline,
          budgetBand: "zero",
          budget: "zero — organic & owned only",
        },
        priorSections: autoApproved.map((s) => ({
          id: s.id,
          title: s.title,
          summary: s.summary,
          bullets: s.bullets,
        })),
      }),
    });
    const section = data?.section;
    const ms = Date.now() - t0;
    if (!res.ok || !section?.summary || !(section.bullets || []).length) {
      fail(
        `auto:${sectionId}`,
        data?.error || data?.warning || `HTTP ${res.status} / empty`
      );
      continue;
    }
    if (sectionId === "market_analysis") {
      const starting = (section.bullets || []).some((b) =>
        /beachhead|starting market|first focus|primary (?:customer )?segment/i.test(b)
      );
      if (!starting) fail(`auto:${sectionId}`, "missing Starting market bullet");
      else ok(`auto:${sectionId}`, `${ms}ms · skills=${(data.skillIds || []).slice(0, 2).join(",")}`);
    } else {
      ok(`auto:${sectionId}`, `${ms}ms · ${section.bullets.length} bullets`);
    }
    autoApproved.push({
      id: section.id || sectionId,
      title: section.title,
      summary: section.summary,
      bullets: section.bullets,
      body: section.body,
    });
  }

  // 3) Goals strategy drafts (skills + lane separation)
  console.log("\n[3] Goals strategy drafts (financial → CS → ops)");
  const goalsAnswers = {
    quantified_target: { value: "custom", label: COMPANY.target },
    timeline_target: { value: "90d", label: COMPANY.timeWindow },
    priority_90d: { value: "custom", label: COMPANY.outcome },
    channel_bet: { value: "organic", label: "Organic / content-led" },
    budget_band: { value: "zero", label: "₹0 / $0 — organic & owned only" },
    success_baseline: { value: "custom", label: COMPANY.baseline },
    strategy_depth: { value: "practical_90d", label: "Practical 90-day execution" },
  };

  const goalsDrafts = [];
  for (const sectionId of GOALS_SECTIONS) {
    try {
      const skillCheck = await jsonFetch(`${BASE}/api/gtm/strategy-section-skills/${sectionId}`);
      if (!skillCheck.data?.loaded) {
        fail(`skills:${sectionId}`, skillCheck.data?.warning || "not loaded");
      } else {
        ok(`skills:${sectionId}`, skillCheck.data.skillIds?.join(", "));
      }

      const t0 = Date.now();
      const draft = await generateGoalsSection(
        sectionId,
        [...autoApproved.slice(-3), ...goalsDrafts],
        brandDna,
        goalsAnswers
      );
      const ms = Date.now() - t0;
      let finalDraft = draft;

      // Consulting CS guard — replace SaaS-shaped drafts
      if (sectionId === "customer_success") {
        const blob = [draft.summary, ...(draft.bullets || [])].join(" ").toLowerCase();
        if (
          /\b(health score|health scorecard)\b/.test(blob) &&
          !/\b(kickoff|first value|milestone)\b/.test(blob)
        ) {
          console.warn("  ! cs SaaS-shaped — applying consulting rewrite");
          finalDraft = {
            id: "customer_success",
            title: "Customer success",
            summary: `Marqq will run post-sale success for Elevate as kickoff → first value → expansion toward ${COMPANY.target}.`,
            bullets: [
              "Marqq will complete kickoff within 5 business days of close",
              "Marqq will define a first-value milestone inside 14–30 days",
              "Marqq will gate retainer/expansion on first-value proof",
              "Marqq will run a weekly at-risk review on active engagements",
              "Marqq will capture reference proof for messaging after milestones",
            ],
            body: "",
            subsections: [
              {
                title: "Kickoff & first value",
                body: "",
                bullets: ["Kickoff checklist", "Named first-value milestone", "SOW success criteria"],
              },
              {
                title: "Expansion",
                body: "",
                bullets: ["Retainer offer after proof", "Phase-2 one-pager", "Proof for GTM"],
              },
            ],
          };
        }
      }

      const blob = [finalDraft.summary, ...(finalDraft.bullets || []), finalDraft.body]
        .join(" ")
        .toLowerCase();

      if (!finalDraft.summary || !(finalDraft.bullets || []).length) {
        fail(`goals:${sectionId}`, "empty draft");
        continue;
      }

      if (sectionId === "operations_execution" && looksLikeCs(blob)) {
        fail(`goals:${sectionId}`, "looks like customer_success clone");
      } else if (
        sectionId === "customer_success" &&
        /raci|weekly scorecard/.test(blob) &&
        !/kickoff|first value|retention|expansion/.test(blob)
      ) {
        fail(`goals:${sectionId}`, "looks like ops, not CS");
      } else {
        ok(`goals:${sectionId}`, `${ms}ms · ${finalDraft.bullets.length} bullets`);
      }

      goalsDrafts.push({
        id: finalDraft.id || sectionId,
        title: finalDraft.title,
        summary: finalDraft.summary,
        bullets: finalDraft.bullets,
        body: finalDraft.body,
        subsections: finalDraft.subsections,
      });
    } catch (err) {
      fail(`goals:${sectionId}`, err.message);
    }
  }

  // 4) Assemble smoke strategy artifact
  console.log("\n[4] Assemble strategy artifact");
  const allSections = [...autoApproved, ...goalsDrafts];
  const doc = {
    title: `${COMPANY.companyName} GTM Strategy (smoke)`,
    company: COMPANY,
    brandDna: {
      tagline: brandDna?.brandTagline,
      summary: brandDna?.businessSummary || brandDna?.brandSummary,
      tone: brandDna?.toneOfVoice,
      colors: brandDna?.colors,
      logo: signals?.logoUrl || signals?.faviconUrl,
    },
    executiveSummary: `Marqq will help ${COMPANY.companyName} reach ${COMPANY.target} in ${COMPANY.timeWindow} for ${COMPANY.icp}, using Brand DNA drafts plus Goals financial/CS/ops plans.`,
    autoSections: autoApproved,
    goalsSections: goalsDrafts,
    sectionCount: allSections.length,
    generatedAt: new Date().toISOString(),
  };

  if (allSections.length >= 10) ok("strategy assembly", `${allSections.length} sections`);
  else fail("strategy assembly", `only ${allSections.length} sections`);

  evaluateQuality({ brandDna, autoApproved, goalsDrafts });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(OUT_DIR, `elevate-gtm-smoke-${stamp}.json`);
  const mdPath = join(OUT_DIR, `elevate-gtm-smoke-${stamp}.md`);

  writeFileSync(jsonPath, JSON.stringify({ results, doc }, null, 2));

  const md = [
    `# ${doc.title}`,
    ``,
    `Generated: ${doc.generatedAt}`,
    ``,
    `## Executive summary`,
    doc.executiveSummary,
    ``,
    `## Brand DNA`,
    `- Tagline: ${doc.brandDna.tagline || "—"}`,
    `- Tone: ${doc.brandDna.tone || "—"}`,
    `- Summary: ${doc.brandDna.summary || "—"}`,
    ``,
    `## Auto sections`,
    ...autoApproved.flatMap((s) => [
      `### ${s.title}`,
      s.summary,
      ...(s.bullets || []).map((b) => `- ${b}`),
      "",
    ]),
    `## Goals drafts`,
    ...goalsDrafts.flatMap((s) => [
      `### ${s.title || s.id}`,
      s.summary,
      ...(s.bullets || []).map((b) => `- ${b}`),
      "",
    ]),
    `## Smoke results`,
    ...results.map((r) => `- ${r.status.toUpperCase()} ${r.name}${r.detail ? `: ${r.detail}` : ""}`),
  ].join("\n");
  writeFileSync(mdPath, md);

  console.log(`\nArtifacts:\n  ${jsonPath}\n  ${mdPath}`);
  console.log(`\n${failed === 0 ? "PASS" : `FAIL (${failed})`} — ${results.filter((r) => r.status === "pass").length}/${results.length} checks\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
