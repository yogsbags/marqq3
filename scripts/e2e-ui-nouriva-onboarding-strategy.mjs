#!/usr/bin/env node
/**
 * UI: signup → Nouriva AI onboarding (nouriva.tech) → GTM wizard → full strategy doc.
 *
 *   BASE_UI=http://localhost:5179 node scripts/e2e-ui-nouriva-onboarding-strategy.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE_UI = String(process.env.BASE_UI || "http://localhost:5179").replace(/\/$/, "");

const NOURIVA = {
  companyName: "Nouriva AI",
  website: "https://nouriva.tech",
  niche: "Consumer health & nutrition AI app (lab-personalized meal scoring)",
  icp: "Indians managing diabetes, PCOS, thyroid, hypertension, or vitamin deficiencies who want meal guidance beyond calorie counting — built for Indian kitchens",
  outcome: "Grow paid conversions from trial users who upload labs or set conditions",
  timeWindow: "90 days",
  target: "200 paid conversions / month",
  baseline: "organic installs + trial starts; paid conversion rate to be instrumented",
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

const results = [];
function ok(name, detail = "") {
  results.push({ name, status: "pass", detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, status: "fail", detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function dismissOverlays(page) {
  // Workspace / search / profile modals sometimes sit on top of the wizard
  for (let i = 0; i < 3; i++) {
    const overlay = page.locator(".modal-overlay").first();
    if (!(await overlay.isVisible().catch(() => false))) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const close = page.getByRole("button", { name: /Close|Cancel|Done|Got it|Skip/i }).first();
    if (await close.isVisible().catch(() => false)) {
      await close.click({ force: true }).catch(() => {});
    }
    // click outside if still present
    if (await overlay.isVisible().catch(() => false)) {
      await overlay.click({ position: { x: 8, y: 8 }, force: true }).catch(() => {});
    }
    await page.waitForTimeout(200);
  }
}

async function safeClick(locator) {
  await locator.click({ force: true, timeout: 15_000 });
}

/** Wait until Brand DNA fetch finishes on step 6 (loader gone, review form ready). */
async function waitForBrandDnaComplete(page, { timeoutMs = 180_000, shotFn = null } = {}) {
  const start = Date.now();
  let sawFetch = false;
  let missed = 0;
  while (Date.now() - start < timeoutMs) {
    const fetching = await page
      .getByText(/Fetching your Brand DNA|Fetching Brand DNA|Synthesizing with AI|Running AI Brand DNA/i)
      .first()
      .isVisible()
      .catch(() => false);
    const review = await page
      .getByRole("heading", { name: /Review your Brand DNA/i })
      .first()
      .isVisible()
      .catch(() => false);
    const ctaBusy = await page
      .getByRole("button", { name: /Fetching Brand DNA/i })
      .first()
      .isVisible()
      .catch(() => false);

    if (!review && !fetching && !ctaBusy) {
      missed += 1;
      if (missed >= 3) return { ok: false, sawFetch, summaryChars: 0 };
      await page.waitForTimeout(800);
      continue;
    }
    missed = 0;

    if (fetching || ctaBusy) {
      sawFetch = true;
      console.log("  … Brand DNA fetch in progress");
      await page.waitForTimeout(2500);
      continue;
    }

    // On review with loader gone
    const rerun = page.getByRole("button", { name: /Re-run/i }).first();
    const rerunDisabled = await rerun.isDisabled().catch(() => false);
    const summary = page.locator("textarea").first();
    const summaryVal = (await summary.inputValue().catch(() => "")) || "";
    if (!rerunDisabled) {
      if (shotFn) await shotFn("02b-brand-dna-ready");
      console.log(`  ✓ Brand DNA ready (${summaryVal.length} summary chars)`);
      return { ok: true, sawFetch, summaryChars: summaryVal.length };
    }
    await page.waitForTimeout(1500);
  }
  throw new Error("Brand DNA fetch timed out");
}

async function fillByLabel(page, labelRe, value) {
  const field = page.locator(".field").filter({ hasText: labelRe }).locator("input, textarea").first();
  if (await field.count()) {
    await field.fill(value);
    return true;
  }
  return false;
}

