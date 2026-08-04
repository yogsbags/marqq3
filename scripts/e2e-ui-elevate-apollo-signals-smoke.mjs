#!/usr/bin/env node
/**
 * UI smoke — Elevate Apollo Signals (Audiences)
 *
 *   BASE_UI=http://localhost:5179 node scripts/e2e-ui-elevate-apollo-signals-smoke.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
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
  icp: "Growth-stage companies and mid-market leaders",
  outcome: "Grow qualified leads",
  timeWindow: "90 days",
  target: "5 qualified leads per month",
  baseline: "1 qualified lead per month",
};

/** ICP-ish accounts for Elevate consulting smoke */
const ICP_ACCOUNTS = [
  { name: "Elevate", domain: "theelevate.co.in" },
  { name: "Zoho", domain: "zoho.com" },
  { name: "Freshworks", domain: "freshworks.com" },
  { name: "Razorpay", domain: "razorpay.com" },
  { name: "Postman", domain: "postman.com" },
];

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
  await page.locator("#li-email, #su-email").first().waitFor({ state: "visible", timeout: 45_000 });
  if (!(await page.locator("#su-email").isVisible().catch(() => false))) {
    await page.getByRole("link", { name: /Sign up/i }).or(page.getByText(/Sign up/i)).first().click();
    await page.locator("#su-email").waitFor({ state: "visible", timeout: 20_000 });
  }
  if (await page.locator("#su-name").isVisible().catch(() => false)) {
    await page.locator("#su-name").fill("Elevate Signals");
  }
  await page.locator("#su-email").fill(email);
  await page.locator("#su-pass").fill(password);
  await page.locator("#su-confirm-pass").fill(password);
  await page.getByRole("button", { name: /Create account|Sign up/i }).first().click();
  await page
    .waitForFunction(
      () => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.includes("auth")),
      { timeout: 45_000 }
    )
    .catch(() => {});
}

async function inject(page, strategy, signalsPayload) {
  await page.evaluate(
    ({ strategy, company, workspaceId, signalsPayload }) => {
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
      localStorage.setItem("marqq_active_screen", "audiences");
      if (strategy) {
        sessionStorage.setItem(
          "marqq_gtm_wizard",
          JSON.stringify({ stage: "document", phase: "document", answers: {}, drafts: {}, strategy, review: null })
        );
        sessionStorage.setItem("marqq_gtm_strategy", JSON.stringify(strategy));
      }
      if (signalsPayload) {
        sessionStorage.setItem(`marqq_apollo_signals_${workspaceId}`, JSON.stringify(signalsPayload));
      }
    },
    { strategy, company: ELEVATE, workspaceId: WORKSPACE_ID, signalsPayload }
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`\nElevate Apollo signals UI smoke → ${BASE_UI}\n`);

  console.log("[1] API poll (Elevate + ICP accounts)");
  let sigJson = null;
  try {
    const res = await fetch(`${API}/api/apollo/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: WORKSPACE_ID,
        refresh: true,
        limit: ICP_ACCOUNTS.length,
        accounts: ICP_ACCOUNTS,
      }),
    });
    sigJson = await res.json();
    writeFileSync(join(OUT_DIR, `elevate-apollo-signals-${stamp}.json`), JSON.stringify(sigJson, null, 2));
    if (!res.ok || sigJson.ok === false) {
      fail("api:apollo-signals", JSON.stringify(sigJson).slice(0, 240));
    } else {
      const accounts = Array.isArray(sigJson.accounts) ? sigJson.accounts : [];
      ok("api:apollo-signals", `${accounts.length} accounts`);
      const types = new Set();
      for (const a of accounts) {
        const sigs = a.signals || [];
        console.log(`  · ${a.name || a.domain}: ${sigs.length} signal(s)`);
        for (const s of sigs) {
          types.add(s.type);
          console.log(`      [${s.type}/${s.strength}] ${(s.text || "").slice(0, 90)}`);
        }
      }
      ok("api:signal-types", [...types].join(", ") || "none");
    }
  } catch (err) {
    fail("api:apollo-signals", err.message);
  }

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const strategy = loadStrategy();
  const email = `elevate.signals.${Date.now()}@marqq.test`;
  const password = "MarqqSignals1!";

  try {
    console.log("\n[2] UI · Audiences");
    await signup(page, email, password);
    const hasSession = await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.includes("auth"))
    );
    if (!hasSession) throw new Error("signup did not create session");
    ok("signup", email);

    await inject(page, strategy, sigJson);
    const body = (await page.locator("body").innerText().catch(() => "")) || "";
    if (/Apollo Signals/i.test(body)) ok("ui:apollo-panel");
    else fail("ui:apollo-panel", body.slice(0, 200));

    if (/Elevate|Zoho|Freshworks|Razorpay|Postman/i.test(body)) {
      ok("ui:accounts-visible", "ICP rows present");
    } else {
      fail("ui:accounts-visible", body.slice(0, 280));
    }

    if (/Scale:|Funding:|Hiring|employees|news/i.test(body)) {
      ok("ui:signal-copy", "signal text rendered");
    } else {
      fail("ui:signal-copy", body.slice(0, 280));
    }

    const pollBtn = page.getByRole("button", { name: /Poll Apollo|Refresh signals/i }).first();
    if (await pollBtn.isVisible().catch(() => false)) {
      ok("ui:poll-button");
    } else {
      fail("ui:poll-button", "missing");
    }

    await page.screenshot({
      path: join(OUT_DIR, `elevate-apollo-signals-ui-${stamp}.png`),
      fullPage: true,
    });
  } catch (err) {
    fail("ui-flow", err.message || String(err));
    await page
      .screenshot({ path: join(OUT_DIR, `elevate-apollo-signals-error-${stamp}.png`), fullPage: true })
      .catch(() => {});
  } finally {
    await browser.close();
  }

  const summary = {
    stamp,
    baseUi: BASE_UI,
    accounts: ICP_ACCOUNTS,
    results,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
  };
  writeFileSync(join(OUT_DIR, `elevate-apollo-signals-smoke-${stamp}.json`), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed} passed · ${summary.failed} failed`);
  process.exit(summary.failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
