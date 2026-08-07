#!/usr/bin/env node
/**
 * ONE-OFF SMOKE — YouTube viral-hook mining via Apify (Elevate / Nouriva).
 * Same pattern as LinkedIn / Instagram / X smokes: niche search → rank by views → extract hooks.
 *
 *   BRAND=elevate|nouriva|both node scripts/smoke-youtube-viral-hooks-apify.mjs
 *
 * Requires APIFY_TOKEN in .env or .env.marqq-live
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const ACTOR = "thirdwatch/youtube-scraper";

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
      "AI transformation ROI business",
      "strategy to execution consulting",
      "CDO operating model",
      "change management digital transformation",
      "mid market AI adoption",
    ],
    nicheRe:
      /\b(digital transformation|AI transformation|change management|operating model|CDO|CIO|strategy|execution|enterprise|consulting|ROI|adoption|mid[- ]market)\b/i,
    noiseRe: /\b(minecraft|fortnite|gaming|music video|asmr|prank|recipe|workout|bitcoin trading signal)\b/i,
  },
  nouriva: {
    brand: "Nouriva",
    queries: [
      "personalized nutrition app",
      "food scanner nutrition AI",
      "diabetes diet Indian food",
      "PCOS diet plan vegetarian",
      "lab based meal plan blood test",
      "what to eat for HbA1c",
    ],
    nicheRe:
      /\b(nutrition|diet|food|diabetes|PCOS|HbA1c|blood test|meal plan|scanner|personalized|thyroid|gut)\b/i,
    noiseRe: /\b(minecraft|fortnite|asmr|prank|mrbeast|music video)\b/i,
  },
};

function num(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).replace(/,/g, "").trim();
  const m = s.match(/^([\d.]+)\s*([kKmMbB])?/);
  if (!m) return 0;
  let n = Number(m[1]);
  const u = (m[2] || "").toLowerCase();
  if (u === "k") n *= 1e3;
  if (u === "m") n *= 1e6;
  if (u === "b") n *= 1e9;
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
    `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR)}/runs?token=${TOKEN}&waitForFinish=240`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }
  );
  const body = await start.json();
  if (!start.ok) throw new Error(JSON.stringify(body).slice(0, 350));
  let run = body.data;
  for (let i = 0; i < 80 && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status); i++) {
    await new Promise((r) => setTimeout(r, 4000));
    run = (await (await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${TOKEN}`)).json()).data;
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
  const title = String(pick(item.title, item.name, item.videoTitle)).trim();
  if (!title) return null;
  const url = String(
    pick(item.url, item.videoUrl, item.link, item.id ? `https://www.youtube.com/watch?v=${item.id}` : "")
  ).trim();
  const views = num(item.viewCount ?? item.views ?? item.viewsCount ?? item.statistics?.viewCount);
  const likes = num(item.likeCount ?? item.likes ?? item.statistics?.likeCount);
  const channel = String(pick(item.channelName, item.channel?.name, item.channelTitle, item.author)).trim();
  const duration = pick(item.duration, item.durationText, item.lengthText);
  const published = pick(item.publishedAt, item.publishDate, item.publishedTime, item.uploadDate);
  const description = String(pick(item.description, item.desc, item.snippet)).slice(0, 500);
  const isShort = Boolean(item.isShort || /#shorts/i.test(title) || /\/shorts\//i.test(url));
  const textBlob = `${title}\n${description}`;
  if (brandCfg.noiseRe.test(textBlob) && !brandCfg.nicheRe.test(textBlob)) return null;

  // Viral score: views primary; shorts get slight damping for B2B, less for B2C
  const shortPenalty = isShort && brandCfg.brand === "Elevate" ? 0.55 : isShort ? 0.85 : 1;
  const score = Math.round((Math.log10(views + 10) * 100 + likes / 50) * shortPenalty);
  const nicheBoost = brandCfg.nicheRe.test(textBlob) ? 1.15 : 0.7;
  const finalScore = Math.round(score * nicheBoost);

  // Hook = title (YouTube's headline)
  const hook = title.slice(0, 220);
  return {
    query,
    title,
    hook,
    url,
    channel,
    views,
    likes,
    duration,
    published,
    isShort,
    description,
    score: finalScore,
    nicheMatch: brandCfg.nicheRe.test(textBlob),
  };
}

async function runBrand(key) {
  const cfg = BRANDS[key];
  console.log(`\n=== ${cfg.brand} YouTube ===`);
  const runIds = [];
  const all = [];

  // Relevance pass (topic fit)
  console.log("  relevance search…");
  const rel = await runActor({
    queries: cfg.queries,
    maxResults: 80,
    maxResultsPerQuery: 14,
    searchType: "videos",
    sort: "relevance",
  });
  runIds.push(rel.runId);
  console.log(`  · ${rel.items.length} items (run ${rel.runId}) keys:`, Object.keys(rel.items[0] || {}));

  // View-count pass (viral in niche queries)
  console.log("  viewCount search…");
  const viral = await runActor({
    queries: cfg.queries.slice(0, 4),
    maxResults: 48,
    maxResultsPerQuery: 12,
    searchType: "videos",
    sort: "viewCount",
  });
  runIds.push(viral.runId);
  console.log(`  · ${viral.items.length} items (run ${viral.runId})`);

  const tagged = [
    ...rel.items.map((it, i) => ({ it, query: cfg.queries[i % cfg.queries.length] })),
    ...viral.items.map((it, i) => ({ it, query: cfg.queries[i % Math.min(4, cfg.queries.length)] })),
  ];

  // Prefer query from item if present
  for (const { it, query } of tagged) {
    const q = pick(it.query, it.searchQuery, it.keyword, query);
    const row = normalize(it, q, cfg);
    if (row) all.push(row);
  }

  const uniq = [
    ...new Map(all.map((v) => [(v.url || v.title).toLowerCase(), v])).values(),
  ].sort((a, b) => b.score - a.score || b.views - a.views);

  const top = uniq.filter((v) => v.nicheMatch || v.views >= 5000).slice(0, 35);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, `${key}-youtube-viral-hooks-smoke-${stamp}.json`);
  const mdPath = join(OUT_DIR, `${key}-youtube-viral-hooks-smoke-${stamp}.md`);

  const report = {
    stamp,
    brand: cfg.brand,
    platform: "youtube",
    actor: ACTOR,
    queries: cfg.queries,
    runIds,
    total: uniq.length,
    top,
  };
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    mdPath,
    [
      `# ${cfg.brand} YouTube viral hooks smoke`,
      ``,
      `- stamp: ${stamp}`,
      `- actor: \`${ACTOR}\``,
      `- queries: ${cfg.queries.map((q) => `\`${q}\``).join(", ")}`,
      `- scored: ${uniq.length} · top listed: ${top.length}`,
      ``,
      `## Top video hooks`,
      ...top.slice(0, 20).map((v, i) =>
        [
          `### ${i + 1}. score ${v.score} · ${v.views.toLocaleString()} views${v.isShort ? " · Short" : ""}`,
          `- **Hook (title):** ${v.hook}`,
          `- channel: ${v.channel || "?"} · query: \`${v.query}\``,
          v.url ? `- ${v.url}` : "",
          v.description ? `\n> ${v.description.slice(0, 220)}…` : "",
          ``,
        ]
          .filter(Boolean)
          .join("\n")
      ),
      ``,
      `## Hook-only list (for Social / video scripts)`,
      ...top.slice(0, 25).map((v, i) => `${i + 1}. ${v.hook}`),
      ``,
    ].join("\n")
  );

  console.log(`\n=== ${cfg.brand} TOP 10 ===`);
  top.slice(0, 10).forEach((v, i) => {
    console.log(`${i + 1}. [${v.score}] ${v.views} views | ${v.hook.slice(0, 90)}`);
  });
  console.log(mdPath);
  return { key, mdPath, jsonPath, top: top.length };
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
