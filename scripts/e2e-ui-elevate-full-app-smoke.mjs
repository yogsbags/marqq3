#!/usr/bin/env node
/**
 * Elevate full UI E2E smoke — theelevate.co.in
 * Signup → onboarding → GTM → strategy → visit EVERY sidebar screen.
 * Drafts only: never click Publish / Go live / Publish now.
 * Continues through failures until all screens are covered.
 *
 *   BASE_UI=http://localhost:5179 node scripts/e2e-ui-elevate-full-app-smoke.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE_UI = String(process.env.BASE_UI || "http://localhost:5179").replace(/\/$/, "");
const API = String(process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");

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

/** Full sidebar inventory (must match Sidebar.jsx). */
const ALL_SCREENS = [
  { id: "command", label: "Command Center", patterns: [/Command|Today|Agent|North Star|insights/i] },
  { id: "chat", label: "Ask Marqq", patterns: [/Ask Marqq|chat|message|Marqq/i] },
  { id: "orchestration", label: "Orchestration", patterns: [/Orchestration|Agent OS|deploy|Activate/i] },
  { id: "approvals", label: "Approvals", patterns: [/Approval|queue|draft|approve/i] },
  { id: "gtmwizard", label: "GTM Wizard", patterns: [/GTM|Wizard|Strategy Document|section/i] },
  { id: "strategy", label: "Strategy", patterns: [/Strategy|GTM|section|North Star/i] },
  { id: "ideas", label: "Marketing Ideas", patterns: [/Idea|marketing|campaign|Generate/i] },
  { id: "pricing", label: "Pricing", patterns: [/Pricing|package|offer|plan/i] },
  { id: "campaigns", label: "Campaigns", patterns: [/Campaign|task|board|pipeline/i] },
  { id: "content", label: "Content", patterns: [/Content|SEO|blog|research|brief|draft/i] },
  { id: "calendar", label: "Calendar", patterns: [/Calendar|Today|Week|Month|Schedule/i] },
  { id: "landingpages", label: "Landing Pages", patterns: [/Landing|page|hero|CTA|draft/i] },
  { id: "leadmagnets", label: "Lead Magnets", patterns: [/Lead magnet|gated|offer|magnet/i] },
  { id: "agents", label: "Agents", patterns: [/Agent|roster|Zara|Maya|Riya|Arjun/i] },
  { id: "market", label: "Market Intelligence", patterns: [/Market|Competitor|research/i] },
  { id: "audiences", label: "Audiences", patterns: [/Audience|ICP|segment|Apollo Signals/i] },
  { id: "brand", label: "Brand Center", patterns: [/Brand|DNA|tagline|voice|logo/i] },
  { id: "seo", label: "SEO", patterns: [/SEO|Search Console|GSC|keyword/i] },
  { id: "analytics", label: "Performance Scorecard", patterns: [/Scorecard|Performance|analytics|KPI|ROAS|traffic/i] },
  { id: "crm", label: "CRM Sync", patterns: [/CRM|Sync|Sheets|destination/i] },
  { id: "customer360", label: "Customer 360", patterns: [/Customer 360|account|segment/i] },
  { id: "outreach", label: "Outreach Studio", patterns: [/Outreach|prospect|Apollo|email|sequence/i] },
  { id: "paid", label: "Paid Media", patterns: [/Paid|Media|ad|budget|plan/i] },
  { id: "social", label: "Social Media", patterns: [/Social|post|channel|compose/i] },
  { id: "creative", label: "Creative Studio", patterns: [/Creative|concept|image|video|ad/i] },
  { id: "voicebot", label: "Voice & Video Bot", patterns: [/Voice|Video|bot|STT|transcri/i] },
  { id: "experiments", label: "Experiments", patterns: [/Experiment|A\/B|hypothesis|variant/i] },
  { id: "reporting", label: "Reporting", patterns: [/Reporting|brief|analytics|report/i] },
  { id: "referrals", label: "Referral Programs", patterns: [/Referral|advocate|invite|program/i] },
  { id: "workflows", label: "Workflows", patterns: [/Workflow|automation|schedule/i] },
  { id: "tasks", label: "Tasks", patterns: [/Task|board|due|status/i] },
  { id: "evaluations", label: "Evaluations", patterns: [/Evaluation|roster|score|run/i] },
  { id: "knowledge", label: "Knowledge Base", patterns: [/Knowledge|file|upload|document/i] },
  { id: "files", label: "Workspace Files", patterns: [/Workspace Files|file|upload|KB/i] },
  { id: "integrations", label: "Integrations", patterns: [/Integration|Composio|connect|Apollo|Gmail/i] },
  { id: "billing", label: "Billing", patterns: [/Billing|credits|plan|usage/i] },
  { id: "admin", label: "Administration", patterns: [/Admin|Security|seat|settings/i] },
  { id: "help", label: "Help & Support", patterns: [/Help|Support|status|docs/i] },
];

