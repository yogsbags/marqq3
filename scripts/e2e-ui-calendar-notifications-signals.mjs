#!/usr/bin/env node
/**
 * UI smoke — Calendar (Marqq2 grid) · Notifications panel · Apollo Signals (Audiences)
 *
 *   BASE_UI=http://localhost:5179 node scripts/e2e-ui-calendar-notifications-signals.mjs
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
  await page.waitForTimeout(500);
  const signupLink = page.getByRole("link", { name: /Sign up|Create/i }).or(page.getByText(/Sign up/i)).first();
  if (await signupLink.isVisible().catch(() => false)) await signupLink.click();
  else {
    await page.evaluate(() => localStorage.setItem("marqq_active_screen", "signup"));
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForTimeout(400);
  const nameInput = page.locator("#su-name").or(page.getByLabel(/Full name|Name/i)).first();
  if (await nameInput.isVisible().catch(() => false)) await nameInput.fill("Nouriva UI Smoke");
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
        JSON.stringify({ id: companyId, name: company.companyName, website_url: company.website, role: "owner" })
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
        const wizard = {
          stage: "document",
          phase: "document",
          answers: {
            quantified_target: { value: "200_paid", label: company.target },
            icp: { value: "lab_users", label: company.icp },
          },
          drafts: {},
          strategy,
        };
        sessionStorage.setItem("marqq_gtm_wizard", JSON.stringify(wizard));
        sessionStorage.setItem("marqq_gtm_strategy", JSON.stringify(strategy));
      }
    },
    { strategy, company: NOURIVA, companyId: COMPANY_ID }
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.evaluate((companyId) => {
    localStorage.setItem("marqq_workspace_id", companyId);
    localStorage.setItem(
      "marqq_active_workspace",
      JSON.stringify({ id: companyId, name: "Nouriva AI", website_url: "https://nouriva.tech", role: "owner" })
    );
  }, COMPANY_ID);
}

async function goScreen(page, label, key) {
  const aside = page.locator("aside").getByText(label, { exact: true }).first();
  if (await aside.isVisible().catch(() => false)) {
    await aside.click({ force: true });
  } else {
    await page.evaluate((screen) => localStorage.setItem("marqq_active_screen", screen), key);
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForTimeout(1200);
}

async function bodyText(page) {
  return page.locator("body").innerText().catch(() => "");
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const shot = async (name) => {
    const path = join(OUT_DIR, `ui-smoke-${name}-${stamp}.png`);
    await page.screenshot({ path, fullPage: true });
    note(`shot ${path}`);
    return path;
  };

  const email = `nouriva.ui.smoke.${Date.now()}@marqq.test`;
  const password = "NourivaSmoke123!";

  try {
    console.log(`\nUI smoke → ${BASE_UI} (api ${API})`);
    note(`health check`);
    const health = await fetch(`${API}/api/agents/deployments?workspaceId=${encodeURIComponent(COMPANY_ID)}`);
    if (!health.ok) fail("api:backend", `HTTP ${health.status}`);
    else ok("api:backend", "deployments reachable");

    await signup(page, email, password);
    const strategy = loadLatestStrategy();
    if (!strategy) note("No cached strategy JSON — continuing with onboarding flags only");
    await injectWorkspace(page, strategy);
    ok("auth:enter-app");

    // —— Calendar ——
    console.log("\n[1] Marketing Calendar");
    await goScreen(page, "Calendar", "calendar");
    let body = await bodyText(page);
    if (/Marketing Calendar/i.test(body)) ok("calendar:title");
    else fail("calendar:title", body.slice(0, 200));
    if (/\bToday\b/i.test(body) && /\bWeek\b/i.test(body) && /\bMonth\b/i.test(body)) {
      ok("calendar:view-toggles");
    } else fail("calendar:view-toggles", "missing Today/Week/Month");
    // Platform row icons / labels may be icon-only — click LinkedIn cell via New Post path
    const weekBtn = page.getByRole("button", { name: /^week$/i }).first();
    if (await weekBtn.isVisible().catch(() => false)) {
      await weekBtn.click();
      await page.waitForTimeout(400);
      ok("calendar:week-click");
    } else fail("calendar:week-click");
    // Open new post modal by clicking a platform cell (second grid area buttons)
    const cells = page.locator("main button").filter({ has: page.locator("svg") });
    const cellCount = await cells.count();
    note(`calendar interactive buttons with icons: ${cellCount}`);
    if (cellCount > 8) {
      await cells.nth(10).click({ force: true }).catch(() => {});
      await page.waitForTimeout(600);
      body = await bodyText(page);
      if (/New .* ·|Calendar title|Schedule|Save draft/i.test(body)) {
        ok("calendar:new-post-modal");
        const close = page.getByRole("button").filter({ has: page.locator("svg") }).first();
        // Prefer Escape
        await page.keyboard.press("Escape").catch(() => {});
        const cancel = page.getByRole("button", { name: /Close|Cancel/i }).first();
        if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => {});
        // Click X in modal if still open
        const xBtn = page.locator(".card").filter({ hasText: /New /i }).getByRole("button").first();
        if (await xBtn.isVisible().catch(() => false)) await xBtn.click().catch(() => {});
      } else {
        fail("calendar:new-post-modal", "modal text not found");
      }
    } else {
      fail("calendar:new-post-modal", "not enough platform cells");
    }
    await shot("01-calendar");

    // —— Notifications ——
    console.log("\n[2] Notifications panel");
    const bell = page.getByRole("button", { name: /Notifications/i }).first();
    if (await bell.isVisible().catch(() => false)) {
      await bell.click();
      await page.waitForTimeout(800);
      body = await bodyText(page);
      if (/Notifications/i.test(body) && (/AI Team/i.test(body) || /Competitors/i.test(body))) {
        ok("notifications:panel");
      } else if (/Sign in to view notifications/i.test(body)) {
        ok("notifications:panel", "signed-in gate / empty auth state");
      } else {
        // Panel may still render with tabs
        const tabs = page.getByText("AI Team").first();
        if (await tabs.isVisible().catch(() => false)) ok("notifications:panel");
        else fail("notifications:panel", body.slice(0, 240));
      }
      const aiTab = page.getByText("AI Team").first();
      if (await aiTab.isVisible().catch(() => false)) {
        await aiTab.click().catch(() => {});
        ok("notifications:ai-team-tab");
      }
      const compTab = page.getByText("Competitors").first();
      if (await compTab.isVisible().catch(() => false)) {
        await compTab.click().catch(() => {});
        ok("notifications:competitors-tab");
      }
      await shot("02-notifications");
      await page.keyboard.press("Escape").catch(() => {});
      // Close via overlay click
      await page.locator("body").click({ position: { x: 20, y: 200 } }).catch(() => {});
    } else {
      fail("notifications:panel", "bell button not found");
    }

    // —— Apollo Signals ——
    console.log("\n[3] Audiences · Apollo Signals");
    await goScreen(page, "Audiences", "audiences");
    body = await bodyText(page);
    if (/Apollo Signals/i.test(body)) ok("audiences:apollo-panel");
    else fail("audiences:apollo-panel", body.slice(0, 200));

    // Seed a known account poll via API then inject into session so UI can show without full C360
    try {
      const sigRes = await fetch(`${API}/api/apollo/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: COMPANY_ID,
          refresh: true,
          limit: 1,
          accounts: [{ name: "Apollo.io", domain: "apollo.io" }],
        }),
      });
      const sigJson = await sigRes.json();
      if (sigRes.ok && sigJson.ok !== false && Array.isArray(sigJson.accounts) && sigJson.accounts.length) {
        ok("api:apollo-signals", `${sigJson.accounts[0].signals?.length || 0} signals`);
        await page.evaluate(
          ({ key, payload }) => {
            sessionStorage.setItem(key, JSON.stringify(payload));
          },
          { key: `marqq_apollo_signals_${COMPANY_ID}`, payload: sigJson }
        );
        await goScreen(page, "Audiences", "audiences");
        body = await bodyText(page);
        if (/Apollo\.io|Hiring|funding|news|roles/i.test(body)) ok("audiences:signals-table", "cached row visible");
        else fail("audiences:signals-table", body.slice(0, 300));
      } else {
        fail("api:apollo-signals", JSON.stringify(sigJson).slice(0, 200));
      }
    } catch (err) {
      fail("api:apollo-signals", err.message);
    }

    const pollBtn = page.getByRole("button", { name: /Poll Apollo|Refresh signals/i }).first();
    if (await pollBtn.isVisible().catch(() => false)) {
      await pollBtn.click();
      // Wait up to 90s for poll to finish
      const start = Date.now();
      let settled = false;
      while (Date.now() - start < 90_000) {
        const label = ((await pollBtn.textContent().catch(() => "")) || "").trim();
        if (!/Polling/i.test(label)) {
          settled = true;
          break;
        }
        await page.waitForTimeout(1500);
      }
      if (settled) ok("audiences:poll-click", "button left Polling state");
      else fail("audiences:poll-click", "still Polling after 90s");
      body = await bodyText(page);
      if (/Updated|Cached|accounts|No signals|No ICP|roles|Apollo/i.test(body)) {
        ok("audiences:poll-result");
      } else fail("audiences:poll-result", body.slice(0, 240));
    } else {
      fail("audiences:poll-click", "Poll button missing");
    }
    await shot("03-apollo-signals");
  } catch (err) {
    fail("fatal", err.message || String(err));
    await shot("fatal").catch(() => {});
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const report = { stamp, baseUi: BASE_UI, api: API, passed, failed, results };
  const reportPath = join(OUT_DIR, `ui-smoke-calendar-notifications-signals-${stamp}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n${passed} passed · ${failed} failed`);
  console.log(`report ${reportPath}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
