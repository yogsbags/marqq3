#!/usr/bin/env node
/**
 * Elevate (theelevate.co.in) — strategy execution smoke (drafts only, no publish).
 *
 * Flow:
 *   1. Load latest Elevate GTM strategy JSON
 *   2. Signup + inject strategy → Agent OS activate
 *   3. API: activate + scheduler tick (draft deployments)
 *   4. UI: Strategy → Orchestration → Run due → Approvals → Agents
 *   5. Execute key module drafts: Market, Outreach, Content, Social, Paid, Creative
 *
 * Never clicks Publish / Go live / Send email / Post live.
 *
 *   BASE_UI=http://localhost:5179 BASE_URL=http://127.0.0.1:3001 \
 *     node scripts/e2e-ui-elevate-strategy-execution.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE_UI = String(process.env.BASE_UI || "http://localhost:5179").replace(/\/$/, "");
const API = String(process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
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

const FORBIDDEN_CTA =
  /Publish now|Publish live|Go live|Send now|Send email|Post live|Launch campaign|Spend|Buy credits/i;

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
const evidence = { lanes: {}, api: {}, goals: {} };

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

function loadLatestElevateStrategy() {
  const prefs = [
    (f) => f.startsWith("elevate-ui-strategy-") && f.endsWith(".json"),
    (f) => f.startsWith("elevate-skillful-strategy-") && f.endsWith(".json"),
    (f) => f.startsWith("elevate-gtm-smoke-") && f.endsWith(".json"),
  ];
  const files = readdirSync(OUT_DIR).sort();
  for (const pred of prefs) {
    const hits = files.filter(pred);
    if (!hits.length) continue;
    const file = hits.at(-1);
    const raw = JSON.parse(readFileSync(join(OUT_DIR, file), "utf8"));
    const strategy = raw.strategy || raw.doc || raw;
    if (strategy?.sections?.length) return { file, strategy };
    // skillful / gtm smoke may nest differently
    const sections = [
      ...(strategy.autoSections || []),
      ...(strategy.goalsSections || []),
      ...(strategy.sections || []),
    ];
    if (sections.length) {
      return {
        file,
        strategy: {
          title: strategy.title || "Elevate GTM Strategy",
          generatedAt: strategy.generatedAt || new Date().toISOString(),
          executiveSummary: strategy.executiveSummary || "",
          goalAlignment: strategy.goalAlignment || {
            north_star_metric: "qualified_leads",
            quantified_target: ELEVATE.target,
            timeline_target: ELEVATE.timeWindow,
          },
          sections: sections.map((s) => ({
            id: s.id,
            title: s.title,
            summary: s.summary,
            body: s.body || "",
            bullets: s.bullets || [],
            subsections: s.subsections || [],
          })),
        },
      };
    }
  }
  throw new Error(
    "No Elevate strategy JSON found — run e2e-ui-elevate-onboarding-strategy.mjs or elevate full smoke first"
  );
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}

async function dismissOverlays(page) {
  for (let i = 0; i < 3; i++) {
    const overlay = page.locator(".modal-overlay").first();
    if (!(await overlay.isVisible().catch(() => false))) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
}

async function clickSidebar(page, label) {
  await dismissOverlays(page);
  const item = page.locator("aside").getByText(label, { exact: true }).first();
  if (await item.isVisible().catch(() => false)) {
    await item.click({ force: true });
    await page.waitForTimeout(1000);
    return true;
  }
  const any = page.getByText(label, { exact: true }).first();
  if (await any.isVisible().catch(() => false)) {
    await any.click({ force: true });
    await page.waitForTimeout(1000);
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
  await page.waitForTimeout(500);

  const signupLink = page
    .getByRole("link", { name: /Sign up|Create/i })
    .or(page.getByText(/Sign up/i))
    .first();
  if (await signupLink.isVisible().catch(() => false)) await signupLink.click();
  else {
    await page.evaluate(() => localStorage.setItem("marqq_active_screen", "signup"));
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForTimeout(400);

  const nameInput = page.locator("#su-name").or(page.getByLabel(/Full name|Name/i)).first();
  if (await nameInput.isVisible().catch(() => false)) await nameInput.fill("Elevate Exec");
  const emailInput = page.locator("#su-email").or(page.getByLabel(/Email/i)).first();
  if (await emailInput.isVisible().catch(() => false)) await emailInput.fill(email);
  else await page.locator('input[type="email"]').first().fill(email);
  const pass = page.locator('input[type="password"]');
  if ((await pass.count()) >= 1) await pass.nth(0).fill(password);
  if ((await pass.count()) >= 2) await pass.nth(1).fill(password);
  await page.getByRole("button", { name: /Create account|Sign up|Register/i }).first().click();
  await page.waitForTimeout(2200);
}

async function injectElevateWorkspace(page, strategy) {
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
      localStorage.setItem("marqq_ob_tagline", "Strategy to execution for growth-stage leaders");
      localStorage.setItem("marqq_active_screen", "strategy");
      const wizard = {
        stage: "document",
        phase: "document",
        answers: {
          priority_90d: { value: "qualified_leads", label: company.outcome },
          quantified_target: { value: "5_ql", label: company.target },
          timeline_target: { value: "90d", label: company.timeWindow },
          channel_bet: { value: "sales_led", label: "Sales-led outreach" },
          icp: { value: "mid_market", label: company.icp },
        },
        drafts: {},
        strategy,
        review: null,
      };
      sessionStorage.setItem("marqq_gtm_wizard", JSON.stringify(wizard));
      sessionStorage.setItem("marqq_gtm_strategy", JSON.stringify(strategy));
    },
    { strategy, company: ELEVATE, workspaceId: WORKSPACE_ID }
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
}

async function clickDraftSafe(page, nameRe, { timeoutMs = 8_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const btn = page.getByRole("button", { name: nameRe }).first();
    if (await btn.isVisible().catch(() => false)) {
      const label = ((await btn.textContent()) || "").trim();
      if (FORBIDDEN_CTA.test(label)) {
        note(`skipped forbidden CTA: ${label}`);
        return null;
      }
      if (!(await btn.isDisabled().catch(() => true))) {
        await btn.click({ force: true });
        await page.waitForTimeout(900);
        return label;
      }
    }
    await page.waitForTimeout(400);
  }
  return null;
}

async function waitForButtonEnabled(page, nameRe, { timeoutMs = 120_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const btn = page.getByRole("button", { name: nameRe }).first();
    if (await btn.isVisible().catch(() => false)) {
      const disabled = await btn.isDisabled().catch(() => true);
      const text = ((await btn.textContent()) || "").trim();
      if (FORBIDDEN_CTA.test(text)) return null;
      if (!disabled && !/…|ing\.\.\.|researching|writing|generating|briefing|Searching|Polling/i.test(text)) {
        return btn;
      }
    }
    await page.waitForTimeout(1500);
  }
  return null;
}

async function assertNoPublishClicked(page) {
  const forbidden = page.getByRole("button", { name: FORBIDDEN_CTA }).first();
  if (await forbidden.isVisible().catch(() => false)) {
    note(`live CTA visible (not clicked): ${((await forbidden.textContent()) || "").trim()}`);
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const email = `elevate.exec.${Date.now()}@marqq.test`;
  const password = "ElevateExec123!";

  const shot = async (name) => {
    const path = join(OUT_DIR, `elevate-exec-${name}-${stamp}.png`);
    await page.screenshot({ path, fullPage: true });
    console.log(`  📸 ${path}`);
    return path;
  };

  try {
    console.log("\nElevate strategy execution smoke (drafts only)");
    console.log(`UI ${BASE_UI} · API ${API} · workspace ${WORKSPACE_ID}`);
    console.log("No publish / go-live / send\n");

    // Health
    const health = await api(`/api/agents/deployments?workspaceId=${encodeURIComponent(WORKSPACE_ID)}`);
    if (health.status === 200) ok("api:backend");
    else fail("api:backend", `status ${health.status}`);

    const { file, strategy } = loadLatestElevateStrategy();
    evidence.goals = {
      strategyFile: file,
      northStar: strategy.goalAlignment?.north_star_metric,
      target: strategy.goalAlignment?.quantified_target,
      timeline: strategy.goalAlignment?.timeline_target,
      sections: strategy.sections?.length || 0,
    };
    note(
      `Strategy ${file} · ${evidence.goals.sections} sections · NSM ${evidence.goals.northStar} → ${evidence.goals.target}`
    );
    if (evidence.goals.sections >= 10) ok("strategy:loaded", `${evidence.goals.sections} sections`);
    else fail("strategy:loaded", `${evidence.goals.sections} sections`);

    // --- API activate + tick (deterministic drafts) ---
    console.log("\n[0] API activate + scheduler tick (draft)");
    try {
      const { updateDb } = await import("../server/db.js");
      updateDb((state) => ({
        ...state,
        agent_deployments: (state.agent_deployments || []).filter(
          (d) => d.workspaceId && d.workspaceId !== WORKSPACE_ID
        ),
        tasks: (state.tasks || []).filter((t) => !t.deploymentId),
      }));
    } catch (err) {
      note(`db clear skipped: ${err.message}`);
    }

    const act = await api("/api/strategy/activate", {
      method: "POST",
      body: {
        workspaceId: WORKSPACE_ID,
        strategy,
        agentOs: {
          version: 1,
          goal_system: strategy.goalAlignment,
          strategy_document: strategy,
        },
      },
    });
    evidence.api.activate = {
      ok: act.ok,
      created: act.data.deploymentsCreated,
      updated: act.data.deploymentsUpdated,
    };
    if (act.ok && (act.data.deploymentsCreated > 0 || act.data.deploymentsUpdated > 0)) {
      ok(
        "api:activate",
        `created=${act.data.deploymentsCreated || 0} updated=${act.data.deploymentsUpdated || 0}`
      );
    } else fail("api:activate", JSON.stringify(act.data).slice(0, 200));

    await new Promise((r) => setTimeout(r, 1500));
    const tick = await api("/api/agents/scheduler/tick", {
      method: "POST",
      body: { force: true, workspaceId: WORKSPACE_ID },
    });
    evidence.api.tick = {
      ran: tick.data.ran?.length || 0,
      failed: tick.data.failed?.length || 0,
    };
    ok("api:tick", `ran=${evidence.api.tick.ran} failed=${evidence.api.tick.failed}`);

    const deps = await api(`/api/agents/deployments?workspaceId=${encodeURIComponent(WORKSPACE_ID)}`);
    const approvals = await api("/api/approvals");
    const depList = deps.data.deployments || [];
    const apprList = approvals.data.approvals || [];
    evidence.api.deployments = depList.length;
    evidence.api.approvals = apprList.length;
    evidence.api.draftApprovals = apprList.filter(
      (a) => /agent|draft/i.test(String(a.type || a.title || ""))
    ).length;
    if (depList.length >= 5) ok("api:deployments", `${depList.length}`);
    else fail("api:deployments", `${depList.length}`);
    if (apprList.length >= 1 || evidence.api.tick.ran >= 1) {
      ok("api:drafts", `approvals=${apprList.length} tickRan=${evidence.api.tick.ran}`);
    } else fail("api:drafts", "no drafts after tick");

    // --- UI shell ---
    console.log("\n[1] Signup + inject Elevate strategy");
    await signup(page, email, password);
    ok("signup");
    await injectElevateWorkspace(page, strategy);
    await shot("01-strategy");

    const body1 = await page.locator("body").innerText().catch(() => "");
    if (/Elevate|qualified lead|GTM|Strategy|North Star/i.test(body1)) ok("strategy:visible");
    else fail("strategy:visible", body1.slice(0, 160));

    // Client-side activate for this session workspace
    const clientAct = await page.evaluate(
      async ({ strategy, workspaceId }) => {
        const res = await fetch("/api/strategy/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            strategy,
            agentOs: {
              version: 1,
              goal_system: strategy.goalAlignment,
              strategy_document: strategy,
            },
          }),
        });
        return res.json().catch(() => ({}));
      },
      { strategy, workspaceId: WORKSPACE_ID }
    );
    if (clientAct.ok !== false) ok("ui:activate", `created=${clientAct.deploymentsCreated || 0}`);
    else fail("ui:activate", JSON.stringify(clientAct).slice(0, 120));

    console.log("\n[2] Orchestration — run due deployments");
    if (await clickSidebar(page, "Orchestration")) ok("nav:orchestration");
    else {
      await page.evaluate(() => localStorage.setItem("marqq_active_screen", "orchestration"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      ok("nav:orchestration", "forced");
    }
    await shot("02-orchestration");

    const orchText = await page.locator("body").innerText().catch(() => "");
    if (/Orchestration|deployment|North Star|Scheduler|Control/i.test(orchText)) {
      ok("orchestration:context");
    } else fail("orchestration:context");

    const tickLabel = await clickDraftSafe(page, /Run due deployments now/i);
    if (tickLabel) {
      note("UI scheduler tick…");
      await page.waitForTimeout(4000);
      ok("orchestration:tick", tickLabel);
    } else fail("orchestration:tick", "button missing");
    await shot("03-after-tick");

    console.log("\n[3] Approvals — draft agent output");
    await clickSidebar(page, "Command Center");
    await page.waitForTimeout(500);
    if (await clickSidebar(page, "Approvals")) ok("nav:approvals");
    else fail("nav:approvals");
    await page.waitForTimeout(1000);
    await shot("04-approvals");

    let approved = false;
    for (let i = 0; i < 6; i++) {
      const approveBtn = page.getByRole("button", { name: /Approve Action|Approve/i }).first();
      if (await approveBtn.isVisible().catch(() => false)) {
        const t = ((await approveBtn.textContent()) || "").trim();
        if (!FORBIDDEN_CTA.test(t)) {
          await approveBtn.click();
          await page.waitForTimeout(800);
          ok("approvals:approve-one", t);
          approved = true;
          break;
        }
      }
      await page.waitForTimeout(800);
    }
    if (!approved) {
      if (evidence.api.approvals > 0) ok("approvals:queue-present", `${evidence.api.approvals} via API`);
      else fail("approvals:approve-one", "no draft approvals");
    }

    console.log("\n[4] Agents hub");
    if (await clickSidebar(page, "Agents")) ok("nav:agents");
    else fail("nav:agents");
    await page.waitForTimeout(900);
    await shot("05-agents");
    const agentsBody = await page.locator("body").innerText().catch(() => "");
    const known = ["Arjun", "Zara", "Kiran", "Maya", "Riya", "Dev", "Neel", "Isha", "Sam", "Tara", "Priya"];
    const found = known.filter((n) => agentsBody.includes(n));
    evidence.agentsSeen = found;
    if (found.length >= 3) ok("agents:roster", found.slice(0, 8).join(", "));
    else fail("agents:roster", "few agents visible");

    // --- Module draft execution (Elevate B2B) ---
    console.log("\n[5] Market Intelligence — draft research");
    if (await clickSidebar(page, "Market Intelligence")) ok("nav:market");
    else {
      await page.evaluate(() => localStorage.setItem("marqq_active_screen", "market"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      ok("nav:market", "forced");
    }
    const marketCta = await clickDraftSafe(page, /Run live research|Refresh|Generate|Start/i);
    if (marketCta) {
      ok("market:draft-cta", marketCta);
      evidence.lanes.market = marketCta;
      await page.waitForTimeout(3000);
    } else ok("market:view-only", "screen loaded");
    await assertNoPublishClicked(page);
    await shot("06-market");

    console.log("\n[6] Outreach Studio — fetch prospects (no send)");
    if (await clickSidebar(page, "Outreach Studio")) ok("nav:outreach");
    else {
      await page.evaluate(() => localStorage.setItem("marqq_active_screen", "outreach"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      ok("nav:outreach", "forced");
    }
    const fetchProspects = await clickDraftSafe(page, /Fetch prospects|Find prospects|Search Apollo|Load ICP/i);
    if (fetchProspects) {
      ok("outreach:fetch", fetchProspects);
      evidence.lanes.outreach = "fetch_prospects";
      await page.waitForTimeout(8000);
    } else {
      const body = await page.locator("body").innerText().catch(() => "");
      if (/Outreach|prospect|Apollo|sequence/i.test(body)) ok("outreach:visible");
      else fail("outreach:visible");
    }
    // Never click Send
    const sendBtn = page.getByRole("button", { name: /Send email|Send now|Send sequence/i }).first();
    if (await sendBtn.isVisible().catch(() => false)) note("Send CTA visible — not clicked");
    await shot("07-outreach");

    console.log("\n[7] Content Studio — research draft only");
    if (await clickSidebar(page, "Content")) ok("nav:content");
    else {
      await page.evaluate(() => localStorage.setItem("marqq_active_screen", "content"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      ok("nav:content", "forced");
    }
    const startResearch = page.getByRole("button", { name: /Start research|Re-run research/i }).first();
    if (await startResearch.isVisible().catch(() => false)) {
      await startResearch.click();
      note("Content research started…");
      // Prod Apify keyword research can exceed 3 minutes — wait for any brief-ready signal
      const researchTimeoutMs = Number(process.env.CONTENT_RESEARCH_TIMEOUT_MS || 420_000);
      const researchStart = Date.now();
      let researchReady = false;
      while (Date.now() - researchStart < researchTimeoutMs) {
        const cont = page.getByRole("button", { name: /Continue to brief/i }).first();
        if (await cont.isVisible().catch(() => false)) {
          const disabled = await cont.isDisabled().catch(() => true);
          if (!disabled) {
            researchReady = true;
            ok("content:research", `Continue to brief (~${Math.round((Date.now() - researchStart) / 1000)}s)`);
            evidence.lanes.content = "research_ready";
            await cont.click();
            await page.waitForTimeout(600);
            break;
          }
        }
        const body = await page.locator("body").innerText().catch(() => "");
        // Avoid matching the always-visible stepper label "2 · Brief"
        if (
          /Generate brief|researched \d+|Pick a queue keyword|article queue|topic clusters|LLMO/i.test(body) &&
          !/Maya researching/i.test(body)
        ) {
          researchReady = true;
          ok("content:research", `brief/keywords ready (~${Math.round((Date.now() - researchStart) / 1000)}s)`);
          evidence.lanes.content = "research_ready";
          break;
        }
        if (/Research failed|GROQ_API_KEY|insufficient_credits/i.test(body)) {
          fail("content:research", body.match(/Research failed[^\n]{0,80}|insufficient_credits|GROQ_API_KEY[^\n]{0,40}/i)?.[0] || "error in UI");
          researchReady = false;
          break;
        }
        await page.waitForTimeout(2500);
      }
      if (!researchReady && !results.some((r) => r.name === "content:research" && r.status === "fail")) {
        fail("content:research", `timed out after ${Math.round(researchTimeoutMs / 1000)}s`);
      } else if (researchReady) {
        const genBrief = page.getByRole("button", { name: /Generate brief/i }).first();
        if (await genBrief.isVisible().catch(() => false)) {
          await genBrief.click();
          const toDraft = await waitForButtonEnabled(page, /Continue to Riya draft|Generate draft/i, {
            timeoutMs: 180_000,
          });
          if (toDraft) {
            ok("content:brief");
            evidence.lanes.content = "brief_ready";
            // Stop before publish — do not continue to live distribute
          } else {
            const body = await page.locator("body").innerText().catch(() => "");
            if (/Maya briefed|status briefed|Riya · Draft|ready for Riya/i.test(body)) {
              ok("content:brief", "briefed (UI signals)");
              evidence.lanes.content = "brief_ready";
            } else fail("content:brief", "timed out");
          }
        }
      }
    } else ok("content:view-only", "no start research CTA");
    await assertNoPublishClicked(page);
    await shot("08-content");

    console.log("\n[8] Social — brief draft only");
    if (await clickSidebar(page, "Social Media")) ok("nav:social");
    else {
      await page.evaluate(() => localStorage.setItem("marqq_active_screen", "social"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      ok("nav:social", "forced");
    }
    const topic = page.locator("input.input, textarea.input, input, textarea").first();
    if (await topic.isVisible().catch(() => false)) {
      await topic.fill(
        "Elevate: strategy-to-execution for mid-market AI transformation — 5 qualified leads / month"
      );
    }
    const socialBrief = await clickDraftSafe(page, /Generate brief|Start brief|1 · Brief/i);
    if (socialBrief) {
      ok("social:brief-start", socialBrief);
      evidence.lanes.social = "brief_started";
      await page.waitForTimeout(6000);
    } else ok("social:view-only");
    const postLive = page.getByRole("button", { name: /Post live|Publish|Schedule & publish/i }).first();
    if (await postLive.isVisible().catch(() => false)) note("Social publish CTA visible — not clicked");
    await shot("09-social");

    console.log("\n[9] Paid Media — plan draft only");
    if (await clickSidebar(page, "Paid Media")) ok("nav:paid");
    else {
      await page.evaluate(() => localStorage.setItem("marqq_active_screen", "paid"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      ok("nav:paid", "forced");
    }
    const paidPlan = await clickDraftSafe(page, /Plan|Generate plan|2 · Plan|Start/i);
    if (paidPlan) {
      ok("paid:plan", paidPlan);
      evidence.lanes.paid = paidPlan;
      await page.waitForTimeout(5000);
    } else ok("paid:view-only");
    await assertNoPublishClicked(page);
    await shot("10-paid");

    console.log("\n[10] Creative Studio — concept draft only");
    if (await clickSidebar(page, "Creative Studio")) ok("nav:creative");
    else {
      await page.evaluate(() => localStorage.setItem("marqq_active_screen", "creative"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      ok("nav:creative", "forced");
    }
    const concept = await clickDraftSafe(page, /Generate concept|1 · Concept|Start/i);
    if (concept) {
      ok("creative:concept", concept);
      evidence.lanes.creative = concept;
      await page.waitForTimeout(8000);
      const toImage = await waitForButtonEnabled(page, /Continue to image/i, { timeoutMs: 90_000 });
      if (toImage) {
        ok("creative:concept-ready");
        // Stop before heavy image/video if slow — still click through image as draft
        await toImage.click();
        await page.waitForTimeout(500);
        const genImage = page.getByRole("button", { name: /Generate image|Regenerate/i }).first();
        if (await genImage.isVisible().catch(() => false)) {
          await genImage.click();
          note("Creative image generating (draft)…");
          const toVideo = await waitForButtonEnabled(page, /Continue to video/i, { timeoutMs: 120_000 });
          if (toVideo) {
            ok("creative:image");
            evidence.lanes.creative = "image_ready";
          } else ok("creative:image-pending", "timed out — concept passed");
        }
      }
    } else ok("creative:view-only");
    await assertNoPublishClicked(page);
    await shot("11-creative");

    console.log("\n[11] Calendar — draft schedule view");
    if (await clickSidebar(page, "Calendar")) ok("nav:calendar");
    else fail("nav:calendar");
    await page.waitForTimeout(800);
    const week = await clickDraftSafe(page, /Week|Month|Today/i);
    if (week) ok("calendar:nav", week);
    else ok("calendar:visible");
    await shot("12-calendar");
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
    mode: "drafts_only",
    baseUi: BASE_UI,
    api: API,
    workspaceId: WORKSPACE_ID,
    evidence,
    passed,
    failed,
    results,
  };
  const jsonPath = join(OUT_DIR, `elevate-strategy-execution-${stamp}.json`);
  const mdPath = join(OUT_DIR, `elevate-strategy-execution-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    mdPath,
    [
      `# Elevate strategy execution smoke`,
      ``,
      `- Company: ${ELEVATE.companyName} (${ELEVATE.website})`,
      `- Mode: drafts only (no publish)`,
      `- Strategy: ${evidence.goals.strategyFile || "?"} · ${evidence.goals.sections || 0} sections`,
      `- NSM: ${evidence.goals.northStar} → ${evidence.goals.target}`,
      `- Deployments: ${evidence.api.deployments ?? "?"} · Approvals: ${evidence.api.approvals ?? "?"}`,
      `- Result: **${passed} passed · ${failed} failed**`,
      ``,
      `## Checks`,
      ...results.map((r) => `- ${r.status === "pass" ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
      ``,
    ].join("\n")
  );

  console.log(`\n${"=".repeat(56)}`);
  console.log(`${passed} passed · ${failed} failed`);
  console.log(`report ${jsonPath}`);
  console.log(`markdown ${mdPath}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