const FORBIDDEN_CTA = /Publish now|Publish live|Go live|Send now|Send email|Post live|Launch campaign|Spend|Buy credits/i;
const DRAFT_SAFE_CTA =
  /Save draft|Schedule|Research|Brief|Draft|Generate|Create|Add|New|Run|Refresh|Poll|Sync|Activate|Tick|Continue|Lock|Concept|Compose|Plan|Fetch|Upload|Edit|Pause|Resume|Open|Use in Outreach/i;

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

async function dismissOverlays(page) {
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    const overlay = page.locator(".modal-overlay").first();
    if (await overlay.isVisible().catch(() => false)) {
      await overlay.click({ position: { x: 8, y: 8 }, force: true }).catch(() => {});
    }
    const close = page.getByRole("button", { name: /Close|Cancel|Done|Got it|Skip|Dismiss/i }).first();
    if (await close.isVisible().catch(() => false)) await close.click({ force: true }).catch(() => {});
    await page.waitForTimeout(150);
  }
}

async function safeClick(locator) {
  await locator.click({ force: true, timeout: 15_000 });
}

async function fillByLabel(page, labelRe, value) {
  const field = page.locator(".field").filter({ hasText: labelRe }).locator("input, textarea").first();
  if (await field.count()) {
    await field.fill(value);
    return true;
  }
  return false;
}

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
      note("Brand DNA fetch in progress");
      await page.waitForTimeout(2500);
      continue;
    }
    const rerun = page.getByRole("button", { name: /Re-run/i }).first();
    const rerunDisabled = await rerun.isDisabled().catch(() => false);
    const summaryVal = (await page.locator("textarea").first().inputValue().catch(() => "")) || "";
    if (!rerunDisabled) {
      if (shotFn) await shotFn("brand-dna-ready");
      return { ok: true, sawFetch, summaryChars: summaryVal.length };
    }
    await page.waitForTimeout(1500);
  }
  throw new Error("Brand DNA fetch timed out");
}

function isStrategyDocumentVisible(page) {
  return page
    .getByRole("heading", { name: /^GTM Strategy Document$/i })
    .first()
    .isVisible()
    .catch(() => false);
}

