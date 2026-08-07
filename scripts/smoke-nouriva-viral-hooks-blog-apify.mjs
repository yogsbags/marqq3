#!/usr/bin/env node
/**
 * ONE-OFF SMOKE (not product code) — Nouriva competitor/category blog hook mining via Apify.
 *
 * Uses apify/website-content-crawler on known blog hubs, extracts title + lead,
 * ranks by Nouriva-relevance keywords (blogs don't expose likes like IG/LI).
 *
 *   node scripts/smoke-nouriva-viral-hooks-blog-apify.mjs
 *
 * Requires APIFY_TOKEN in .env or .env.marqq-live
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const ACTOR = "apify/website-content-crawler";

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

/** Category + near-competitor blogs for lab/personalized nutrition (India + global CGM/labs). */
const START_URLS = [
  { url: "https://www.fitterfly.com/blog", label: "Fitterfly" },
  { url: "https://www.beato.app/blog", label: "BeatO" },
  { url: "https://www.1mg.com/articles", label: "1mg" },
  { url: "https://pharmeasy.in/blog/", label: "PharmEasy" },
  { url: "https://www.ultrahuman.com/blog/", label: "Ultrahuman" },
  { url: "https://zoe.com/learn", label: "ZOE" },
  { url: "https://www.levels.com/blog", label: "Levels" },
  { url: "https://www.netmeds.com/health-library", label: "Netmeds" },
  { url: "https://www.healthifyme.com/blog/", label: "HealthifyMe" },
];

const MAX_PAGES_PER_SOURCE = Number(process.env.MAX_PAGES_PER_SOURCE || 6);
const MAX_DEPTH = Number(process.env.MAX_DEPTH || 1);

const NOURIVA_TERMS = [
  "diabetes",
  "blood sugar",
  "glucose",
  "hba1c",
  "insulin",
  "pcos",
  "pcod",
  "thyroid",
  "lab",
  "biomarker",
  "cgm",
  "meal",
  "nutrition",
  "indian",
  "roti",
  "rice",
  "cholesterol",
  "weight loss",
  "personalized",
  "diet",
  "metabolic",
];

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sourceLabel(url, fallback) {
  if (fallback) return fallback;
  const host = hostname(url);
  const hit = START_URLS.find((s) => hostname(s.url) === host);
  return hit?.label || host;
}

function plain(item) {
  const md = String(item.markdown || item.text || item.content || "").trim();
  return md
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[[^\]]*\]\([^)]+\)/g, (m) => m.replace(/\[|\]|\([^)]*\)/g, ""))
    .replace(/[#>*_`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleOf(item) {
  return String(item.metadata?.title || item.title || item.metadata?.ogTitle || "")
    .replace(/\s+[|\-–—]\s+.*$/, "") // site name after " | " / " - ", keep hyphenated words
    .trim()
    .slice(0, 180);
}

function leadParagraph(text) {
  const parts = text.split(/(?<=[.!?])\s+/).filter((p) => p.length > 40);
  return (parts[0] || text.slice(0, 220)).slice(0, 280);
}

function relevanceScore(title, text) {
  const hay = `${title}\n${text}`.toLowerCase();
  let hits = 0;
  const matched = [];
  for (const term of NOURIVA_TERMS) {
    if (hay.includes(term)) {
      hits += 1;
      matched.push(term);
    }
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  // Prefer articles with clinical/nutrition overlap; soft boost for substance length.
  const lengthBoost = Math.min(words, 1200) / 200;
  return { score: hits * 10 + lengthBoost, hits, matched, words };
}

function isLikelyListing(url, title, words) {
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  })();
  if (words < 120) return true;
  if (/\/(blog|articles|learn|health-library)\/?$/i.test(path)) return true;
  if (/^(blog|articles|learn|health library|latest)$/i.test(title.trim())) return true;
  return false;
}