function isStrategyDocumentVisible(page) {
  return page
    .getByRole("heading", { name: /^GTM Strategy Document$/i })
    .first()
    .isVisible()
    .catch(() => false);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const email = `nouriva.ui.${Date.now()}@marqq.test`;
  const password = "NourivaTest123!";

  const shot = async (name) => {
    const path = join(OUT_DIR, `nouriva-ui-${name}.png`);
    await page.screenshot({ path, fullPage: true });
    console.log(`  📸 ${path}`);
    return path;
  };

  try {
    console.log(`\n[1] Open ${BASE_UI} → Sign up`);
    await page.goto(BASE_UI, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) keys.push(k);
      }
      for (const k of keys) {
        if (k.startsWith("marqq_") || k.startsWith("sb-")) localStorage.removeItem(k);
      }
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);

    // Go to signup
    const signupLink = page.getByRole("link", { name: /Sign up|Create/i }).or(page.getByText(/Sign up/i)).first();
    if (await signupLink.isVisible().catch(() => false)) {
      await signupLink.click();
      await page.waitForTimeout(600);
    } else {
      await page.evaluate(() => localStorage.setItem("marqq_active_screen", "signup"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
    }

    await page.locator("#su-name, input").filter({ hasNot: page.locator('[type=password]') }).first().fill("Nouriva UI Smoke").catch(async () => {
      const inputs = page.locator("input");
      const n = await inputs.count();
      // name, email, password, confirm — fill by order of visible text fields
      for (let i = 0; i < n; i++) {
        const t = await inputs.nth(i).getAttribute("type");
        const id = await inputs.nth(i).getAttribute("id");
        if (id === "su-name" || (!t && i === 0) || t === "text") {
          await inputs.nth(i).fill("Nouriva UI Smoke");
          break;
        }
      }
    });

    // Prefer labeled fields
    const nameInput = page.locator("#su-name").or(page.getByLabel(/Full name|Name/i)).first();
    if (await nameInput.isVisible().catch(() => false)) await nameInput.fill("Nouriva UI Smoke");
    const emailInput = page.locator("#su-email").or(page.getByLabel(/Email/i)).first();
    if (await emailInput.isVisible().catch(() => false)) await emailInput.fill(email);
    else {
      await page.locator('input[type="email"]').first().fill(email);
    }
    const passInputs = page.locator('input[type="password"]');
    if ((await passInputs.count()) >= 1) await passInputs.nth(0).fill(password);
    if ((await passInputs.count()) >= 2) await passInputs.nth(1).fill(password);

    await shot("01-signup");
    await page.getByRole("button", { name: /Create account|Sign up|Register/i }).first().click();
    await page.waitForTimeout(2500);

    // Wait for onboarding
    const landed =
      (await page.getByText(/Step\s+1\s+of\s+8/i).first().isVisible().catch(() => false)) ||
      (await page.getByText(/Welcome|Brand DNA|Company/i).first().isVisible().catch(() => false));
    if (landed) ok("signup→onboarding");
    else {
      // email confirm may be required — try force onboarding if session exists
      const hasSession = await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.includes("auth")));
      if (hasSession) {
        await page.evaluate(() => {
          localStorage.setItem("marqq_active_screen", "onboarding");
          localStorage.removeItem("marqq_onboarding_complete");
        });
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1200);
      }
      if (await page.getByText(/Step\s+\d+\s+of\s+8/i).first().isVisible().catch(() => false)) ok("signup→onboarding");
      else {
        fail("signup→onboarding", await page.locator("body").innerText().then((t) => t.slice(0, 200)).catch(() => ""));
        await shot("fail-signup");
      }
    }

    console.log("\n[2] Fill Nouriva onboarding");
    // Pre-seed localStorage fields then reload so inputs pick them up if controlled slowly
    await page.evaluate((data) => {
      localStorage.setItem("marqq_ob_companyName", data.companyName);
      localStorage.setItem("marqq_ob_website", data.website);
      localStorage.setItem("marqq_ob_niche", data.niche);
      localStorage.setItem("marqq_ob_icp", data.icp);
      localStorage.setItem("marqq_ob_outcome", data.outcome);
      localStorage.setItem("marqq_ob_timeWindow", data.timeWindow);
      localStorage.setItem("marqq_ob_target", data.target);
      localStorage.setItem("marqq_ob_baseline", data.baseline);
      localStorage.setItem("marqq_onboarding_step", "1");
      localStorage.setItem("marqq_active_screen", "onboarding");
    }, NOURIVA);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await shot("02-onboarding-seeded");

    // Click through steps, ensuring company/website filled on step 1
    let brandDnaOk = false;
    for (let guard = 0; guard < 28; guard++) {
      const stepText =
        (await page.getByText(/Step\s+(\d+)\s+of\s+8/i).first().textContent().catch(() => "")) || "";
      const step = Number((stepText.match(/Step\s+(\d+)/i) || [])[1] || 0);
      console.log(`  … ${stepText.trim() || "(no step)"}`);

      if (step === 1 || step === 0) {
        await fillByLabel(page, /Company/i, NOURIVA.companyName);
        await fillByLabel(page, /Website|URL/i, NOURIVA.website);
        // fallback first inputs
        const inputs = page.locator("input.input, input");
        if ((await inputs.count()) >= 1) {
          const v0 = await inputs.nth(0).inputValue().catch(() => "");
          if (!v0) await inputs.nth(0).fill(NOURIVA.companyName);
        }
        if ((await inputs.count()) >= 2) {
          const v1 = await inputs.nth(1).inputValue().catch(() => "");
          if (!v1) await inputs.nth(1).fill(NOURIVA.website);
        }
      }
      if (step === 2) {
        await fillByLabel(page, /Niche|Industry/i, NOURIVA.niche);
        await fillByLabel(page, /ICP|customer/i, NOURIVA.icp);
      }
      if (step === 3) {
        await fillByLabel(page, /Outcome|goal/i, NOURIVA.outcome);
        await fillByLabel(page, /Window|Timeline|days/i, NOURIVA.timeWindow);
        await fillByLabel(page, /Target/i, NOURIVA.target);
        await fillByLabel(page, /Baseline/i, NOURIVA.baseline);
      }

      // Step 6: wait for live Brand DNA scrape/synthesis before Continue
      if (
        !brandDnaOk &&
        (step === 6 ||
          (await page.getByText(/Fetching your Brand DNA|Fetching Brand DNA|Review your Brand DNA/i).first().isVisible().catch(() => false)))
      ) {
        const dna = await waitForBrandDnaComplete(page, { shotFn: shot });
        if (dna.ok) {
          brandDnaOk = true;
          ok("onboarding:brand-dna", `${dna.summaryChars} chars · fetch=${dna.sawFetch}`);
        } else if (step === 6) {
          fail("onboarding:brand-dna", "review screen incomplete");
        }
      }

      const cta = page.getByRole("button", { name: /Continue|Launch GTM Strategy Wizard|Finish|Next|Fetching Brand DNA/i }).first();
      if (!(await cta.isVisible().catch(() => false))) {
        await page.waitForTimeout(2000);
        continue;
      }
      const label = ((await cta.textContent()) || "").trim();
      if (await cta.isDisabled().catch(() => false) || /Fetching Brand DNA/i.test(label)) {
        await page.waitForTimeout(2500);
        continue;
      }
      await cta.click();
      await page.waitForTimeout(1200);
      if (/Launch GTM/i.test(label)) {
        ok("onboarding:launch-wizard");
        break;
      }
      if (step >= 8) break;
    }
    if (!brandDnaOk) fail("onboarding:brand-dna", "never completed Brand DNA step");
    await shot("03-after-onboarding");

    console.log("\n[3] GTM Wizard → strategy document");
    await page.waitForTimeout(1000);
    if (!(await page.getByRole("heading", { name: /GTM Wizard/i }).first().isVisible().catch(() => false))) {
      await page.evaluate(() => {
        localStorage.setItem("marqq_onboarding_complete", "1");
        localStorage.setItem("marqq_active_screen", "gtmwizard");
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
    }
    if (await page.getByRole("heading", { name: /GTM Wizard/i }).first().isVisible().catch(() => false)) {
      ok("wizard:visible");
    } else fail("wizard:visible");
    await shot("04-wizard");

    let locks = 0;
    for (let i = 0; i < 120; i++) {
      await dismissOverlays(page);
      if (await isStrategyDocumentVisible(page)) {
        ok("strategy:document");
        break;
      }
      if (await page.getByText(/Assembling document|Generating GTM strategy/i).first().isVisible().catch(() => false)) {
        await page.waitForTimeout(3000);
        continue;
      }
      // Prefer full document depth when that question appears
      const fullPlan = page.locator("button").filter({ hasText: /Full strategic plan \(all sections\)/i }).first();
      if (await fullPlan.isVisible().catch(() => false)) {
        await safeClick(fullPlan);
        await page.waitForTimeout(400);
        const cont = page.getByRole("button", { name: /^Continue$/i }).first();
        if (await cont.isVisible().catch(() => false)) await safeClick(cont);
        continue;
      }
      const lockCta = page.getByRole("button", { name: /Lock (Goals|Module|Offer|Audience)/i }).first();
      if (await lockCta.isVisible().catch(() => false)) {
        await safeClick(lockCta);
        locks += 1;
        ok(`wizard:lock-${locks}`);
        await page.waitForTimeout(900);
        continue;
      }
      // Prefer recommended option cards
      const recommended = page.locator("button").filter({ hasText: /RECOMMENDED/i });
      if ((await recommended.count()) > 0) {
        await safeClick(recommended.first());
        await page.waitForTimeout(500);
        const cont = page.getByRole("button", { name: /^Continue$/i }).first();
        if (await cont.isVisible().catch(() => false)) await safeClick(cont);
        continue;
      }
      const candidates = page.locator("button.btn");
      const n = await candidates.count();
      let clicked = false;
      let fallbackIdx = -1;
      for (let j = 0; j < Math.min(n, 24); j++) {
        const t = ((await candidates.nth(j).textContent()) || "").trim();
        if (!t || t.length > 140) continue;
        if (/Back|Export|Regenerate|Start over|Ask|Open|Skip|Sign|Google|SSO|Logout|Goals|Module|Offer|Audience|^Strategy$|Market analysis|Positioning|Distribution|Marketing strategy|Sales strategy|Launch plan|Measurement|Risks|Timeline/i.test(t))
          continue;
        if (/Lock |Continue/i.test(t)) continue;
        if (fallbackIdx < 0) fallbackIdx = j;
        if (
          /lab|nutrition|health|biomarker|diabetes|PCOS|consumer|activation|paid users|subscription|freemium|app store|Instagram|ASO|Nouriva|meal|Indian|trial/i.test(
            t
          )
        ) {
          await safeClick(candidates.nth(j));
          clicked = true;
          await page.waitForTimeout(450);
          break;
        }
      }
      if (!clicked && fallbackIdx >= 0) {
        await safeClick(candidates.nth(fallbackIdx));
        clicked = true;
        await page.waitForTimeout(450);
      }
      if (!clicked) await page.waitForTimeout(2000);
    }

    const docOk = await page
      .getByRole("heading", { name: /^GTM Strategy Document$/i })
      .first()
      .waitFor({ state: "visible", timeout: 420_000 })
      .then(() => true)
      .catch(() => false);
    if (docOk) ok("strategy:document-final");
    else fail("strategy:document-final", "never reached GTM Strategy Document");

    await shot("05-strategy-final");

    console.log("\n[4] Extract all strategy sections");
    const strategy = await page.evaluate(() => {
      try {
        const raw = sessionStorage.getItem("marqq_gtm_strategy");
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    });

    const sections = Array.isArray(strategy?.sections) ? strategy.sections : [];
    if (sections.length) ok("strategy:sections", `${sections.length} sections`);
    else fail("strategy:sections", "no sections in sessionStorage");

    const sectionReport = sections.map((s, idx) => {
      const body = String(s.body || s.summary || "").trim();
      const bullets = Array.isArray(s.bullets) ? s.bullets.map(String) : [];
      return {
        index: idx + 1,
        id: s.id,
        title: s.title || s.id,
        bodyPreview: body.slice(0, 280),
        bulletCount: bullets.length,
        bullets: bullets.slice(0, 8),
      };
    });

    // Click through nav buttons if present to screenshot a few sections
    for (const s of sectionReport.slice(0, 6)) {
      const btn = page.locator("button").filter({ hasText: new RegExp(s.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(400);
      }
    }
    await shot("06-strategy-sections");

    const md = [
      `# Nouriva UI onboarding → strategy`,
      ``,
      `- URL: ${BASE_UI}`,
      `- Company: ${NOURIVA.companyName}`,
      `- Website: ${NOURIVA.website}`,
      `- Signup: ${email}`,
      `- Generated: ${new Date().toISOString()}`,
      `- Title: ${strategy?.title || "(none)"}`,
      `- Sections: ${sections.length}`,
      ``,
      `## Results`,
      ...results.map((r) => `- ${r.status === "pass" ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
      ``,
      `## Strategy sections`,
      ...sectionReport.flatMap((s) => [
        `### ${s.index}. ${s.title} (\`${s.id}\`)`,
        ``,
        s.bodyPreview || "_empty_",
        ``,
        ...(s.bullets.length ? s.bullets.map((b) => `- ${b}`) : []),
        ``,
      ]),
    ].join("\n");

    const mdPath = join(OUT_DIR, `nouriva-ui-strategy-${stamp}.md`);
    writeFileSync(mdPath, md);
    writeFileSync(join(OUT_DIR, `nouriva-ui-strategy-${stamp}.json`), JSON.stringify({ strategy, sectionReport, results }, null, 2));
    console.log(`\n📄 ${mdPath}`);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => r.status === "fail").length;
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
