#!/usr/bin/env node
/**
 * ONE-OFF SMOKE (not product code) — Nouriva Semrush + Ahrefs via Apify PPE actors.
 *
 * Cheap path (no Semrush/Ahrefs seat required):
 *   - Ahrefs:  maximedupre/ahrefs-free-website-stats-scraper  (~$0.002/domain)
 *   - Semrush: bovi/semrush-keyword-scraper                   (~$0.018/keyword, India DB)
 *
 *   node scripts/smoke-nouriva-semrush-ahrefs-apify.mjs
 *
 * Requires APIFY_TOKEN in .env or .env.marqq-live
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const AHREFS_ACTOR = "maximedupre/ahrefs-free-website-stats-scraper";
const SEMRUSH_KW_ACTOR = "bovi/semrush-keyword-scraper";
const SEMRUSH_DOMAIN_ACTOR = "crawlerbros/semrush-scraper";

function loadEnv() {
  for (const file of [".env.marqq-live", ".env"]) {
    const path = join(ROOT, file);
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
if (!TOKEN) {
  console.error("Missing APIFY_TOKEN");
  process.exit(1);
}

const DOMAINS = [
  "nouriva.tech",
  "healthifyme.com",
  "fitterfly.com",
  "beato.app",
  "ultrahuman.com",
  "zoe.com",
  "levels.com",
  "1mg.com",
];

const KEYWORDS = [
  "diabetes diet plan Indian food",
  "PCOS diet chart India",
  "thyroid diet plan Indian",
  "personalized nutrition app India",
  "HbA1c diet meal plan",
  "food scanner nutrition AI",
  "calorie tracker India",
  "lab based meal recommendations",
];

async function runActor(actorId, input, waitSecs = 240) {
  const start = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${TOKEN}&waitForFinish=${waitSecs}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  const started = await start.json();
  if (!start.ok) throw new Error(`${actorId} start failed: ${JSON.stringify(started).slice(0, 500)}`);
  let run = started.data;
  const runId = run.id;
  for (let i = 0; i < 90 && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status); i++) {
    await new Promise((r) => setTimeout(r, 3500));
    const st = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${TOKEN}`);
    const sj = await st.json();
    run = sj.data;
  }
  if (run.status !== "SUCCEEDED") throw new Error(`${actorId} ${run.status}: ${runId}`);
  const ds = await fetch(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${TOKEN}&clean=true&format=json`
  );
  const items = await ds.json();
  return { runId, datasetId: run.defaultDatasetId, items: Array.isArray(items) ? items : [] };
}

function num(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[,$%\s]/g, "").replace(/k$/i, "e3").replace(/m$/i, "e6");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function summarizeAhrefs(item) {
  const domain =
    item.domain ||
    item.target ||
    item.url ||
    item.website ||
    item.input ||
    "(unknown)";
  return {
    domain: String(domain).replace(/^https?:\/\//, "").replace(/\/$/, ""),
    domainRating: num(item.domainRating ?? item.domain_rating ?? item.dr ?? item.DR),
    urlRating: num(item.urlRating ?? item.url_rating ?? item.ur),
    organicTraffic: num(item.organicTraffic ?? item.organic_traffic ?? item.searchTraffic ?? item.traffic),
    organicKeywords: num(item.organicKeywords ?? item.organic_keywords ?? item.keywords),
    trafficValue: num(item.trafficValue ?? item.traffic_value ?? item.orgTrafficValue),
    globalRank: num(item.globalRank ?? item.global_rank ?? item.rank),
    linkingWebsites: num(item.linkingWebsites ?? item.linking_websites ?? item.refDomains ?? item.referringDomains),
    rawKeys: Object.keys(item).slice(0, 25),
  };
}

function summarizeSemrushKw(item) {
  const kw = item.keyword || item.query || item.term || "";
  return {
    keyword: kw,
    volume: num(item.volume ?? item.searchVolume ?? item.search_volume ?? item.avgMonthlySearches),
    kd: num(item.keywordDifficulty ?? item.difficulty ?? item.kd ?? item["Keyword Difficulty"]),
    cpc: num(item.cpc ?? item.CPC ?? item.avgCpc),
    competition: num(item.competition ?? item.competitiveDensity ?? item.comp),
    intent: item.intent || item.searchIntent || item.keyword_intent || item.mainIntent || null,
    results: num(item.results ?? item.numberOfResults ?? item.serpResults),
    database: item.database || item.country || "in",
    ideas: Array.isArray(item.ideas)
      ? item.ideas.slice(0, 5).map((i) => (typeof i === "string" ? i : i.keyword || i.phrase || JSON.stringify(i)))
      : [],
    rawKeys: Object.keys(item).slice(0, 25),
  };
}

function summarizeSemrushDomain(item) {
  return {
    domain: item.domain || item.website || item.url || "(unknown)",
    authorityScore: num(item.authorityScore ?? item.authority_score ?? item.as),
    visits: num(item.visits ?? item.monthlyVisits ?? item.traffic),
    organicVisits: num(item.organicVisits ?? item.organic_visits ?? item.organicTraffic),
    referringDomains: num(item.referringDomains ?? item.referring_domains ?? item.refDomains),
    backlinks: num(item.backlinks ?? item.backlinkCount),
    rawKeys: Object.keys(item).slice(0, 20),
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  console.log(`\nNouriva Semrush + Ahrefs Apify smoke (cheap PPE)\n`);
  console.log(`Ahrefs actor:         ${AHREFS_ACTOR}`);
  console.log(`Semrush keywords:     ${SEMRUSH_KW_ACTOR} (database=in)`);
  console.log(`Semrush domain stats: ${SEMRUSH_DOMAIN_ACTOR}\n`);

  const [ahrefs, semrushKw, semrushDom] = await Promise.all([
    runActor(AHREFS_ACTOR, {
      targets: DOMAINS,
      mode: "full",
      maxResults: DOMAINS.length,
    }).then((r) => {
      console.log(`Ahrefs: ${r.items.length} domains · run ${r.runId}`);
      if (r.items[0]) console.log(`  keys: ${Object.keys(r.items[0]).slice(0, 14).join(", ")}`);
      return r;
    }),
    runActor(SEMRUSH_KW_ACTOR, {
      keywords: KEYWORDS,
      database: "in",
      includeIdeas: false,
      includeSerp: false,
      maxItems: KEYWORDS.length,
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
    }).then((r) => {
      console.log(`Semrush KW: ${r.items.length} keywords · run ${r.runId}`);
      if (r.items[0]) console.log(`  keys: ${Object.keys(r.items[0]).slice(0, 14).join(", ")}`);
      return r;
    }),
    runActor(SEMRUSH_DOMAIN_ACTOR, {
      domains: DOMAINS,
      mode: "full",
      enableBrowserFallback: true,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
        apifyProxyCountry: "US",
      },
    }).then((r) => {
      console.log(`Semrush domains: ${r.items.length} · run ${r.runId}`);
      if (r.items[0]) console.log(`  keys: ${Object.keys(r.items[0]).slice(0, 14).join(", ")}`);
      return r;
    }),
  ]);

  const ahrefsRows = ahrefs.items.map(summarizeAhrefs).sort((a, b) => (b.organicTraffic || 0) - (a.organicTraffic || 0));
  const semrushRows = semrushKw.items
    .map(summarizeSemrushKw)
    .filter((r) => r.keyword)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0));
  const semrushDomainRows = semrushDom.items
    .map(summarizeSemrushDomain)
    .sort((a, b) => (b.visits || 0) - (a.visits || 0));

  const report = {
    stamp,
    brand: "nouriva",
    note: "No Semrush/Ahrefs seats used — Apify PPE scrapers of public / mediated data.",
    domains: DOMAINS,
    keywords: KEYWORDS,
    ahrefs: {
      actor: AHREFS_ACTOR,
      runId: ahrefs.runId,
      datasetId: ahrefs.datasetId,
      rows: ahrefsRows,
    },
    semrushKeywords: {
      actor: SEMRUSH_KW_ACTOR,
      runId: semrushKw.runId,
      datasetId: semrushKw.datasetId,
      database: "in",
      rows: semrushRows,
    },
    semrushDomains: {
      actor: SEMRUSH_DOMAIN_ACTOR,
      runId: semrushDom.runId,
      datasetId: semrushDom.datasetId,
      rows: semrushDomainRows,
    },
  };

  const jsonPath = join(OUT_DIR, `nouriva-semrush-ahrefs-smoke-${stamp}.json`);
  const mdPath = join(OUT_DIR, `nouriva-semrush-ahrefs-smoke-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    mdPath,
    [
      `# Nouriva Semrush + Ahrefs smoke (Apify PPE — scripts only)`,
      ``,
      `- stamp: ${stamp}`,
      `- Ahrefs: \`${AHREFS_ACTOR}\` · run ${ahrefs.runId}`,
      `- Semrush keywords: \`${SEMRUSH_KW_ACTOR}\` · db=in · run ${semrushKw.runId}`,
      `- Semrush domains: \`${SEMRUSH_DOMAIN_ACTOR}\` · run ${semrushDom.runId}`,
      `- No Semrush/Ahrefs login — pay-per-event on Apify only`,
      ``,
      `## Ahrefs public domain stats`,
      ``,
      `| Domain | DR | Organic traffic | Keywords | Traffic value | Linking sites | Global rank |`,
      `|---|---:|---:|---:|---:|---:|---:|`,
      ...ahrefsRows.map(
        (r) =>
          `| ${r.domain} | ${r.domainRating ?? "—"} | ${r.organicTraffic ?? "—"} | ${r.organicKeywords ?? "—"} | ${r.trafficValue ?? "—"} | ${r.linkingWebsites ?? "—"} | ${r.globalRank ?? "—"} |`
      ),
      ``,
      `## Semrush public domain stats`,
      ``,
      `| Domain | Authority | Visits | Organic visits | Ref domains | Backlinks |`,
      `|---|---:|---:|---:|---:|---:|`,
      ...semrushDomainRows.map(
        (r) =>
          `| ${r.domain} | ${r.authorityScore ?? "—"} | ${r.visits ?? "—"} | ${r.organicVisits ?? "—"} | ${r.referringDomains ?? "—"} | ${r.backlinks ?? "—"} |`
      ),
      ``,
      `## Semrush keyword metrics (India)`,
      ``,
      `| Keyword | Volume | KD | CPC | Competition | Intent |`,
      `|---|---:|---:|---:|---:|---|`,
      ...semrushRows.map(
        (r) =>
          `| ${r.keyword} | ${r.volume ?? "—"} | ${r.kd ?? "—"} | ${r.cpc ?? "—"} | ${r.competition ?? "—"} | ${r.intent ?? "—"} |`
      ),
      ``,
      `_Scripts-only competitive research. Prefer official Semrush/Ahrefs APIs for production._`,
      ``,
    ].join("\n")
  );

  console.log(`\nAhrefs domains:`);
  ahrefsRows.forEach((r) => console.log(`  ${r.domain}: DR ${r.domainRating ?? "?"} · traffic ${r.organicTraffic ?? "?"}`));
  console.log(`\nSemrush domains:`);
  semrushDomainRows.forEach((r) => console.log(`  ${r.domain}: AS ${r.authorityScore ?? "?"} · visits ${r.visits ?? "?"}`));
  console.log(`\nSemrush keywords (IN):`);
  semrushRows.forEach((r) => console.log(`  ${r.keyword}: vol ${r.volume ?? "?"} · KD ${r.kd ?? "?"}`));
  console.log(`\nreport ${jsonPath}`);
  console.log(`md     ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
