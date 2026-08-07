#!/usr/bin/env node
/**
 * ONE-OFF SMOKE — keyword white-space / greenfield opportunities (Elevate + Nouriva).
 *
 * Actor: dltik/keyword-serp-research (volume, CPC, difficulty, intent)
 * Score: med-high volume × medium KD × commercial/transactional intent
 *
 *   node scripts/smoke-keyword-whitespace-apify.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const ACTOR = "dltik/keyword-serp-research";

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
    name: "Elevate",
    domain: "theelevate.co.in",
    locationName: "India",
    seeds: [
      "digital transformation consulting",
      "AI transformation consulting",
      "DX strategy framework",
      "enterprise digital transformation India",
      "AI adoption roadmap",
      "digital transformation partner",
      "change management digital transformation",
    ],
    competitor: "accenture.com",
    maxResults: 80,
  },
  nouriva: {
    name: "Nouriva",
    domain: "nouriva.tech",
    locationName: "India",
    seeds: [
      "diabetes diet plan Indian",
      "PCOS diet chart",
      "personalized nutrition app",
      "food scanner AI",
      "thyroid diet Indian",
      "HbA1c meal plan",
      "lab based nutrition",
    ],
    competitor: "healthifyme.com",
    maxResults: 80,
  },
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intentOf(row) {
  const raw =
    row.intent ||
    row.search_intent ||
    row.searchIntent ||
    row.keyword_intent ||
    (Array.isArray(row.intents) ? row.intents.join(" ") : "") ||
    "";
  return String(raw).toLowerCase();
}

function normalizeRow(row, brand) {
  const keyword = String(row.keyword || row.keyword_data?.keyword || row.seed || "").trim();
  const volume = num(
    row.volume ??
      row.search_volume ??
      row.searchVolume ??
      row.keyword_info?.search_volume ??
      row.monthlySearches
  );
  const kd = num(
    row.difficulty ??
      row.keyword_difficulty ??
      row.keywordDifficulty ??
      row.seo_difficulty ??
      row.competition_index
  );
  const cpc = num(row.cpc ?? row.high_top_of_page_bid ?? row.keyword_info?.cpc);
  const competition = num(row.competition ?? row.competitive_density ?? row.paid_difficulty);
  const intent = intentOf(row);
  return { brand, keyword, volume, kd, cpc, competition, intent, rawKeys: Object.keys(row).slice(0, 20) };
}

/** Sweet-spot white space: demand without brutal SEO war, buyers not browsers. */
function opportunityScore(r) {
  if (!r.keyword || r.volume == null) return { score: 0, band: "skip", reasons: ["no volume"] };

  const vol = r.volume;
  const kd = r.kd ?? 50;
  const intent = r.intent;

  // Volume preference: peak around 500–8k (med-high); taper very low / ultra-head terms
  let volScore = 0;
  if (vol < 50) volScore = 5;
  else if (vol < 200) volScore = 25;
  else if (vol < 500) volScore = 55;
  else if (vol <= 8000) volScore = 90;
  else if (vol <= 20000) volScore = 70;
  else volScore = 40; // branded/head often owned by giants

  // KD preference: medium 20–45; punish extremes
  let kdScore = 0;
  if (kd <= 10) kdScore = 40; // might be thin SERP or junk
  else if (kd <= 20) kdScore = 70;
  else if (kd <= 45) kdScore = 95;
  else if (kd <= 60) kdScore = 55;
  else kdScore = 20;

  let intentBoost = 1.0;
  let intentLabel = "unknown";
  if (/transaction|buy|purchase/.test(intent)) {
    intentBoost = 1.5;
    intentLabel = "transactional";
  } else if (/commercial|investigat|compar/.test(intent)) {
    intentBoost = 1.4;
    intentLabel = "commercial";
  } else if (/info/.test(intent)) {
    intentBoost = 0.75;
    intentLabel = "informational";
  } else if (/navi/.test(intent)) {
    intentBoost = 0.25;
    intentLabel = "navigational";
  }

  const cpcBoost = r.cpc != null && r.cpc >= 0.3 ? 1.1 : 1.0;
  const score = Math.round(volScore * 0.45 + kdScore * 0.4) * intentBoost * cpcBoost;

  const whiteSpace =
    vol >= 200 &&
    vol <= 15000 &&
    kd >= 15 &&
    kd <= 50 &&
    (intentLabel === "commercial" || intentLabel === "transactional" || intentLabel === "unknown");

  const greenfield =
    whiteSpace && kd <= 40 && vol >= 300 && intentLabel !== "informational" && intentLabel !== "navigational";

  const reasons = [];
  if (whiteSpace) reasons.push("med-high vol + medium KD");
  if (greenfield) reasons.push("commercial/txn leaning + winnable KD");
  if (intentLabel === "informational") reasons.push("info intent (content, weaker $/visit)");
  if (vol > 20000) reasons.push("head term — usually dominated");
  if (kd > 60) reasons.push("hard KD");

  return { score, band: greenfield ? "greenfield" : whiteSpace ? "whitespace" : "watch", intentLabel, reasons };
}

