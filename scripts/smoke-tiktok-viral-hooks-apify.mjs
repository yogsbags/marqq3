#!/usr/bin/env node
/**
 * ONE-OFF SMOKE — TikTok viral-hook mining via Apify (Nouriva / Elevate).
 *
 *   BRAND=nouriva|elevate|both node scripts/smoke-tiktok-viral-hooks-apify.mjs
 *
 * Requires APIFY_TOKEN in .env or .env.marqq-live
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const ACTOR = "apidojo/tiktok-scraper";

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
  nouriva: {
    brand: "Nouriva",
    location: "US",
    keywords: [
      "personalized nutrition",
      "food scanner app",
      "diabetes diet tips",
      "PCOS meal plan",
      "HbA1c diet",
      "Indian diabetic food",
      "blood sugar meals",
      "nutrition lab test",
    ],
    hashtags: ["diabetes", "pcos", "nutritiontips", "bloodsugar"],
    nicheRe:
      /\b(nutrition|diet|diabetes|PCOS|HbA1c|A1[Cc]|blood sugar|meal plan|food scanner|glucose|insulin|thyroid|vegetarian|lab test|CGM)\b/i,
  },
  elevate: {
    brand: "Elevate",
    location: "US",
    keywords: [
      "digital transformation",
      "AI transformation business",
      "change management AI",
      "CIO strategy",
      "enterprise AI ROI",
      "strategy to execution",
    ],
    hashtags: ["digitaltransformation", "enterpriseAI", "CIO"],
    nicheRe:
      /\b(digital transformation|AI transformation|change management|CIO|CDO|enterprise AI|strategy|ROI|consulting)\b/i,
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

function normalize(item, query, brandCfg) {
  const text = String(
    pick(item.text, item.desc, item.description, item.title, item.caption, item.videoMeta?.description, "")
  ).trim();
  if (!text) return null;

  const likes = num(
    item.diggCount ?? item.likes ?? item.likeCount ?? item.stats?.diggCount ?? item.videoMeta?.digg
  );
  const comments = num(item.commentCount ?? item.comments ?? item.stats?.commentCount);
  const shares = num(item.shareCount ?? item.shares ?? item.stats?.shareCount);
  const plays = num(item.playCount ?? item.views ?? item.stats?.playCount ?? item.videoMeta?.playCount);
  const author = String(
    pick(item.authorMeta?.name, item.authorMeta?.nickName, item.author, item.nickname, item.uniqueId, "")
  );
  const url = String(
    pick(
      item.webVideoUrl,
      item.url,
      item.videoUrl,
      item.id && author ? `https://www.tiktok.com/@${author}/video/${item.id}` : ""
    )
  );

  const hashtags = []
    .concat(item.hashtags || [])
    .map((h) => (typeof h === "string" ? h : h?.name || h?.title || ""))
    .filter(Boolean);
  const blob = `${text}\n${hashtags.join(" ")}`;
  if (!brandCfg.nicheRe.test(blob) && likes < 5000) return null;
  if (!brandCfg.nicheRe.test(blob)) return null;

  const eng = Math.round(
    Math.log10(likes + 10) * 100 + Math.log10(plays + 10) * 40 + Math.log10(comments + 2) * 30
  );
  // Hook = first line / first sentence of caption
  const hook = text.split(/\n|[.!?]/)[0].trim().slice(0, 180) || text.slice(0, 180);

  return {
    query,
    hook,
    text: text.slice(0, 400),
    url,
    author,
    likes,
    comments,
    shares,
    plays,
    hashtags: hashtags.slice(0, 8),
    score: eng,
  };
}

async function runBrand(key) {
  const cfg = BRANDS[key];
  console.log(`\n=== ${cfg.brand} TikTok ===`);
  const runIds = [];
  const all = [];

  console.log("  most-liked keyword search…");
  const liked = await runActor({
    keywords: cfg.keywords,
    maxItems: 80,
    sortType: "MOST_LIKED",
    dateRange: "LAST_SIX_MONTHS",
    location: cfg.location,
    includeSearchKeywords: true,
  });
  runIds.push(liked.runId);
  console.log(`  · ${liked.items.length} items (run ${liked.runId}) keys:`, Object.keys(liked.items[0] || {}));

  console.log("  relevance keyword search…");
  const rel = await runActor({
    keywords: cfg.keywords.slice(0, 5),
    maxItems: 50,
    sortType: "RELEVANCE",
    dateRange: "LAST_SIX_MONTHS",
    location: cfg.location,
    includeSearchKeywords: true,
  });
  runIds.push(rel.runId);
  console.log(`  · ${rel.items.length} items (run ${rel.runId})`);

  // Hashtag URLs via startUrls
  console.log("  hashtag feeds…");
  const tags = await runActor({
    startUrls: cfg.hashtags.map((h) => `https://www.tiktok.com/tag/${h}`),
    maxItems: 40,
    location: cfg.location,
  });
  runIds.push(tags.runId);
  console.log(`  · ${tags.items.length} items (run ${tags.runId})`);

  const tagged = [
    ...liked.items.map((it) => ({ it, query: pick(it.searchKeyword, it.keyword, "most_liked") })),
    ...rel.items.map((it) => ({ it, query: pick(it.searchKeyword, it.keyword, "relevance") })),
    ...tags.items.map((it, i) => ({ it, query: `#${cfg.hashtags[i % cfg.hashtags.length]}` })),
  ];

  for (const { it, query } of tagged) {
    const row = normalize(it, query, cfg);
    if (row) all.push(row);
  }

  const uniq = [
    ...new Map(all.map((v) => [(v.url || v.hook).toLowerCase(), v])).values(),
  ].sort((a, b) => b.score - a.score || b.likes - a.likes);

  const listed = uniq.slice(0, 35);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, `${key}-tiktok-viral-hooks-smoke-${stamp}.json`);
  const mdPath = join(OUT_DIR, `${key}-tiktok-viral-hooks-smoke-${stamp}.md`);

  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        stamp,
        brand: cfg.brand,
        platform: "tiktok",
        actor: ACTOR,
        keywords: cfg.keywords,
        hashtags: cfg.hashtags,
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
      `# ${cfg.brand} TikTok viral hooks smoke`,
      ``,
      `- stamp: ${stamp}`,
      `- actor: \`${ACTOR}\``,
      `- keywords: ${cfg.keywords.map((q) => `\`${q}\``).join(", ")}`,
      `- hashtags: ${cfg.hashtags.map((h) => `#${h}`).join(", ")}`,
      `- scored: ${uniq.length} · listed: ${listed.length}`,
      ``,
      `## Top video hooks`,
      ...listed.slice(0, 20).map((v, i) =>
        [
          `### ${i + 1}. score ${v.score} · ${v.likes.toLocaleString()} likes · ${v.plays.toLocaleString()} plays`,
          `- **Hook:** ${v.hook}`,
          `- @${v.author || "?"} · query: \`${v.query}\``,
          v.hashtags?.length ? `- tags: ${v.hashtags.map((h) => `#${h}`).join(" ")}` : "",
          v.url ? `- ${v.url}` : "",
          v.text && v.text !== v.hook ? `\n> ${v.text.slice(0, 220)}…` : "",
          ``,
        ]
          .filter(Boolean)
          .join("\n")
      ),
      ``,
      `## Hook-only list (for Social / short-form scripts)`,
      ...listed.slice(0, 25).map((v, i) => `${i + 1}. ${v.hook}`),
      ``,
    ].join("\n")
  );

  console.log(`\n=== ${cfg.brand} TOP 10 ===`);
  listed.slice(0, 10).forEach((v, i) => {
    console.log(`${i + 1}. [${v.score}] ${v.likes}♥ ${v.plays}▶ | ${v.hook.slice(0, 85)}`);
  });
  console.log(mdPath);
  return { key, mdPath, top: listed.length };
}

const which = String(process.env.BRAND || "nouriva").toLowerCase();
const keys = which === "both" ? ["nouriva", "elevate"] : [which];
if (!keys.every((k) => BRANDS[k])) {
  console.error("BRAND must be nouriva | elevate | both");
  process.exit(1);
}

const out = [];
for (const k of keys) out.push(await runBrand(k));
console.log("\nDone:", out.map((o) => `${o.key}:${o.top}`).join(", "));
