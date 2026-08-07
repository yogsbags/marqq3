#!/usr/bin/env node
/**
 * AEO / LLMO smoke — verifies Marqq Content Studio LLMO fields + article AEO structure,
 * then probes live AI-answer surfaces (Google AI Overview + optional Perplexity) for citation gaps.
 *
 *   BASE_URL=https://marqq3-production.up.railway.app node scripts/smoke-aeo-llmo.mjs
 *
 * Brands: Elevate (default). Set BRAND=nouriva for Nouriva.
 * Requires APIFY_TOKEN in .env / .env.marqq-live for live citation probe.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(__dirname, "output");
const API = String(process.env.BASE_URL || "https://marqq3-production.up.railway.app").replace(/\/$/, "");
const WORKSPACE_ID = process.env.WORKSPACE_ID || "marqq-ws-1";
const BRAND = String(process.env.BRAND || "elevate").toLowerCase();
const SERP = "apify/google-search-scraper";

function loadEnv() {
  for (const name of [".env", ".env.marqq-live"]) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}
loadEnv();

const TOKEN = process.env.APIFY_TOKEN;
const BRANDS = {
  elevate: {
    companyName: "Elevate",
    domain: "theelevate.co.in",
    website: "https://theelevate.co.in",
    marketType: "b2b",
    brandContext:
      "Elevate (theelevate.co.in) — management strategy, AI solutions, and digital transformation consulting for Indian growth-stage and mid-market leaders.",
    citeQueries: [
      "best digital transformation consulting India",
      "AI transformation strategy mid-market India",
      "strategy to execution consulting firm India",
      "what is digital transformation operating model",
    ],
  },
  nouriva: {
    companyName: "Nouriva AI",
    domain: "nouriva.tech",
    website: "https://nouriva.tech",
    marketType: "b2c",
    brandContext:
      "Nouriva AI — personalized food and lab-aware nutrition insights app (nouriva.tech).",
    citeQueries: [
      "best personalized nutrition app India",
      "AI food scanner diabetes diet",
      "personalized meal plan from blood test",
      "what is food scanner nutrition app",
    ],
  },
};
const cfg = BRANDS[BRAND] || BRANDS.elevate;

const results = [];
function ok(n, d = "") {
  results.push({ name: n, status: "pass", detail: d });
  console.log(`  ✓ ${n}${d ? ` — ${d}` : ""}`);
}
function fail(n, d = "") {
  results.push({ name: n, status: "fail", detail: d });
  console.error(`  ✗ ${n}${d ? ` — ${d}` : ""}`);
}
function warn(n, d = "") {
  results.push({ name: n, status: "warn", detail: d });
  console.warn(`  ⚠ ${n}${d ? ` — ${d}` : ""}`);
}
function note(m) {
  console.log(`  · ${m}`);
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}

async function runActor(actor, input, wait = 360) {
  if (!TOKEN) throw new Error("Missing APIFY_TOKEN");
  const start = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/runs?token=${TOKEN}&waitForFinish=${Math.min(wait, 300)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }
  );
  const body = await start.json();
  if (!start.ok) throw new Error(JSON.stringify(body).slice(0, 300));
  let run = body.data;
  for (let i = 0; i < 90 && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status); i++) {
    await new Promise((r) => setTimeout(r, 4000));
    run = (await (await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${TOKEN}`)).json()).data;
  }
  if (run.status !== "SUCCEEDED") throw new Error(`${actor} ${run.status}`);
  const items = await (
    await fetch(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${TOKEN}&clean=true&format=json`)
  ).json();
  return { runId: run.id, items: Array.isArray(items) ? items : [] };
}

function aeoStructureChecks(html) {
  const h = String(html || "");
  const faqDetails = (h.match(/<details[\s>]/gi) || []).length;
  const checks = {
    hasArticle: /<article[\s>]/i.test(h),
    hasH1: /<h1[\s>]/i.test(h),
    hasFaqSection: /id=["']faq["']/i.test(h) || /frequently asked questions/i.test(h),
    faqQaCount: faqDetails,
    hasKeyTakeaway: /id=["']key-takeaway["']/i.test(h) || /key takeaway/i.test(h),
    answerFirst: (() => {
      const m = h.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      return m ? m[1].replace(/<[^>]+>/g, "").trim().length >= 40 : false;
    })(),
    hasJsonLdHint: /application\/ld\+json|FAQPage|BlogPosting/i.test(h),
  };
  const score =
    (checks.hasH1 ? 15 : 0) +
    (checks.hasFaqSection ? 25 : 0) +
    (checks.faqQaCount >= 3 ? 25 : checks.faqQaCount > 0 ? 10 : 0) +
    (checks.hasKeyTakeaway ? 15 : 0) +
    (checks.answerFirst ? 15 : 0) +
    (checks.hasArticle ? 5 : 0);
  return { ...checks, score };
}

function hostIn(url, domain) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").includes(domain.replace(/^www\./, ""));
  } catch {
    return String(url || "").includes(domain);
  }
}

async function smokeContentStudio() {
  console.log("\n[1] Content Studio — LLMO research notes + AEO article structure");
  const create = await api("/api/content/runs", {
    method: "POST",
    body: {
      companyName: cfg.companyName,
      companyId: WORKSPACE_ID,
      workspaceId: WORKSPACE_ID,
      domain: cfg.domain,
      marketType: cfg.marketType,
      brandContext: cfg.brandContext,
    },
  });
  if (!create.ok) {
    fail("content:create", create.data?.error || JSON.stringify(create.data).slice(0, 160));
    return null;
  }
  const runId = create.data.runId || create.data.run?.id;
  ok("content:create", runId);

  note("Maya research (expects llmo_notes)…");
  const research = await api(`/api/content/runs/${runId}/research`, { method: "POST" });
  if (!research.ok) {
    fail("content:research", research.data?.error || JSON.stringify(research.data).slice(0, 160));
    return { runId };
  }
  const plan = research.data.plan || {};
  const llmo = Array.isArray(plan.llmo_notes) ? plan.llmo_notes : [];
  const queue = Array.isArray(plan.article_queue) ? plan.article_queue : [];
  if (llmo.length >= 1) ok("content:llmo_notes", `${llmo.length} notes`);
  else fail("content:llmo_notes", "missing llmo_notes on research plan");
  ok("content:research_queue", `${queue.length} articles · ${plan.data_source || "?"}`);

  const brief = await api(`/api/content/runs/${runId}/brief`, { method: "POST", body: { queueIndex: 0 } });
  if (!brief.ok) {
    fail("content:brief", brief.data?.error || "?");
    return { runId, plan, llmo };
  }
  ok("content:brief", `kw=${brief.data.brief?.keyword || "?"}`);

  note("Riya draft (AEO structure)…");
  const draft = await api(`/api/content/runs/${runId}/draft`, { method: "POST" });
  if (!draft.ok) {
    fail("content:draft", draft.data?.error || "?");
    return { runId, plan, llmo };
  }
  const article = draft.data.article || {};
  const html = String(article.html || article.body_html || article.markdown || article.body || "");
  const aeo = aeoStructureChecks(html);
  if (aeo.score >= 60) ok("content:aeo_structure", `score=${aeo.score} faq=${aeo.faqQaCount} takeaway=${aeo.hasKeyTakeaway}`);
  else warn("content:aeo_structure", `score=${aeo.score} faq=${aeo.faqQaCount} — below AEO bar (want FAQ≥3 + answer-first)`);
  ok("content:draft", `words=${article.word_count || "?"} title="${String(article.title || "").slice(0, 50)}"`);

  return {
    runId,
    plan,
    llmo,
    keyword: brief.data.brief?.keyword,
    title: article.title,
    word_count: article.word_count,
    aeo,
    htmlPreview: html.slice(0, 1500),
  };
}

async function smokeLiveCitations() {
  console.log("\n[2] Live AEO visibility — Google SERP + AI Overview cite probe");
  if (!TOKEN) {
    fail("live:apify", "APIFY_TOKEN missing — skipped");
    return null;
  }
  const queries = cfg.citeQueries.join("\n");
  note(`SERP+AI Overview for ${cfg.citeQueries.length} queries…`);
  const r = await runActor(
    SERP,
    {
      queries,
      maxPagesPerQuery: 1,
      countryCode: BRAND === "nouriva" ? "in" : "in",
      languageCode: "en",
      aiOverview: { scrapeFullAiOverview: true },
      perplexitySearch: { enablePerplexity: true },
      mobileResults: false,
      saveHtml: false,
      saveHtmlToKeyValueStore: false,
    },
    420
  );

  const perQuery = [];
  for (const item of r.items) {
    const term = String(item.searchQuery?.term || item.searchQuery || item.query || "").trim();
    const organic = item.organicResults || [];
    const ai =
      item.aiOverview ||
      item.aiOverviewResult ||
      item.fullAiOverview ||
      item.ai_overview ||
      null;
    const perplexity = item.perplexityResult || item.perplexity || item.perplexitySearch || null;

    const organicCite = organic.some((o) => hostIn(o.url || o.link || "", cfg.domain));
    const aiText = JSON.stringify(ai || {});
    const aiSources = [];
    const collectUrls = (obj, depth = 0) => {
      if (!obj || depth > 5) return;
      if (typeof obj === "string" && /^https?:\/\//i.test(obj)) aiSources.push(obj);
      else if (Array.isArray(obj)) obj.forEach((x) => collectUrls(x, depth + 1));
      else if (typeof obj === "object") Object.values(obj).forEach((x) => collectUrls(x, depth + 1));
    };
    collectUrls(ai);
    collectUrls(perplexity);
    const aiCite = aiSources.some((u) => hostIn(u, cfg.domain)) || aiText.toLowerCase().includes(cfg.domain.toLowerCase());
    const pText = JSON.stringify(perplexity || {}).toLowerCase();
    const perplexityCite = pText.includes(cfg.domain.toLowerCase()) || pText.includes(cfg.companyName.toLowerCase());

    perQuery.push({
      query: term,
      organicCount: organic.length,
      organicCitesBrand: organicCite,
      hasAiOverview: Boolean(ai && (aiText.length > 20)),
      aiOverviewCitesBrand: aiCite,
      perplexityCitesBrand: perplexityCite,
      aiSourceSample: aiSources.slice(0, 6),
      topOrganic: organic.slice(0, 3).map((o) => ({
        title: String(o.title || "").slice(0, 70),
        url: o.url || o.link || "",
      })),
    });
  }

  const organicHits = perQuery.filter((q) => q.organicCitesBrand).length;
  const aiHits = perQuery.filter((q) => q.aiOverviewCitesBrand).length;
  const pxHits = perQuery.filter((q) => q.perplexityCitesBrand).length;
  const aiPresent = perQuery.filter((q) => q.hasAiOverview).length;

  if (perQuery.length) ok("live:serp_ran", `${perQuery.length} queries · run ${r.runId}`);
  else fail("live:serp_ran", "no SERP rows");

  if (aiPresent > 0) ok("live:ai_overview_present", `${aiPresent}/${perQuery.length} queries showed AI Overview`);
  else warn("live:ai_overview_present", "no AI Overview captured (may be geo/query dependent)");

  if (organicHits > 0) ok("live:organic_brand", `${organicHits}/${perQuery.length} SERPs cite ${cfg.domain}`);
  else warn("live:organic_brand", `0/${perQuery.length} organic cite ${cfg.domain} — SEO gap`);

  if (aiHits > 0) ok("live:ai_overview_brand", `${aiHits}/${perQuery.length} AI Overviews cite brand`);
  else warn("live:ai_overview_brand", `0 AI Overview citations for ${cfg.domain} — LLMO gap`);

  if (pxHits > 0) ok("live:perplexity_brand", `${pxHits}/${perQuery.length} Perplexity cites brand`);
  else warn("live:perplexity_brand", `0 Perplexity citations — expected for most new brands`);

  return { runId: r.runId, perQuery, organicHits, aiHits, pxHits, aiPresent };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log(`AEO/LLMO smoke · brand=${BRAND} · API=${API}`);

  const content = await smokeContentStudio();
  const live = await smokeLiveCitations();

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const pass = results.filter((r) => r.status === "pass").length;
  const failN = results.filter((r) => r.status === "fail").length;
  const warnN = results.filter((r) => r.status === "warn").length;

  const report = {
    stamp,
    brand: BRAND,
    api: API,
    implemented: {
      marqq_module: "seo-llmo (SEOLLMOFlow + Maya)",
      content_studio: "llmo_notes on research + AEO FAQ/answer-first drafting",
      marqq2_content_engine: "ai-seo checklist, key-takeaway, FAQ, schema",
      nouriva_app: "no dedicated AEO/LLMO product surface (marketing site only via Marqq)",
      gap: "No first-party AI-citation tracker productized yet — live probe is Apify SERP/AI Overview",
    },
    results,
    content,
    live,
    summary: { pass, fail: failN, warn: warnN },
  };

  const jsonPath = join(OUT, `aeo-llmo-smoke-${BRAND}-${stamp}.json`);
  const mdPath = join(OUT, `aeo-llmo-smoke-${BRAND}-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    mdPath,
    [
      `# AEO / LLMO smoke — ${cfg.companyName}`,
      ``,
      `- stamp: ${stamp}`,
      `- API: ${API}`,
      `- results: ${pass} pass · ${warnN} warn · ${failN} fail`,
      ``,
      `## Is AEO/LLMO implemented?`,
      `- **Marqq:** Yes — paired with SEO as \`seo-llmo\` (Maya module, Content Studio \`llmo_notes\`, AEO article structure/FAQ).`,
      `- **Not separate from SEO** as a standalone product; LLMO is embedded in SEO/content pipeline.`,
      `- **Nouriva mobile app:** No in-app AEO/LLMO. Brand can use Marqq Content Studio.`,
      `- **Live citation monitoring:** Partial — skills/docs exist; this smoke uses Apify Google AI Overview + Perplexity, not a built-in dashboard.`,
      ``,
      `## Content Studio checks`,
      ...results.filter((r) => r.name.startsWith("content:")).map((r) => `- ${r.status}: **${r.name}** — ${r.detail || ""}`),
      content?.llmo?.length
        ? `\n### llmo_notes\n${content.llmo.map((n) => `- ${n}`).join("\n")}`
        : "",
      content?.aeo
        ? `\n### AEO structure score: ${content.aeo.score}\n\`\`\`\n${JSON.stringify(content.aeo, null, 2)}\n\`\`\``
        : "",
      ``,
      `## Live AI-answer visibility`,
      ...results.filter((r) => r.name.startsWith("live:")).map((r) => `- ${r.status}: **${r.name}** — ${r.detail || ""}`),
      ``,
      `### Per query`,
      `| Query | Organic cite? | AI Overview? | AI cites brand? | Perplexity cites? |`,
      `|---|---|---|---|---|`,
      ...(live?.perQuery || []).map(
        (q) =>
          `| ${q.query} | ${q.organicCitesBrand ? "yes" : "no"} | ${q.hasAiOverview ? "yes" : "no"} | ${q.aiOverviewCitesBrand ? "yes" : "no"} | ${q.perplexityCitesBrand ? "yes" : "no"} |`
      ),
      ``,
    ].join("\n")
  );

  console.log(`\n=== SUMMARY ${pass} pass / ${warnN} warn / ${failN} fail ===`);
  console.log(mdPath);
  if (failN) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
