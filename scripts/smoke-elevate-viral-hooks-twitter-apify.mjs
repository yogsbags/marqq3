#!/usr/bin/env node
/**
 * ONE-OFF SMOKE (not product code) — Elevate niche X/Twitter viral-hook mining via Apify.
 *
 * Mirrors smoke-elevate-viral-hooks-apify.mjs (LinkedIn) using scraper_one/x-posts-search.
 * Ranks by likes/reposts/replies/views, extracts hooks + structure cues.
 *
 *   node scripts/smoke-elevate-viral-hooks-twitter-apify.mjs
 *
 * Requires APIFY_TOKEN in .env or .env.marqq-live
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const ACTOR = "scraper_one/x-posts-search";

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
  "digital transformation strategy",
  "CDO operating model",
  "strategy to execution",
  "mid-market digital transformation",
  "AI transformation ROI",
  "change management digital",
];

const RESULTS_PER_QUERY = Number(process.env.MAX_POSTS || 25);
const SEARCH_TYPE = process.env.SEARCH_TYPE || "top"; // top | latest

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function engagement(post) {
  const likes =
    num(post.favouriteCount) ||
    num(post.favoriteCount) ||
    num(post.likeCount) ||
    num(post.likes) ||
    num(post?.public_metrics?.like_count) ||
    num(post?.engagement?.likes) ||
    0;
  const reposts =
    num(post.retweetCount) ||
    num(post.repostCount) ||
    num(post.reposts) ||
    num(post?.public_metrics?.retweet_count) ||
    num(post?.engagement?.reposts) ||
    0;
  const replies =
    num(post.replyCount) ||
    num(post.replies) ||
    num(post?.public_metrics?.reply_count) ||
    num(post?.engagement?.replies) ||
    0;
  const quotes =
    num(post.quoteCount) ||
    num(post.quotes) ||
    num(post?.public_metrics?.quote_count) ||
    0;
  const views =
    num(post.viewCount) ||
    num(post.views) ||
    num(post?.public_metrics?.impression_count) ||
    0;
  // Weight discussion + amplification higher than vanity likes
  const score = likes + replies * 3 + reposts * 4 + quotes * 3 + Math.min(views, 50000) / 200;
  return { likes, replies, reposts, quotes, views, score: Math.round(score) };
}

function postText(post) {
  return String(
    post.postText ||
      post.text ||
      post.fullText ||
      post.full_text ||
      post.content ||
      post.tweetText ||
      post?.legacy?.full_text ||
      ""
  ).trim();
}

function postUrl(post) {
  return String(
    post.postUrl ||
      post.url ||
      post.tweetUrl ||
      post.permalink ||
      post.link ||
      (post.id && post.author?.userName
        ? `https://x.com/${post.author.userName}/status/${post.id}`
        : "") ||
      (post.id_str && post.user?.screen_name
        ? `https://x.com/${post.user.screen_name}/status/${post.id_str}`
        : "")
  ).trim();
}

function authorHandle(post) {
  return String(
    post.author?.screenName ||
      post.author?.userName ||
      post.author?.username ||
      post.userName ||
      post.username ||
      post.user?.screen_name ||
      post.handle ||
      ""
  ).replace(/^@/, "");
}

function firstHook(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return (lines[0] || cleaned.slice(0, 180)).slice(0, 220);
}

function structureCues(text) {
  const lines = text.split(/\n+/).filter((l) => l.trim());
  return {
    lineCount: lines.length,
    hasQuestion: /\?/.test(text),
    hasThreadCue: /\b(thread|1\/|🧵)\b/i.test(text),
    hasBullets: /^[\s]*([•\-\*]|\d+[\.\)])/m.test(text),
    hasHashtag: /#\w+/.test(text),
    hasMention: /@\w+/.test(text),
    chars: text.length,
  };
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
  if (!start.ok) throw new Error(`Actor start failed: ${JSON.stringify(started).slice(0, 400)}`);
  let run = started.data;
  for (let i = 0; i < 80 && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status); i++) {
    await new Promise((r) => setTimeout(r, 3000));
    run = (await (await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${TOKEN}`)).json()).data;
  }
  if (run.status !== "SUCCEEDED") throw new Error(`Run ${run.status}: ${run.id}`);
  const items = await (
    await fetch(
      `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${TOKEN}&clean=true&format=json`
    )
  ).json();
  return { runId: run.id, items: Array.isArray(items) ? items : [] };
}

function normalize(post, query) {
  const text = postText(post);
  if (!text || text.length < 40) return null;
  // Skip pure RTs without commentary if text starts with RT
  if (/^RT @/i.test(text) && text.length < 120) return null;
  const eng = engagement(post);
  return {
    query,
    text,
    hook: firstHook(text),
    url: postUrl(post),
    author: authorHandle(post),
    createdAt: post.createdAt || post.created_at || post.date || null,
    ...eng,
    structure: structureCues(text),
    rawKeys: Object.keys(post).slice(0, 25),
  };
}

async function main() {
  console.log(`Elevate X/Twitter viral-hooks smoke (${ACTOR})`);
  console.log(`queries=${SEARCH_QUERIES.length} resultsPer=${RESULTS_PER_QUERY} type=${SEARCH_TYPE}`);

  const runIds = [];
  const all = [];
  for (const query of SEARCH_QUERIES) {
    process.stdout.write(`  · ${query} ... `);
    try {
      const r = await runActor({
        query,
        resultsCount: RESULTS_PER_QUERY,
        searchType: SEARCH_TYPE,
      });
      runIds.push(r.runId);
      let n = 0;
      for (const item of r.items) {
        const row = normalize(item, query);
        if (row) {
          all.push(row);
          n++;
        }
      }
      console.log(`${n} posts (run ${r.runId})`);
      if (r.items[0] && !all.length) {
        console.log("    sample keys:", Object.keys(r.items[0]));
      }
    } catch (e) {
      console.log(`FAIL ${e.message.slice(0, 120)}`);
    }
  }

  // Dedupe by url/text
  const uniq = [
    ...new Map(
      all.map((p) => [(p.url || p.text.slice(0, 80)).toLowerCase(), p])
    ).values(),
  ].sort((a, b) => b.score - a.score);

  const top = uniq.slice(0, 40);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, `elevate-twitter-viral-hooks-smoke-${stamp}.json`);
  const mdPath = join(OUT_DIR, `elevate-twitter-viral-hooks-smoke-${stamp}.md`);

  const report = {
    stamp,
    brand: "Elevate",
    platform: "x-twitter",
    actor: ACTOR,
    searchType: SEARCH_TYPE,
    queries: SEARCH_QUERIES,
    runIds,
    total: uniq.length,
    top,
    note: "Engagement score = likes + 3*replies + 4*reposts + 3*quotes + views/200 (capped). Scripts-only smoke.",
  };
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  writeFileSync(
    mdPath,
    [
      `# Elevate X/Twitter viral hooks smoke`,
      ``,
      `- stamp: ${stamp}`,
      `- actor: \`${ACTOR}\` · searchType: ${SEARCH_TYPE}`,
      `- queries: ${SEARCH_QUERIES.map((q) => `\`${q}\``).join(", ")}`,
      `- scored posts: ${uniq.length}`,
      ``,
      `## Top hooks`,
      ...top.slice(0, 25).map((p, i) =>
        [
          `### ${i + 1}. score ${p.score} · @${p.author || "?"} · ♥${p.likes} ↻${p.reposts} 💬${p.replies}${p.views ? ` 👁${p.views}` : ""}`,
          `- query: \`${p.query}\``,
          `- **Hook:** ${p.hook}`,
          p.url ? `- ${p.url}` : "",
          `- cues: chars=${p.structure.chars} thread=${p.structure.hasThreadCue} Q=${p.structure.hasQuestion}`,
          ``,
          "```",
          p.text.slice(0, 900),
          "```",
          ``,
        ]
          .filter(Boolean)
          .join("\n")
      ),
      ``,
      `## Hook-only list (for Social Studio)`,
      ...top.slice(0, 30).map((p, i) => `${i + 1}. ${p.hook}`),
      ``,
    ].join("\n")
  );

  console.log("\n=== TOP 12 ===");
  top.slice(0, 12).forEach((p, i) => {
    console.log(
      `${i + 1}. [${p.score}] @${p.author} ♥${p.likes} ↻${p.reposts} | ${p.hook.slice(0, 100)}`
    );
  });
  console.log("\n", mdPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
