#!/usr/bin/env node
/**
 * Opportunity scanners A–E — FREE path (no Apify).
 * Google Suggest expansion + commercial/underserved heuristics.
 *
 *   node scripts/smoke-opportunity-scanners-free.mjs --pass=a
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "output");
const pass = (process.argv.find((a) => a.startsWith("--pass=")) || "--pass=a").split("=")[1].toLowerCase();

const PASSES = {
  a: {
    id: "a-apps-india",
    title: "Mobile app ideas — India (underserved demand)",
    gl: "in",
    hl: "en",
    seeds: [
      "invoice scanner app",
      "GST billing app",
      "society management app",
      "PG rental app",
      "tuition management app",
      "field force tracking app",
      "PCOS tracker app",
      "diabetes diet app India",
      "kirana accounting app",
      "legal case management app",
      "apartment visitor app",
      "mandi price app",
    ],
    niche: /app|scanner|billing|gst|society|pg |tuition|field|pcos|diabetes|kirana|legal|visitor|mandi|tracker|management/i,
    type: "apps",
  },
  b: {
    id: "b-apps-us",
    title: "Mobile app ideas — US (underserved demand)",
    gl: "us",
    hl: "en",
    seeds: [
      "HOA management app",
      "contractor estimate app",
      "ADHD habit tracker",
      "CGM meal planner app",
      "church volunteer app",
      "property maintenance request app",
      "trades invoice app",
      "therapist client portal",
      "split rent app",
      "neighborhood tool library app",
    ],
    niche: /app|hoa|contractor|adhd|cgm|church|maintenance|trades|therapist|rent|tracker|portal/i,
    type: "apps",
  },
  c: {
    id: "c-pe-vc-india",
    title: "PE/VC fund themes — India",
    gl: "in",
    hl: "en",
    seeds: [
      "private equity India healthcare",
      "hospital rollup India",
      "growth equity India SaaS",
      "family office India investing",
      "private credit India",
      "climate tech VC India",
      "infrastructure fund India",
      "GCC India private equity",
      "consumer brand rollup India",
      "fintech lending PE India",
    ],
    niche: /private equity|venture|growth|family office|pe |vc |rollup|healthcare|credit|climate|infrastructure|gcc|fintech|saas|buyout/i,
    type: "funds",
  },
  d: {
    id: "d-re-offmarket-india",
    title: "Real estate / off-market angles — India",
    gl: "in",
    hl: "en",
    seeds: [
      "warehouse investment India",
      "cold storage investment India",
      "pre leased commercial property India",
      "data center real estate India",
      "student housing investment India",
      "fractional ownership commercial property",
      "industrial land investment India",
      "dark store real estate India",
      "REIT India commercial",
      "co living investment India",
    ],
    niche: /warehouse|cold storage|commercial|data center|student|fractional|industrial|dark store|reit|co.?living|lease|property|land/i,
    type: "re",
  },
  e: {
    id: "e-syndiq-bridge",
    title: "Syndiq bridge — themes → off-market deal angles",
    type: "syndiq",
  },
};

async function suggest(q, gl, hl) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; MarqqOppBot/1.0)" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.[1]) ? data[1].map(String) : [];
}

async function expandSeed(seed, gl, hl) {
  const alphas = ["", " a", " for", " app", " india", " best", " near me", " software"];
  const out = new Set([seed.toLowerCase()]);
  for (const suf of alphas) {
    try {
      const hits = await suggest(seed + suf, gl, hl);
      hits.forEach((h) => out.add(h.toLowerCase()));
      await new Promise((r) => setTimeout(r, 120));
    } catch {
      /* ignore */
    }
  }
  return [...out];
}

function commercialScore(kw, type) {
  let s = 0;
  if (/\b(best|top|vs|alternative|pricing|cost|download|software|tool|platform|service|consult|fund|invest|lease)\b/i.test(kw)) s += 25;
  if (type === "apps" && /\bapp\b|android|ios|play store|software/i.test(kw)) s += 30;
  if (type === "funds" && /\b(private equity|venture|family office|fund|credit|rollup|buyout)\b/i.test(kw)) s += 30;
  if (type === "re" && /\b(invest|lease|warehouse|reit|yield|rental)\b/i.test(kw)) s += 30;
  if (/\b(how to|what is|meaning|wiki)\b/i.test(kw)) s -= 20;
  // proxy “underserved”: long-tail specificity
  const words = kw.trim().split(/\s+/).length;
  if (words >= 3 && words <= 7) s += 20;
  if (words >= 8) s += 8;
  // local India wedge
  if (/\bindia\b|gst|kirana|mandi|pg |society|aadhaar|upi/i.test(kw)) s += 15;
  return s;
}

