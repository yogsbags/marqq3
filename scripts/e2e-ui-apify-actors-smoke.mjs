#!/usr/bin/env node
/**
 * UI smoke — Apify actors on Market Intelligence (Marqq2 parity).
 * Website crawler + Google Ads Transparency (cheap/default). LinkedIn/FB optional.
 *
 *   BASE_UI=http://localhost:5179 node scripts/e2e-ui-apify-actors-smoke.mjs
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
const WORKSPACE_ID = process.env.WORKSPACE_ID || "marqq-ws-1";
const RUN_ADS = String(process.env.APIFY_SMOKE_ADS || "1") !== "0";
const DOMAIN = process.env.APIFY_SMOKE_DOMAIN || "theelevate.co.in";

const ELEVATE = {
  companyName: "Elevate",
  website: "https://theelevate.co.in",
  niche: "Management strategy, AI solutions & digital transformation consulting",
  icp: "Growth-stage companies and mid-market leaders",
  outcome: "Grow qualified leads",
  timeWindow: "90 days",
  target: "5 qualified leads per month",
  baseline: "1 qualified lead per month",
};

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const results = [];
const ok = (n, d = "") => {
  results.push({ name: n, status: "pass", detail: d });
  console.log(`  ✓ ${n}${d ? ` — ${d}` : ""}`);
};
const fail = (n, d = "") => {
  results.push({ name: n, status: "fail", detail: d });
  console.error(`  ✗ ${n}${d ? ` — ${d}` : ""}`);
};

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

function loadStrategy() {
  if (!existsSync(OUT_DIR)) return null;
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith("elevate-ui-strategy-") && f.endsWith(".json"))
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
  // Login email is #li-email (no type=email). Wait past auth splash.
  await page.locator("#li-email, #su-email").first().waitFor({ state: "visible", timeout: 45_000 });
  if (!(await page.locator("#su-email").isVisible().catch(() => false))) {
    const signupLink = page
      .getByRole("link", { name: /Sign up|Create/i })
      .or(page.getByText(/Sign up/i))
      .first();
    await signupLink.click();
    await page.locator("#su-email").waitFor({ state: "visible", timeout: 20_000 });
  }
  const name = page.locator("#su-name").first();
  if (await name.isVisible().catch(() => false)) await name.fill("Elevate Apify");
  await page.locator("#su-email").fill(email);
  await page.locator("#su-pass").fill(password);
  await page.locator("#su-confirm-pass").fill(password);
  await page.getByRole("button", { name: /Create account|Sign up|Register/i }).first().click();
  // Prefer a real Supabase session; fall back to onboarding shell
  await page
    .waitForFunction(
      () =>
        Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.includes("auth")) ||
        !!document.querySelector("#ob-company, [data-testid='onboarding'], .brand-style-loader") ||
        /Create your Brand DNA|Tell me about|Company name|onboarding/i.test(document.body?.innerText || ""),
      { timeout: 45_000 }
    )
    .catch(() => {});
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
      localStorage.setItem("marqq_active_screen", "market");
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
}

async function forceMarket(page) {
  await page.evaluate(() => localStorage.setItem("marqq_active_screen", "market"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`\nApify actors UI smoke → ${BASE_UI}\n`);

  // API preflight
  const statusRes = await fetch(`${API}/api/apify/status`);
  const status = await statusRes.json().catch(() => ({}));
  if (!status.configured) {
    fail("apify-status", "APIFY_TOKEN not configured on backend");
  } else {
    ok("apify-status", Object.keys(status.actors || {}).join(", "));
  }

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const strategy = loadStrategy();
  const email = `elevate.apify.${Date.now()}@marqq.test`;
  const password = "MarqqApify1!";

  try {
    await signup(page, email, password);
    const hasSession = await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.includes("auth"))
    );
    if (!hasSession) {
      const body = ((await page.locator("body").innerText().catch(() => "")) || "").slice(0, 240);
      throw new Error(`signup did not create session — ${body}`);
    }
    ok("signup", email);
    await inject(page, strategy);
    await forceMarket(page);

    const statusEl = page.getByTestId("apify-status");
    await statusEl.waitFor({ state: "visible", timeout: 20_000 });
    const statusText = (await statusEl.textContent().catch(() => "")) || "";
    if (/Apify connected/i.test(statusText)) ok("ui-apify-status", statusText.trim().slice(0, 80));
    else fail("ui-apify-status", statusText || "status line missing");

    // Website crawl
    const crawlBtn = page.getByTestId("apify-run-website");
    await crawlBtn.waitFor({ state: "visible", timeout: 15_000 });
    await crawlBtn.click();
    await page.getByTestId("apify-website-result").waitFor({ state: "visible", timeout: 180_000 });
    const siteText = await page.getByTestId("apify-website-result").textContent();
    if (siteText && siteText.length > 20) ok("ui-website-crawl", siteText.slice(0, 90).replace(/\s+/g, " "));
    else fail("ui-website-crawl", "empty result");

    await page.screenshot({
      path: join(OUT_DIR, `elevate-apify-website-${stamp}.png`),
      fullPage: true,
    });

    if (RUN_ADS) {
      await page.getByTestId("apify-ads-domain").fill(DOMAIN);
      await page.getByTestId("apify-ads-name").fill("Elevate");
      for (const p of ["linkedin", "facebook"]) {
        const box = page.getByTestId(`apify-platform-${p}`);
        if (await box.isChecked().catch(() => false)) await box.uncheck();
      }
      const googleBox = page.getByTestId("apify-platform-google");
      if (!(await googleBox.isChecked().catch(() => false))) await googleBox.check();

      await page.getByTestId("apify-run-ads").click();
      await page.getByTestId("apify-ads-result").waitFor({ state: "visible", timeout: 300_000 });
      const adsText = (await page.getByTestId("apify-ads-result").textContent()) || "";
      if (/ads|google|scraped|skipped|View creative|No ad creatives/i.test(adsText)) {
        ok("ui-google-ads-scrape", adsText.slice(0, 120).replace(/\s+/g, " "));
      } else {
        fail("ui-google-ads-scrape", adsText.slice(0, 160) || "no result panel content");
      }
      await page.screenshot({
        path: join(OUT_DIR, `elevate-apify-ads-${stamp}.png`),
        fullPage: true,
      });
    } else {
      ok("ui-google-ads-scrape", "skipped (APIFY_SMOKE_ADS=0)");
    }

    await page.screenshot({
      path: join(OUT_DIR, `elevate-apify-market-${stamp}.png`),
      fullPage: true,
    });
  } catch (err) {
    fail("ui-flow", err.message || String(err));
    await page.screenshot({ path: join(OUT_DIR, `elevate-apify-error-${stamp}.png`), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }

  const summary = {
    stamp,
    baseUi: BASE_UI,
    results,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
  };
  writeFileSync(join(OUT_DIR, `elevate-apify-smoke-${stamp}.json`), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed} passed · ${summary.failed} failed`);
  process.exit(summary.failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
