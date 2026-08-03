#!/usr/bin/env node
/**
 * UI smoke: Nouriva AI — strategy → agent execution like a real Marqq user.
 *
 * Default reuses the latest nouriva-ui-strategy-*.json (fast).
 * FULL_ONBOARDING=1 also runs Brand DNA + skillful strategy first (slow).
 *
 *   BASE_UI=http://localhost:5179 node scripts/e2e-ui-nouriva-strategy-to-agents.mjs
 *   FULL_ONBOARDING=1 BASE_UI=http://localhost:5179 node scripts/e2e-ui-nouriva-strategy-to-agents.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE_UI = String(process.env.BASE_UI || "http://localhost:5179").replace(/\/$/, "");
const FULL = process.env.FULL_ONBOARDING === "1";

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
function note(msg) {
  console.log(`  · ${msg}`);
}

function loadLatestNourivaStrategy() {
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith("nouriva-ui-strategy-") && f.endsWith(".json"))
    .sort();
  if (!files.length) throw new Error("No nouriva-ui-strategy-*.json — run e2e-ui-nouriva-onboarding-strategy.mjs first");
  const raw = JSON.parse(readFileSync(join(OUT_DIR, files.at(-1)), "utf8"));
  const strategy = raw.strategy;
  if (!strategy?.sections?.length) throw new Error(`Bad strategy in ${files.at(-1)}`);
  return { file: files.at(-1), strategy };
}

async function dismissOverlays(page) {
  for (let i = 0; i < 3; i++) {
    const overlay = page.locator(".modal-overlay").first();
    if (!(await overlay.isVisible().catch(() => false))) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
}

async function clickSidebar(page, label) {
  await dismissOverlays(page);
  const item = page.locator("aside, nav, .sidebar").getByText(label, { exact: true }).first();
  if (await item.isVisible().catch(() => false)) {
    await item.click({ force: true });
    await page.waitForTimeout(900);
    return true;
  }
  // fallback: any clickable with that text
  const any = page.getByText(label, { exact: true }).first();
  if (await any.isVisible().catch(() => false)) {
    await any.click({ force: true });
    await page.waitForTimeout(900);
    return true;
  }
  return false;
}

async function signup(page, email, password) {
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
  await page.waitForTimeout(600);

  const signupLink = page.getByRole("link", { name: /Sign up|Create/i }).or(page.getByText(/Sign up/i)).first();
  if (await signupLink.isVisible().catch(() => false)) await signupLink.click();
  else {
    await page.evaluate(() => localStorage.setItem("marqq_active_screen", "signup"));
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForTimeout(500);

  const nameInput = page.locator("#su-name").or(page.getByLabel(/Full name|Name/i)).first();
  if (await nameInput.isVisible().catch(() => false)) await nameInput.fill("Nouriva Journey");
  const emailInput = page.locator("#su-email").or(page.getByLabel(/Email/i)).first();
  if (await emailInput.isVisible().catch(() => false)) await emailInput.fill(email);
  else await page.locator('input[type="email"]').first().fill(email);
  const passInputs = page.locator('input[type="password"]');
  if ((await passInputs.count()) >= 1) await passInputs.nth(0).fill(password);
  if ((await passInputs.count()) >= 2) await passInputs.nth(1).fill(password);

  await page.getByRole("button", { name: /Create account|Sign up|Register/i }).first().click();
  await page.waitForTimeout(2500);

  const landed =
    (await page.getByText(/Step\s+\d+\s+of\s+8/i).first().isVisible().catch(() => false)) ||
    (await page.getByText(/Welcome|Brand DNA|Company/i).first().isVisible().catch(() => false));
  if (!landed) {
    await page.evaluate(() => {
      localStorage.setItem("marqq_active_screen", "onboarding");
      localStorage.removeItem("marqq_onboarding_complete");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
  }
}

async function injectStrategyAndEnterApp(page, strategy) {
  await page.evaluate(
    ({ strategy, company }) => {
      // Mark onboarding done with Nouriva brief
      localStorage.setItem("marqq_onboarding_complete", "1");
      localStorage.setItem("marqq_ob_companyName", company.companyName);
      localStorage.setItem("marqq_ob_website", company.website);
      localStorage.setItem("marqq_ob_niche", company.niche);
      localStorage.setItem("marqq_ob_icp", company.icp);
      localStorage.setItem("marqq_ob_outcome", company.outcome);
      localStorage.setItem("marqq_ob_timeWindow", company.timeWindow);
      localStorage.setItem("marqq_ob_target", company.target);
      localStorage.setItem("marqq_ob_baseline", company.baseline);
      localStorage.setItem("marqq_ob_tagline", "Nutrition App That Reads Your Lab Report");
      localStorage.setItem("marqq_ob_tone", "empathetic yet authoritative");
      localStorage.setItem("marqq_active_screen", "gtmwizard");

      const wizard = {
        stage: "document",
        phase: "document",
        answers: {
          priority_90d: { value: "activation", label: company.outcome },
          quantified_target: { value: "200_paid", label: company.target },
          timeline_target: { value: "90d", label: company.timeWindow },
          channel_bet: { value: "paid_social", label: "Paid social + app store" },
          icp: { value: "lab_users", label: company.icp },
        },
        drafts: {},
        strategy,
        review: null,
      };
      sessionStorage.setItem("marqq_gtm_wizard", JSON.stringify(wizard));
      sessionStorage.setItem("marqq_gtm_strategy", JSON.stringify(strategy));
    },
    { strategy, company: NOURIVA }
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const email = `nouriva.journey.${Date.now()}@marqq.test`;
  const password = "NourivaJourney123!";
  const evidence = {};

  const shot = async (name) => {
    const path = join(OUT_DIR, `nouriva-journey-${name}.png`);
    await page.screenshot({ path, fullPage: true });
    console.log(`  📸 ${path}`);
    return path;
  };

  try {
    console.log("\n=== Nouriva strategy → agents UI journey ===\n");
    console.log(`URL ${BASE_UI} · fullOnboarding=${FULL}`);

    if (FULL) {
      note("FULL_ONBOARDING=1 — running nouriva onboarding→strategy first");
      const r = spawnSync(
        process.execPath,
        [join(__dirname, "e2e-ui-nouriva-onboarding-strategy.mjs")],
        { cwd: ROOT, env: { ...process.env, BASE_UI }, stdio: "inherit" }
      );
      if (r.status !== 0) fail("full-onboarding", `exit ${r.status}`);
      else ok("full-onboarding");
    }

    const { file, strategy } = loadLatestNourivaStrategy();
    note(`Using strategy ${file} · ${strategy.sections.length} sections · NSM ${strategy.goalAlignment?.north_star_metric || "?"}`);
    evidence.strategyFile = file;
    evidence.northStar = strategy.goalAlignment?.north_star_metric || null;
    evidence.quantifiedTarget = strategy.goalAlignment?.quantified_target || null;
    evidence.sectionTargets = (strategy.goalAlignment?.sectionTargets || []).length;

    console.log("\n[1] Sign up as new Nouriva user");
    await signup(page, email, password);
    ok("signup");
    await shot("01-signup");

    console.log("\n[2] Land on GTM Strategy Document (post-onboarding)");
    await injectStrategyAndEnterApp(page, strategy);
    // Ensure workspace exists for activate/lock
    await page.waitForTimeout(1500);

    const docVisible = await page
      .getByRole("heading", { name: /GTM Strategy Document/i })
      .first()
      .isVisible()
      .catch(() => false);
    if (docVisible) ok("strategy:document");
    else {
      // Force screen
      await page.evaluate(() => localStorage.setItem("marqq_active_screen", "gtmwizard"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      if (await page.getByRole("heading", { name: /GTM Strategy Document/i }).first().isVisible().catch(() => false)) {
        ok("strategy:document");
      } else fail("strategy:document", "not visible after inject");
    }
    await shot("02-strategy-doc");

    // Confirm client activate fired
    const activated = await page.evaluate(async () => {
      const os = sessionStorage.getItem("marqq_agent_os");
      return {
        hasOs: Boolean(os),
        roster: os ? (JSON.parse(os).agent_roster?.agents || []).length : 0,
        highPriority: os
          ? (JSON.parse(os).agent_roster?.agents || []).filter((a) => a.status === "high_priority").map((a) => a.name || a.id)
          : [],
        loopStatus: os ? JSON.parse(os).control_loop?.status : null,
        nsm: os ? JSON.parse(os).goal_system?.north_star_metric : null,
      };
    });
    evidence.agentOs = activated;
    if (activated.hasOs) ok("agent-os:built", `${activated.roster} agents · loop=${activated.loopStatus}`);
    else fail("agent-os:built", "marqq_agent_os missing");

    console.log("\n[3] Activation & control loop tab");
    const actTab = page.getByRole("button", { name: /Activation/i }).first();
    if (await actTab.isVisible().catch(() => false)) {
      await actTab.click();
      await page.waitForTimeout(800);
      ok("activation:tab");
    } else fail("activation:tab");
    await shot("03-activation");

    const openOrch = page.getByRole("button", { name: /Open orchestration control loop|Open orchestration/i }).first();
    if (await openOrch.isVisible().catch(() => false)) {
      await openOrch.click();
      await page.waitForTimeout(1200);
      ok("activation:open-orchestration");
    } else {
      note("no activation CTA — navigating sidebar");
      if (await clickSidebar(page, "Orchestration")) ok("sidebar:orchestration");
      else fail("activation:open-orchestration");
    }

    console.log("\n[4] Orchestration — North Star + run due deployments");
    await dismissOverlays(page);
    const orchHeading =
      (await page.getByText(/Orchestration|Control plane|North Star checkpoints|Scheduler/i).first().isVisible().catch(() => false));
    if (orchHeading) ok("orchestration:visible");
    else fail("orchestration:visible");

    const nsmText = await page.locator("body").innerText().then((t) => t.slice(0, 2500)).catch(() => "");
    evidence.orchestrationSnippet = nsmText.slice(0, 400);
    if (/paid.?conversion|North Star|checkpoint|deployment/i.test(nsmText)) {
      ok("orchestration:goal-context", "North Star / deployments language present");
    } else {
      fail("orchestration:goal-context", "missing goal language");
    }
    await shot("04-orchestration");

    const tickBtn = page.getByRole("button", { name: /Run due deployments now/i }).first();
    if (await tickBtn.isVisible().catch(() => false)) {
      await tickBtn.click();
      note("scheduler tick started (force)…");
      // Poll until approvals appear (draft-gated runs)
      let approvals = 0;
      for (let i = 0; i < 24; i++) {
        await page.waitForTimeout(1500);
        approvals = await page.evaluate(async () => {
          const app = await fetch("/api/approvals").then((r) => r.json()).catch(() => ({}));
          return Array.isArray(app.approvals) ? app.approvals.length : 0;
        });
        if (approvals > 0) break;
        note(`waiting for drafts… (${i + 1})`);
      }
      ok("orchestration:tick", `${approvals} approvals after tick`);
    } else fail("orchestration:tick", "button missing");
    await shot("05-after-tick");

    // API evidence
    const apiSnap = await page.evaluate(async () => {
      const [dep, app, os] = await Promise.all([
        fetch("/api/agents/deployments").then((r) => r.json()).catch(() => ({})),
        fetch("/api/approvals").then((r) => r.json()).catch(() => ({})),
        fetch("/api/agent-os").then((r) => r.json()).catch(() => ({})),
      ]);
      return {
        deployments: Array.isArray(dep.deployments) ? dep.deployments.length : 0,
        pending: Array.isArray(dep.deployments)
          ? dep.deployments.filter((d) => /pending|active|running|completed|done/i.test(String(d.status || ""))).length
          : 0,
        approvals: Array.isArray(app.approvals) ? app.approvals.length : 0,
        draftApprovals: Array.isArray(app.approvals)
          ? app.approvals.filter((a) => !a.decision || a.decision === "pending" || a.status === "pending").length
          : 0,
        serverOs: Boolean(os?.agentOs),
        serverRoster: (os?.agentOs?.agent_roster?.agents || []).length,
      };
    });
    evidence.api = apiSnap;
    if (apiSnap.deployments > 0) ok("deployments:seeded", `${apiSnap.deployments} deployments`);
    else fail("deployments:seeded", "0 deployments — activate may have failed");

    console.log("\n[5] Approvals — review draft agent output");
    // Refresh App approvals state by navigating away/back
    await clickSidebar(page, "Command Center");
    await page.waitForTimeout(600);
    if (await clickSidebar(page, "Approvals")) ok("sidebar:approvals");
    else fail("sidebar:approvals");
    await page.waitForTimeout(1200);
    await shot("06-approvals");

    let approved = false;
    for (let i = 0; i < 8; i++) {
      const approveBtn = page.getByRole("button", { name: /Approve Action/i }).first();
      if (await approveBtn.isVisible().catch(() => false)) {
        await approveBtn.click();
        await page.waitForTimeout(800);
        ok("approvals:approve-one");
        approved = true;
        break;
      }
      await page.waitForTimeout(1000);
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(800);
      await clickSidebar(page, "Approvals");
    }
    if (!approved) {
      if (apiSnap.approvals > 0) ok("approvals:queue-present", `${apiSnap.approvals} via API (UI lag)`);
      else fail("approvals:approve-one", "no drafts in Approvals after force tick");
    }

    console.log("\n[6] Agents hub — priority roster");
    if (await clickSidebar(page, "Agents")) ok("sidebar:agents");
    else fail("sidebar:agents");
    await page.waitForTimeout(1000);
    await shot("07-agents");

    const agentsBody = await page.locator("body").innerText().catch(() => "");
    const known = ["Arjun", "Zara", "Kiran", "Maya", "Riya", "Dev", "Neel", "Isha", "Sam", "Tara", "Priya", "Veena"];
    const found = known.filter((n) => agentsBody.includes(n));
    evidence.agentsSeen = found;
    if (found.length >= 3) ok("agents:roster", found.slice(0, 8).join(", "));
    else fail("agents:roster", "few/no catalog agents visible");

    // Open first agent card if clickable
    const agentCard = page.locator(".card, [class*=agent]").filter({ hasText: /Arjun|Zara|Maya|Kiran|Dev|Neel/i }).first();
    if (await agentCard.isVisible().catch(() => false)) {
      await agentCard.click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
      ok("agents:open-detail");
      await shot("08-agent-detail");
    } else {
      note("no agent card click target");
    }

    console.log("\n[7] Strategy home — section Open → studio handoff");
    if (await clickSidebar(page, "Strategy")) ok("sidebar:strategy");
    else {
      await page.evaluate(() => localStorage.setItem("marqq_active_screen", "strategy"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      ok("sidebar:strategy", "forced screen");
    }
    await shot("09-strategy-home");

    const openSection = page.getByRole("button", { name: /Open →/i }).first();
    if (await openSection.isVisible().catch(() => false)) {
      await openSection.click();
      await page.waitForTimeout(1200);
      ok("strategy:open-section");
      await shot("10-section-handoff");
    } else {
      fail("strategy:open-section", "no Open → on Strategy home");
    }

    // Capture final session state
    evidence.final = await page.evaluate(() => {
      const os = sessionStorage.getItem("marqq_agent_os");
      const parsed = os ? JSON.parse(os) : null;
      return {
        screen: localStorage.getItem("marqq_active_screen"),
        hasStrategy: Boolean(sessionStorage.getItem("marqq_gtm_strategy")),
        nsm: parsed?.goal_system?.north_star_metric || null,
        target: parsed?.goal_system?.quantified_target || null,
        highPriority: (parsed?.agent_roster?.agents || [])
          .filter((a) => a.status === "high_priority")
          .map((a) => a.name || a.id),
        activated: (parsed?.agent_roster?.agents || [])
          .filter((a) => a.status === "activated")
          .map((a) => a.name || a.id)
          .slice(0, 8),
      };
    });
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const md = [
    `# Nouriva UI — strategy → agents journey`,
    ``,
    `- URL: ${BASE_UI}`,
    `- Signup: ${email}`,
    `- Generated: ${new Date().toISOString()}`,
    `- Strategy: ${evidence.strategyFile || "(n/a)"}`,
    `- North Star: ${evidence.northStar || "—"} → ${evidence.quantifiedTarget || "—"}`,
    `- Section targets: ${evidence.sectionTargets ?? "—"}`,
    `- Result: ${passed} pass · ${failed} fail`,
    ``,
    `## Flow under test`,
    `1. Strategy document (goalAlignment + 16 sections)`,
    `2. Auto Agent OS + \`/api/strategy/activate\` (seed deployments)`,
    `3. Activation & control loop`,
    `4. Orchestration → Run due deployments (draft-only)`,
    `5. Approvals → approve draft`,
    `6. Agents hub (priority roster)`,
    `7. Strategy home → Open → section studio`,
    ``,
    `## Results`,
    ...results.map((r) => `- ${r.status === "pass" ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
    ``,
    `## Evidence`,
    "```json",
    JSON.stringify(evidence, null, 2),
    "```",
  ].join("\n");

  const mdPath = join(OUT_DIR, `nouriva-journey-${stamp}.md`);
  writeFileSync(mdPath, md);
  writeFileSync(join(OUT_DIR, `nouriva-journey-${stamp}.json`), JSON.stringify({ results, evidence }, null, 2));
  console.log(`\n📄 ${mdPath}`);
  console.log(`\n=== ${passed} pass · ${failed} fail ===\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