async function goScreen(page, label, key) {
  await dismissOverlays(page);
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

/** Click first visible draft-safe CTA; never forbidden publish/live CTAs. */
async function clickDraftSafe(page, preferredRe = null) {
  const buttons = page.locator("main button, main .btn");
  const n = await buttons.count();
  const preferred = [];
  const safe = [];
  for (let i = 0; i < Math.min(n, 40); i++) {
    const btn = buttons.nth(i);
    if (!(await btn.isVisible().catch(() => false))) continue;
    if (await btn.isDisabled().catch(() => true)) continue;
    const t = ((await btn.textContent()) || "").trim();
    if (!t || t.length > 80) continue;
    if (FORBIDDEN_CTA.test(t)) continue;
    if (preferredRe && preferredRe.test(t)) preferred.push(btn);
    else if (DRAFT_SAFE_CTA.test(t)) safe.push(btn);
  }
  const target = preferred[0] || safe[0];
  if (!target) return null;
  const label = ((await target.textContent()) || "").trim();
  await safeClick(target);
  await page.waitForTimeout(800);
  return label;
}

async function exerciseDraftActions(page, screenId) {
  await dismissOverlays(page);
  switch (screenId) {
    case "content": {
      const start = await clickDraftSafe(page, /Start|New|Create|Research|SEO/i);
      if (start) ok("draft:content-start", start);
      await page.waitForTimeout(2000);
      const research = await clickDraftSafe(page, /Research/i);
      if (research) {
        ok("draft:content-research", research);
        await page.waitForTimeout(8000);
      }
      break;
    }
    case "creative": {
      const start = await clickDraftSafe(page, /Start|New|Create|Concept/i);
      if (start) ok("draft:creative-start", start);
      await page.waitForTimeout(1500);
      break;
    }
    case "social": {
      const start = await clickDraftSafe(page, /Start|New|Compose|Brief/i);
      if (start) ok("draft:social-start", start);
      break;
    }
    case "paid": {
      const start = await clickDraftSafe(page, /Start|New|Plan|Create/i);
      if (start) ok("draft:paid-start", start);
      break;
    }
    case "landingpages": {
      const start = await clickDraftSafe(page, /Start|New|Generate|Create/i);
      if (start) ok("draft:landing-start", start);
      break;
    }
    case "leadmagnets": {
      const start = await clickDraftSafe(page, /Start|New|Generate|Create|Design/i);
      if (start) ok("draft:leadmagnet-start", start);
      break;
    }
    case "outreach": {
      const fetchBtn = await clickDraftSafe(page, /Fetch|Start|New run|Apollo/i);
      if (fetchBtn) ok("draft:outreach-fetch", fetchBtn);
      break;
    }
    case "calendar": {
      const week = page.getByRole("button", { name: /^week$/i }).first();
      if (await week.isVisible().catch(() => false)) {
        await week.click();
        ok("draft:calendar-week");
      }
      break;
    }
    case "market": {
      const refresh = await clickDraftSafe(page, /Refresh|Research|Run/i);
      if (refresh) {
        ok("draft:market-refresh", refresh);
        await page.waitForTimeout(5000);
      }
      break;
    }
    case "audiences": {
      // Don't full Apollo poll for every account here — just assert panel + optional light poll
      const poll = page.getByRole("button", { name: /Poll Apollo|Refresh signals/i }).first();
      if (await poll.isVisible().catch(() => false)) {
        await poll.click();
        ok("draft:apollo-poll-clicked");
        const start = Date.now();
        while (Date.now() - start < 90_000) {
          const t = ((await poll.textContent()) || "").trim();
          if (!/Polling/i.test(t)) break;
          await page.waitForTimeout(2000);
        }
      }
      break;
    }
    case "brand": {
      const edit = await clickDraftSafe(page, /Edit|Save|Brand DNA/i);
      if (edit) ok("draft:brand-action", edit);
      break;
    }
    case "crm": {
      // Sync with empty may fail — just ensure button exists
      const sync = page.getByRole("button", { name: /Sync/i }).first();
      if (await sync.isVisible().catch(() => false)) ok("draft:crm-sync-visible");
      break;
    }
    case "orchestration": {
      const act = await clickDraftSafe(page, /Activate|Tick|Run/i);
      if (act) ok("draft:orchestration", act);
      break;
    }
    case "workflows": {
      const act = await clickDraftSafe(page, /Run now|Pause|Resume|Create/i);
      if (act) ok("draft:workflows", act);
      break;
    }
    case "experiments":
    case "referrals": {
      const add = await clickDraftSafe(page, /Add|Create|New/i);
      if (add) ok(`draft:${screenId}-create`, add);
      break;
    }
    case "files":
    case "knowledge": {
      const up = page.getByRole("button", { name: /Upload|Add|New/i }).first();
      if (await up.isVisible().catch(() => false)) ok(`draft:${screenId}-upload-visible`);
      break;
    }
    case "evaluations": {
      const run = await clickDraftSafe(page, /Run|Evaluate|Tick/i);
      if (run) ok("draft:evaluations", run);
      break;
    }
    case "ideas": {
      const gen = await clickDraftSafe(page, /Generate|Refresh|Ideas/i);
      if (gen) {
        ok("draft:ideas", gen);
        await page.waitForTimeout(6000);
      }
      break;
    }
    case "voicebot": {
      const any = await clickDraftSafe(page, /Record|Transcribe|Analyze|Start/i);
      if (any) ok("draft:voicebot", any);
      break;
    }
    case "approvals": {
      // Do not approve/reject live — just open
      ok("draft:approvals-view-only");
      break;
    }
    default:
      break;
  }
  await dismissOverlays(page);
}

async function runOnboardingAndStrategy(page, shot, email, password) {
  console.log("\n=== PHASE 1: Signup → Elevate onboarding → GTM strategy ===\n");
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
  await page.waitForTimeout(600);

  const signupLink = page.getByRole("link", { name: /Sign up|Create/i }).or(page.getByText(/Sign up/i)).first();
  if (await signupLink.isVisible().catch(() => false)) await signupLink.click();
  else {
    await page.evaluate(() => localStorage.setItem("marqq_active_screen", "signup"));
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForTimeout(500);

  const nameInput = page.locator("#su-name").or(page.getByLabel(/Full name|Name/i)).first();
  if (await nameInput.isVisible().catch(() => false)) await nameInput.fill("Elevate Full UI Smoke");
  const emailInput = page.locator("#su-email").or(page.getByLabel(/Email/i)).first();
  if (await emailInput.isVisible().catch(() => false)) await emailInput.fill(email);
  else await page.locator('input[type="email"]').first().fill(email);
  const passInputs = page.locator('input[type="password"]');
  if ((await passInputs.count()) >= 1) await passInputs.nth(0).fill(password);
  if ((await passInputs.count()) >= 2) await passInputs.nth(1).fill(password);
  await shot("01-signup");
  await page.getByRole("button", { name: /Create account|Sign up|Register/i }).first().click();
  await page.waitForTimeout(2500);

  let landed =
    (await page.getByText(/Step\s+\d+\s+of\s+8/i).first().isVisible().catch(() => false)) ||
    (await page.getByText(/Welcome|Brand DNA|Company/i).first().isVisible().catch(() => false));
  if (!landed) {
    const hasSession = await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.includes("auth"))
    );
    if (hasSession) {
      await page.evaluate(() => {
        localStorage.setItem("marqq_active_screen", "onboarding");
        localStorage.removeItem("marqq_onboarding_complete");
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      landed = await page.getByText(/Step\s+\d+\s+of\s+8/i).first().isVisible().catch(() => false);
    }
  }
  if (landed) ok("signup→onboarding");
  else fail("signup→onboarding", (await bodyText(page)).slice(0, 200));

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

  let brandDnaOk = false;
  for (let guard = 0; guard < 32; guard++) {
    const stepText =
      (await page.getByText(/Step\s+(\d+)\s+of\s+8/i).first().textContent().catch(() => "")) || "";
    const step = Number((stepText.match(/Step\s+(\d+)/i) || [])[1] || 0);
    note(stepText.trim() || "(no step)");

    if (step === 1 || step === 0) {
      await fillByLabel(page, /Company/i, ELEVATE.companyName);
      await fillByLabel(page, /Website|URL/i, ELEVATE.website);
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

    if (
      !brandDnaOk &&
      (step === 6 ||
        (await page
          .getByText(/Fetching your Brand DNA|Fetching Brand DNA|Review your Brand DNA/i)
          .first()
          .isVisible()
          .catch(() => false)))
    ) {
      try {
        const dna = await waitForBrandDnaComplete(page, { shotFn: shot });
        if (dna.ok) {
          brandDnaOk = true;
          ok("onboarding:brand-dna", `${dna.summaryChars} chars`);
        } else if (step === 6) fail("onboarding:brand-dna", "incomplete");
      } catch (err) {
        fail("onboarding:brand-dna", err.message);
      }
    }

    const cta = page
      .getByRole("button", { name: /Continue|Launch GTM Strategy Wizard|Finish|Next|Fetching Brand DNA/i })
      .first();
    if (!(await cta.isVisible().catch(() => false))) {
      await page.waitForTimeout(2000);
      continue;
    }
    const label = ((await cta.textContent()) || "").trim();
    if ((await cta.isDisabled().catch(() => false)) || /Fetching Brand DNA/i.test(label)) {
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
  if (!brandDnaOk) fail("onboarding:brand-dna", "never completed");
  await shot("03-after-onboarding");

  console.log("\n[GTM Wizard → strategy]");
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
  for (let i = 0; i < 140; i++) {
    await dismissOverlays(page);
    if (await isStrategyDocumentVisible(page)) {
      ok("strategy:document");
      break;
    }
    if (await page.getByText(/Assembling document|Generating GTM strategy/i).first().isVisible().catch(() => false)) {
      await page.waitForTimeout(3000);
      continue;
    }
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
    for (let j = 0; j < Math.min(n, 24); j++) {
      const t = ((await candidates.nth(j).textContent()) || "").trim();
      if (!t || t.length > 140) continue;
      if (
        /Back|Export|Regenerate|Start over|Ask|Open|Skip|Sign|Google|SSO|Logout|Goals|Module|Offer|Audience|^Strategy$|Market analysis|Positioning|Distribution|Marketing strategy|Sales strategy|Launch plan|Measurement|Risks|Timeline|Publish|Go live/i.test(
          t
        )
      )
        continue;
      if (/Lock |Continue/i.test(t)) continue;
      await safeClick(candidates.nth(j));
      clicked = true;
      await page.waitForTimeout(450);
      break;
    }
    if (!clicked) await page.waitForTimeout(2000);
  }

  const docOk = await page
    .getByRole("heading", { name: /^GTM Strategy Document$/i })
    .first()
    .waitFor({ state: "visible", timeout: 480_000 })
    .then(() => true)
    .catch(() => false);
  if (docOk) ok("strategy:document-final");
  else fail("strategy:document-final", "never reached document — continuing to screens anyway");
  await shot("05-strategy");

  const strategy = await page.evaluate(() => {
    try {
      return JSON.parse(sessionStorage.getItem("marqq_gtm_strategy") || "null");
    } catch {
      return null;
    }
  });
  const sections = Array.isArray(strategy?.sections) ? strategy.sections : [];
  if (sections.length) ok("strategy:sections", `${sections.length}`);
  else fail("strategy:sections", "empty");

  // Pin Elevate branding into workspace for remaining screens
  await page.evaluate((data) => {
    localStorage.setItem("marqq_onboarding_complete", "1");
    localStorage.setItem("marqq_ob_companyName", data.companyName);
    localStorage.setItem("marqq_ob_website", data.website);
    localStorage.setItem("marqq_ob_niche", data.niche);
    localStorage.setItem("marqq_ob_icp", data.icp);
  }, ELEVATE);

  return { strategy, sections };
}

async function runAllScreens(page, shot) {
  console.log("\n=== PHASE 2: Visit every screen (drafts only) ===\n");
  const covered = [];
  for (const screen of ALL_SCREENS) {
    console.log(`\n[${screen.id}] ${screen.label}`);
    try {
      const via = await goScreen(page, screen.label, screen.id);
      await page.waitForTimeout(500);
      const body = await bodyText(page);
      const hit = screen.patterns.some((re) => re.test(body));
      if (hit) ok(`screen:${screen.id}`, via);
      else {
        fail(`screen:${screen.id}`, body.replace(/\s+/g, " ").slice(0, 180));
        await shot(`fail-${screen.id}`);
      }

      // Assert no accidental live publish CTA was auto-clicked (sanity)
      const forbiddenVisible = await page
        .getByRole("button", { name: FORBIDDEN_CTA })
        .first()
        .isVisible()
        .catch(() => false);
      if (forbiddenVisible) note(`${screen.id}: live CTA visible (not clicked)`);

      await exerciseDraftActions(page, screen.id);
      covered.push(screen.id);
      if (["command", "content", "calendar", "outreach", "brand", "audiences", "orchestration"].includes(screen.id)) {
        await shot(`screen-${screen.id}`);
      }
    } catch (err) {
      fail(`screen:${screen.id}:exception`, err.message || String(err));
      await shot(`fail-${screen.id}-ex`).catch(() => {});
    }
  }

  // Notifications bell
  console.log("\n[notifications]");
  try {
    await dismissOverlays(page);
    let bell = page.getByRole("button", { name: /Notifications/i }).first();
    if (!(await bell.isVisible().catch(() => false))) {
      bell = page.locator('button[title="Notifications"], button[aria-label="Notifications"]').first();
    }
    if (await bell.isVisible().catch(() => false)) {
      await bell.click();
      await page.waitForTimeout(900);
      // Panel is a fixed overlay outside <main> — do not use bodyText(main).
      const panel = page.locator("text=AI Team").first();
      const panelAlt = page.getByText(/Notifications/i).first();
      const opened =
        (await panel.isVisible().catch(() => false)) ||
        (await page.getByText(/Competitors|Sign in to view notifications/i).first().isVisible().catch(() => false)) ||
        (await panelAlt.isVisible().catch(() => false));
      if (opened) ok("notifications:panel");
      else {
        const snippet = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
        fail("notifications:panel", snippet);
      }
      await shot("notifications");
      await page.keyboard.press("Escape").catch(() => {});
    } else fail("notifications:panel", "bell missing");
  } catch (err) {
    fail("notifications:exception", err.message);
  }

  return covered;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(30_000);
  const email = `elevate.full.${Date.now()}@marqq.test`;
  const password = "ElevateFullUI123!";
  const shot = async (name) => {
    const path = join(OUT_DIR, `elevate-full-${name}-${stamp}.png`);
    await page.screenshot({ path, fullPage: true }).catch(() => {});
    note(`shot ${path}`);
    return path;
  };

  let strategyMeta = { strategy: null, sections: [] };
  let covered = [];

  try {
    console.log(`\nElevate FULL UI smoke → ${BASE_UI}`);
    console.log(`Company: ${ELEVATE.companyName} · ${ELEVATE.website}`);
    console.log(`Drafts only — no publish/go-live\n`);

    try {
      const health = await fetch(`${API}/api/agents/deployments?workspaceId=marqq-ws-1`);
      if (health.ok) ok("api:backend");
      else fail("api:backend", `HTTP ${health.status}`);
    } catch (err) {
      fail("api:backend", err.message);
    }

    strategyMeta = await runOnboardingAndStrategy(page, shot, email, password);
    covered = await runAllScreens(page, shot);
  } catch (err) {
    fail("fatal", err.message || String(err));
    await shot("fatal").catch(() => {});
  } finally {
    await browser.close().catch(() => {});
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const report = {
    stamp,
    company: ELEVATE,
    email,
    baseUi: BASE_UI,
    api: API,
    mode: "drafts_only",
    screensExpected: ALL_SCREENS.length,
    screensVisited: covered.length,
    covered,
    strategySections: strategyMeta.sections?.length || 0,
    passed,
    failed,
    results,
  };
  const jsonPath = join(OUT_DIR, `elevate-full-ui-smoke-${stamp}.json`);
  const mdPath = join(OUT_DIR, `elevate-full-ui-smoke-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    mdPath,
    [
      `# Elevate full UI smoke`,
      ``,
      `- Company: ${ELEVATE.companyName} (${ELEVATE.website})`,
      `- Mode: drafts only (no publish / go-live)`,
      `- Screens: ${covered.length}/${ALL_SCREENS.length}`,
      `- Strategy sections: ${report.strategySections}`,
      `- Result: ${passed} passed · ${failed} failed`,
      ``,
      `## Results`,
      ...results.map((r) => `- ${r.status === "pass" ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
      ``,
      `## Screens covered`,
      ...covered.map((id) => `- ${id}`),
    ].join("\n")
  );
  console.log(`\n${"=".repeat(56)}`);
  console.log(`${passed} passed · ${failed} failed · screens ${covered.length}/${ALL_SCREENS.length}`);
  console.log(`report ${jsonPath}`);
  console.log(`markdown ${mdPath}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
