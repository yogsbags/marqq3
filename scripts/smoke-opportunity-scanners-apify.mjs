#!/usr/bin/env node
/**
 * Opportunity scanners A–E (scripts-only Apify DataForSEO Labs).
 *
 *   node scripts/smoke-opportunity-scanners-apify.mjs --pass=a
 *   node scripts/smoke-opportunity-scanners-apify.mjs --pass=b
 *   ...
 *
 * a = mobile apps India | b = mobile apps US
 * c = PE/VC fund themes India | d = RE / off-market themes India
 * e = theme shortlist for Syndiq bridge (no Apify if prior JSON exists; else light pass)
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const ACTOR = "santhej/dataforseo-labs-keyword-explorer";
const LOC = { in: "2356", us: "2840" };

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

const pass = (process.argv.find((a) => a.startsWith("--pass=")) || "--pass=a").split("=")[1].toLowerCase();

const PASSES = {
  a: {
    id: "a-apps-india",
    title: "Mobile app ideas — India (underserved demand)",
    locationCode: LOC.in,
    locationName: "India",
    niche: /app|scanner|tracker|manager|booking|invoice|expense|attendance|tuition|legal|rent|pg |society|gst|kirana|billing|housing|apartment|visitor|field|pcos|diabetes|diet/i,
    seeds: [
      "GST billing app",
      "GST invoice app",
      "society management app",
      "housing society app",
      "kirana billing app",
      "billing software app",
      "PCOS tracker app",
      "diabetes diet app",
      "tuition management app",
      "visitor management app",
    ],
    preferAppIntent: true,
  },
  b: {
    id: "b-apps-us",
    title: "Mobile app ideas — US (underserved demand)",
    locationCode: LOC.us,
    locationName: "United States",
    niche: /app|scanner|tracker|manager|booking|invoice|expense|hoa |hoa|rent|lease|clinic|therapy|adhd|meal|cgm|contractor|trades|church|nonprofit|hoa/i,
    seeds: [
      "HOA management app",
      "contractor estimate app",
      "ADHD habit tracker app",
      "meal planner CGM app",
      "church volunteer scheduling app",
      "property maintenance request app",
      "trades invoice app",
      "therapist client portal app",
      "neighborhood tool library app",
      "split rent payment app",
    ],
    preferAppIntent: true,
  },
  c: {
    id: "c-pe-vc-india",
    title: "PE/VC fund themes — India search demand",
    locationCode: LOC.in,
    locationName: "India",
    niche: /private equity|venture|growth equity|family office|pe fund|vc fund|buyout|rollup|healthcare pe|fintech|saas|climate|infrastructure fund|credit fund|continuation fund|secondary/i,
    seeds: [
      "private equity india healthcare",
      "growth equity india saas",
      "family office investing india",
      "hospital rollup india",
      "fintech lending PE india",
      "climate tech VC india",
      "infrastructure fund india",
      "private credit india",
      "GCC outsourcing india private equity",
      "consumer brand rollup india",
    ],
    preferAppIntent: false,
  },
  d: {
    id: "d-re-offmarket-india",
    title: "Real estate / off-market angles — India",
    locationCode: LOC.in,
    locationName: "India",
    niche: /warehouse|warehous|cold storage|data center|co.?living|student housing|industrial park|reit|fractional|commercial property|lease|pre.?leased|land parcel|plot|warehouse lease|dark store|fulfilistory/i,
    seeds: [
      "warehouse investment india",
      "cold storage investment india",
      "pre leased commercial property india",
      "data center real estate india",
      "student housing investment india",
      "fractional ownership commercial property india",
      "industrial land investment india",
      "dark store real estate india",
      "REIT india commercial",
      "co living investment india",
    ],
    preferAppIntent: false,
  },
  e: {
    id: "e-syndiq-bridge",
    title: "Syndiq bridge — themes → off-market deal angles",
    // Uses prior C/D outputs + light themed seeds if missing
    locationCode: LOC.in,
    locationName: "India",
    niche: /./,
    seeds: [],
    preferAppIntent: false,
    syndiqBridge: true,
  },
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function runActor(input) {
  const start = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR)}/runs?token=${TOKEN}&waitForFinish=240`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }
  );
  const body = await start.json();
  if (!start.ok) throw new Error(JSON.stringify(body).slice(0, 400));
  let run = body.data;
  for (let i = 0; i < 90 && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status); i++) {
    await new Promise((r) => setTimeout(r, 3000));
    run = (await (await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${TOKEN}`)).json()).data;
  }
  if (run.status !== "SUCCEEDED") throw new Error(`${run.status} ${run.id}`);
  const items = await (
    await fetch(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${TOKEN}&clean=true&format=json`)
  ).json();
  return { runId: run.id, items: Array.isArray(items) ? items : [] };
}

function parseKw(row) {
  const keyword = String(row.keyword || "").trim();
  const volume = num(row.search_volume ?? row.searchVolume ?? row.volume);
  const cpc = num(row.cpc);
  const competition = num(row.competition);
  const kd = num(row.keyword_difficulty ?? row.keywordDifficulty ?? row.difficulty);
  const intent = String(row.search_intent || row.intent || row.keyword_intent || "").toLowerCase();
  return { keyword, volume, cpc, competition, kd, intent };
}

function scoreRow(r, cfg) {
  if (!r.keyword || !cfg.niche.test(r.keyword)) return null;
  const vol = r.volume ?? 0;
  const kd = r.kd ?? 45;
  let volScore = vol < 50 ? 8 : vol < 200 ? 30 : vol < 500 ? 60 : vol <= 8000 ? 92 : vol <= 25000 ? 62 : 30;
  let kdScore = kd <= 12 ? 50 : kd <= 22 ? 80 : kd <= 45 ? 95 : kd <= 60 ? 50 : 18;

  let intentBoost = 1;
  let intentLabel = r.intent || "unknown";
  if (/transaction/.test(r.intent)) {
    intentBoost = 1.5;
    intentLabel = "transactional";
  } else if (/commercial/.test(r.intent)) {
    intentBoost = 1.4;
    intentLabel = "commercial";
  } else if (/info/.test(r.intent)) {
    intentBoost = 0.8;
    intentLabel = "informational";
  } else if (/navi/.test(r.intent)) {
    intentBoost = 0.2;
    intentLabel = "navigational";
  }

  if (cfg.preferAppIntent) {
    if (/\bapp\b|software|tool|scanner|tracker|saas/.test(r.keyword)) intentBoost *= 1.25;
    if (/best |vs |download|play store|android|ios/.test(r.keyword)) {
      intentBoost *= 1.15;
      if (intentLabel === "informational") intentLabel = "commercial-leaning-info";
    }
  } else {
    // fund / RE: boost investment language
    if (/invest|fund|pe |vc |reit|lease|warehouse|credit|rollup|buyout/.test(r.keyword)) intentBoost *= 1.2;
  }

  const cpcBoost = r.cpc != null && r.cpc >= 0.5 ? 1.1 : 1;
  const score = Math.round((volScore * 0.45 + kdScore * 0.4) * intentBoost * cpcBoost * 10) / 10;
  // Apps: India DFS often under-reports app query volume — allow micro-vol if commercial/txn + CPC
  const minVol = cfg.preferAppIntent ? 20 : 150;
  const minGfVol = cfg.preferAppIntent ? 20 : 200;
  const kdOk = r.kd == null ? cfg.preferAppIntent : kd >= 8 && kd <= 55;
  const kdGf = r.kd == null ? cfg.preferAppIntent : kd <= 42;
  const whiteSpace = vol >= minVol && vol <= 20000 && kdOk;
  const greenfield =
    whiteSpace &&
    kdGf &&
    vol >= minGfVol &&
    intentLabel !== "navigational" &&
    (cfg.preferAppIntent
      ? /\bapp\b|software|tool|scanner|tracker|manager|billing|gst/.test(r.keyword) ||
        intentLabel.includes("commercial") ||
        intentLabel === "transactional"
      : true);

  return {
    keyword: r.keyword,
    volume: r.volume,
    kd: r.kd,
    cpc: r.cpc,
    competition: r.competition,
    intent: r.intent,
    intentLabel,
    score,
    band: greenfield ? "greenfield" : whiteSpace ? "whitespace" : "watch",
  };
}

async function runKeywordPass(cfg) {
  const all = [];
  const runIds = [];
  for (const seed of cfg.seeds) {
    try {
      const r = await runActor({
        mode: "keyword_suggestions",
        seedKeyword: seed,
        locationCode: cfg.locationCode,
        languageCode: "en",
        limit: 35,
      });
      runIds.push(r.runId);
      console.log(`  “${seed}” → ${r.items.length}`);
      for (const it of r.items) all.push(parseKw(it));
    } catch (e) {
      console.warn(`  fail ${seed}: ${e.message.slice(0, 120)}`);
    }
  }
  const uniq = [...new Map(all.filter((a) => a.keyword).map((a) => [a.keyword.toLowerCase(), a])).values()];

  // Enrich missing KD for top commercial candidates
  const needKd = uniq.filter((k) => k.kd == null && (k.volume ?? 0) >= (cfg.preferAppIntent ? 10 : 50)).slice(0, 60);
  if (needKd.length) {
    try {
      const diff = await runActor({
        mode: "keyword_difficulty",
        keywords: needKd.map((k) => k.keyword),
        locationCode: cfg.locationCode,
        languageCode: "en",
      });
      runIds.push(diff.runId);
      console.log(`  KD enrich: ${diff.items.length}`);
      const by = Object.fromEntries(diff.items.map(parseKw).filter((x) => x.keyword).map((x) => [x.keyword.toLowerCase(), x]));
      for (const k of uniq) {
        const e = by[k.keyword.toLowerCase()];
        if (e?.kd != null) k.kd = e.kd;
      }
    } catch (e) {
      console.warn(`  KD enrich fail: ${e.message.slice(0, 100)}`);
    }
  }

  const scored = uniq
    .map((r) => scoreRow(r, cfg))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return {
    runIds,
    totalRaw: all.length,
    totalScored: scored.length,
    greenfield: scored.filter((s) => s.band === "greenfield").slice(0, 30),
    whitespace: scored.filter((s) => s.band === "whitespace" || s.band === "greenfield").slice(0, 40),
    top: scored.slice(0, 50),
  };
}

function loadLatestPass(prefix) {
  if (!existsSync(OUT_DIR)) return null;
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort()
    .reverse();
  if (!files[0]) return null;
  return JSON.parse(readFileSync(join(OUT_DIR, files[0]), "utf8"));
}

function syndiqBridgeFromPriors() {
  const c = loadLatestPass("opportunity-c-pe-vc");
  const d = loadLatestPass("opportunity-d-re");
  const themes = [];

  function harvest(rep, bucket) {
    if (!rep?.result) return;
    for (const row of [...(rep.result.greenfield || []), ...(rep.result.whitespace || [])].slice(0, 15)) {
      themes.push({
        bucket,
        theme: row.keyword,
        volume: row.volume,
        kd: row.kd,
        intent: row.intentLabel,
        score: row.score,
        syndiqAngle: bucket.startsWith("pe")
          ? mapPeThemeToSyndiq(row.keyword)
          : mapReThemeToSyndiq(row.keyword),
      });
    }
  }
  harvest(c, "pe-vc");
  harvest(d, "real-estate");

  // Curated bridge even if priors thin
  const curated = [
    {
      bucket: "pe-vc",
      theme: "hospital / healthcare services rollup India",
      syndiqAngle: {
        sectors: ["Healthcare", "Hospitals", "Diagnostics"],
        dealTypes: ["Control buyout", "Platform + add-ons"],
        ticketHint: "₹50–500 Cr EV platforms; smaller nursing homes as add-ons",
        buyerFilter: "Healthcare PE / family offices with India healthcare thesis",
        offMarketHook: "MCA: Pvt Ltd hospitals/clinics, promoter age 55+, no IB process, rising ‘hospital investment’ search",
      },
    },
    {
      bucket: "pe-vc",
      theme: "GCC / outsourcing India PE",
      syndiqAngle: {
        sectors: ["IT Services", "BPO", "GCC captives spinouts"],
        dealTypes: ["Growth", "Carve-out"],
        ticketHint: "₹100–1000 Cr",
        buyerFilter: "IT services PE, strategics seeking India delivery",
        offMarketHook: "Search demand for GCC + aging mid-tier IT co. without banker → proprietary outreach",
      },
    },
    {
      bucket: "real-estate",
      theme: "cold storage / warehouse India",
      syndiqAngle: {
        sectors: ["Logistics", "Cold chain", "Warehousing"],
        dealTypes: ["Asset / OpCo", "Sale-leaseback"],
        ticketHint: "Project-level ₹20–200 Cr",
        buyerFilter: "RE credit, industrial RE funds, family offices",
        offMarketHook: "Rising warehouse/cold-storage queries + fragmented local owners = off-market land+shed packages",
      },
    },
    {
      bucket: "real-estate",
      theme: "student housing / co-living",
      syndiqAngle: {
        sectors: ["Student housing", "Co-living"],
        dealTypes: ["Platform", "Asset aggregation"],
        ticketHint: "City clusters ₹30–300 Cr",
        buyerFilter: "Hospitality-adjacent RE / consumer housing funds",
        offMarketHook: "Demand keywords up; operators capital-starved → equity + preferred structures",
      },
    },
    {
      bucket: "apps-to-ma",
      theme: "vertical SME apps (GST, society, field force)",
      syndiqAngle: {
        sectors: ["Vertical SaaS", "SME software"],
        dealTypes: "Seed–Series A build OR acquire rolling local apps",
        ticketHint: "Build <$0.5M; acqui-hires ₹2–20 Cr",
        buyerFilter: "SaaS growth funds / strategics (Perfios, Khatabook-class)",
        offMarketHook: "Keyword greenfield apps → either build or buy regional accounting/society tools with users, weak brand",
      },
    },
  ];

  return {
    fromSearch: themes.slice(0, 25),
    curatedPlaybook: curated,
    howToUseInSyndiq: [
      "1. Pick a theme with rising vol + medium KD (underserved narrative).",
      "2. In Syndiq buyers: filter thesis sector + ticket + geo India.",
      "3. In deals/MCA: pull companies in sector+revenue band; flag ‘no advisor’ / promoter succession.",
      "4. Outreach memo: ‘Search demand for X is compounding; your thesis matches; here are 5 under-marketed OpCos.’",
      "5. Apps path: treat greenfield app keywords as product wedges OR buy small apps ranking for those terms.",
    ],
  };
}

function mapPeThemeToSyndiq(kw) {
  const k = kw.toLowerCase();
  if (/hospital|health|clinic|diagn/.test(k))
    return { sectors: ["Healthcare"], buyerFilter: "Healthcare PE / growth", offMarketHook: "Clinic/hospital platforms without IB" };
  if (/saas|software|fintech|lending/.test(k))
    return { sectors: ["SaaS", "Fintech"], buyerFilter: "Growth equity / VC growth", offMarketHook: "Profitable SMB SaaS, no process" };
  if (/climate|infra|credit/.test(k))
    return { sectors: ["Infrastructure", "Climate", "Credit"], buyerFilter: "Infra / credit funds", offMarketHook: "Yield assets + OpCo hybrids" };
  if (/family office/.test(k))
    return { sectors: ["Multi"], buyerFilter: "Family offices India", offMarketHook: "Direct deals FO prefer proprietary" };
  return { sectors: ["Generalist India PE"], buyerFilter: "India-focused PE/VC", offMarketHook: "Theme-aligned proprietary list" };
}

function mapReThemeToSyndiq(kw) {
  const k = kw.toLowerCase();
  if (/cold|warehouse|industrial|dark store/.test(k))
    return { sectors: ["Industrial RE", "Logistics"], buyerFilter: "Industrial/logistics RE", offMarketHook: "Owner-operated sheds, city peri-urban" };
  if (/student|co.?living|living/.test(k))
    return { sectors: ["Residential alternatives"], buyerFilter: "Prop co / hospitality capital", offMarketHook: "Operator rollups" };
  if (/data center/.test(k))
    return { sectors: ["Data centers"], buyerFilter: "Infra / digital RE", offMarketHook: "Land+power packages pre-leased" };
  if (/reit|fractional|pre.?leased|commercial/.test(k))
    return { sectors: ["Commercial RE"], buyerFilter: "REITs / credit", offMarketHook: "Pre-leased assets off-market" };
  return { sectors: ["Real estate"], buyerFilter: "RE funds", offMarketHook: "Theme search → local broker bypass" };
}

function writeReport(cfg, result) {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `opportunity-${cfg.id}-${stamp}`;
  const jsonPath = join(OUT_DIR, `${base}.json`);
  const mdPath = join(OUT_DIR, `${base}.md`);
  const payload = { stamp, actor: ACTOR, pass: cfg.id, title: cfg.title, locationName: cfg.locationName, result };
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

  let md;
  if (cfg.syndiqBridge) {
    md = [
      `# ${cfg.title}`,
      ``,
      `- stamp: ${stamp}`,
      ``,
      `## How to use in Syndiq`,
      ...result.howToUseInSyndiq.map((x) => `- ${x}`),
      ``,
      `## Curated theme → Syndiq angles`,
      ...result.curatedPlaybook.flatMap((t, i) => [
        ``,
        `### ${i + 1}. [${t.bucket}] ${t.theme}`,
        ``,
        `- sectors: ${t.syndiqAngle.sectors?.join(", ") || t.syndiqAngle.sectors}`,
        `- deal types: ${t.syndiqAngle.dealTypes}`,
        `- ticket: ${t.syndiqAngle.ticketHint}`,
        `- buyer filter: ${t.syndiqAngle.buyerFilter}`,
        `- off-market hook: ${t.syndiqAngle.offMarketHook}`,
      ]),
      ``,
      `## From search passes C/D (if present)`,
      ...(result.fromSearch.length
        ? result.fromSearch.slice(0, 20).map(
            (t) =>
              `- **${t.theme}** (${t.bucket}) vol ${t.volume ?? "?"} KD ${t.kd ?? "?"} → ${t.syndiqAngle?.buyerFilter || ""} | ${t.syndiqAngle?.offMarketHook || ""}`
          )
        : ["_Run passes C and D first for live keyword-backed themes._"]),
      ``,
    ].join("\n");
  } else {
    md = [
      `# ${cfg.title}`,
      ``,
      `- stamp: ${stamp}`,
      `- actor: \`${ACTOR}\` · ${cfg.locationName}`,
      `- scored: ${result.totalScored} · greenfield: ${result.greenfield.length}`,
      ``,
      `### Greenfield`,
      ``,
      `| Keyword | Vol | KD | CPC | Intent | Score |`,
      `|---|---:|---:|---:|---|---:|`,
      ...result.greenfield.map(
        (r) => `| ${r.keyword} | ${r.volume ?? "—"} | ${r.kd ?? "—"} | ${r.cpc ?? "—"} | ${r.intentLabel} | ${r.score} |`
      ),
      result.greenfield.length ? "" : "_None under strict filters — see whitespace._",
      ``,
      `### White space`,
      ``,
      `| Keyword | Vol | KD | CPC | Intent | Score |`,
      `|---|---:|---:|---:|---|---:|`,
      ...result.whitespace.slice(0, 25).map(
        (r) => `| ${r.keyword} | ${r.volume ?? "—"} | ${r.kd ?? "—"} | ${r.cpc ?? "—"} | ${r.intentLabel} | ${r.score} |`
      ),
      ``,
    ].join("\n");
  }
  writeFileSync(mdPath, md);
  return { jsonPath, mdPath, payload };
}

async function main() {
  const cfg = PASSES[pass];
  if (!cfg) {
    console.error("Unknown --pass= a|b|c|d|e");
    process.exit(1);
  }
  console.log(`\n=== PASS ${pass.toUpperCase()}: ${cfg.title} ===\n`);

  let result;
  if (cfg.syndiqBridge) {
    result = syndiqBridgeFromPriors();
  } else {
    result = await runKeywordPass(cfg);
  }

  const { jsonPath, mdPath } = writeReport(cfg, result);
  if (!cfg.syndiqBridge) {
    console.log(`\nTop greenfield:`);
    (result.greenfield || []).slice(0, 8).forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.score}] ${r.keyword} · vol ${r.volume} · KD ${r.kd} · ${r.intentLabel}`);
    });
  } else {
    console.log(`Curated Syndiq angles: ${result.curatedPlaybook.length}`);
    console.log(`Search-backed themes: ${result.fromSearch.length}`);
  }
  console.log(`\nmd  ${mdPath}`);
  console.log(`json ${jsonPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
