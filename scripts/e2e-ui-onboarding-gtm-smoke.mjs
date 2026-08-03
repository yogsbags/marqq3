#!/usr/bin/env node
/**
 * UI smoke: onboarding → GTM wizard → strategy document (Elevate).
 *
 *   node scripts/e2e-ui-onboarding-gtm-smoke.mjs
 *
 * Requires: frontend http://localhost:5179 + backend :3001 + GROQ
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE_UI = String(process.env.BASE_UI || "http://localhost:5179").replace(/\/$/, "");
const BOOTSTRAP_VERSION = "elevate-theelevate-co-in-v6";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    console.log("[ui-smoke] installing playwright…");
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

const results = [];
function ok(name, detail = "") {
  results.push({ name, status: "pass", detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, status: "fail", detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitVisible(locator, timeout = 120_000) {
  await locator.waitFor({ state: "visible", timeout });
  return locator;
}

async function clickWhenEnabled(locator, timeout = 180_000) {
  await locator.waitFor({ state: "visible", timeout });
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (!(await locator.isDisabled().catch(() => true))) {
      await locator.click();
      return true;
    }
    await locator.page().waitForTimeout(1500);
  }
  return false;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err.message || err)));

  const shot = async (name) => {
    const path = join(OUT_DIR, `ui-smoke-${name}.png`);
    await page.screenshot({ path, fullPage: true });
    console.log(`  📸 ${path}`);
    return path;
  };

  try {
    console.log(`\n[1] Open ${BASE_UI} (fresh onboarding)`);
    await page.goto(BASE_UI, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate((bootstrapVersion) => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) keys.push(k);
      }
      for (const k of keys) {
        if (k.startsWith("marqq_") || k.startsWith("sb-")) localStorage.removeItem(k);
      }
      localStorage.setItem("marqq_workspace_bootstrap", bootstrapVersion);
      localStorage.setItem("marqq_onboarding_step", "1");
      sessionStorage.clear();
    }, BOOTSTRAP_VERSION);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    if (await page.getByText(/Step\s+1\s+of\s+8/i).first().isVisible().catch(() => false)) {
      ok("onboarding:landed");
    } else {
      fail("onboarding:landed");
      await shot("fail-land");
    }
    await shot("01-onboarding-start");

    console.log("\n[2] Onboarding steps 1→8 (no strategy drafts here)");
    for (let guard = 0; guard < 14; guard++) {
      const stepText = (await page.getByText(/Step\s+(\d+)\s+of\s+8/i).first().textContent().catch(() => "")) || "";
      const stepMatch = stepText.match(/Step\s+(\d+)/i);
      const step = stepMatch ? Number(stepMatch[1]) : 0;
      console.log(`  … onboarding step marker: ${stepText.trim() || "(none)"}`);

      if (step >= 7) {
        const continueBtn = page.getByRole("button", { name: /Continue|Launch GTM Strategy Wizard/i }).first();
        if (await continueBtn.isVisible().catch(() => false)) {
          const label = (await continueBtn.textContent()) || "";
          await continueBtn.click();
          await page.waitForTimeout(1000);
          if (/Launch GTM/i.test(label)) {
            ok("onboarding:launch-wizard");
            break;
          }
          ok(`onboarding:continue-step-${step}`);
          continue;
        }
      }

      const continueBtn = page.getByRole("button", { name: /^Continue$|Launch GTM Strategy Wizard/i }).first();
      if (!(await continueBtn.isVisible().catch(() => false))) {
        // Still drafting Brand DNA?
        if (await page.getByText(/Drafting|Loading skill|Synthesiz|Analyz|Building Brand/i).first().isVisible().catch(() => false)) {
          await page.waitForTimeout(3000);
          continue;
        }
        fail("onboarding:continue-missing", `step=${step}`);
        await shot("fail-continue");
        break;
      }

      // Light field fill on early steps
      if (step === 1) {
        const company = page.locator("input").first();
        if (await company.count()) {
          await company.fill("Elevate");
        }
      }

      const label = (await continueBtn.textContent()) || "";
      await continueBtn.click();
      await page.waitForTimeout(900);
      // Brand DNA may start async work when leaving step 5
      if (await page.getByText(/Synthesiz|Analyz|Building Brand|Drafting/i).first().isVisible().catch(() => false)) {
        await page.waitForTimeout(5000);
      }
      if (/Launch GTM/i.test(label)) {
        ok("onboarding:launch-wizard");
        break;
      }
    }

    console.log("\n[3] GTM Wizard — interview questions only → generate strategy");
    await page.waitForTimeout(1000);
    if (!(await page.getByRole("heading", { name: /GTM Wizard/i }).first().isVisible().catch(() => false))) {
      await page.evaluate(() => {
        localStorage.setItem("marqq_onboarding_complete", "1");
        localStorage.setItem("marqq_active_screen", "gtmwizard");
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
    }

    if (await page.getByRole("heading", { name: /GTM Wizard/i }).first().isVisible().catch(() => false)) {
      ok("wizard:visible");
    } else {
      fail("wizard:visible");
      await shot("fail-wizard");
    }
    // Progress strip: Goals → Module → Offer → Audience → Strategy
    if (await page.getByRole("button", { name: /^Goals$/i }).first().isVisible().catch(() => false)) {
      ok("wizard:goals-chip");
    } else {
      fail("wizard:goals-chip", "expected Goals progress chip");
    }
    if (await page.getByText(/Locked from onboarding/i).first().isVisible().catch(() => false)) {
      ok("wizard:locked-answers-card");
    } else {
      fail("wizard:locked-answers-card", "expected Locked from onboarding card");
    }
    await shot("03-wizard-enter");

    let locks = 0;
    for (let i = 0; i < 80; i++) {
      // Final strategy document (strict)
      if (await page.getByRole("heading", { name: /GTM Strategy Document/i }).first().isVisible().catch(() => false)) {
        ok("strategy:document-heading");
        break;
      }
      if (await page.getByText(/North-star goal system/i).first().isVisible().catch(() => false)) {
        ok("strategy:north-star-system-early");
        break;
      }

      if (await page.getByText(/Assembling document|Generating GTM strategy/i).first().isVisible().catch(() => false)) {
        await page.waitForTimeout(2500);
        continue;
      }

      // Section lock CTAs (no mid-flow draft reviews)
      const lockCta = page.getByRole("button", { name: /Lock (Goals|Module|Offer|Audience)/i }).first();
      if (await lockCta.isVisible().catch(() => false)) {
        await lockCta.click();
        locks += 1;
        ok(`wizard:lock-${locks}`);
        await page.waitForTimeout(800);
        continue;
      }

      // Interview options
      const recommended = page.locator("button").filter({ hasText: /recommended|Organic|90 days|Practical|pipeline|LinkedIn|₹0|zero|Growth-stage|mid-market/i });
      if ((await recommended.count()) > 0) {
        await recommended.first().click();
        await page.waitForTimeout(600);
        const cont = page.getByRole("button", { name: /^Continue$/i }).first();
        if (await cont.isVisible().catch(() => false)) await cont.click();
        continue;
      }

      // Generic option click (avoid nav)
      const candidates = page.locator("button.btn");
      const n = await candidates.count();
      let clicked = false;
      for (let j = 0; j < Math.min(n, 20); j++) {
        const t = ((await candidates.nth(j).textContent()) || "").trim();
        if (!t || t.length > 120) continue;
        if (/Back|Export|Regenerate|Start over|Ask|Open|Skip|Sign|Google|SSO|Logout|Goals|Module|Offer|Audience|Strategy/i.test(t)) continue;
        if (/Lock |Continue/i.test(t)) continue;
        await candidates.nth(j).click();
        clicked = true;
        await page.waitForTimeout(500);
        break;
      }
      if (!clicked) await page.waitForTimeout(2000);
    }

    await shot("04-strategy-attempt");

    console.log("\n[4] Strategy document assertions");
    const docOk = await page
      .getByRole("heading", { name: /GTM Strategy Document/i })
      .first()
      .waitFor({ state: "visible", timeout: 300_000 })
      .then(() => true)
      .catch(() => false);

    if (docOk) ok("strategy:document-visible");
    else fail("strategy:document-visible", "never reached GTM Strategy Document heading");

    if (await page.getByText(/North-star goal system/i).first().isVisible().catch(() => false)) {
      ok("strategy:north-star-card");
    } else {
      fail("strategy:north-star-card", "expected North-star goal system card");
    }

    const depthHit = await page
      .getByText(/Definition:|Metric tree|Do not optimize|contributing metrics|Ultimate outcome|Archetype:/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (depthHit) ok("strategy:goal-alignment-depth");
    else fail("strategy:goal-alignment-depth");

    if (await page.getByRole("button", { name: /Export Markdown/i }).first().isVisible().catch(() => false)) {
      ok("strategy:export-markdown");
    } else {
      fail("strategy:export-markdown");
    }

    if (await page.getByRole("button", { name: /Export PDF/i }).first().isVisible().catch(() => false)) {
      ok("strategy:export-pdf");
    } else {
      fail("strategy:export-pdf");
    }

    // Section contribution chip in split view
    if (await page.getByText(/Contribution to North Star/i).first().isVisible().catch(() => false)) {
      ok("strategy:section-contribution");
    } else {
      // may need clicking a section first
      const firstSection = page.locator("button").filter({ hasText: /Market analysis|Executive summary|Target customer/i }).first();
      if (await firstSection.isVisible().catch(() => false)) {
        await firstSection.click();
        await page.waitForTimeout(500);
      }
      if (await page.getByText(/Contribution to North Star/i).first().isVisible().catch(() => false)) {
        ok("strategy:section-contribution");
      } else {
        fail("strategy:section-contribution");
      }
    }

    await shot("05-strategy-final");

    const fatalUi = consoleErrors.filter(
      (e) => !/favicon|Download the React DevTools|supabase|net::ERR|ResizeObserver/i.test(e)
    );
    if (fatalUi.length === 0) ok("ui:no-fatal-console-errors");
    else fail("ui:no-fatal-console-errors", fatalUi.slice(0, 4).join(" | "));
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mdPath = join(OUT_DIR, `ui-onboarding-gtm-smoke-${stamp}.md`);
  writeFileSync(join(OUT_DIR, `ui-onboarding-gtm-smoke-${stamp}.json`), JSON.stringify({ passed, failed, results }, null, 2));
  writeFileSync(
    mdPath,
    [
      `# UI onboarding → GTM strategy smoke`,
      "",
      `- Base: ${BASE_UI}`,
      `- Result: ${failed === 0 ? "PASS" : "FAIL"} (${passed}/${passed + failed})`,
      "",
      ...results.map((r) => `- ${r.status.toUpperCase()} ${r.name}${r.detail ? `: ${r.detail}` : ""}`),
      "",
    ].join("\n")
  );
  console.log(`\n${failed === 0 ? "PASS" : `FAIL (${failed})`} — ${passed}/${passed + failed} checks`);
  console.log(`wrote ${mdPath}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