function band(score) {
  if (score >= 55) return "greenfield";
  if (score >= 35) return "whitespace";
  return "watch";
}

async function runPass(cfg) {
  const all = [];
  for (const seed of cfg.seeds) {
    console.log(`  expand: ${seed}`);
    const kws = await expandSeed(seed, cfg.gl, cfg.hl);
    for (const keyword of kws) {
      if (!cfg.niche.test(keyword)) continue;
      const score = commercialScore(keyword, cfg.type);
      all.push({ keyword, seed, score, band: band(score), note: "suggest-depth proxy (no paid volume/KD — Apify capped)" });
    }
  }
  const uniq = [...new Map(all.map((r) => [r.keyword, r])).values()].sort((a, b) => b.score - a.score);
  return {
    method: "google-suggest-heuristics",
    total: uniq.length,
    greenfield: uniq.filter((r) => r.band === "greenfield").slice(0, 35),
    whitespace: uniq.filter((r) => r.band === "whitespace" || r.band === "greenfield").slice(0, 45),
    top: uniq.slice(0, 60),
  };
}

function loadLatest(prefix) {
  if (!existsSync(OUT_DIR)) return null;
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort()
    .reverse();
  return files[0] ? JSON.parse(readFileSync(join(OUT_DIR, files[0]), "utf8")) : null;
}

function syndiqBridge() {
  const a = loadLatest("opportunity-a-apps");
  const b = loadLatest("opportunity-b-apps");
  const c = loadLatest("opportunity-c-pe");
  const d = loadLatest("opportunity-d-re");
  const pull = (rep, bucket) =>
    (rep?.result?.greenfield || []).slice(0, 12).map((r) => ({
      bucket,
      theme: r.keyword,
      score: r.score,
      seed: r.seed,
    }));

  const fromSearch = [...pull(a, "apps-in"), ...pull(b, "apps-us"), ...pull(c, "pe-vc"), ...pull(d, "real-estate")];

  const curatedPlaybook = [
    {
      bucket: "pe-vc",
      theme: "Healthcare / hospital services rollup India",
      syndiqAngle: {
        sectors: ["Healthcare", "Hospitals", "Diagnostics"],
        dealTypes: ["Platform + add-ons", "Control"],
        ticketHint: "₹50–500 Cr platforms",
        buyerFilter: "Healthcare PE + India family offices",
        offMarketHook: "MCA Pvt Ltd hospitals/clinics; promoter succession; no IB mandate",
      },
    },
    {
      bucket: "pe-vc",
      theme: "GCC / mid-tier IT services",
      syndiqAngle: {
        sectors: ["IT Services", "BPO"],
        dealTypes: ["Growth", "Carve-out"],
        ticketHint: "₹100–1000 Cr",
        buyerFilter: "IT services PE / strategics",
        offMarketHook: "Rising GCC search narrative + unbanked mid-caps",
      },
    },
    {
      bucket: "real-estate",
      theme: "Warehouse / cold storage India",
      syndiqAngle: {
        sectors: ["Logistics RE", "Cold chain"],
        dealTypes: ["Asset", "Sale-leaseback"],
        ticketHint: "₹20–200 Cr project",
        buyerFilter: "Industrial RE / credit funds",
        offMarketHook: "Owner-operated peri-urban sheds; bypass national brokers",
      },
    },
    {
      bucket: "real-estate",
      theme: "Student housing / co-living",
      syndiqAngle: {
        sectors: ["Alt residential"],
        dealTypes: ["Operator rollup"],
        ticketHint: "City clusters ₹30–300 Cr",
        buyerFilter: "Hospitality-adjacent RE capital",
        offMarketHook: "Capital-starved local operators",
      },
    },
    {
      bucket: "apps-to-ma",
      theme: "Vertical SME apps (GST, society, field force, kirana)",
      syndiqAngle: {
        sectors: ["Vertical SaaS"],
        dealTypes: ["Build or acqui-hire"],
        ticketHint: "Build <$0.5M; buy ₹2–20 Cr",
        buyerFilter: "SaaS growth / strategic fintech infra",
        offMarketHook: "Buy regional apps with users ranking for greenfield suggest terms",
      },
    },
  ];

  return {
    fromSearch,
    curatedPlaybook,
    howToUseInSyndiq: [
      "1. Pick theme from greenfield list (demand narrative).",
      "2. Syndiq buyers: filter sector + ticket + India thesis.",
      "3. Syndiq deals / MCA: companies in band with weak digital footprint = off-market probability.",
      "4. Outreach: fund thesis × rising demand × 5 proprietary names.",
      "5. Apps: ship wedge or acquire local tools owning those suggest clusters.",
    ],
    note: "Apify monthly hard limit hit — live volume/KD paused. Suggest-heuristics + curated Syndiq angles still usable; re-run paid KD when quota resets.",
  };
}

