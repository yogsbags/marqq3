#!/usr/bin/env node
/**
 * ONE-OFF SMOKE (not product code) — Nouriva Instagram niche viral-hook mining via Apify.
 *
 * Uses apify/instagram-hashtag-scraper, ranks by engagement, extracts caption hooks.
 * Does NOT wire into Social Studio / Ask Marqq.
 *
 *   node scripts/smoke-nouriva-viral-hooks-instagram-apify.mjs
 *
 * Requires APIFY_TOKEN in .env or .env.marqq-live
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const ACTOR = "apify/instagram-hashtag-scraper";

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

const HASHTAGS = [
  "healthyindianfood",
  "diabetesdietindia",
  "pcosdiet",
  "personalizednutrition",
  "thyroiddiet",
];

const RESULTS_LIMIT = Number(process.env.RESULTS_LIMIT || 15);
const RESULTS_TYPE = process.env.RESULTS_TYPE || "posts"; // posts | reels

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function engagement(post) {
  const likes =
    num(post.likesCount) ||
    num(post.likeCount) ||
    num(post.likes) ||
    num(post?.edge_liked_by?.count) ||
    0;
  const comments =
    num(post.commentsCount) ||
    num(post.commentCount) ||
    num(post.comments) ||
    num(post?.edge_media_to_comment?.count) ||
    0;
  const views =
    num(post.videoViewCount) ||
    num(post.videoPlayCount) ||
    num(post.playCount) ||
    num(post.viewsCount) ||
    0;
  // weigh comments higher; views soft for reels
  return { likes, comments, views, score: likes + comments * 3 + Math.min(views, 50000) / 100 };
}

function caption(post) {
  return String(post.caption || post.text || post.description || "").trim();
}

function firstHook(text) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  // drop leading emoji-only / hashtag-only openers for display
  const first = lines.find((l) => !/^[#@]/.test(l) && l.length > 12) || lines[0] || text.slice(0, 180);
  return String(first || "").slice(0, 220);
}

function structureCues(text) {
  const lines = text.split(/\n+/).filter((l) => l.trim());
  return {
    blankLines: (text.match(/\n\n/g) || []).length,
    lineCount: lines.length,
    hasQuestion: /\?/.test(text),
    hasBullets: /^[\s]*([•\-\*▪▸]|[0-9]+[\.\)]|1️⃣|2️⃣|3️⃣)/m.test(text),
    hashtagCount: (text.match(/#\w+/g) || []).length,
    chars: text.length,
  };
}

function authorLabel(post) {
  return (
    post.ownerUsername ||
    post.ownerFullName ||
    post.username ||
    post.author ||
    post?.owner?.username ||
    "unknown"
  );
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
  if (!start.ok) throw new Error(`Actor start failed: ${JSON.stringify(started).slice(0, 500)}`);
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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  console.log(`\nNouriva Instagram viral-hooks Apify smoke (scripts-only)`);
  console.log(`Actor ${ACTOR}`);
  console.log(`Hashtags: ${HASHTAGS.map((h) => "#" + h).join(" ")}`);
  console.log(`resultsLimit=${RESULTS_LIMIT} type=${RESULTS_TYPE}\n`);

  const { runId, datasetId, items } = await runActor({
    hashtags: HASHTAGS,
    resultsType: RESULTS_TYPE,
    resultsLimit: RESULTS_LIMIT,
    keywordSearch: false,
  });

  console.log(`Run ${runId} · ${items.length} posts`);

  const ranked = items
    .map((post, i) => {
      const text = caption(post);
      const eng = engagement(post);
      return {
        id: post.id || post.shortCode || `ig-${i}`,
        url: post.url || post.inputUrl || (post.shortCode ? `https://www.instagram.com/p/${post.shortCode}/` : ""),
        author: authorLabel(post),
        hashtag: post.hashtag || post.query || "",
        type: post.type || post.productType || RESULTS_TYPE,
        ...eng,
        hook: firstHook(text),
        structure: structureCues(text),
        textPreview: text.slice(0, 500),
        text,
      };
    })
    .filter((p) => p.text.length > 40)
    .sort((a, b) => b.score - a.score);

  const top = ranked.slice(0, 15);
  const report = {
    stamp,
    brand: "nouriva",
    platform: "instagram",
    actor: ACTOR,
    runId,
    datasetId,
    hashtags: HASHTAGS,
    resultsType: RESULTS_TYPE,
    resultsLimit: RESULTS_LIMIT,
    totalScraped: items.length,
    usable: ranked.length,
    topHooks: top.map((p) => ({
      score: Math.round(p.score),
      likes: p.likes,
      comments: p.comments,
      views: p.views,
      author: p.author,
      hashtag: p.hashtag,
      type: p.type,
      hook: p.hook,
      structure: p.structure,
      url: p.url,
      textPreview: p.textPreview,
    })),
  };

  const jsonPath = join(OUT_DIR, `nouriva-ig-viral-hooks-smoke-${stamp}.json`);
  const mdPath = join(OUT_DIR, `nouriva-ig-viral-hooks-smoke-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    mdPath,
    [
      `# Nouriva Instagram viral hooks smoke (Apify — scripts only)`,
      ``,
      `- stamp: ${stamp}`,
      `- actor: \`${ACTOR}\``,
      `- run: ${runId}`,
      `- scraped: ${items.length} · usable: ${ranked.length}`,
      `- hashtags: ${HASHTAGS.map((h) => `\`#${h}\``).join(", ")}`,
      ``,
      `## Top captions (ranked likes + 3×comments + soft views)`,
      ...top.flatMap((p, i) => [
        ``,
        `### ${i + 1}. score ${Math.round(p.score)} · ❤️ ${p.likes} · 💬 ${p.comments}${p.views ? ` · ▶️ ${p.views}` : ""}`,
        ``,
        `**Hook:** ${p.hook}`,
        ``,
        `- @${p.author}${p.hashtag ? ` · #${p.hashtag}` : ""}`,
        `- structure: ${p.structure.chars} chars · ${p.structure.lineCount} lines · #tags=${p.structure.hashtagCount} · Q=${p.structure.hasQuestion}`,
        p.url ? `- url: ${p.url}` : "",
        ``,
        "```",
        p.textPreview + (p.text.length > 500 ? "…" : ""),
        "```",
      ]),
      ``,
      `_Not product code. Caption/hook inspiration only — do not copy verbatim. Rank by raw engagement (not follower-normalized)._`,
      ``,
    ]
      .filter(Boolean)
      .join("\n")
  );

  console.log(`\nTop 5 hooks:`);
  top.slice(0, 5).forEach((p, i) => {
    console.log(`  ${i + 1}. [${Math.round(p.score)}] ${p.hook.slice(0, 100)}`);
  });
  console.log(`\nreport ${jsonPath}`);
  console.log(`md     ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
