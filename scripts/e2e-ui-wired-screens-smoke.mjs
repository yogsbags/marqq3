#!/usr/bin/env node
/**
 * UI smoke — recently wired Plan/Grow/System (+ Brand/CRM/Orchestration/Workflows) screens.
 * Skips Calendar / Notifications / Apollo (covered by e2e-ui-calendar-notifications-signals.mjs).
 *
 *   BASE_UI=http://localhost:5179 node scripts/e2e-ui-wired-screens-smoke.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE_UI = String(process.env.BASE_UI || "http://localhost:5179").replace(/\/$/, "");
const API = String(process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const COMPANY_ID = process.env.COMPANY_ID || "marqq-ws-1";

const NOURIVA = {
  companyName: "Nouriva AI",
  website: "https://nouriva.tech",
  niche: "Consumer health & nutrition AI app",
  icp: "Clinic Director, Head of Nutrition, Founder, CEO",
  outcome: "Grow paid conversions",
  timeWindow: "90 days",
  target: "200 paid conversions / month",
  baseline: "organic installs + trial starts",
};

/** Recently wired / half-wired screens to smoke (label = sidebar text). */
const SCREENS = [
  {
    id: "files",
    label: "Workspace Files",
    patterns: [/Workspace Files|Knowledge|Upload|files/i],
  },
  {
    id: "help",
    label: "Help & Support",
    patterns: [/Help|Support|status|docs|contact/i],
  },
  {
    id: "reporting",
    label: "Reporting",
    patterns: [/Reporting|board brief|analytics|report/i],
  },
  {
    id: "seo",
    label: "SEO",
    patterns: [/SEO|Search Console|GSC|keywords|indexing/i],
  },
  {
    id: "evaluations",
    label: "Evaluations",
    patterns: [/Evaluation|roster|run|score|agent/i],
  },
  {
    id: "pricing",
    label: "Pricing",
    patterns: [/Pricing|package|plan|Tara|handoff/i],
  },
  {
    id: "market",
    label: "Market Intelligence",
    patterns: [/Market|Competitor|research|Refresh|category/i],
  },
  {
    id: "experiments",
    label: "Experiments",
    patterns: [/Experiment|A\/B|hypothesis|variant|test/i],
  },
  {
    id: "referrals",
    label: "Referral Programs",
    patterns: [/Referral|advocate|invite|program/i],
  },
  {
    id: "billing",
    label: "Billing",
    patterns: [/Billing|credits|plan|usage|soft.?cap/i],
  },
  {
    id: "admin",
    label: "Administration",
    patterns: [/Admin|Security|seat|workspace|settings/i],
  },
  {
    id: "voicebot",
    label: "Voice & Video Bot",
    patterns: [/Voice|Video|STT|transcri|bot|ICP/i],
  },
  {
    id: "brand",
    label: "Brand Center",
    patterns: [/Brand|DNA|logo|voice|tagline|Knowledge/i],
  },
  {
    id: "crm",
    label: "CRM Sync",
    patterns: [/CRM|Sync|Sheets|destination|Customer 360/i],
  },
  {
    id: "orchestration",
    label: "Orchestration",
    patterns: [/Orchestration|Agent OS|deploy|Activate|approval/i],
  },
  {
    id: "workflows",
    label: "Workflows",
    patterns: [/Workflow|automation|schedule|pause|run now/i],
  },
  {
    id: "approvals",
    label: "Approvals",
    patterns: [/Approval|queue|approve|reject|draft/i],
  },
  {
    id: "customer360",
    label: "Customer 360",
    patterns: [/Customer 360|accounts|segment|outreach|at risk/i],
  },
];

