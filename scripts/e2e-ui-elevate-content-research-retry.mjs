#!/usr/bin/env node
/**
 * Focused Content Studio research retry (drafts only) — Elevate on production/local.
 * Uses longer Apify wait (default 7 min).
 *
 *   BASE_UI=https://marqq3-production.up.railway.app \
 *   BASE_URL=https://marqq3-production.up.railway.app \
 *   CONTENT_RESEARCH_TIMEOUT_MS=420000 \
 *   node scripts/e2e-ui-elevate-content-research-retry.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE_UI = String(process.env.BASE_UI || "http://localhost:5179").replace(/\/$/, "");
const RESEARCH_MS = Number(process.env.CONTENT_RESEARCH_TIMEOUT_MS || 420_000);
const BRIEF_MS = Number(process.env.CONTENT_BRIEF_TIMEOUT_MS || 180_000);

const ELEVATE = {
  companyName: "Elevate",
  website: "https://theelevate.co.in",
  niche: "Management strategy, AI solutions & digital transformation consulting",
  icp: "Growth-stage companies and mid-market leaders seeking strategy-to-execution partners",
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
    return import("playwright");
  }
}

function loadStrategy() {
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith("elevate-ui-strategy-") && f.endsWith(".json"))
    .sort();
  if (!files.length) throw new Error("No elevate-ui-strategy-*.json");
  const raw = JSON.parse(readFileSync(join(OUT_DIR, files.at(-1)), "utf8"));
  return { file: files.at(-1), strategy: raw.strategy || raw };
}

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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const { chromium } = await loadPlaywright();
  const { file, strategy } = loadStrategy();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const email = `elevate.content.retry.${Date.now()}@marqq.test`;
  const password = "ElevateExec123!";

  const shot = async (name) => {
    const path = join(OUT_DIR, `elevate-content-retry-${name}-${stamp}.png`);
    await page.screenshot({ path, fullPage: true });
    console.log(`  📸 ${path}`);
  };

  console.log("\nElevate Content research retry (drafts only)");
  console.log(`UI ${BASE_UI} · timeout ${Math.round(RESEARCH_MS / 1000)}s`);
  console.log(`Strategy ${file} · ${strategy?.sections?.length || 0} sections\n`);

  try {
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

    const signupLink = page
      .getByRole("link", { name: /Sign up|Create/i })
      .or(page.getByText(/^Sign up$/i))
      .first();
    if (await signupLink.isVisible().catch(() => false)) await signupLink.click();
    else {
      await page.evaluate(() => localStorage.setItem("marqq_active_screen", "signup"));
      await page.reload({ waitUntil: "domcontentloaded" });
    }
    await page.waitForTimeout(500);

    const nameInput = page.locator("#su-name").or(page.getByLabel(/Full name|Name/i)).first();
    if (await nameInput.isVisible().catch(() => false)) await nameInput.fill("Elevate Content Retry");
    const emailInput = page.locator("#su-email").or(page.getByLabel(/Email/i)).first();
    if (await emailInput.isVisible().catch(() => false)) await emailInput.fill(email);
    else await page.locator('input[type="email"]').first().fill(email, { timeout: 15_000 });
    const pass = page.locator('input[type="password"]');
    if ((await pass.count()) >= 1) await pass.nth(0).fill(password);
    if ((await pass.count()) >= 2) await pass.nth(1).fill(password);
    await page.getByRole("button", { name: /Create account|Sign up|Register/i }).first().click();
    await page.waitForTimeout(2500);
    ok("signup", email);

    // Skip / finish onboarding if present
    for (let i = 0; i < 12; i++) {
      const body = await page.locator("body").innerText().catch(() => "");
      if (/Command Center|Ask Marqq|Content|GTM Wizard|Orchestration/i.test(body) && !/Step \d+ of/i.test(body)) break;
      const skip = page.getByRole("button", { name: /Skip|Continue|Next|Launch|Finish|Done|Open app/i }).first();
      if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
      await page.waitForTimeout(800);
    }

    // Inject strategy + brand context
    await page.evaluate(
      ({ strategy, elevate }) => {
        const ws = localStorage.getItem("marqq_workspace_id") || "marqq-ws-1";
        localStorage.setItem("marqq_active_screen", "content");
        localStorage.setItem(
          "marqq_brand_context",
          JSON.stringify({
            companyName: elevate.companyName,
            website: elevate.website,
            niche: elevate.niche,
            icp: elevate.icp,
          })
        );
        try {
          sessionStorage.setItem(`gtm_strategy_${ws}`, JSON.stringify(strategy));
        } catch {
          /* ignore */
        }
        localStorage.setItem("marqq_gtm_strategy", JSON.stringify(strategy));
      },
      { strategy, elevate: ELEVATE }
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.evaluate(() => localStorage.setItem("marqq_active_screen", "content"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    ok("nav:content");
    await shot("01-content-start");

    const startResearch = page.getByRole("button", { name: /Start research|Re-run research/i }).first();
    if (!(await startResearch.isVisible().catch(() => false))) {
      fail("content:start", "Start research CTA missing");
      await shot("02-missing-cta");
    } else {
      await startResearch.click();
      note("Maya researching…");
      const t0 = Date.now();
      let ready = false;
      while (Date.now() - t0 < RESEARCH_MS) {
        const cont = page.getByRole("button", { name: /Continue to brief/i }).first();
        if (await cont.isVisible().catch(() => false)) {
          const disabled = await cont.isDisabled().catch(() => true);
          if (!disabled) {
            ready = true;
            ok("content:research", `Continue to brief (~${Math.round((Date.now() - t0) / 1000)}s)`);
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
          ready = true;
          ok("content:research", `brief/keywords ready (~${Math.round((Date.now() - t0) / 1000)}s)`);
          break;
        }
        if (/Research failed|insufficient_credits|GROQ_API_KEY required/i.test(body)) {
          fail("content:research", body.match(/Research failed[^\n]{0,100}|insufficient_credits|GROQ_API_KEY[^\n]{0,60}/i)?.[0] || "error");
          break;
        }
        if ((Date.now() - t0) % 30000 < 2600) {
          note(`still researching… ${Math.round((Date.now() - t0) / 1000)}s`);
        }
        await page.waitForTimeout(2500);
      }
      if (!ready && !results.some((r) => r.name === "content:research")) {
        fail("content:research", `timed out after ${Math.round(RESEARCH_MS / 1000)}s`);
      }
      await shot("03-content-research");

      if (ready) {
        const chip = page.getByRole("button", { name: /digital|strategy|AI|consult|transform/i }).first();
        if (await chip.isVisible().catch(() => false)) await chip.click().catch(() => {});
        const genBrief = page.getByRole("button", { name: /Generate brief/i }).first();
        if (await genBrief.isVisible().catch(() => false)) {
          await genBrief.click();
          note("Generating brief…");
          const t1 = Date.now();
          let briefOk = false;
          while (Date.now() - t1 < BRIEF_MS) {
            const toDraft = page
              .getByRole("button", { name: /Continue to Riya draft|Generate draft/i })
              .first();
            if (await toDraft.isVisible().catch(() => false)) {
              const disabled = await toDraft.isDisabled().catch(() => true);
              const label = ((await toDraft.textContent()) || "").trim();
              if (!disabled && !/Briefing|Generating|Drafting/i.test(label)) {
                briefOk = true;
                ok("content:brief", `${label || "draft CTA"} (~${Math.round((Date.now() - t1) / 1000)}s)`);
                break;
              }
            }
            const body = await page.locator("body").innerText().catch(() => "");
            if (
              /Maya briefed|status briefed|Riya · Draft|ready for Riya|Continue to Riya draft/i.test(body)
            ) {
              briefOk = true;
              ok("content:brief", `briefed (~${Math.round((Date.now() - t1) / 1000)}s)`);
              break;
            }
            if (/Brief failed|insufficient_credits/i.test(body)) {
              fail("content:brief", body.match(/Brief failed[^\n]{0,80}|insufficient_credits/i)?.[0] || "error");
              break;
            }
            await page.waitForTimeout(2000);
          }
          if (!briefOk && !results.some((r) => r.name === "content:brief")) {
            fail("content:brief", "timed out");
          }
          await shot("04-content-brief");
        } else {
          fail("content:brief", "Generate brief missing");
        }
      }
    }

    // Ensure we never clicked publish
    const forbidden = page.getByRole("button", { name: /Publish now|Publish live|Go live/i }).first();
    if (await forbidden.isVisible().catch(() => false)) note("Publish CTA visible — not clicked");
    ok("drafts_only", "no publish");
  } catch (err) {
    fail("fatal", err.message || String(err));
    await shot("fatal").catch(() => {});
  } finally {
    await browser.close().catch(() => {});
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const report = { stamp, baseUi: BASE_UI, researchTimeoutMs: RESEARCH_MS, passed, failed, results };
  const jsonPath = join(OUT_DIR, `elevate-content-retry-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\n${"=".repeat(56)}`);
  console.log(`${passed} passed · ${failed} failed`);
  console.log(`report ${jsonPath}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