function writeReport(cfg, result) {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `opportunity-${cfg.id}-${stamp}`;
  const jsonPath = join(OUT_DIR, `${base}.json`);
  const mdPath = join(OUT_DIR, `${base}.md`);
  writeFileSync(jsonPath, JSON.stringify({ stamp, pass: cfg.id, title: cfg.title, result }, null, 2));

  let md;
  if (cfg.type === "syndiq") {
    md = [
      `# ${cfg.title}`,
      ``,
      `- stamp: ${stamp}`,
      `- ${result.note}`,
      ``,
      `## Syndiq playbook`,
      ...result.howToUseInSyndiq.map((x) => `- ${x}`),
      ``,
      `## Curated angles`,
      ...result.curatedPlaybook.flatMap((t, i) => [
        ``,
        `### ${i + 1}. [${t.bucket}] ${t.theme}`,
        `- sectors: ${t.syndiqAngle.sectors.join(", ")}`,
        `- deals: ${t.syndiqAngle.dealTypes}`,
        `- ticket: ${t.syndiqAngle.ticketHint}`,
        `- buyers: ${t.syndiqAngle.buyerFilter}`,
        `- off-market: ${t.syndiqAngle.offMarketHook}`,
      ]),
      ``,
      `## From passes A–D greenfield (if any)`,
      ...(result.fromSearch.length
        ? result.fromSearch.map((t) => `- [${t.bucket}] ${t.theme} (score ${t.score})`)
        : ["_Prior greenfield lists attached when A–D complete._"]),
      ``,
    ].join("\n");
  } else {
    md = [
      `# ${cfg.title}`,
      ``,
      `- stamp: ${stamp}`,
      `- method: Google Suggest heuristics (Apify quota exhausted — no paid volume/KD)`,
      `- scored phrases: ${result.total}`,
      ``,
      `### Greenfield (heuristic)`,
      ``,
      `| Keyword | Score | Seed |`,
      `|---|---:|---|`,
      ...result.greenfield.map((r) => `| ${r.keyword} | ${r.score} | ${r.seed} |`),
      ``,
      `### White space`,
      ``,
      `| Keyword | Score | Seed |`,
      `|---|---:|---|`,
      ...result.whitespace.slice(0, 30).map((r) => `| ${r.keyword} | ${r.score} | ${r.seed} |`),
      ``,
      `_Re-score with DataForSEO/Semrush volume+KD when Apify limit resets._`,
      ``,
    ].join("\n");
  }
  writeFileSync(mdPath, md);
  return { mdPath, jsonPath };
}

async function main() {
  const cfg = PASSES[pass];
  if (!cfg) {
    console.error("Use --pass=a|b|c|d|e");
    process.exit(1);
  }
  console.log(`\n=== PASS ${pass.toUpperCase()}: ${cfg.title} ===\n`);
  const result = cfg.type === "syndiq" ? syndiqBridge() : await runPass(cfg);
  const { mdPath, jsonPath } = writeReport(cfg, result);
  if (cfg.type !== "syndiq") {
    console.log("\nTop:");
    result.greenfield.slice(0, 10).forEach((r, i) => console.log(`  ${i + 1}. [${r.score}] ${r.keyword}`));
  } else {
    console.log(`Curated angles: ${result.curatedPlaybook.length}`);
  }
  console.log(`\nmd  ${mdPath}`);
  console.log(`json ${jsonPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