const results = [];
const ok = (n, d = "") => {
  results.push({ name: n, status: "pass", detail: d });
  console.log(`  ✓ ${n}${d ? ` — ${d}` : ""}`);
};
const fail = (n, d = "") => {
  results.push({ name: n, status: "fail", detail: d });
  console.error(`  ✗ ${n}${d ? ` — ${d}` : ""}`);
};
const note = (m) => console.log(`  · ${m}`);

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    spawnSync("npm", ["install", "--no-save", "playwright@1.52.0"], {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    spawnSync("npx", ["playwright", "install", "chromium"], {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    return import("playwright");
  }
}

function loadLatestStrategy() {
  if (!existsSync(OUT_DIR)) return null;
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith("nouriva-ui-strategy-") && f.endsWith(".json"))
    .sort();
  if (!files.length) return null;
  return JSON.parse(readFileSync(join(OUT_DIR, files.at(-1)), "utf8")).strategy;
}

async function signup(page, email, password) {
  await page.goto(BASE_UI, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) if (k.startsWith("marqq_") || k.startsWith("sb-")) localStorage.removeItem(k);
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  const signupLink = page.getByRole("link", { name: /Sign up|Create/i }).or(page.getByText(/Sign up/i)).first();
  if (await signupLink.isVisible().catch(() => false)) await signupLink.click();
  else {
    await page.evaluate(() => localStorage.setItem("marqq_active_screen", "signup"));
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForTimeout(400);
  const nameInput = page.locator("#su-name").or(page.getByLabel(/Full name|Name/i)).first();
  if (await nameInput.isVisible().catch(() => false)) await nameInput.fill("Nouriva Wired Smoke");
  const emailInput = page.locator("#su-email").or(page.getByLabel(/Email/i)).first();
  if (await emailInput.isVisible().catch(() => false)) await emailInput.fill(email);
  else await page.locator('input[type="email"]').first().fill(email);
  const pass = page.locator('input[type="password"]');
  if ((await pass.count()) >= 1) await pass.nth(0).fill(password);
  if ((await pass.count()) >= 2) await pass.nth(1).fill(password);
  await page.getByRole("button", { name: /Create account|Sign up|Register/i }).first().click();
  await page.waitForTimeout(2500);
}

async function injectWorkspace(page, strategy) {
  await page.evaluate(
    ({ strategy, company, companyId }) => {
      localStorage.setItem("marqq_onboarding_complete", "1");
      localStorage.setItem("marqq_workspace_id", companyId);
      localStorage.setItem(
        "marqq_active_workspace",
        JSON.stringify({
          id: companyId,
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
      localStorage.setItem("marqq_active_screen", "command");
      if (strategy) {
        sessionStorage.setItem(
          "marqq_gtm_wizard",
          JSON.stringify({
            stage: "document",
            phase: "document",
            answers: {
              quantified_target: { value: "200_paid", label: company.target },
              icp: { value: "lab_users", label: company.icp },
            },
            drafts: {},
            strategy,
          })
        );
        sessionStorage.setItem("marqq_gtm_strategy", JSON.stringify(strategy));
      }
    },
    { strategy, company: NOURIVA, companyId: COMPANY_ID }
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.evaluate((companyId) => {
    localStorage.setItem("marqq_workspace_id", companyId);
    localStorage.setItem(
      "marqq_active_workspace",
      JSON.stringify({
        id: companyId,
        name: "Nouriva AI",
        website_url: "https://nouriva.tech",
        role: "owner",
      })
    );
  }, COMPANY_ID);
}

async function goScreen(page, label, key) {
  const aside = page.locator("aside").getByText(label, { exact: true }).first();
  if (await aside.isVisible().catch(() => false)) {
    await aside.click({ force: true });
    await page.waitForTimeout(900);
    return "sidebar";
  }
  await page.evaluate((screen) => localStorage.setItem("marqq_active_screen", screen), key);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1100);
  return "localStorage";
}

async function bodyText(page) {
  return page.locator("main").innerText().catch(() => page.locator("body").innerText().catch(() => ""));
}

async function smokeScreen(page, screen, shotFn) {
  const via = await goScreen(page, screen.label, screen.id);
  const body = await bodyText(page);
  const hit = screen.patterns.some((re) => re.test(body));
  if (hit) {
    ok(`screen:${screen.id}`, via);
  } else {
    fail(`screen:${screen.id}`, `no match — ${body.replace(/\s+/g, " ").slice(0, 180)}`);
    await shotFn(`fail-${screen.id}`);
  }
  // Light interaction probes for screens that have obvious primary actions
  if (screen.id === "market") {
    const btn = page.getByRole("button", { name: /Refresh|Research|Run/i }).first();
    if (await btn.isVisible().catch(() => false)) ok("action:market-refresh-visible");
  }
  if (screen.id === "workflows") {
    const btn = page.getByRole("button", { name: /Run now|Pause|Resume|Create/i }).first();
    if (await btn.isVisible().catch(() => false)) ok("action:workflows-controls");
  }
  if (screen.id === "orchestration") {
    const btn = page.getByRole("button", { name: /Activate|Tick|Run/i }).first();
    if (await btn.isVisible().catch(() => false)) ok("action:orchestration-controls");
  }
  if (screen.id === "crm") {
    const btn = page.getByRole("button", { name: /Sync/i }).first();
    if (await btn.isVisible().catch(() => false)) ok("action:crm-sync-visible");
  }
  if (screen.id === "brand") {
    const btn = page.getByRole("button", { name: /Save|Brand DNA|Upload|Edit/i }).first();
    if (await btn.isVisible().catch(() => false)) ok("action:brand-controls");
  }
  if (screen.id === "experiments" || screen.id === "referrals") {
    const btn = page.getByRole("button", { name: /Add|Create|New/i }).first();
    if (await btn.isVisible().catch(() => false)) ok(`action:${screen.id}-create`);
  }
  if (screen.id === "files") {
    const btn = page.getByRole("button", { name: /Upload|Add|New/i }).first();
    if (await btn.isVisible().catch(() => false)) ok("action:files-upload");
  }
  if (screen.id === "evaluations") {
    const btn = page.getByRole("button", { name: /Run|Evaluate|Tick/i }).first();
    if (await btn.isVisible().catch(() => false)) ok("action:evaluations-run");
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const shot = async (name) => {
    const path = join(OUT_DIR, `ui-wired-${name}-${stamp}.png`);
    await page.screenshot({ path, fullPage: true });
    note(`shot ${path}`);
    return path;
  };

  try {
    console.log(`\nWired-screens UI smoke → ${BASE_UI}`);
    const health = await fetch(`${API}/api/agents/deployments?workspaceId=${encodeURIComponent(COMPANY_ID)}`);
    if (!health.ok) fail("api:backend", `HTTP ${health.status}`);
    else ok("api:backend");

    const email = `nouriva.wired.${Date.now()}@marqq.test`;
    await signup(page, email, "NourivaSmoke123!");
    await injectWorkspace(page, loadLatestStrategy());
    ok("auth:enter-app");
    await shot("00-home");

    for (const screen of SCREENS) {
      console.log(`\n[${screen.id}] ${screen.label}`);
      await smokeScreen(page, screen, shot);
    }

    // Spot-check gallery of a few key screens
    await goScreen(page, "Brand Center", "brand");
    await shot("brand");
    await goScreen(page, "Orchestration", "orchestration");
    await shot("orchestration");
    await goScreen(page, "Workflows", "workflows");
    await shot("workflows");
    await goScreen(page, "Market Intelligence", "market");
    await shot("market");
  } catch (err) {
    fail("fatal", err.message || String(err));
    await shot("fatal").catch(() => {});
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const reportPath = join(OUT_DIR, `ui-wired-screens-smoke-${stamp}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify({ stamp, baseUi: BASE_UI, api: API, passed, failed, results }, null, 2)
  );
  console.log(`\n${passed} passed · ${failed} failed`);
  console.log(`report ${reportPath}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
