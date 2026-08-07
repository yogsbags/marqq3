#!/usr/bin/env node
/**
 * ONE-OFF SMOKE (not product code) — Nouriva niche “top ads” via Apify.
 *
 * Meta: sourabhbgp/facebook-ads-scraper (Ad Library, India) — rank by days live / impressions proxy
 * Google: scrapesage/google-ads-transparency-scraper — competitor domains, region IN
 *
 *   node scripts/smoke-nouriva-niche-ads-apify.mjs
 *
 * Requires APIFY_TOKEN in .env or .env.marqq-live
 *
 * Note: Ad Library does NOT expose CTR/ROAS. “Top performing” ≈ still active + long-running
 * (+ impressions when available).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const META_ACTOR = "sourabhbgp/facebook-ads-scraper";
const GOOGLE_ACTOR = "scrapesage/google-ads-transparency-scraper";

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

const META_QUERIES = [
  "diabetes diet",
  "PCOS diet",
  "personalized nutrition",
  "calorie tracker India",
  "food scanner",
  "thyroid diet",
  "HealthifyMe",
  "Fitterfly",
];
const META_MAX = Number(process.env.META_MAX_PER_QUERY || 12);
const GOOGLE_DOMAINS = [
  "healthifyme.com",
  "fitterfly.com",
  "beato.app",
  "ultrahuman.com",
  "zoe.com",
  "levels.com",
  "1mg.com",
];
const GOOGLE_MAX = Number(process.env.GOOGLE_MAX_PER_DOMAIN || 15);
const REGION = process.env.ADS_REGION || "IN";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function daysBetween(start, end = new Date()) {
  if (!start) return null;
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return null;
  const e = end instanceof Date ? end : new Date(end);
  return Math.max(0, Math.round((e - s) / (1000 * 60 * 60 * 24)));
}

async function runActor(actorId, input, { waitSecs = 240 } = {}) {
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
  for (let i = 0; i < 100 && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status); i++) {
    await new Promise((r) => setTimeout(r, 4000));
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

function pickCopy(ad) {
  const parts = [
    ad.adCopy,
    ad.body,
    ad.title,
    ad.caption,
    ad.linkDescription,
    ad.byline,
    ad.adCreativeBody,
    ad.adCreativeLinkTitle,
    ...(Array.isArray(ad.cards)
      ? ad.cards.flatMap((c) => [c?.body, c?.title, c?.link_description, c?.caption, c?.adCopy])
      : []),
  ]
    .flatMap((x) => (Array.isArray(x) ? x : [x]))
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return [...new Set(parts)].slice(0, 4);
}

function metaNormalize(ad, query) {
  const startDate = ad.startDate || ad.ad_delivery_start_time || ad.start_date;
  const endDate = ad.endDate || ad.ad_delivery_stop_time || ad.end_date || null;
  let days = daysBetween(startDate, endDate || new Date());
  const tat = num(ad.totalActiveTime);
  if (tat != null && tat > 100000) days = Math.round(tat / 86400000);
  const page = ad.pageName || ad.page_name || ad.advertiserName || "unknown";
  const libraryUrl = ad.adArchiveId
    ? `https://www.facebook.com/ads/library/?id=${ad.adArchiveId}`
    : ad.adLibraryUrl || ad.ad_snapshot_url || "";
  const platforms = ad.publisherPlatforms || ad.publisherPlatform || ad.platforms || [];
  const cta = ad.ctaText || ad.ctaType || ad.cta_type || "";
  const copy = pickCopy(ad);
  const impressions = num(ad.impressionsIndex) > 0 ? num(ad.impressionsIndex) : null;
  const score =
    (days || 0) * 2 +
    (copy[0]?.length > 40 ? 5 : 0) +
    (ad.pageLikes ? Math.min(ad.pageLikes, 200000) / 10000 : 0) +
    (impressions ? Math.min(impressions, 1000000) / 50000 : 0);
  return {
    query,
    page,
    days,
    startDate,
    endDate,
    platforms: Array.isArray(platforms) ? platforms.join(", ") : String(platforms || ""),
    cta: String(cta || ""),
    hook: copy[0] || "(visual-only / no text)",
    copy,
    libraryUrl,
    impressions,
    pageLikes: ad.pageLikes ?? null,
    score,
    format: ad.displayFormat || ad.mediaType || "",
  };
}

function googleNormalize(ad) {
  const first = ad.firstShown || ad.first_shown || ad.startDate;
  const last = ad.lastShown || ad.last_shown || ad.endDate;
  const days = num(ad.shownForDays) ?? num(ad.daysActive) ?? daysBetween(first, last || new Date());
  const advertiser = ad.advertiserName || ad.advertiser || "unknown";
  const domain = ad.domain || ad.targetDomain || "";
  const format = ad.format || ad.adFormat || "";
  const preview = ad.imageUrl || ad.previewUrl || ad.videoUrl || "";
  const score = (days || 0) * 2 + (String(format).toUpperCase() === "VIDEO" ? 3 : 0);
  return {
    advertiser,
    domain,
    days,
    shownForDays: ad.shownForDays ?? days,
    first,
    last,
    format,
    platforms: "",
    hook: `${format || "AD"} creative · ${domain}`,
    preview,
    adUrl: ad.adUrl || "",
    score,
    creativeId: ad.creativeId || ad.id || "",
  };
}

async function scrapeMeta() {
  const runIds = [];
  const all = [];
  for (const query of META_QUERIES) {
    console.log(`→ Meta “${query}” (${REGION})`);
    try {
      const { runId, items } = await runActor(META_ACTOR, {
        mode: "search",
        query,
        country: REGION,
        activeStatus: "active",
        adType: "all",
        mediaType: "all",
        maxResults: META_MAX,
        sortBy: "total_impressions",
        enrichDetails: false,
        proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
      });
      runIds.push(runId);
      console.log(`  ${items.length} ads · run ${runId}`);
      if (items[0]) console.log(`  keys: ${Object.keys(items[0]).slice(0, 12).join(", ")}`);
      for (const ad of items) {
        if (ad.demo === true && !ad.pageName && !ad.body) continue;
        all.push(metaNormalize(ad, query));
      }
    } catch (err) {
      console.warn(`  failed: ${err.message?.slice(0, 180)}`);
    }
  }
  const seen = new Set();
  const deduped = [];
  for (const ad of all.sort((a, b) => b.score - a.score)) {
    const key = `${ad.page}|${ad.hook.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ad);
  }
  return { runIds, ads: deduped };
}

async function scrapeGoogle() {
  console.log(`→ Google Ads Transparency domains × ${GOOGLE_DOMAINS.length} (region ${REGION})`);
  const { runId, items } = await runActor(
    GOOGLE_ACTOR,
    {
      domains: GOOGLE_DOMAINS,
      resultType: "ads",
      region: REGION,
      adFormat: "ALL",
      maxAdsPerSearch: GOOGLE_MAX,
      includeDetails: false,
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
    },
    { waitSecs: 300 }
  );
  console.log(`  ${items.length} ads · run ${runId}`);
  if (items[0]) console.log(`  keys: ${Object.keys(items[0]).slice(0, 14).join(", ")}`);
  const ads = items
    .filter((a) => !a.demo)
    .map(googleNormalize)
    .sort((a, b) => b.score - a.score);
  const seen = new Set();
  const deduped = [];
  for (const ad of ads) {
    const key = ad.creativeId || `${ad.advertiser}|${ad.hook.slice(0, 60)}|${ad.preview}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ad);
  }
  return { runId, ads: deduped };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  console.log(`\nNouriva niche ads smoke (Meta India + Google Transparency)\n`);

  const [meta, google] = await Promise.all([
    scrapeMeta().catch((e) => {
      console.error("Meta scrape failed:", e.message);
      return { runIds: [], ads: [] };
    }),
    scrapeGoogle().catch((e) => {
      console.error("Google scrape failed:", e.message);
      return { runId: null, ads: [] };
    }),
  ]);

  const topMeta = meta.ads.slice(0, 20);
  const topGoogle = google.ads.slice(0, 20);

  const report = {
    stamp,
    brand: "nouriva",
    note: "Performance proxy = days running (+ impressions when exposed). Not CTR/ROAS.",
    meta: {
      actor: META_ACTOR,
      region: REGION,
      queries: META_QUERIES,
      runIds: meta.runIds,
      total: meta.ads.length,
      top: topMeta,
    },
    google: {
      actor: GOOGLE_ACTOR,
      region: REGION,
      domains: GOOGLE_DOMAINS,
      runId: google.runId,
      total: google.ads.length,
      top: topGoogle,
    },
  };

  const jsonPath = join(OUT_DIR, `nouriva-niche-ads-smoke-${stamp}.json`);
  const mdPath = join(OUT_DIR, `nouriva-niche-ads-smoke-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    mdPath,
    [
      `# Nouriva niche ads smoke (Apify — scripts only)`,
      ``,
      `- stamp: ${stamp}`,
      `- region: ${REGION}`,
      `- ranking: **days live** (+ impressions when available) — Ad Library does not give CTR/ROAS`,
      ``,
      `## Meta Ad Library (India)`,
      ``,
      `- actor: \`${META_ACTOR}\``,
      `- runs: ${meta.runIds.join(", ") || "—"}`,
      `- ads collected: ${meta.ads.length}`,
      `- queries: ${META_QUERIES.map((q) => `\`${q}\``).join(", ")}`,
      ``,
      `### Top Meta creatives (by longevity proxy)`,
      ...topMeta.flatMap((ad, i) => [
        ``,
        `### M${i + 1}. ${ad.page} · ~${ad.days ?? "?"} days · score ${Math.round(ad.score)}`,
        ``,
        `**Hook / body:** ${ad.hook}`,
        ``,
        `- query: ${ad.query}`,
        `- platforms: ${ad.platforms || "—"}`,
        `- CTA: ${ad.cta || "—"} · format: ${ad.format || "—"}`,
        ad.impressions != null ? `- impressions (if any): ${ad.impressions}` : "",
        ad.libraryUrl ? `- library: ${ad.libraryUrl}` : "",
      ]),
      ``,
      `## Google Ads Transparency`,
      ``,
      `- actor: \`${GOOGLE_ACTOR}\``,
      `- run: ${google.runId || "—"}`,
      `- domains: ${GOOGLE_DOMAINS.join(", ")}`,
      `- ads collected: ${google.ads.length}`,
      ``,
      `### Top Google creatives (by days shown)`,
      ...topGoogle.flatMap((ad, i) => [
        ``,
        `### G${i + 1}. ${ad.advertiser} (${ad.domain || "?"}) · ~${ad.days ?? "?"} days · score ${Math.round(ad.score)}`,
        ``,
        `**Creative / text:** ${ad.hook}`,
        ``,
        `- format: ${ad.format || "—"} · platforms: ${ad.platforms || "—"}`,
        `- first→last: ${ad.first || "?"} → ${ad.last || "?"}`,
        ad.preview ? `- preview: ${ad.preview}` : "",
      ]),
      ``,
      `_Not product code. Creative inspiration only — do not copy verbatim._`,
      ``,
    ]
      .filter((l) => l !== "")
      .join("\n")
  );

  console.log(`\nMeta ads: ${meta.ads.length} · Google ads: ${google.ads.length}`);
  console.log(`Top Meta:`);
  topMeta.slice(0, 5).forEach((a, i) => console.log(`  ${i + 1}. [${a.days}d] ${a.page}: ${a.hook.slice(0, 70)}`));
  console.log(`Top Google:`);
  topGoogle.slice(0, 5).forEach((a, i) => console.log(`  ${i + 1}. [${a.days}d] ${a.advertiser}: ${a.hook.slice(0, 70)}`));
  console.log(`\nreport ${jsonPath}`);
  console.log(`md     ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