async function runActor(input) {
  const start = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR)}/runs?token=${TOKEN}&waitForFinish=300`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }
  );
  const started = await start.json();
  if (!start.ok) throw new Error(`start failed: ${JSON.stringify(started).slice(0, 500)}`);
  let run = started.data;
  for (let i = 0; i < 100 && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status); i++) {
    await new Promise((r) => setTimeout(r, 4000));
    run = (await (await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${TOKEN}`)).json()).data;
  }
  if (run.status !== "SUCCEEDED") throw new Error(`${run.status}: ${run.id}`);
  const items = await (
    await fetch(
      `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${TOKEN}&clean=true&format=json`
    )
  ).json();
  return { runId: run.id, datasetId: run.defaultDatasetId, items: Array.isArray(items) ? items : [] };
}

async function researchBrand(key, cfg) {
  console.log(`\n→ ${cfg.name} keyword_research (${cfg.locationName})`);
  const research = await runActor({
    mode: "keyword_research",
    keywords: cfg.seeds,
    locationName: cfg.locationName,
    languageCode: "en",
    maxResults: cfg.maxResults,
  });
  console.log(`  research: ${research.items.length} rows · ${research.runId}`);
  if (research.items[0]) console.log(`  keys: ${Object.keys(research.items[0]).slice(0, 16).join(", ")}`);

  let gap = { runId: null, items: [] };
  try {
    console.log(`→ ${cfg.name} competitor_gap vs ${cfg.competitor}`);
    gap = await runActor({
      mode: "competitor_gap",
      domain: cfg.domain,
      competitorDomain: cfg.competitor,
      locationName: cfg.locationName,
      languageCode: "en",
      maxResults: 40,
    });
    console.log(`  gap: ${gap.items.length} rows · ${gap.runId}`);
  } catch (e) {
    console.warn(`  gap failed: ${e.message.slice(0, 160)}`);
  }

  const rows = research.items
    .map((it) => normalizeRow(it, key))
    .filter((r) => r.keyword)
    .map((r) => ({ ...r, ...opportunityScore(r) }));

  const gapRows = gap.items
    .map((it) => normalizeRow(it, key))
    .filter((r) => r.keyword)
    .map((r) => ({ ...r, ...opportunityScore(r), source: "competitor_gap" }));

  rows.sort((a, b) => b.score - a.score);
  gapRows.sort((a, b) => b.score - a.score);

  return {
    key,
    ...cfg,
    researchRunId: research.runId,
    gapRunId: gap.runId,
    rows,
    gapRows,
    greenfield: rows.filter((r) => r.band === "greenfield").slice(0, 25),
    whitespace: rows.filter((r) => r.band === "whitespace" || r.band === "greenfield").slice(0, 40),
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  console.log(`Keyword white-space smoke · actor ${ACTOR}`);

  const brands = {};
  for (const [key, cfg] of Object.entries(BRANDS)) {
    try {
      brands[key] = await researchBrand(key, cfg);
    } catch (e) {
      console.error(`${key} failed:`, e.message);
      brands[key] = { key, error: e.message, greenfield: [], whitespace: [], rows: [], gapRows: [] };
    }
  }

  const report = {
    stamp,
    actor: ACTOR,
    scoring: {
      greenfield: "vol 300–15k, KD 15–40, commercial/transactional lean",
      whitespace: "vol 200–15k, KD 15–50",
      note: "Early-domain sites (DR~0) should bias toward lower KD + commercial intent before head terms.",
    },
    brands,
  };

  const jsonPath = join(OUT_DIR, `keyword-whitespace-smoke-${stamp}.json`);
  const mdPath = join(OUT_DIR, `keyword-whitespace-smoke-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const sections = [];
  for (const b of Object.values(brands)) {
    if (b.error) {
      sections.push(`## ${b.key}\n\n_Error: ${b.error}_\n`);
      continue;
    }
    sections.push(
      [
        `## ${b.name} (\`${b.domain}\` · ${b.locationName})`,
        ``,
        `- research run: ${b.researchRunId}`,
        `- gap vs \`${b.competitor}\`: ${b.gapRunId || "—"} (${b.gapRows.length} rows)`,
        `- scored keywords: ${b.rows.length}`,
        ``,
        `### Greenfield (best bets)`,
        ``,
        `| Keyword | Vol | KD | CPC | Intent | Score |`,
        `|---|---:|---:|---:|---|---:|`,
        ...b.greenfield.map(
          (r) =>
            `| ${r.keyword} | ${r.volume ?? "—"} | ${r.kd ?? "—"} | ${r.cpc ?? "—"} | ${r.intentLabel} | ${Math.round(r.score)} |`
        ),
        b.greenfield.length ? "" : `_None passed greenfield filters — see whitespace / watchlist._`,
        ``,
        `### White space (med vol · med KD)`,
        ``,
        `| Keyword | Vol | KD | CPC | Intent | Score |`,
        `|---|---:|---:|---:|---|---:|`,
        ...b.whitespace.slice(0, 20).map(
          (r) =>
            `| ${r.keyword} | ${r.volume ?? "—"} | ${r.kd ?? "—"} | ${r.cpc ?? "—"} | ${r.intentLabel} | ${Math.round(r.score)} |`
        ),
        ``,
        `### Competitor gap highlights`,
        ``,
        ...b.gapRows.slice(0, 12).map(
          (r) =>
            `- **${r.keyword}** · vol ${r.volume ?? "?"} · KD ${r.kd ?? "?"} · ${r.intentLabel} · score ${Math.round(r.score)}`
        ),
        b.gapRows.length ? "" : `_No gap rows._`,
        ``,
      ].join("\n")
    );
  }

  writeFileSync(
    mdPath,
    [
      `# Keyword white-space / greenfield smoke (Elevate + Nouriva)`,
      ``,
      `- stamp: ${stamp}`,
      `- actor: \`${ACTOR}\``,
      `- filters: med–high volume, medium KD, commercial/transactional intent preferred`,
      ``,
      `## How scoring works`,
      ``,
      `1. **Volume band** — favor ~500–8k/mo (enough demand, not only mega-head)`,
      `2. **KD band** — favor ~20–45 (winnable for newer domains)`,
      `3. **Intent** — boost commercial / transactional; discount pure info / navigational`,
      `4. **CPC** — soft boost if CPC suggests buyer value`,
      `5. **Competitor gap** — keywords competitor ranks for that your domain does not`,
      ``,
      ...sections,
      `_Scripts-only. Validate top picks in GSC/Ads before committing content budget._`,
      ``,
    ].join("\n")
  );

  for (const b of Object.values(brands)) {
    if (b.error) continue;
    console.log(`\n${b.name} greenfield top:`);
    b.greenfield.slice(0, 8).forEach((r, i) => {
      console.log(`  ${i + 1}. [${Math.round(r.score)}] ${r.keyword} · vol ${r.volume} · KD ${r.kd} · ${r.intentLabel}`);
    });
  }
  console.log(`\nreport ${jsonPath}`);
  console.log(`md     ${mdPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
