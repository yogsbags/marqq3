#!/usr/bin/env node
/**
 * ONE-OFF SMOKE (not product code) — Elevate niche LinkedIn viral-hook mining via Apify.
 *
 * Uses harvestapi/linkedin-post-search, ranks by engagement, extracts hooks + structure cues.
 * Does NOT wire into Social Studio / Ask Marqq.
 *
 *   node scripts/smoke-elevate-viral-hooks-apify.mjs
 *
 * Requires APIFY_TOKEN in .env or .env.marqq-live
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const ACTOR = "harvestapi/linkedin-post-search";

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

const SEARCH_QUERIES = [
  "digital transformation stalls strategy deck",
  "CDO operating model mid-market",
  "strategy to execution digital transformation BFSI",
];

const MAX_POSTS_PER_QUERY = Number(process.env.MAX_POSTS || 12);
const POSTED_LIMIT = process.env.POSTED_LIMIT || "3months";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function engagement(post) {
  const r =
    num(post.totalReactionCount) ||
    num(post.reactionsCount) ||
    num(post.numLikes) ||
    num(post.likeCount) ||
    num(post?.engagement?.likes) ||
    num(post?.socialCount?.numLikes) ||
    0;
  const c =
    num(post.commentsCount) ||
    num(post.numComments) ||
    num(post.commentCount) ||
    num(post?.engagement?.comments) ||
    num(post?.socialCount?.numComments) ||
    0;
  const s =
    num(post.repostsCount) ||
    num(post.numShares) ||
    num(post.shareCount) ||
    num(post?.engagement?.shares) ||
    num(post?.socialCount?.numShares) ||
    0;
  return { reactions: r, comments: c, shares: s, score: r + c * 2 + s * 3 };
}

function postText(post) {
  return String(
    post.text ||
      post.content ||
      post.commentary ||
      post.postText ||
      post?.content?.text ||
      ""
  ).trim();
}

function firstHook(text) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return (lines[0] || text.slice(0, 180)).slice(0, 220);
}

function structureCues(text) {
  const lines = text.split(/\n+/).filter((l) => l.trim());
  return {
    blankLines: (text.match(/\n\n/g) || []).length,
    lineCount: lines.length,
    hasQuestion: /\?/.test(text),
    hasBullets: /^[\s]*([•\-\*▪▸]|[0-9]+[\.\)]|1️⃣|2️⃣|3️⃣)/m.test(text),
    hasNumberedEmoji: /[1-9]️⃣/.test(text),
    likeCommentConnect: /like this post|comment ["“']?\w+|connect with me/i.test(text),
    chars: text.length,
  };
}

async function runActor(input) {
  const start = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR)}/runs?token=${TOKEN}&waitForFinish=120`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const started = await start.json();
  if (!start.ok) throw new Error(`Actor start failed: ${JSON.stringify(started).slice(0, 400)}`);
  let run = started.data;
  const runId = run.id;
  // poll if not finished
  for (let i = 0; i < 60 && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status); i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${TOKEN}`);
    const sj = await st.json();
    run = sj.data;
  }
  if (run.status !== "SUCCEEDED") {
    throw new Error(`Actor run ${run.status}: ${runId}`);
  }
  const ds = await fetch(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${TOKEN}&clean=true&format=json`
  );
  const items = await ds.json();
  return { runId, datasetId: run.defaultDatasetId, items: Array.isArray(items) ? items : [] };
}

function authorLabel(post) {
  return (
    post.authorName ||
    post.author?.name ||
    post.author?.fullName ||
    post.posterName ||
    post.actor?.name ||
    post.authorHeadline ||
    "unknown"
  );
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  console.log(`\nElevate viral-hooks Apify smoke (scripts-only)`);
  console.log(`Actor ${ACTOR}`);
  console.log(`Queries: ${SEARCH_QUERIES.join(" | ")}`);
  console.log(`maxPosts/query=${MAX_POSTS_PER_QUERY} postedLimit=${POSTED_LIMIT}\n`);

  const { runId, datasetId, items } = await runActor({
    searchQueries: SEARCH_QUERIES,
    maxPosts: MAX_POSTS_PER_QUERY,
    postedLimit: POSTED_LIMIT,
    sortBy: "relevance",
    contentType: "all",
    scrapeReactions: false,
    scrapeComments: false,
    profileScraperMode: "short",
  });

  console.log(`Run ${runId} · ${items.length} posts`);

  const ranked = items
    .map((post, i) => {
      const text = postText(post);
      const eng = engagement(post);
      return {
        id: post.id || post.urn || `p-${i}`,
        url: post.postUrl || post.url || post.linkedinUrl || "",
        author: authorLabel(post),
        headline: post.authorHeadline || post.author?.headline || "",
        postedAt: post.postedAt || post.publishedAt || post.timestamp || "",
        ...eng,
        hook: firstHook(text),
        structure: structureCues(text),
        textPreview: text.slice(0, 600),
        text,
      };
    })
    .filter((p) => p.text.length > 80)
    .sort((a, b) => b.score - a.score);

  const top = ranked.slice(0, 15);
  const report = {
    stamp,
    brand: "elevate",
    actor: ACTOR,
    runId,
    datasetId,
    queries: SEARCH_QUERIES,
    postedLimit: POSTED_LIMIT,
    maxPostsPerQuery: MAX_POSTS_PER_QUERY,
    totalScraped: items.length,
    usable: ranked.length,
    topHooks: top.map((p) => ({
      score: p.score,
      reactions: p.reactions,
      comments: p.comments,
      shares: p.shares,
      author: p.author,
      headline: p.headline,
      hook: p.hook,
      structure: p.structure,
      url: p.url,
      textPreview: p.textPreview,
    })),
  };

  const jsonPath = join(OUT_DIR, `elevate-viral-hooks-smoke-${stamp}.json`);
  const mdPath = join(OUT_DIR, `elevate-viral-hooks-smoke-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    mdPath,
    [
      `# Elevate viral LinkedIn hooks smoke (Apify — scripts only)`,
      ``,
      `- stamp: ${stamp}`,
      `- actor: \`${ACTOR}\``,
      `- run: ${runId}`,
      `- scraped: ${items.length} · usable: ${ranked.length}`,
      `- queries: ${SEARCH_QUERIES.map((q) => `\`${q}\``).join(", ")}`,
      ``,
      `## Top hooks (ranked reactions + 2×comments + 3×shares)`,
      ...top.flatMap((p, i) => [
        ``,
        `### ${i + 1}. score ${p.score} · 👍 ${p.reactions} · 💬 ${p.comments} · 🔁 ${p.shares}`,
        ``,
        `**Hook:** ${p.hook}`,
        ``,
        `- author: ${p.author}`,
        `- structure: ${p.structure.chars} chars · ${p.structure.lineCount} lines · blanks=${p.structure.blankLines} · bullets=${p.structure.hasBullets} · Q=${p.structure.hasQuestion}`,
        p.url ? `- url: ${p.url}` : "",
        ``,
        "```",
        p.textPreview + (p.text.length > 600 ? "…" : ""),
        "```",
      ]),
      ``,
      `_Not committed to product path. For Social Studio pattern inspiration only — do not copy text verbatim._`,
      ``,
    ]
      .filter(Boolean)
      .join("\n")
  );

  console.log(`\nTop 5 hooks:`);
  top.slice(0, 5).forEach((p, i) => {
    console.log(`  ${i + 1}. [${p.score}] ${p.hook.slice(0, 100)}`);
  });
  console.log(`\nreport ${jsonPath}`);
  console.log(`md     ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