async function runActor(input) {
  const start = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR)}/runs?token=${TOKEN}&waitForFinish=240`,
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
  for (let i = 0; i < 90 && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status); i++) {
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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  console.log(`\nNouriva blog viral-hooks Apify smoke (scripts-only)`);
  console.log(`Actor ${ACTOR}`);
  console.log(`Sources: ${START_URLS.map((s) => s.label).join(", ")}`);
  console.log(`maxPagesPerSource=${MAX_PAGES_PER_SOURCE} maxCrawlDepth=${MAX_DEPTH}\n`);

  // Per-source runs so one chatty blog can't eat the whole page budget.
  const runIds = [];
  const datasetIds = [];
  const items = [];
  for (const source of START_URLS) {
    console.log(`→ ${source.label} (${source.url})`);
    try {
      const { runId, datasetId, items: batch } = await runActor({
        startUrls: [{ url: source.url }],
        crawlerType: "playwright:adaptive",
        maxCrawlDepth: MAX_DEPTH,
        maxCrawlPages: MAX_PAGES_PER_SOURCE,
        maxResults: MAX_PAGES_PER_SOURCE,
        proxyConfiguration: { useApifyProxy: true },
        saveMarkdown: true,
        htmlTransformer: "readableText",
        removeCookieWarnings: true,
        blockMedia: true,
        respectRobotsTxtFile: true,
      });
      runIds.push(runId);
      datasetIds.push(datasetId);
      console.log(`  ${batch.length} pages`);
      for (const it of batch) {
        items.push({ ...it, _sourceLabel: source.label });
      }
    } catch (err) {
      console.warn(`  failed: ${err.message?.slice(0, 160) || err}`);
    }
  }

  const runId = runIds.join(",");
  const datasetId = datasetIds.join(",");
  console.log(`\nCombined · ${items.length} pages across ${runIds.length} runs`);

  const ranked = items
    .map((item, i) => {
      const url = item.url || item.loadedUrl || item.crawl?.loadedUrl || "";
      const title = titleOf(item);
      const text = plain(item);
      const lead = leadParagraph(text);
      const rel = relevanceScore(title, text);
      return {
        id: item.id || `blog-${i}`,
        url,
        source: sourceLabel(url, item._sourceLabel),
        title,
        hook: title || lead.slice(0, 160),
        lead,
        structure: {
          words: rel.words,
          chars: text.length,
          matchedTerms: rel.matched,
        },
        score: rel.score,
        hits: rel.hits,
        textPreview: text.slice(0, 500),
        listing: isLikelyListing(url, title, rel.words),
      };
    })
    .filter((p) => !p.listing && p.title && p.hits >= 1)
    .sort((a, b) => b.score - a.score || b.structure.words - a.structure.words);

  const top = ranked.slice(0, 15);
  const bySource = {};
  for (const p of ranked) {
    bySource[p.source] = (bySource[p.source] || 0) + 1;
  }

  const report = {
    stamp,
    brand: "nouriva",
    platform: "blog",
    actor: ACTOR,
    runId,
    datasetId,
    startUrls: START_URLS,
    maxPagesPerSource: MAX_PAGES_PER_SOURCE,
    maxCrawlDepth: MAX_DEPTH,
    totalScraped: items.length,
    usableArticles: ranked.length,
    bySource,
    note: "Ranked by Nouriva keyword overlap (not social engagement). Inspiration only — do not copy verbatim.",
    topHooks: top.map((p) => ({
      score: Math.round(p.score * 10) / 10,
      source: p.source,
      title: p.title,
      hook: p.hook,
      lead: p.lead,
      matchedTerms: p.structure.matchedTerms,
      words: p.structure.words,
      url: p.url,
      textPreview: p.textPreview,
    })),
  };

  const jsonPath = join(OUT_DIR, `nouriva-blog-viral-hooks-smoke-${stamp}.json`);
  const mdPath = join(OUT_DIR, `nouriva-blog-viral-hooks-smoke-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    mdPath,
    [
      `# Nouriva blog viral hooks smoke (Apify — scripts only)`,
      ``,
      `- stamp: ${stamp}`,
      `- actor: \`${ACTOR}\``,
      `- run: ${runId}`,
      `- crawled: ${items.length} · usable articles: ${ranked.length}`,
      `- sources: ${START_URLS.map((s) => s.label).join(", ")}`,
      `- ranking: Nouriva keyword overlap (diabetes/PCOS/thyroid/labs/meals…) — **not** likes/shares`,
      ``,
      `## Top article titles / leads`,
      ...top.flatMap((p, i) => [
        ``,
        `### ${i + 1}. score ${Math.round(p.score * 10) / 10} · ${p.source}`,
        ``,
        `**Title / hook:** ${p.title}`,
        ``,
        `**Lead:** ${p.lead}`,
        ``,
        `- matched: ${p.structure.matchedTerms.join(", ") || "—"}`,
        `- ~${p.structure.words} words`,
        p.url ? `- url: ${p.url}` : "",
        ``,
        "```",
        p.textPreview + (p.textPreview.length >= 500 ? "…" : ""),
        "```",
      ]),
      ``,
      `_Not product code. Structural/title inspiration only — rewrite; don’t copy._`,
      ``,
    ]
      .filter(Boolean)
      .join("\n")
  );

  console.log(`\nUsable articles: ${ranked.length}`);
  console.log(`By source: ${JSON.stringify(bySource)}`);
  console.log(`\nTop 5 titles:`);
  top.slice(0, 5).forEach((p, i) => {
    console.log(`  ${i + 1}. [${p.source}] ${p.title.slice(0, 90)}`);
  });
  console.log(`\nreport ${jsonPath}`);
  console.log(`md     ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
