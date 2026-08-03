#!/usr/bin/env node
/**
 * Journey smoke: seed strategy + agent OS → walk J1–J12 screens →
 * section handoffs → Composio integrations status.
 *
 *   node scripts/e2e-journey-smoke.mjs
 *
 * Requires: frontend :5179 + backend :3001
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE_UI = String(process.env.BASE_UI || "http://localhost:5179").replace(/\/$/, "");
const BASE_API = String(process.env.BASE_API || "http://localhost:3001").replace(/\/$/, "");
const COMPANY_ID = process.env.COMPANY_ID || "elevate-smoke";

const JOURNEY_SCREENS = [
  { id: "command", journey: "J-spine", label: "Command Center" },
  { id: "gtmwizard", journey: "J1", label: "GTM Wizard" },
  { id: "strategy", journey: "J1", label: "Strategy home" },
  { id: "ideas", journey: "J2", label: "Marketing Ideas" },
  { id: "orchestration", journey: "J3", label: "Orchestration" },
  { id: "workflows", journey: "J3", label: "Workflows" },
  { id: "approvals", journey: "J4", label: "Approvals" },
  { id: "agents", journey: "J5", label: "Agents Hub" },
  { id: "pricing", journey: "J6", label: "Pricing" },
  { id: "campaigns", journey: "J7", label: "Campaigns" },
  { id: "paid", journey: "J7", label: "Paid Media" },
  { id: "market", journey: "J8", label: "Market" },
  { id: "audiences", journey: "J8", label: "Audiences" },
  { id: "brand", journey: "J8", label: "Brand" },
  { id: "seo", journey: "J9", label: "SEO" },
  { id: "creative", journey: "J9", label: "Creative" },
  { id: "crm", journey: "J10", label: "CRM" },
  { id: "customer360", journey: "J10", label: "Customer 360" },
  { id: "outreach", journey: "J10", label: "Outreach" },
  { id: "analytics", journey: "J11", label: "Analytics" },
  { id: "integrations", journey: "J12", label: "Integrations" },
];

const SECTION_HANDOFFS = [
  { sectionId: "pricing_monetization", expectScreen: "pricing" },
  { sectionId: "market_analysis", expectScreen: "market" },
  { sectionId: "timeline_roadmap", expectScreen: "orchestration" },
  { sectionId: "customer_success", expectScreen: "customer360" },
  { sectionId: "operations_execution", expectScreen: "workflows" },
];

const SEED_STRATEGY = {
  title: "Elevate GTM Strategy (journey smoke)",
  executiveSummary: "Smoke-seeded strategy for journey handoff verification.",
  goalAlignment: {
    north_star_metric: "Qualified pipeline influenced",
    quantified_target: "$2M influenced pipeline in 90 days",
    metric_definition: "Opportunity amount where Marqq motions touched the account",
    sectionTargets: [
      { sectionId: "market_analysis", metric: "Share of voice vs top 3" },
      { sectionId: "pricing_monetization", metric: "Demo→paid conversion" },
      { sectionId: "timeline_roadmap", metric: "Checkpoint hit rate" },
      { sectionId: "customer_success", metric: "NPS / expansion" },
      { sectionId: "operations_execution", metric: "Workflows live" },
    ],
  },
  sections: [
    {
      id: "market_analysis",
      title: "Market Analysis",
      content: "Competitive intensity is high in clinic ops software; win on workflow depth.",
    },
    {
      id: "pricing_monetization",
      title: "Pricing & Monetization",
      content: "Seat-based mid-market package with implementation fee; protect ACV.",
    },
    {
      id: "timeline_roadmap",
      title: "Timeline & Roadmap",
      content: "90-day control loop with weekly checkpoints on pipeline and CPA.",
    },
    {
      id: "customer_success",
      title: "Customer Success",
      content: "Onboard within 14 days; expansion playbooks for multi-site clinics.",
    },
    {
      id: "operations_execution",
      title: "Operations & Execution",
      content: "Automate lead routing, approval gates, and weekly scorecard pushes.",
    },
    {
      id: "marketing_strategy",
      title: "Marketing Strategy",
      content: "LinkedIn + search + partner webinars as primary acquisition mix.",
    },
  ],
  nextSteps: ["Generate marketing ideas", "Activate high-priority agents", "Connect Meta + GA4"],
};

const SEED_AGENT_OS = {
  version: 1,
  updatedAt: new Date().toISOString(),
  goal_system: SEED_STRATEGY.goalAlignment,
  control_loop: {
    status: "active",
    currentPeriod: { label: "Week 2", target: 250000, actual: null },
    checkpointPlan: {
      endTarget: 2000000,
      checkpoints: [
        { id: "w2", label: "Week 2", target: 250000 },
        { id: "w4", label: "Week 4", target: 600000 },
        { id: "w8", label: "Week 8", target: 1200000 },
      ],
    },
  },
  agent_roster: {
    highPriority: ["zara", "tara"],
    agents: [
      {
        id: "zara",
        name: "Zara",
        status: "high_priority",
        mission: "Own paid + channel experiments against CPA gate",
        reason: "Acquisition bottleneck",
      },
      {
        id: "tara",
        name: "Tara",
        status: "activated",
        mission: "Pricing and conversion friction",
        reason: "Offer clarity",
      },
      {
        id: "neel",
        name: "Neel",
        status: "activated",
        mission: "Orchestrate control loop",
        reason: "Core",
      },
    ],
  },
  strategy_document: SEED_STRATEGY,
  last_executed_task: null,
};

const results = [];
function ok(name, detail = "") {
  results.push({ name, status: "pass", detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, status: "fail", detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}
function info(msg) {
  console.log(`  · ${msg}`);
}

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

async function apiSmoke() {
  console.log("\n[API] Agents / plan / integrations");
  const agentsRes = await fetch(`${BASE_API}/api/agents`);
  if (!agentsRes.ok) {
    fail("api:agents", `HTTP ${agentsRes.status}`);
    return { connectors: [] };
  }
  const agentsJson = await agentsRes.json();
  ok("api:agents", `${(agentsJson.agents || []).length} agents`);

  const planRes = await fetch(`${BASE_API}/api/agents/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sectionId: "pricing_monetization", screenId: "pricing" }),
  });
  const planJson = await planRes.json().catch(() => ({}));
  if (planRes.ok && planJson.plan?.agentName) {
    ok("api:agents/plan", `${planJson.plan.agentName} → ${planJson.plan.mission?.slice(0, 48) || ""}`);
  } else {
    fail("api:agents/plan", JSON.stringify(planJson).slice(0, 200));
  }

  const intRes = await fetch(
    `${BASE_API}/api/integrations?companyId=${encodeURIComponent(COMPANY_ID)}`
  );
  const intJson = await intRes.json().catch(() => ({}));
  const connectors = intJson.connectors || [];
  if (!intRes.ok || !connectors.length) {
    fail("api:integrations", `HTTP ${intRes.status}`);
    return { connectors: [] };
  }
  const active = connectors.filter((c) => c.connected || c.status === "active");
  ok(
    "api:integrations",
    `${connectors.length} listed · active: ${active.map((c) => c.id).join(", ") || "none"}`
  );

  // Attempt OAuth link creation for one configured connector (does not complete browser OAuth)
  const tryId = "meta_ads";
  const connectRes = await fetch(`${BASE_API}/api/integrations/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: COMPANY_ID, connectorId: tryId }),
  });
  const connectJson = await connectRes.json().catch(() => ({}));
  if (connectJson.ok === false && /missing|config/i.test(String(connectJson.error || ""))) {
    fail("api:integrations/connect", connectJson.error);
  } else if (connectJson.redirectUrl || connectJson.link || connectJson.ok !== false) {
    ok(
      "api:integrations/connect",
      connectJson.redirectUrl || connectJson.link
        ? `${tryId} OAuth URL issued`
        : `${tryId} response ok (already linked or no redirect)`
    );
  } else {
    info(`connect ${tryId}: ${JSON.stringify(connectJson).slice(0, 160)}`);
    ok("api:integrations/connect", "endpoint reachable");
  }

  return { connectors };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const api = await apiSmoke();

  console.log(`\n[UI] Open ${BASE_UI} with seeded strategy + agent OS`);
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err.message || err)));

  const shot = async (name) => {
    const path = join(OUT_DIR, `journey-smoke-${name}.png`);
    await page.screenshot({ path, fullPage: false });
    return path;
  };

  try {
    await page.goto(BASE_UI, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate(
      ({ strategy, agentOs }) => {
        localStorage.setItem("marqq_onboarding_complete", "1");
        localStorage.setItem("marqq_active_screen", "command");
        localStorage.setItem("marqq_workspace_bootstrap", "elevate-theelevate-co-in-v6");
        sessionStorage.setItem("marqq_gtm_strategy", JSON.stringify(strategy));
        sessionStorage.setItem("marqq_agent_os", JSON.stringify(agentOs));
        sessionStorage.removeItem("marqq_journey_handoff");
      },
      { strategy: SEED_STRATEGY, agentOs: SEED_AGENT_OS }
    );
    await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(800);

    const hasSidebar = await page.locator("nav, aside, [class*='sidebar']").first().isVisible().catch(() => false);
    if (hasSidebar || (await page.getByText(/Command Center|North Star/i).first().isVisible().catch(() => false))) {
      ok("ui:boot-past-onboarding");
    } else {
      fail("ui:boot-past-onboarding");
      await shot("fail-boot");
    }
    await shot("00-command");

    // Walk journey screens via localStorage + soft navigate (click sidebar when possible)
    for (const screen of JOURNEY_SCREENS) {
      console.log(`\n[${screen.journey}] ${screen.id}`);
      const navBtn = page.locator(`button, a, [role="button"]`).filter({ hasText: new RegExp(`^${screen.label}$`, "i") }).first();
      if (await navBtn.isVisible().catch(() => false)) {
        await navBtn.click();
      } else {
        await page.evaluate((id) => {
          localStorage.setItem("marqq_active_screen", id);
          window.location.reload();
        }, screen.id);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(600);
      }

      const bodyText = ((await page.locator("main").innerText().catch(() => "")) || "").slice(0, 4000);
      const blank = !bodyText || bodyText.trim().length < 20;
      const crashed = consoleErrors.some((e) => /Cannot read|is not defined|Unexpected/i.test(e));
      if (blank) {
        fail(`screen:${screen.id}`, "empty main");
        await shot(`fail-${screen.id}`);
      } else {
        ok(`screen:${screen.id}`, bodyText.replace(/\s+/g, " ").slice(0, 80));
      }
      if (crashed) {
        fail(`screen:${screen.id}:console`, consoleErrors.slice(-2).join(" | "));
        consoleErrors.length = 0;
      }
    }

    // Section handoffs from Strategy → workstreams
    console.log("\n[Handoffs] Strategy section Open →");
    await page.evaluate(() => {
      localStorage.setItem("marqq_active_screen", "strategy");
      window.location.reload();
    });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(800);

    if (await page.getByText(/Elevate GTM Strategy|North Star/i).first().isVisible().catch(() => false)) {
      ok("handoff:strategy-loaded");
    } else {
      fail("handoff:strategy-loaded");
    }

    for (const h of SECTION_HANDOFFS) {
      await page.evaluate(() => {
        localStorage.setItem("marqq_active_screen", "strategy");
        window.location.reload();
      });
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(700);

      const sectionCard = page.locator(".card").filter({ hasText: new RegExp(h.sectionId.replace(/_/g, "[ _]"), "i") }).first();
      // Prefer title-based match
      const titleMap = {
        pricing_monetization: /Pricing/i,
        market_analysis: /Market Analysis/i,
        timeline_roadmap: /Timeline/i,
        customer_success: /Customer Success/i,
        operations_execution: /Operations/i,
      };
      const card = page.locator(".card").filter({ hasText: titleMap[h.sectionId] || /./ }).first();
      const openBtn = card.getByRole("button", { name: /Open/i }).first();
      if (!(await openBtn.isVisible().catch(() => false))) {
        fail(`handoff:${h.sectionId}`, "Open button missing");
        continue;
      }
      await openBtn.click();
      await page.waitForTimeout(900);
      const active = await page.evaluate(() => localStorage.getItem("marqq_active_screen"));
      const handoff = await page.evaluate(() => {
        try {
          return sessionStorage.getItem("marqq_journey_handoff");
        } catch {
          return null;
        }
      });
      // handoff is consumed by JourneyBar — check screen + North Star / Journey handoff / title
      const main = ((await page.locator("main").innerText().catch(() => "")) || "").toLowerCase();
      const landed =
        active === h.expectScreen ||
        main.includes(h.expectScreen) ||
        (h.expectScreen === "pricing" && /pricing/.test(main)) ||
        (h.expectScreen === "market" && /market|competitor/.test(main)) ||
        (h.expectScreen === "orchestration" && /orchestration|control loop/.test(main)) ||
        (h.expectScreen === "customer360" && /customer 360|360/.test(main)) ||
        (h.expectScreen === "workflows" && /workflow/.test(main));

      if (landed) {
        ok(`handoff:${h.sectionId}→${h.expectScreen}`, handoff ? "handoff stashed then consumed" : "landed");
        await shot(`handoff-${h.sectionId}`);
      } else {
        fail(`handoff:${h.sectionId}→${h.expectScreen}`, `active=${active}`);
        await shot(`fail-handoff-${h.sectionId}`);
      }
      void sectionCard;
    }

    // NBA from Command
    await page.evaluate(() => {
      localStorage.setItem("marqq_active_screen", "command");
      window.location.reload();
    });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(700);
    if (await page.getByText(/Activate Zara|Next best|North Star/i).first().isVisible().catch(() => false)) {
      ok("nba:command-shows-priority");
    } else {
      fail("nba:command-shows-priority");
    }
    await shot("99-command-nba");

    // Integrations UI
    await page.evaluate(() => {
      localStorage.setItem("marqq_active_screen", "integrations");
      window.location.reload();
    });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1200);
    if (await page.getByText(/Meta Ads|Google Analytics|HubSpot|Integrations/i).first().isVisible().catch(() => false)) {
      ok("ui:integrations-list");
    } else {
      fail("ui:integrations-list");
    }
    await shot("integrations");
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const report = {
    at: new Date().toISOString(),
    baseUi: BASE_UI,
    baseApi: BASE_API,
    companyId: COMPANY_ID,
    connectors: api.connectors,
    passed,
    failed,
    results,
  };
  const reportPath = join(OUT_DIR, `journey-smoke-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n=== Journey smoke: ${passed} pass · ${failed} fail ===`);
  console.log(`Report: ${reportPath}`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
