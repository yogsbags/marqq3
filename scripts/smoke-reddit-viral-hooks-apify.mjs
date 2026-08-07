#!/usr/bin/env node
/**
 * ONE-OFF SMOKE — Reddit viral-hook mining via Apify (Elevate / Nouriva).
 * Same pattern as LinkedIn / X / YouTube: niche search → rank by upvotes → extract hooks.
 *
 *   BRAND=elevate|nouriva|both node scripts/smoke-reddit-viral-hooks-apify.mjs
 *
 * Requires APIFY_TOKEN in .env or .env.marqq-live
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
// Fast search-oriented actor (trudax lite was too slow for multi-query smokes)
const ACTOR = "fatihtahta/reddit-scraper-search-fast";

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

const BRANDS = {
  elevate: {
    brand: "Elevate",
    queries: [
      "digital transformation strategy",
      "AI transformation ROI",
      "strategy to execution consulting",
      "CDO operating model",
      "change management digital transformation",
      "mid market AI adoption",
    ],
    subreddits: ["CIO", "consulting", "artificial", "sysadmin", "Entrepreneur", "ITManagers"],
    // Avoid bare "strategy"/"AI" — Reddit Top search floods off-niche mega-subs
    nicheRe:
      /\b(digital transformation|AI transformation|change management|operating model|CDO|CIO|strategy to execution|enterprise AI|enterprise IT|IT strategy|consulting firm|mid[- ]market|genai|generative AI|cloud transformation|tech transformation)\b/i,
    noiseSub:
      /^(mildlyinfuriating|cats|memes|politics|news|worldnews|AITAH|AskReddit|funny|pics|videos|BlackPeopleofReddit|GlowUps|GirlDinnerDiaries|ChatGPT|pcmasterrace|UnderReportedNews|todayilearned|interestingasfuck|MadeMeSmile|PublicFreakout)$/i,
  },
  nouriva: {
    brand: "Nouriva",
    queries: [
      "personalized nutrition app",
      "food scanner nutrition",
      "diabetes diet Indian food",
      "PCOS diet plan vegetarian",
      "lab based meal plan blood test",
      "what to eat for HbA1c",
    ],
    subreddits: [
      "diabetes",
      "PCOS",
      "nutrition",
      "IndianFood",
      "HealthyFood",
      "diabetes_t2",
      "loseit",
      "EatCheapAndHealthy",
      "prediabetes",
      "Type1Diabetes",
    ],
    nicheRe:
      /\b(nutrition|diet(ary)?|diabetes|PCOS|HbA1c|A1[Cc]|blood sugar|blood test|meal plan|food scanner|personalized nutrition|thyroid|glucose|insulin|glycemic|type\s?[12]|prediabetes|carb count|CGM|continuous glucose)\b/i,
    noiseSub:
      /^(Fauxmoi|AITAH|complaints|Life|CATHELP|BestofRedditorUpdates|politics|news|worldnews|AskReddit|memes|funny|pics|videos|UpliftingNews|shittyfoodporn|TwoHotTakes|HistoryMemes|GlowUps|BoredPandaHQ|walking)$/i,
  },
};

function num(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function pick(...vals) {
  for (const v of vals) {
    if (v != null && String(v).trim()) return v;
  }
  return "";
}

async function runActor(input) {
  const start = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR)}/runs?token=${TOKEN}&waitForFinish=180`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }
  );
  const body = await start.json();
  if (!start.ok) throw new Error(JSON.stringify(body).slice(0, 400));
  let run = body.data;
  for (let i = 0; i < 90 && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status); i++) {
    await new Promise((r) => setTimeout(r, 4000));
    run = (await (await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${TOKEN}`)).json()).data;
    if (i % 10 === 0) console.log(`    … still ${run.status} (${run.id})`);
  }
  if (run.status !== "SUCCEEDED") throw new Error(`${run.status} ${run.id}`);
  const items = await (
    await fetch(
      `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${TOKEN}&clean=true&format=json`
    )
  ).json();
  return { runId: run.id, items: Array.isArray(items) ? items : [] };
}

function isPost(item) {
  const dataType = String(item.dataType || item.type || item.kind || item.record_type || "").toLowerCase();
  if (dataType.includes("comment")) return false;
  const title = pick(item.title, item.postTitle, item.post_title, item.data?.title);
  return Boolean(title);
}

function normalize(item, query, brandCfg) {
  if (!isPost(item)) return null;
  const title = String(pick(item.title, item.postTitle, item.post_title, item.data?.title)).trim();
  if (!title) return null;

  const body = String(
    pick(
      item.body,
      item.selftext,
      item.text,
      item.postText,
      item.self_text,
      item.content,
      item.data?.selftext,
      ""
    )
  ).slice(0, 800);
  const permalink = pick(item.permalink, item.postUrl, item.url, item.link, item.data?.permalink);
  let url = String(permalink || "").trim();
  if (url && !url.startsWith("http")) url = `https://www.reddit.com${url.startsWith("/") ? "" : "/"}${url}`;

  const subreddit = String(
    pick(item.subreddit, item.communityName, item.community, item.subreddit_name, item.data?.subreddit, "")
  ).replace(/^r\//i, "");
  const author = String(
    pick(item.author, item.username, item.userName, item.data?.author, "")
  ).replace(/^u\//i, "");
  const score = num(
    item.score ?? item.upVotes ?? item.ups ?? item.upvote_count ?? item.numberOfUpvotes ?? item.data?.score
  );
  const comments = num(
    item.num_comments ?? item.numberOfComments ?? item.numComments ?? item.commentCount ?? item.data?.num_comments
  );
  const created = pick(item.created_utc, item.createdAt, item.created, item.date, item.data?.created_utc);

  const textBlob = `${title}\n${body}\nr/${subreddit}`;
  if (brandCfg.noiseSub?.test(subreddit)) return null;

  const allowlisted = (brandCfg.subreddits || []).some(
    (s) => s.toLowerCase() === subreddit.toLowerCase()
  );
  const nicheMatch = brandCfg.nicheRe.test(textBlob) || allowlisted;
  // Require niche signal — Reddit Top search floods mega off-niche posts
  if (!nicheMatch) return null;

  const engScore = Math.round(Math.log10(score + 10) * 120 + Math.log10(comments + 2) * 40);
  const finalScore = Math.round(engScore * (brandCfg.nicheRe.test(textBlob) ? 1.25 : 0.9));

  return {
    query,
    title,
    hook: title.slice(0, 220),
    bodyPreview: body.slice(0, 280),
    url,
    subreddit,
    author,
    upvotes: score,
    comments,
    created,
    score: finalScore,
    nicheMatch: true,
  };
}

async function runBrand(key) {
  const cfg = BRANDS[key];
  console.log(`\n=== ${cfg.brand} Reddit ===`);
  const runIds = [];
  const all = [];

  console.log("  top search…");
  const top = await runActor({
    queries: cfg.queries,
    sort: "top",
    timeframe: "year",
    scrapeComments: false,
    includeNsfw: false,
    maxPosts: 20,
    maximize_coverage: false,
  });
  runIds.push(top.runId);
  console.log(`  · ${top.items.length} items (run ${top.runId}) keys:`, Object.keys(top.items[0] || {}));

  console.log("  relevance search…");
  const rel = await runActor({
    queries: cfg.queries,
    sort: "relevance",
    timeframe: "year",
    scrapeComments: false,
    includeNsfw: false,
    maxPosts: 15,
    maximize_coverage: false,
  });
  runIds.push(rel.runId);
  console.log(`  · ${rel.items.length} items (run ${rel.runId})`);

  // Optional: top posts from one high-signal subreddit per brand
  const seedSub = cfg.subreddits[0];
  console.log(`  r/${seedSub} top…`);
  const subs = await runActor({
    subredditName: seedSub,
    subredditSort: "top",
    subredditTimeframe: "year",
    scrapeComments: false,
    includeNsfw: false,
    maxPosts: 15,
  });
  runIds.push(subs.runId);
  console.log(`  · ${subs.items.length} items (run ${subs.runId})`);

  const tagged = [
    ...top.items.map((it, i) => ({ it, query: cfg.queries[i % cfg.queries.length] })),
    ...rel.items.map((it, i) => ({ it, query: cfg.queries[i % cfg.queries.length] })),
    ...subs.items.map((it) => ({ it, query: `r/${seedSub}` })),
  ];

  for (const { it, query } of tagged) {
    const q = pick(it.query, it.search_query, it.searchedQuery, query);
    const row = normalize(it, q, cfg);
    if (row) all.push(row);
  }

  const uniq = [
    ...new Map(all.map((v) => [(v.url || v.title).toLowerCase(), v])).values(),
  ].sort((a, b) => b.score - a.score || b.upvotes - a.upvotes);

  const listed = uniq.slice(0, 35);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, `${key}-reddit-viral-hooks-smoke-${stamp}.json`);
  const mdPath = join(OUT_DIR, `${key}-reddit-viral-hooks-smoke-${stamp}.md`);

  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        stamp,
        brand: cfg.brand,
        platform: "reddit",
        actor: ACTOR,
        queries: cfg.queries,
        subreddits: cfg.subreddits,
        runIds,
        total: uniq.length,
        top: listed,
      },
      null,
      2
    )
  );
  writeFileSync(
    mdPath,
    [
      `# ${cfg.brand} Reddit viral hooks smoke`,
      ``,
      `- stamp: ${stamp}`,
      `- actor: \`${ACTOR}\``,
      `- queries: ${cfg.queries.map((q) => `\`${q}\``).join(", ")}`,
      `- seed subreddit: r/${cfg.subreddits[0]} (others for context: ${cfg.subreddits.slice(1).map((s) => `r/${s}`).join(", ")})`,
      `- scored: ${uniq.length} · top listed: ${listed.length}`,
      ``,
      `## Top post hooks`,
      ...listed.slice(0, 20).map((v, i) =>
        [
          `### ${i + 1}. score ${v.score} · ${v.upvotes.toLocaleString()} upvotes · ${v.comments} comments`,
          `- **Hook (title):** ${v.hook}`,
          `- r/${v.subreddit || "?"} · u/${v.author || "?"} · query: \`${v.query}\``,
          v.url ? `- ${v.url}` : "",
          v.bodyPreview ? `\n> ${v.bodyPreview}${v.bodyPreview.length >= 280 ? "…" : ""}` : "",
          ``,
        ]
          .filter(Boolean)
          .join("\n")
      ),
      ``,
      `## Hook-only list (for Social / community posts)`,
      ...listed.slice(0, 25).map((v, i) => `${i + 1}. ${v.hook}`),
      ``,
    ].join("\n")
  );

  console.log(`\n=== ${cfg.brand} TOP 10 ===`);
  listed.slice(0, 10).forEach((v, i) => {
    console.log(
      `${i + 1}. [${v.score}] ${v.upvotes}↑ ${v.comments}💬 r/${v.subreddit} | ${v.hook.slice(0, 85)}`
    );
  });
  console.log(mdPath);
  return { key, mdPath, jsonPath, top: listed.length };
}

const which = String(process.env.BRAND || "both").toLowerCase();
const keys = which === "both" ? ["elevate", "nouriva"] : [which];
if (!keys.every((k) => BRANDS[k])) {
  console.error("BRAND must be elevate | nouriva | both");
  process.exit(1);
}

const out = [];
for (const k of keys) out.push(await runBrand(k));
console.log("\nDone:", out.map((o) => `${o.key}:${o.top}`).join(", "));
