#!/usr/bin/env node
/**
 * Elevate UI overflow audit — desktop + mobile viewports.
 * Detects text/elements where scrollWidth > clientWidth (clipped/overflow).
 *
 *   BASE_UI=http://localhost:5179 node scripts/e2e-ui-elevate-overflow-audit.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE_UI = String(process.env.BASE_UI || "http://localhost:5179").replace(/\/$/, "");
const WORKSPACE_ID = process.env.WORKSPACE_ID || "marqq-ws-1";

const ELEVATE = {
  companyName: "Elevate",
  website: "https://theelevate.co.in",
  niche: "Management strategy, AI solutions & digital transformation consulting",
  icp: "Growth-stage companies and mid-market leaders seeking strategy-to-execution partners",
  outcome: "Grow qualified leads from strategy and AI transformation buyers",
  timeWindow: "90 days",
  target: "5 qualified leads per month",
  baseline: "1 qualified lead per month",
};

const SCREENS = [
  { id: "command", label: "Command Center" },
  { id: "ask", label: "Ask Marqq" },
  { id: "strategy", label: "Strategy" },
  { id: "content", label: "Content" },
  { id: "landingpages", label: "Landing Pages" },
  { id: "leadmagnets", label: "Lead Magnets" },
  { id: "outreach", label: "Outreach Studio" },
  { id: "social", label: "Social Media" },
  { id: "paid", label: "Paid Media" },
  { id: "creative", label: "Creative" },
  { id: "calendar", label: "Calendar" },
  { id: "market", label: "Market Intelligence" },
  { id: "scorecard", label: "Performance Scorecard" },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
];

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    spawnSync("npm", ["install", "--no-save", "playwright@1.52.0"], {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    return import("playwright");
  }
}

function loadStrategy() {
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith("elevate-ui-strategy-") && f.endsWith(".json"))
    .sort();
  if (!files.length) return null;
  return JSON.parse(readFileSync(join(OUT_DIR, files.at(-1)), "utf8")).strategy;
}

async function inject(page, strategy) {
  await page.evaluate(
    ({ strategy, company, workspaceId }) => {
      localStorage.setItem("marqq_onboarding_complete", "1");
      localStorage.setItem("marqq_workspace_id", workspaceId);
      localStorage.setItem(
        "marqq_active_workspace",
        JSON.stringify({
          id: workspaceId,
          name: company.companyName,
          website_url: company.website,
          role: "owner",
        })
      );
      localStorage.setItem("marqq_ob_companyName", company.companyName);
      localStorage.setItem("marqq_ob_website", company.website);
      localStorage.setItem("marqq_ob_niche", company.niche);
      localStorage.setItem("marqq_ob_icp", company.icp);
      localStorage.setItem("marqq_ob_outcome", company.outcome);
      localStorage.setItem("marqq_ob_timeWindow", company.timeWindow);
      localStorage.setItem("marqq_ob_target", company.target);
      localStorage.setItem("marqq_ob_baseline", company.baseline);
      localStorage.setItem("marqq_ob_country", "India");
      localStorage.setItem("marqq_active_screen", "command");
      if (strategy) {
        sessionStorage.setItem(
          "marqq_gtm_wizard",
          JSON.stringify({ stage: "document", phase: "document", answers: {}, drafts: {}, strategy, review: null })
        );
        sessionStorage.setItem("marqq_gtm_strategy", JSON.stringify(strategy));
      }
    },
    { strategy, company: ELEVATE, workspaceId: WORKSPACE_ID }
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
}

async function collectOverflow(page) {
  return page.evaluate(() => {
    const docOverflow =
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 ||
      document.body.scrollWidth > document.body.clientWidth + 2;

    const offenders = [];
    const nodes = document.querySelectorAll(
      "button, a, h1, h2, h3, h4, p, span, label, td, th, li, .card, .btn, [class*='title'], [class*='meta']"
    );

    for (const el of nodes) {
      if (!(el instanceof HTMLElement)) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;

      const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length < 2) continue;

      // Intentional ellipsis truncation is OK
      const intentional =
        style.textOverflow === "ellipsis" &&
        (style.overflow === "hidden" || style.overflowX === "hidden") &&
        (style.whiteSpace === "nowrap" || style.whiteSpace === "pre");

      const dx = el.scrollWidth - el.clientWidth;
      const dy = el.scrollHeight - el.clientHeight;
      // Only flag horizontal text clip (typical overflow bug); allow scrollable panels
      const overflowYScrollable = /(auto|scroll)/.test(style.overflowY) || /(auto|scroll)/.test(style.overflow);
      const overflowXScrollable = /(auto|scroll)/.test(style.overflowX) || /(auto|scroll)/.test(style.overflow);

      if (dx > 2 && !intentional && !overflowXScrollable) {
        offenders.push({
          kind: "horizontal",
          tag: el.tagName.toLowerCase(),
          className: String(el.className || "").slice(0, 80),
          text: text.slice(0, 120),
          dx,
          dy,
          w: Math.round(rect.width),
          intentional: false,
        });
      }

      // Text clipped by parent box (child wider than visible parent without wrap)
      if (
        !intentional &&
        style.whiteSpace === "nowrap" &&
        dx > 2 &&
        style.overflow === "visible" &&
        style.overflowX === "visible"
      ) {
        offenders.push({
          kind: "nowrap-clip",
          tag: el.tagName.toLowerCase(),
          className: String(el.className || "").slice(0, 80),
          text: text.slice(0, 120),
          dx,
          dy,
          w: Math.round(rect.width),
        });
      }

      // Element extending past viewport
      if (rect.right > window.innerWidth + 2 && text.length > 3) {
        offenders.push({
          kind: "past-viewport",
          tag: el.tagName.toLowerCase(),
          className: String(el.className || "").slice(0, 80),
          text: text.slice(0, 120),
          right: Math.round(rect.right),
          vw: window.innerWidth,
        });
      }
    }

    // Dedupe by text+kind
    const seen = new Set();
    const unique = [];
    for (const o of offenders) {
      const key = `${o.kind}|${o.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(o);
    }
    return {
      docOverflow,
      docScrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      offenders: unique.slice(0, 40),
    };
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const strategy = loadStrategy();
  const report = { stamp, baseUi: BASE_UI, viewports: [], totals: { screens: 0, withIssues: 0, offenders: 0 } };

  console.log(`\nElevate overflow audit · ${BASE_UI}\n`);

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const email = `elevate.overflow.${Date.now()}@marqq.test`;
    await page.goto(BASE_UI, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    // Skip full signup — inject onboarded Elevate state
    await inject(page, strategy);

    const vpResult = { name: vp.name, width: vp.width, height: vp.height, screens: [] };

    for (const screen of SCREENS) {
      await page.evaluate((sid) => localStorage.setItem("marqq_active_screen", sid), screen.id);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1100);
      // dismiss overlays
      for (let i = 0; i < 2; i++) {
        if (!(await page.locator(".modal-overlay").first().isVisible().catch(() => false))) break;
        await page.keyboard.press("Escape");
        await page.waitForTimeout(150);
      }

      const overflow = await collectOverflow(page);
      report.totals.screens += 1;
      const issueCount = overflow.offenders.length + (overflow.docOverflow ? 1 : 0);
      if (issueCount > 0) {
        report.totals.withIssues += 1;
        report.totals.offenders += overflow.offenders.length;
        const shot = join(OUT_DIR, `elevate-overflow-${vp.name}-${screen.id}-${stamp}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        console.log(
          `  ✗ ${vp.name}/${screen.label} — docOverflow=${overflow.docOverflow} offenders=${overflow.offenders.length}`
        );
        for (const o of overflow.offenders.slice(0, 5)) {
          console.log(`      · [${o.kind}] ${o.tag}.${o.className}: "${o.text}"`);
        }
        vpResult.screens.push({ ...screen, ...overflow, shot, ok: false });
      } else {
        console.log(`  ✓ ${vp.name}/${screen.label}`);
        vpResult.screens.push({ ...screen, ok: true, docOverflow: false, offenders: [] });
      }
    }

    report.viewports.push(vpResult);
    await page.close();
  }

  await browser.close();

  const jsonPath = join(OUT_DIR, `elevate-overflow-audit-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\n${"=".repeat(56)}`);
  console.log(
    `${report.totals.screens} screens · ${report.totals.withIssues} with issues · ${report.totals.offenders} offenders`
  );
  console.log(`report ${jsonPath}`);
  process.exit(report.totals.withIssues > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
