#!/usr/bin/env node
/**
 * UI: signup → Elevate onboarding (theelevate.co.in) → GTM wizard → full strategy doc.
 *
 *   BASE_UI=http://localhost:5179 node scripts/e2e-ui-elevate-onboarding-strategy.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE_UI = String(process.env.BASE_UI || "http://localhost:5179").replace(/\/$/, "");

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

    // On review with loader gone — require a real scrape, not the placeholder stub
    const rerun = page.getByRole("button", { name: /Re-run|Fetch Brand DNA/i }).first();
    const rerunDisabled = await rerun.isDisabled().catch(() => false);
    const summary = page.locator("textarea").first();
    const summaryVal = (await summary.inputValue().catch(() => "")) || "";
    const placeholder = /empowers mid-tier leaders|accelerate growth through innovative solutions/i.test(summaryVal);
    const tagline = page.getByPlaceholder(/One-line brand promise/i).first();
    const taglineVal = (await tagline.inputValue().catch(() => "")) || "";
    if (!rerunDisabled && summaryVal.length >= 80 && !placeholder) {
      if (shotFn) await shotFn("02b-brand-dna-ready");
      console.log(`  ✓ Brand DNA ready (${summaryVal.length} summary chars${taglineVal ? `, tagline="${taglineVal.slice(0, 40)}"` : ""})`);
      return { ok: true, sawFetch, summaryChars: summaryVal.length, tagline: taglineVal };
    }
    if (!rerunDisabled && (placeholder || summaryVal.length < 40)) {
      // Thin stub — click Re-run / Fetch and keep waiting
      if (await rerun.isVisible().catch(() => false)) {
        console.log("  … Brand DNA looks like a stub — re-running fetch");
        await rerun.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2000);
      }
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
  const email = `elevate.ui.${Date.now()}@marqq.test`;
  const password = "ElevateTest123!";

  const shot = async (name) => {
    const path = join(OUT_DIR, `elevate-ui-${name}.png`);
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

    await page.locator("#su-name, input").filter({ hasNot: page.locator('[type=password]') }).first().fill("Elevate UI Smoke").catch(async () => {
      const inputs = page.locator("input");
      const n = await inputs.count();
      // name, email, password, confirm — fill by order of visible text fields
      for (let i = 0; i < n; i++) {
        const t = await inputs.nth(i).getAttribute("type");
        const id = await inputs.nth(i).getAttribute("id");
        if (id === "su-name" || (!t && i === 0) || t === "text") {
          await inputs.nth(i).fill("Elevate UI Smoke");
          break;
        }
      }
    });

    // Prefer labeled fields
    const nameInput = page.locator("#su-name").or(page.getByLabel(/Full name|Name/i)).first();
    if (await nameInput.isVisible().catch(() => false)) await nameInput.fill("Elevate UI Smoke");
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

    console.log("\n[2] Fill Elevate onboarding");
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
    }, ELEVATE);
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
        await fillByLabel(page, /Company/i, ELEVATE.companyName);
        await fillByLabel(page, /Website|URL/i, ELEVATE.website);
        // fallback first inputs
        const inputs = page.locator("input.input, input");
        if ((await inputs.count()) >= 1) {
          const v0 = await inputs.nth(0).inputValue().catch(() => "");
          if (!v0) await inputs.nth(0).fill(ELEVATE.companyName);
        }
        if ((await inputs.count()) >= 2) {
          const v1 = await inputs.nth(1).inputValue().catch(() => "");
          if (!v1) await inputs.nth(1).fill(ELEVATE.website);
        }
      }
      if (step === 2) {
        await fillByLabel(page, /Niche|Industry/i, ELEVATE.niche);
        await fillByLabel(page, /ICP|customer/i, ELEVATE.icp);
      }
      if (step === 3) {
        await fillByLabel(page, /Outcome|goal/i, ELEVATE.outcome);
        await fillByLabel(page, /Window|Timeline|days/i, ELEVATE.timeWindow);
        await fillByLabel(page, /Target/i, ELEVATE.target);
        await fillByLabel(page, /Baseline/i, ELEVATE.baseline);
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
    for (let i = 0; i < 180; i++) {
      await dismissOverlays(page);
      if (await isStrategyDocumentVisible(page)) {
        ok("strategy:document");
        break;
      }
      if (await page.getByText(/Assembling document|Generating GTM strategy/i).first().isVisible().catch(() => false)) {
        await page.waitForTimeout(3000);
        continue;
      }
      const lockCta = page.getByRole("button", { name: /Lock (execution choices|Module|Offer|audience refinement|Goals)/i }).first();
      if (await lockCta.isVisible().catch(() => false)) {
        await safeClick(lockCta);
        locks += 1;
        ok(`wizard:lock-${locks}`);
        await page.waitForTimeout(900);
        continue;
      }

      if (await page.getByText(/Generating options for your company/i).first().isVisible().catch(() => false)) {
        if (i % 4 === 0) console.log("  … waiting for AI options");
        await page.waitForTimeout(2000);
        continue;
      }
      const retryOpts = page.getByRole("button", { name: /Retry AI options/i }).first();
      if (await retryOpts.isVisible().catch(() => false)) {
        console.log("  … retry AI options");
        await safeClick(retryOpts);
        await page.waitForTimeout(2500);
        continue;
      }

      const questionHeading = page
        .locator("h4")
        .filter({ hasText: /\?/ })
        .filter({ hasNotText: /^GTM Strategy Document$/i })
        .first();
      if (!(await questionHeading.isVisible().catch(() => false))) {
        if (i % 5 === 0) {
          const headings = await page.locator("h4").allTextContents().catch(() => []);
          console.log(`  … no active question heading [${headings.join(" | ")}]`);
        }
        await page.waitForTimeout(1200);
        continue;
      }
      const questionPanel = questionHeading.locator("xpath=..");
      const question = (await questionHeading.textContent().catch(() => "")).trim();
      console.log(`  … answering: ${question}`);
      const customAnswers = [
        [/What are you building|go-to-market plan for/i, "Management strategy and AI transformation consulting"],
        [/What should we call this offer/i, "Elevate strategy-to-execution"],
        [/What does this specific offer do/i, "Helps growth-stage companies turn strategy into measurable digital transformation outcomes"],
        [/Where would a buyer put you/i, "Strategy and AI transformation partner"],
        [/Who uses, chooses, or influences/i, "CEOs, COOs, and transformation leaders at mid-market companies"],
        [/What are they trying to accomplish/i, "Execute a credible AI and digital transformation roadmap with measurable business impact"],
        [/What usually causes them/i, "Strategy decks that never ship, failed pilots, or pressure to show AI ROI"],
        [/Who is not a good fit/i, "Early-stage startups or companies seeking only staff augmentation"],
      ];
      const custom = customAnswers.find(([re]) => re.test(question));
      const serviceOpt = questionPanel
        .getByRole("button", { name: /^(Service|Consulting|B2B services|Advisory|Professional services)\b/i })
        .first();
      const fullPlan = questionPanel.getByRole("button", { name: /Full strategic plan/i }).first();
      const customInput = page.getByPlaceholder(/type your own/i).first();
      const submitCustom = page.getByRole("button", { name: /Submit custom answer/i }).first();

      if (/How detailed should/i.test(question) && (await fullPlan.isVisible().catch(() => false))) {
        await safeClick(fullPlan);
      } else if (/What are you building|go-to-market plan for/i.test(question) && (await serviceOpt.isVisible().catch(() => false))) {
        await safeClick(serviceOpt);
      } else if (custom && (await customInput.isVisible().catch(() => false))) {
        await customInput.fill("");
        await customInput.fill(custom[1]);
        await customInput.press("Enter").catch(() => {});
        if (await submitCustom.isEnabled().catch(() => false)) {
          await safeClick(submitCustom);
        } else {
          const fallback = questionPanel.locator("button.btn-secondary").first();
          if (await fallback.isVisible().catch(() => false)) await safeClick(fallback);
        }
      } else {
        const optionButtons = questionPanel.locator("button.btn-secondary, button").filter({
          hasNotText: /Continue with|Submit custom|Lock|Generate strategy|Retry AI|Add module/i,
        });
        if (!(await optionButtons.count())) {
          if (i % 5 === 0) console.log(`  … active question has no options: ${question}`);
          await page.waitForTimeout(1200);
          continue;
        }
        await safeClick(optionButtons.first());
      }
      await page.waitForTimeout(900);

      const multiContinue = questionPanel.getByRole("button", { name: /^Continue with \d+ selected$/i }).first();
      if (await multiContinue.isVisible().catch(() => false)) {
        await safeClick(multiContinue);
        await page.waitForTimeout(900);
      }
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
      `# Elevate UI onboarding → strategy`,
      ``,
      `- URL: ${BASE_UI}`,
      `- Company: ${ELEVATE.companyName}`,
      `- Website: ${ELEVATE.website}`,
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

    const mdPath = join(OUT_DIR, `elevate-ui-strategy-${stamp}.md`);
    writeFileSync(mdPath, md);
    writeFileSync(join(OUT_DIR, `elevate-ui-strategy-${stamp}.json`), JSON.stringify({ strategy, sectionReport, results }, null, 2));
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
