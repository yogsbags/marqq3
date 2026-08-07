#!/usr/bin/env node
/**
 * ONE-OFF SMOKE (not product code) — Nouriva “popular blog” mining via Google SERP (Apify).
 *
 * Uses apify/google-search-scraper for India SERPs, ranks organic hits by position,
 * prefers article/blog URLs, extracts title + snippet as content hooks.
 *
 *   node scripts/smoke-nouriva-viral-hooks-serp-apify.mjs
 *
 * Requires APIFY_TOKEN in .env or .env.marqq-live
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const ACTOR = "apify/google-search-scraper";

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

const QUERIES = [
  "personalized nutrition app India",
  "diabetes diet plan Indian food",
  "PCOS diet chart India vegetarian",
  "thyroid diet plan Indian meals",
  "what to eat based on blood test reports",
  "HbA1c diet meal plan India",
  "food scanner nutrition AI app",
  "lab based meal recommendations",
];

const MAX_PAGES = Number(process.env.MAX_PAGES_PER_QUERY || 1);
const COUNTRY = process.env.COUNTRY_CODE || "in";
const LANG = process.env.LANGUAGE_CODE || "en";

const ARTICLE_HINT =
  /\/(blog|article|articles|learn|guide|guides|health|nutrition|diet|wellness|magazine|stories?|news)\b|healthline|webmd|medicalnewstoday|healthify|fitterfly|beato|1mg|pharmeasy|netmeds|ultrahuman|zoe\.com|levels\.com|healthkart|dietdoctor|mayoclinic|clevelandclinic|harvard\.edu|nih\.gov/i;

const NOISE =
  /amazon\.|flipkart\.|play\.google\.|apps\.apple\.|wikipedia\.org|youtube\.com|facebook\.com|instagram\.com|linkedin\.com|reddit\.com|pinterest\.|quora\.com/i;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function asOrganic(item) {
  // Normalize across possible Apidojo shapes
  const url =
    item.url ||
    item.link ||
    item.organicResults?.[0]?.url ||
    item.resultUrl ||
    "";
  const title = String(item.title || item.name || item.organicResults?.[0]?.title || "").trim();
  const snippet = String(
    item.description || item.snippet || item.content || item.organicResults?.[0]?.description || ""
  ).trim();
  const position =
    num(item.position) ??
    num(item.rank) ??
    num(item.index) ??
    num(item.organicResults?.[0]?.position) ??
    99;
  const query = String(item.searchQuery || item.query || item.keyword || item.term || "").trim();
  const type = String(item.type || item.resultType || "organic").toLowerCase();
  return { url, title, snippet, position, query, type, rawKeys: Object.keys(item) };
}

async function runActor(input) {
  const start = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR)}/runs?token=${TOKEN}&waitForFinish=180`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }
  );
  const started = await start.json();
  if (!start.ok) throw new Error(`Actor start failed: ${JSON.stringify(started).slice(0, 600)}`);
  let run = started.data;
  const runId = run.id;
  for (let i = 0; i < 80 && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status); i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${TOKEN}`);
    const sj = await st.json();
    run = sj.data;
  }
  if (run.status !== "SUCCEEDED") throw new Error(`Actor run ${run.status}: ${runId}`);
  const ds = await fetch(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${TOKEN}&clean=true&format=json`
  );
  const items = await ds.json();
  return { runId, datasetId: run.defaultDatasetId, items: Array.isArray(items) ? items : [] };
}

function queryFromPage(item) {
  const sq = item.searchQuery;
  if (typeof sq === "string") return sq;
  if (sq && typeof sq === "object") return String(sq.term || sq.query || sq.q || "").trim();
  return String(item.query || item.keyword || "").trim();
}

function expandItems(items) {
  // Official actor: one dataset row per SERP page with organicResults[]
  const out = [];
  for (const item of items) {
    const q = queryFromPage(item);
    const related = Array.isArray(item.relatedQueries)
      ? item.relatedQueries.map((r) => (typeof r === "string" ? r : r.title || r.query || "")).filter(Boolean)
      : [];
    const paa = Array.isArray(item.peopleAlsoAsk)
      ? item.peopleAlsoAsk.map((p) => p.question || p.title || "").filter(Boolean)
      : [];

    if (Array.isArray(item.organicResults) && item.organicResults.length) {
      for (const org of item.organicResults) {
        out.push({
          ...org,
          searchQuery: q,
          type: "organic",
          _relatedQueries: related,
          _paa: paa,
        });
      }
      continue;
    }
    if (Array.isArray(item.organic) && item.organic.length) {
      for (const org of item.organic) {
        out.push({ ...org, searchQuery: q, type: "organic", _relatedQueries: related, _paa: paa });
      }
      continue;
    }
    // Skip empty / demo placeholders
    if (item.demo === true && !item.url && !item.title) continue;
    out.push({ ...item, searchQuery: q || item.searchQuery });
  }
  return out;
}

function scoreHit(hit) {
  // Lower SERP position = more “popular” for that query
  let score = Math.max(0, 110 - hit.position * 10);
  if (ARTICLE_HINT.test(hit.url) || ARTICLE_HINT.test(hit.title)) score += 15;
  if (NOISE.test(hit.url)) score -= 40;
  if (/india|indian|pcos|diabetes|thyroid|hba1c|blood test|meal|diet/i.test(`${hit.title} ${hit.snippet}`)) {
    score += 8;
  }
  return score;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  console.log(`\nNouriva Google SERP blog-hooks smoke (scripts-only)`);
  console.log(`Actor ${ACTOR}`);
  console.log(`country=${COUNTRY} lang=${LANG} pages/query=${MAX_PAGES}`);
  console.log(`queries: ${QUERIES.length}\n`);

  const { runId, datasetId, items: raw } = await runActor({
    queries: QUERIES.join("\n"),
    countryCode: COUNTRY,
    languageCode: LANG,
    searchLanguage: LANG,
    maxPagesPerQuery: MAX_PAGES,
    mobileResults: false,
    saveHtmlToKeyValueStore: false,
    focusOnPaidAds: false,
  });

  console.log(`Run ${runId} · raw dataset rows: ${raw.length}`);
  if (raw[0]) {
    console.log(`Sample keys: ${Object.keys(raw[0]).join(", ")}`);
  }

  const flat = expandItems(raw).map(asOrganic).filter((h) => h.url && h.title);
  const organic = flat.filter((h) => !h.type || /organic|result|search/i.test(h.type));

  const relatedSet = new Set();
  const paaSet = new Set();
  for (const item of raw) {
    for (const r of item.relatedQueries || []) {
      const t = typeof r === "string" ? r : r.title || r.query;
      if (t) relatedSet.add(String(t));
    }
    for (const p of item.peopleAlsoAsk || []) {
      const t = p.question || p.title;
      if (t) paaSet.add(String(t));
    }
  }

  // Prefer article-like; keep top SERP apps separately as weak signal
  const articles = organic
    .filter((h) => !NOISE.test(h.url))
    .map((h) => ({
      ...h,
      domain: hostname(h.url),
      score: scoreHit(h),
      articleLike: ARTICLE_HINT.test(h.url) || ARTICLE_HINT.test(h.title),
    }))
    .sort((a, b) => b.score - a.score || a.position - b.position);

  // Dedupe by URL
  const seen = new Set();
  const deduped = [];
  for (const h of articles) {
    const key = h.url.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(h);
  }

  const top = deduped.slice(0, 20);
  const byQuery = {};
  for (const h of organic) {
    const q = h.query || "(unknown)";
    if (!byQuery[q]) byQuery[q] = [];
    if (byQuery[q].length < 5) {
      byQuery[q].push({ position: h.position, title: h.title, url: h.url, domain: hostname(h.url) });
    }
  }

  const report = {
    stamp,
    brand: "nouriva",
    platform: "google-serp",
    actor: ACTOR,
    runId,
    datasetId,
    countryCode: COUNTRY,
    languageCode: LANG,
    queries: QUERIES,
    rawRows: raw.length,
    organicHits: organic.length,
    uniqueUrls: deduped.length,
    note: "Rank ≈ Google popularity proxy (SERP position + article URL bias). Not social engagement.",
    topHooks: top.map((h) => ({
      score: Math.round(h.score),
      position: h.position,
      query: h.query,
      domain: h.domain,
      title: h.title,
      hook: h.title,
      snippet: h.snippet.slice(0, 280),
      articleLike: h.articleLike,
      url: h.url,
    })),
    topByQuery: byQuery,
    peopleAlsoAsk: [...paaSet].slice(0, 30),
    relatedQueries: [...relatedSet].slice(0, 40),
  };

  const jsonPath = join(OUT_DIR, `nouriva-serp-blog-hooks-smoke-${stamp}.json`);
  const mdPath = join(OUT_DIR, `nouriva-serp-blog-hooks-smoke-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    mdPath,
    [
      `# Nouriva Google SERP blog hooks smoke (Apify — scripts only)`,
      ``,
      `- stamp: ${stamp}`,
      `- actor: \`${ACTOR}\``,
      `- run: ${runId}`,
      `- country: ${COUNTRY} · lang: ${LANG}`,
      `- organic hits: ${organic.length} · unique URLs: ${deduped.length}`,
      `- ranking: SERP position (lower better) + article-URL boost — **true popularity proxy vs blog crawl**`,
      ``,
      `## Queries`,
      ...QUERIES.map((q) => `- \`${q}\``),
      ``,
      `## Top ranking titles / snippets`,
      ...top.flatMap((h, i) => [
        ``,
        `### ${i + 1}. #${h.position} for “${h.query || "?"}” · score ${Math.round(h.score)} · ${h.domain}`,
        ``,
        `**Hook / title:** ${h.title}`,
        ``,
        h.snippet ? `**Snippet:** ${h.snippet.slice(0, 280)}` : "",
        ``,
        `- articleLike: ${h.articleLike}`,
        `- url: ${h.url}`,
      ]),
      ``,
      `## Top 5 per query`,
      ...Object.entries(byQuery).flatMap(([q, rows]) => [
        ``,
        `### ${q}`,
        ...rows.map((r) => `- #${r.position} [${r.domain}] ${r.title} — ${r.url}`),
      ]),
      ``,
      `## People Also Ask`,
      ...[...paaSet].slice(0, 20).map((q) => `- ${q}`),
      ``,
      `## Related searches`,
      ...[...relatedSet].slice(0, 25).map((q) => `- ${q}`),
      ``,
      `_Not product code. Title/angle inspiration only — rewrite; don’t copy._`,
      ``,
    ]
      .filter((line) => line !== undefined)
      .join("\n")
  );

  console.log(`\nUnique article-biased URLs: ${deduped.length}`);
  console.log(`\nTop 5:`);
  top.slice(0, 5).forEach((h, i) => {
    console.log(`  ${i + 1}. [#${h.position}] ${h.title.slice(0, 90)}`);
  });
  console.log(`\nreport ${jsonPath}`);
  console.log(`md     ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
