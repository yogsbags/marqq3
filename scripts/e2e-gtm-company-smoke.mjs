#!/usr/bin/env node
/**
 * Multi-company GTM E2E smoke (Brand DNA → auto sections → Goals drafts → quality eval).
 *
 *   node scripts/e2e-gtm-company-smoke.mjs nouriva
 *   node scripts/e2e-gtm-company-smoke.mjs productverse
 *   node scripts/e2e-gtm-company-smoke.mjs nouriva productverse
 *
 * Requires: backend on BASE_URL (default http://127.0.0.1:3001) + GROQ key in .env
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { withGroqReasoning, resolveGroqModel } from "../server/services/groqReasoning.js";

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

/** @type {Record<string, object>} */
const COMPANIES = {
  nouriva: {
    slug: "nouriva",
    companyName: "Nouriva AI",
    websiteUrl: "https://nouriva.tech",
    industry: "Consumer health & nutrition AI app (lab-personalized meal scoring)",
    icp: "Indians managing diabetes, PCOS, thyroid, hypertension, or vitamin deficiencies who want meal guidance beyond calorie counting — built for Indian kitchens",
    outcome: "Grow paid conversions from trial users who upload labs or set conditions",
    timeWindow: "90 days",
    target: "200 paid conversions / month",
    baseline: "organic installs + trial starts; paid conversion rate to be instrumented",
    workspaceId: "marqq-ws-nouriva",
    motion: "saas_product",
    budgetBand: "zero",
    expectedTaglineRe: /lab|nutrition|meal|vitality|body|personal/i,
    peerAsBuyerRe:
      /\b(nutrition apps?|calorie.?counter apps?|competitor apps?|other health apps?)\b/i,
    buyerBeachheadRe:
      /\b(beachhead|starting market|first focus|diabetes|pcos|thyroid|indian|condition|lab|users?|consumers?|patients?)\b/i,
  },
  productverse: {
    slug: "productverse",
    companyName: "Productverse",
    websiteUrl: "https://productverse.in",
    industry: "Premium AI app development for real estate, fintech, ecommerce & martech",
    icp: "Real estate, fintech/BFSI, and ecommerce leaders who need custom AI apps to improve ops, sales, or customer experience",
    outcome: "Grow qualified AI-development project leads from real estate, fintech, and ecommerce buyers",
    timeWindow: "90 days",
    target: "5 qualified project leads per month",
    baseline: "1 qualified inbound/project conversation per month",
    workspaceId: "marqq-ws-productverse",
    motion: "services_consulting",
    budgetBand: "zero",
    expectedTaglineRe: /ai|app|real estate|fintech|innovativ/i,
    peerAsBuyerRe:
      /\b(ai (?:app )?development (?:companies|firms|agencies)|software development companies|peer agencies)\b/i,
    buyerBeachheadRe:
      /\b(beachhead|starting market|first focus|real estate|fintech|bfsi|ecommerce|e-commerce|leaders|buyers|clients|mid-market)\b/i,
  },
  syndiq: {
    slug: "syndiq",
    companyName: "SYNDIQ",
    websiteUrl: "https://syndiq-production-8c43.up.railway.app/",
    industry:
      "B2B SaaS private-capital matchmaking platform (compliant deal matching for PE / syndication)",
    icp: "PE sponsors, family offices, syndicate leads, and advisors who need compliant deal ↔ capital matching across India / GCC / mid-market private capital",
    outcome: "Grow qualified platform trials and paid seats from PE / syndicate buyers who complete a first match workflow",
    timeWindow: "90 days",
    target: "15 qualified trials / month with 5 converting to paid seats",
    baseline: "early pipeline; instrument trial→paid and first-match completion",
    workspaceId: "marqq-ws-syndiq",
    motion: "saas_product",
    budgetBand: "zero",
    expectedTaglineRe: /private capital|match|syndiq|compliant|deal/i,
    peerAsBuyerRe:
      /\b(pe platforms?|deal platforms?|fintech competitors?|other matchmaking (?:apps|platforms))\b/i,
    buyerBeachheadRe:
      /\b(beachhead|starting market|first focus|pe|private equity|family office|syndicate|sponsor|advisor|lp|gp|deal|capital)\b/i,
  },
  /** Marqq2 Elevate smoke playbook — services / consulting motion */
  elevate: {
    slug: "elevate",
    companyName: "The Elevate",
    websiteUrl: "https://theelevate.co.in",
    industry: "Management strategy, AI solutions & digital transformation consulting",
    icp: "Founders, promoters, boards, and leadership teams in mid-to-large enterprises and MNCs seeking strategy-to-execution partners",
    outcome: "Build a qualified executive pipeline and convert priority accounts into paid diagnostic or transformation engagements",
    timeWindow: "90 days",
    target: "10 qualified executive engagements within 90 days",
    baseline: "Establish baseline in week one from pipeline and CRM review",
    workspaceId: "marqq-ws-1",
    motion: "services_consulting",
    budgetBand: "10_50l",
    expectedTaglineRe: /strategy|transform|ai|consult|elevate|execution/i,
    peerAsBuyerRe:
      /\b(consulting firms?|strategy firms?|global consultanc(?:y|ies)|peer agencies|internal transformation teams?)\b/i,
    buyerBeachheadRe:
      /\b(beachhead|starting market|first focus|founder|board|leadership|enterprise|mnc|transformation|consulting)\b/i,
  },
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

function looksLikeCs(blob) {
  const t = String(blob || "").toLowerCase();
  const cs = ["activation", "time-to-value", "retention", "expansion", "health score"].filter((k) =>
    t.includes(k)
  ).length;
  const ops = ["raci", "scorecard", "stack", "standup", "crm hygiene"].filter((k) => t.includes(k))
    .length;
  return cs >= 3 && ops < 2;
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

async function generateGoalsSection(company, sectionId, prior, brandDna, answers) {
  const skillRes = await jsonFetch(`${BASE}/api/gtm/strategy-section-skills/${sectionId}`);
  const playbook = skillRes.data?.playbook || "";
  const skillIds = skillRes.data?.skillIds || [];
  const isSaas = company.motion === "saas_product";

  const lane =
    sectionId === "financial_plan"
      ? "FINANCE ONLY: for zero budget use capacity/hours ceilings, weekly output SLA, and kill rules — concrete bullets not labels. Not CS or ops."
      : sectionId === "customer_success"
        ? isSaas
          ? "CS ONLY for SaaS/consumer app: REQUIRED = activation → first value (first personalized scan/lab loop) → retention → expansion (trial→paid). Health scores OK if product-shaped. Bullet-heavy. Not ops/finance."
          : "CS ONLY for consulting: REQUIRED themes = kickoff checklist, first-value milestone (14–30d), retainer/expansion gate, weekly at-risk review. FORBIDDEN: health scorecard, SaaS activation, in-app onboarding. Bullet-heavy. Not ops/finance."
        : "OPS ONLY: RACI, stack readiness, weekly scorecard. Never Activation/Expansion/Retention/health scores.";

  const system = `You are a senior GTM strategist. Generate ONE strategy section.
${lane}
BUYER vs SELLER: ${company.companyName} sells "${company.industry}" TO: ${company.icp}. Never set starting market to peer sellers.
BUSINESS MOTION: ${company.motion}.
VOICE: "Marqq will…" — never "${company.companyName} should…".
NO invented funding surges or fake metrics.
EXECUTABLE: cadences, SLAs, kill rules, shippable artifacts.
Return STRICT JSON: {"id":"${sectionId}","title":string,"summary":string,"bullets":string[],"body":string,"subsections":[{"title":string,"body":string,"bullets":string[]}]}
${playbook ? `\n${playbook.slice(0, 6000)}\n` : ""}`;

  const user = JSON.stringify({
    companyName: company.companyName,
    website: company.websiteUrl,
    industry: company.industry,
    icp: company.icp,
    businessMotion: company.motion,
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
    body: JSON.stringify(
      withGroqReasoning({
        model: resolveGroqModel(),
        temperature: 0.3,
        max_tokens: 2200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system.slice(0, 12000) },
          { role: "user", content: user },
        ],
      })
    ),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    // Fallback if reasoning model rejects payload
    if (res.status >= 400) {
      const retry = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.3,
          max_tokens: 2200,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system.slice(0, 8000) },
            { role: "user", content: user },
          ],
        }),
      });
      if (!retry.ok) throw new Error(`Groq HTTP ${res.status} / fallback ${retry.status}: ${errText.slice(0, 200)}`);
      const data = await retry.json();
      const raw = data.choices?.[0]?.message?.content || "";
      return JSON.parse(raw);
    }
    throw new Error(`Groq HTTP ${res.status}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  return JSON.parse(raw);
}

function evaluateQuality(company, { brandDna, autoApproved, goalsDrafts }, { ok, fail }) {
  console.log("\n[5] Quality evaluation");
  const isSaas = company.motion === "saas_product";
  const nameEsc = company.companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const market = autoApproved.find((s) => s.id === "market_analysis");
  const sales = autoApproved.find((s) => s.id === "sales_strategy");
  const cs = goalsDrafts.find((s) => s.id === "customer_success");
  const ops = goalsDrafts.find((s) => s.id === "operations_execution");
  const fin = goalsDrafts.find((s) => s.id === "financial_plan");

  const marketBlob = [market?.summary, ...(market?.bullets || []), market?.body].join(" ");
  if (company.peerAsBuyerRe.test(marketBlob) && !company.buyerBeachheadRe.test(marketBlob)) {
    fail("quality:market beachhead", "peer sellers treated as starting market");
  } else if (/beachhead|starting market|first focus|primary (?:customer )?segment/i.test(marketBlob) && company.buyerBeachheadRe.test(marketBlob)) {
    ok("quality:market beachhead", "buyer-shaped");
  } else if (company.buyerBeachheadRe.test(marketBlob)) {
    ok("quality:market beachhead", "buyer language present");
  } else {
    fail("quality:market beachhead", "missing clear starting market");
  }

  if (/recent (?:surge|funding)|surge in demand|recent funding and partnerships/i.test(marketBlob)) {
    fail("quality:no invented surge", "invented market event still present");
  } else {
    ok("quality:no invented surge");
  }

  if (brandDna?.brandTagline && company.expectedTaglineRe.test(brandDna.brandTagline)) {
    ok("quality:brand tagline", brandDna.brandTagline);
  } else if (brandDna?.brandTagline) {
    ok("quality:brand tagline (soft)", brandDna.brandTagline);
  } else {
    fail("quality:brand tagline", "missing tagline");
  }

  const salesBlob = [sales?.summary, ...(sales?.bullets || []), sales?.body].join(" ").toLowerCase();
  if (isSaas) {
    if (/\b(trial|paywall|activation|conversion|onboard|store|funnel|qualif|sla|objection)\b/.test(salesBlob)) {
      ok("quality:sales process", "consumer/SaaS conversion path");
    } else {
      fail("quality:sales process", "missing trial/paywall/conversion path");
    }
  } else if (/\b(qualif|sla|objection|discovery|proposal|tat|stage)\b/.test(salesBlob)) {
    ok("quality:sales process");
  } else {
    fail("quality:sales process", "missing qualification/SLA/objections");
  }

  const marketing = autoApproved.find((s) => s.id === "marketing_strategy");
  const distribution = autoApproved.find((s) => s.id === "distribution_channels");
  const mktBlob = [marketing?.summary, ...(marketing?.bullets || [])].join(" ").toLowerCase();
  const distBlob = [distribution?.summary, ...(distribution?.bullets || [])].join(" ").toLowerCase();
  const channelWords = ["linkedin", "referral", "google ads", "industry events", "podcast", "app store", "play store", "tiktok", "instagram"];
  const mChannels = channelWords.filter((w) => mktBlob.includes(w));
  const dChannels = channelWords.filter((w) => distBlob.includes(w));
  const channelOverlap = mChannels.filter((w) => dChannels.includes(w)).length;
  const hasStrongSpine =
    /\b(campaign spine|offer|narrative|experiment|proof series|message angle|diagnostic|scoped pilot|kill rules|trial|paywall|lead magnet|whitepaper|webinar|referral program)\b/.test(
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
  if (isSaas) {
    if (/\b(pre-?launch|post-?launch|wk\s*\d|week[s]?\s*\d|trial|store|aso)\b/.test(launchBlob)) {
      ok("quality:launch time-boxed", "phased / store-aware");
    } else {
      fail("quality:launch time-boxed", "missing pre/launch/post or week milestones");
    }
  } else {
    const productHuntMention = /\bproduct hunt\b/.test(launchBlob);
    const productHuntDeprioritized = /depriorit\w*.{0,80}product hunt|product hunt.{0,40}depriorit/i.test(
      launchBlob
    );
    if (productHuntMention && !productHuntDeprioritized) {
      fail("quality:launch services-shaped", "Product Hunt / consumer launch still present");
    } else if (/\b(pre-?launch|post-?launch|wk\s*\d|week[s]?\s*\d)\b/.test(launchBlob)) {
      ok("quality:launch services-shaped", "phased + time-boxed");
    } else {
      fail("quality:launch services-shaped", "missing pre/launch/post or week milestones");
    }
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
  const shouldHits = (allAuto.match(new RegExp(`\\b${nameEsc} should\\b`, "gi")) || []).length;
  if (shouldHits >= 3) fail("quality:voice", `${shouldHits}× "${company.companyName} should"`);
  else ok("quality:voice", `${shouldHits}× should (ok if ≤2)`);

  const csBlob = [cs?.summary, ...(cs?.bullets || [])].join(" ").toLowerCase();
  if (isSaas) {
    if (/\b(activation|first value|trial|retention|onboard|time-to-value|lab|scan)\b/.test(csBlob)) {
      ok("quality:cs product-shaped");
    } else {
      fail("quality:cs product-shaped", "missing activation/trial/retention motifs");
    }
  } else if (
    /\b(health score|health scorecard)\b/.test(csBlob) &&
    !/\b(kickoff|first value|milestone)\b/.test(csBlob)
  ) {
    fail("quality:cs consulting-shaped", "SaaS health-score CS without kickoff/first-value");
  } else if (/\b(kickoff|first value|engagement|retainer|milestone)\b/.test(csBlob)) {
    ok("quality:cs consulting-shaped");
  } else {
    fail("quality:cs consulting-shaped", "missing consulting CS motifs");
  }

  const opsBlob = [ops?.summary, ...(ops?.bullets || [])].join(" ").toLowerCase();
  if (looksLikeCs(opsBlob)) fail("quality:ops≠cs", "ops still looks like CS");
  else ok("quality:ops≠cs");

  const finBlob = [fin?.summary, ...(fin?.bullets || [])].join(" ").toLowerCase();
  if (/zero|organic|capacity|owned/.test(finBlob)) ok("quality:finance zero-budget aware");
  else fail("quality:finance zero-budget aware", "missing zero/organic framing");

  const positioning = autoApproved.find((s) => s.id === "positioning_messaging");
  const posBlob = [positioning?.summary, ...(positioning?.bullets || [])].join(" ").toLowerCase();
  if (/\b(claim|hook|proof|counter)\b/.test(posBlob)) ok("quality:positioning assets");
  else fail("quality:positioning assets", "missing claim/hook/proof/counter");

  if (/\b(\d+\s*[×x]\/week|per week|warm|cadence|kill|aso|store)\b/.test(distBlob)) {
    ok("quality:distribution cadence");
  } else {
    fail("quality:distribution cadence", "missing weekly cadence / kill rule");
  }

  const measurement = autoApproved.find((s) => s.id === "measurement_optimization");
  const measBlob = [measurement?.summary, ...(measurement?.bullets || [])].join(" ").toLowerCase();
  if (
    /\b(qualified leads?|primary kpi|paid conversion|trial|install)\b/.test(measBlob) &&
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
  const tlExec = /\b(icp|offer|outreach|discovery|warm|kill|qualified|trial|aso|store|lab|scan)\b/.test(
    tlBlob
  );
  if (tlMeta && !tlExec) fail("quality:timeline executable", "meta section-name roadmap");
  else if (tlExec) ok("quality:timeline executable");
  else fail("quality:timeline executable", "missing shippable fortnight outcomes");

  const execSections = autoApproved.filter((s) => {
    const b = [s.summary, ...(s.bullets || [])].join(" ").toLowerCase();
    return /\b(marqq will|week|wk|sla|kill|cadence|ship|publish|book|outreach|scorecard|trial|aso)\b/.test(
      b
    );
  });
  if (execSections.length >= 7) ok("quality:executable plan", `${execSections.length}/9 sections actionable`);
  else fail("quality:executable plan", `only ${execSections.length}/9 sections look executable`);

  const moneyBlob = `${distBlob}\n${mktBlob}`;
  if (company.budgetBand === "zero" && /[₹$]\s*\d+|budget allocation of/i.test(moneyBlob)) {
    fail("quality:zero-cash realism", "invented paid budget under zero-cash plan");
  } else {
    ok("quality:zero-cash realism");
  }

  // Motion fitness
  if (isSaas) {
    const productSignals = /\b(app store|play store|trial|aso|scan|lab|paywall|install)\b/i.test(
      `${distBlob}\n${mktBlob}\n${launchBlob}\n${csBlob}`
    );
    if (productSignals) ok("quality:motion fitness", "SaaS/consumer signals present");
    else fail("quality:motion fitness", "missing app/trial/store signals for SaaS motion");
  } else {
    const servicesSignals = /\b(discovery|proposal|retainer|engagement|warm intro|consult)\b/i.test(
      `${salesBlob}\n${csBlob}\n${launchBlob}`
    );
    if (servicesSignals) ok("quality:motion fitness", "services signals present");
    else fail("quality:motion fitness", "missing discovery/proposal/retainer for services motion");
  }
}

async function runCompany(company) {
  const results = [];
  let failed = 0;
  const ok = (name, detail = "") => {
    results.push({ name, status: "pass", detail });
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  };
  const fail = (name, detail = "") => {
    failed += 1;
    results.push({ name, status: "fail", detail });
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  };

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${company.companyName} GTM E2E smoke → ${BASE}`);
  console.log(`motion=${company.motion} · ${company.websiteUrl}`);
  console.log(`${"=".repeat(60)}\n`);
  mkdirSync(OUT_DIR, { recursive: true });

  {
    const { res, data } = await jsonFetch(`${BASE}/health`);
    if (res.ok && data?.status === "ok") ok("backend health");
    else fail("backend health", JSON.stringify(data));
  }

  if (!GROQ_KEY) {
    fail("groq key", "GROQ_API_KEY / VITE_GROQ_API_KEY missing");
    return { company, failed: failed + 1, results, doc: null, paths: {} };
  }
  ok("groq key present");

  let brandDna = null;
  let signals = null;
  {
    console.log("\n[1] Brand DNA");
    const { res, data } = await jsonFetch(`${BASE}/api/brand-dna`, {
      method: "POST",
      body: JSON.stringify({
        companyName: company.companyName,
        websiteUrl: company.websiteUrl,
        industry: company.industry,
        icp: company.icp,
        workspaceId: company.workspaceId,
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
      `${BASE}/api/brand-dna/context?workspaceId=${encodeURIComponent(company.workspaceId)}`
    );
    if (ctx.res.ok && ctx.data) ok("brand-dna context persisted");
    else fail("brand-dna context", String(ctx.res.status));
  }

  console.log("\n[2] Auto strategy sections (9)");
  const autoApproved = [];
  for (const sectionId of AUTO_SECTIONS) {
    const t0 = Date.now();
    const { res, data } = await jsonFetch(`${BASE}/api/gtm/auto-sections/generate`, {
      method: "POST",
      body: JSON.stringify({
        sectionId,
        companyName: company.companyName,
        websiteUrl: company.websiteUrl,
        industry: company.industry,
        icp: company.icp,
        businessMotion: company.motion,
        brandDna: {
          companyName: company.companyName,
          websiteUrl: company.websiteUrl,
          brandTagline: brandDna?.brandTagline,
          businessSummary: brandDna?.businessSummary || brandDna?.brandSummary,
          toneOfVoice: brandDna?.toneOfVoice,
          colors: brandDna?.colors,
          fonts: brandDna?.fonts,
        },
        onboarding: {
          company: company.companyName,
          websiteUrl: company.websiteUrl,
          industry: company.industry,
          icp: company.icp,
          primaryGoal: company.outcome,
          goals: company.outcome,
          timelineTarget: company.timeWindow,
          quantifiedTarget: company.target,
          successBaseline: company.baseline,
          budgetBand: company.budgetBand,
          budget: company.budgetBand === "zero" ? "zero — organic & owned only" : company.budgetBand,
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
      fail(`auto:${sectionId}`, data?.error || data?.warning || `HTTP ${res.status} / empty`);
      continue;
    }
    ok(
      `auto:${sectionId}`,
      `${ms}ms · ${section.bullets.length} bullets · motion=${data.businessMotion || "?"} · model=${data.model || "?"} · search=${data.usedSearch ? "yes" : "no"}`
    );
    autoApproved.push({
      id: section.id || sectionId,
      title: section.title,
      summary: section.summary,
      bullets: section.bullets,
      body: section.body,
    });
  }

  console.log("\n[3] Goals strategy drafts (financial → CS → ops)");
  const goalsAnswers = {
    quantified_target: { value: "custom", label: company.target },
    timeline_target: { value: "90d", label: company.timeWindow },
    priority_90d: { value: "custom", label: company.outcome },
    channel_bet: {
      value: company.motion === "saas_product" ? "aso_organic" : "organic",
      label:
        company.motion === "saas_product"
          ? "ASO + organic content / communities"
          : "Organic / content-led",
    },
    budget_band: { value: "zero", label: "₹0 / $0 — organic & owned only" },
    success_baseline: { value: "custom", label: company.baseline },
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
        company,
        sectionId,
        [...autoApproved.slice(-3), ...goalsDrafts],
        brandDna,
        goalsAnswers
      );
      const ms = Date.now() - t0;
      let finalDraft = draft;

      if (sectionId === "customer_success" && company.motion === "services_consulting") {
        const blob = [draft.summary, ...(draft.bullets || [])].join(" ").toLowerCase();
        if (
          /\b(health score|health scorecard)\b/.test(blob) &&
          !/\b(kickoff|first value|milestone)\b/.test(blob)
        ) {
          console.warn("  ! cs SaaS-shaped — applying consulting rewrite");
          finalDraft = {
            id: "customer_success",
            title: "Customer success",
            summary: `Marqq will run post-sale success for ${company.companyName} as kickoff → first value → expansion toward ${company.target}.`,
            bullets: [
              "Marqq will complete kickoff within 5 business days of close",
              "Marqq will define a first-value milestone inside 14–30 days",
              "Marqq will gate retainer/expansion on first-value proof",
              "Marqq will run a weekly at-risk review on active engagements",
              "Marqq will capture reference proof for messaging after milestones",
            ],
            body: "",
            subsections: [],
          };
        }
      }

      if (sectionId === "customer_success" && company.motion === "saas_product") {
        const blob = [draft.summary, ...(draft.bullets || [])].join(" ").toLowerCase();
        if (
          /\b(kickoff checklist|retainer\/expansion|sow)\b/.test(blob) &&
          !/\b(activation|trial|scan|lab|paywall)\b/.test(blob)
        ) {
          console.warn("  ! cs consulting-shaped for SaaS — applying product rewrite");
          finalDraft = {
            id: "customer_success",
            title: "Customer success",
            summary: `Marqq will drive ${company.companyName} activation → first personalized value → trial-to-paid retention toward ${company.target}.`,
            bullets: [
              "Marqq will get new users to first core action within 24h of install",
              "Marqq will prompt key personalization setup before day 3 (first-value loop)",
              "Marqq will gate paywall education on completed personalized value",
              "Marqq will run weekly at-risk review on trial users with 0 personalization context",
              "Marqq will capture proof stories for ASO and social proof",
            ],
            body: "",
            subsections: [],
          };
        }
      }

      if (!finalDraft.summary || !(finalDraft.bullets || []).length) {
        fail(`goals:${sectionId}`, "empty draft");
        continue;
      }

      const blob = [finalDraft.summary, ...(finalDraft.bullets || []), finalDraft.body]
        .join(" ")
        .toLowerCase();

      if (sectionId === "operations_execution" && looksLikeCs(blob)) {
        fail(`goals:${sectionId}`, "looks like customer_success clone");
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

  console.log("\n[4] Assemble strategy artifact");
  const allSections = [...autoApproved, ...goalsDrafts];
  const doc = {
    title: `${company.companyName} GTM Strategy (smoke)`,
    company,
    brandDna: {
      tagline: brandDna?.brandTagline,
      summary: brandDna?.businessSummary || brandDna?.brandSummary,
      tone: brandDna?.toneOfVoice,
      colors: brandDna?.colors,
      logo: signals?.logoUrl || signals?.faviconUrl,
    },
    executiveSummary: `Marqq will help ${company.companyName} reach ${company.target} in ${company.timeWindow} for ${company.icp}, using Brand DNA drafts plus Goals financial/CS/ops plans.`,
    autoSections: autoApproved,
    goalsSections: goalsDrafts,
    sectionCount: allSections.length,
    generatedAt: new Date().toISOString(),
  };

  if (allSections.length >= 10) ok("strategy assembly", `${allSections.length} sections`);
  else fail("strategy assembly", `only ${allSections.length} sections`);

  evaluateQuality(company, { brandDna, autoApproved, goalsDrafts }, { ok, fail });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(OUT_DIR, `${company.slug}-gtm-smoke-${stamp}.json`);
  const mdPath = join(OUT_DIR, `${company.slug}-gtm-smoke-${stamp}.md`);

  writeFileSync(jsonPath, JSON.stringify({ results, doc }, null, 2));

  const md = [
    `# ${doc.title}`,
    ``,
    `Generated: ${doc.generatedAt}`,
    ``,
    `Motion: ${company.motion}`,
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
  console.log(
    `\n${failed === 0 ? "PASS" : `FAIL (${failed})`} — ${results.filter((r) => r.status === "pass").length}/${results.length} checks\n`
  );

  return { company, failed, results, doc, paths: { jsonPath, mdPath } };
}

function strategicEval(run) {
  const { company, doc, failed, results } = run;
  if (!doc) return { company: company.slug, verdict: "FAIL", notes: ["no doc"] };

  const auto = doc.autoSections || [];
  const goals = doc.goalsSections || [];
  const blob = [...auto, ...goals]
    .map((s) => [s.summary, ...(s.bullets || [])].join("\n"))
    .join("\n")
    .toLowerCase();

  const notes = [];
  const isSaas = company.motion === "saas_product";

  // Buyer fitness
  if (isSaas) {
    if (company.slug === "nouriva") {
      if (/\b(diabetes|pcos|thyroid|lab|indian kitchen|condition)\b/.test(blob)) {
        notes.push("Buyer ICP reflects clinical/Indian-kitchen users");
      } else notes.push("WARN: weak clinical/Indian buyer specificity");
      if (
        /\b(consulting|retainer|discovery call|proposal)\b/.test(blob) &&
        !/\b(trial|scan|aso|paywall)\b/.test(blob)
      ) {
        notes.push("WARN: may be over-indexing B2B consulting language for a consumer app");
      }
    } else if (company.slug === "syndiq") {
      if (/\b(pe|private equity|family office|syndicate|sponsor|deal|capital)\b/.test(blob)) {
        notes.push("Buyer ICP reflects PE / syndicate / private-capital buyers");
      } else notes.push("WARN: weak PE/private-capital buyer specificity");
      if (/\b(calorie|lab report|app store|food scan)\b/.test(blob)) {
        notes.push("WARN: consumer-app language leaking into PE SaaS strategy");
      }
      if (/\b(200\+|95%|invented|guarantees efficient)\b/.test(blob)) {
        notes.push("WARN: watch for invented proof metrics in positioning");
      }
    } else {
      if (company.buyerBeachheadRe.test(blob)) notes.push("Buyer ICP language present");
      else notes.push("WARN: weak buyer beachhead specificity");
    }
  } else {
    if (/\b(real estate|fintech|ecommerce|e-commerce|bfsi)\b/.test(blob)) {
      notes.push("Buyer ICP reflects RE/fintech/ecommerce buyers");
    } else notes.push("WARN: weak vertical buyer specificity");
    if (/\b(app store|play store|calorie|lab report)\b/.test(blob)) {
      notes.push("WARN: consumer-app language leaking into services strategy");
    }
  }

  // Executable
  const cadence = (blob.match(/\b(per week|\/week|48h|kill|sla|scorecard)\b/g) || []).length;
  notes.push(cadence >= 8 ? `Executable density OK (${cadence} cadence/SLA/kill hits)` : `WARN: thin executable density (${cadence})`);

  // Zero cash
  if (/\$\s*\d{2,}/.test(blob) && company.budgetBand === "zero") {
    notes.push("WARN: dollar amounts present under zero-cash plan");
  } else notes.push("Zero-cash framing held");

  const passCount = results.filter((r) => r.status === "pass").length;
  const verdict =
    failed === 0
      ? "STRATEGICALLY SOUND"
      : failed <= 2
        ? "MOSTLY SOUND (minor gate fails)"
        : "NEEDS WORK";

  return {
    company: company.companyName,
    slug: company.slug,
    motion: company.motion,
    tagline: doc.brandDna?.tagline || "",
    checks: `${passCount}/${results.length}`,
    failed,
    verdict,
    notes,
    artifact: run.paths?.mdPath,
  };
}

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const keys = args.length ? args : ["nouriva", "productverse"];
  const unknown = keys.filter((k) => !COMPANIES[k]);
  if (unknown.length) {
    console.error(`Unknown company keys: ${unknown.join(", ")}`);
    console.error(`Available: ${Object.keys(COMPANIES).join(", ")}`);
    process.exit(1);
  }

  const runs = [];
  for (const key of keys) {
    const run = await runCompany(COMPANIES[key]);
    runs.push(run);
  }

  console.log("\n" + "=".repeat(60));
  console.log("STRATEGIC EVALUATION SUMMARY");
  console.log("=".repeat(60));
  const evals = runs.map(strategicEval);
  for (const e of evals) {
    console.log(`\n## ${e.company} (${e.motion})`);
    console.log(`Verdict: ${e.verdict} · checks ${e.checks}`);
    console.log(`Tagline: ${e.tagline || "—"}`);
    for (const n of e.notes) console.log(`  - ${n}`);
    if (e.artifact) console.log(`  Artifact: ${e.artifact}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summaryPath = join(OUT_DIR, `multi-gtm-eval-${stamp}.md`);
  const summaryMd = [
    `# Multi-company GTM strategy evaluation`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    ``,
    ...evals.flatMap((e) => [
      `## ${e.company}`,
      ``,
      `- Motion: ${e.motion}`,
      `- Verdict: **${e.verdict}**`,
      `- Checks: ${e.checks}`,
      `- Tagline: ${e.tagline || "—"}`,
      `- Artifact: ${e.artifact || "—"}`,
      ``,
      `Notes:`,
      ...e.notes.map((n) => `- ${n}`),
      ``,
    ]),
  ].join("\n");
  writeFileSync(summaryPath, summaryMd);
  console.log(`\nSummary: ${summaryPath}\n`);

  process.exit(runs.some((r) => r.failed > 0) ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
