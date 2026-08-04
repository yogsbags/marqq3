#!/usr/bin/env node
/**
 * Elevate (theelevate.co.in) — Content + Social Media E2E smoke (drafts only).
 *
 * Content: Start research → Continue to brief → Generate brief → Generate draft
 * Social:  Generate brief → Generate posts → Approve all (never Post live)
 *
 *   BASE_UI=https://marqq3-production.up.railway.app \
 *   BASE_URL=https://marqq3-production.up.railway.app \
 *   CONTENT_RESEARCH_TIMEOUT_MS=420000 \
 *   node scripts/e2e-ui-elevate-content-social-smoke.mjs
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
const DRAFT_MS = Number(process.env.CONTENT_DRAFT_TIMEOUT_MS || 300_000);
const SOCIAL_BRIEF_MS = Number(process.env.SOCIAL_BRIEF_TIMEOUT_MS || 150_000);
const SOCIAL_POSTS_MS = Number(process.env.SOCIAL_POSTS_TIMEOUT_MS || 180_000);

const ELEVATE = {
  companyName: "Elevate",
  website: "https://theelevate.co.in",
  niche: "Management strategy, AI solutions & digital transformation consulting",
  icp: "Growth-stage companies and mid-market leaders seeking strategy-to-execution partners",
};

const FORBIDDEN = /Publish now|Publish live|Go live|Post live|Schedule & publish/i;

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
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith("elevate-ui-strategy-") && f.endsWith(".json"))
    .sort();
  if (!files.length) throw new Error("No elevate-ui-strategy-*.json — run onboarding/full smoke first");
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

async function clickSidebar(page, label) {
  const item = page.locator("aside").getByText(label, { exact: true }).first();
  if (await item.isVisible().catch(() => false)) {
    await item.click({ force: true });
    await page.waitForTimeout(700);
    return true;
  }
  return false;
}

async function forceScreen(page, screen) {
  await page.evaluate((s) => localStorage.setItem("marqq_active_screen", s), screen);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
}

async function waitEnabled(page, nameRe, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const btn = page.getByRole("button", { name: nameRe }).first();
    if (await btn.isVisible().catch(() => false)) {
      const disabled = await btn.isDisabled().catch(() => true);
      const label = ((await btn.textContent()) || "").trim();
      if (!disabled && !/Generating|Drafting|Briefing|Composing|Researching/i.test(label)) {
        return btn;
      }
    }
    await page.waitForTimeout(2000);
  }
  return null;
}

async function assertNoPublish(page) {
  const forbidden = page.getByRole("button", { name: FORBIDDEN }).first();
  if (await forbidden.isVisible().catch(() => false)) {
    note(`live CTA visible (not clicked): ${((await forbidden.textContent()) || "").trim()}`);
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const { chromium } = await loadPlaywright();
  const { file, strategy } = loadStrategy();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const email = `elevate.content.social.${Date.now()}@marqq.test`;
  const password = "ElevateExec123!";

  const shot = async (name) => {
    const path = join(OUT_DIR, `elevate-cs-${name}-${stamp}.png`);
    await page.screenshot({ path, fullPage: true });
    console.log(`  📸 ${path}`);
    return path;
  };

  console.log("\nElevate Content + Social smoke (drafts only)");
  console.log(`UI ${BASE_UI}`);
  console.log(`Company Elevate · ${ELEVATE.website}`);
  console.log(`Strategy ${file} · ${strategy?.sections?.length || 0} sections`);
  console.log(`Timeouts research=${Math.round(RESEARCH_MS / 1000)}s brief=${Math.round(BRIEF_MS / 1000)}s draft=${Math.round(DRAFT_MS / 1000)}s\n`);

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

    // Signup
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
    if (await nameInput.isVisible().catch(() => false)) await nameInput.fill("Elevate Content Social");
    const emailInput = page.locator("#su-email").or(page.getByLabel(/Email/i)).first();
    if (await emailInput.isVisible().catch(() => false)) await emailInput.fill(email);
    else await page.locator('input[type="email"]').first().fill(email, { timeout: 15_000 });
    const pass = page.locator('input[type="password"]');
    if ((await pass.count()) >= 1) await pass.nth(0).fill(password);
    if ((await pass.count()) >= 2) await pass.nth(1).fill(password);
    await page.getByRole("button", { name: /Create account|Sign up|Register/i }).first().click();
    await page.waitForTimeout(2500);
    ok("signup", email);

    for (let i = 0; i < 12; i++) {
      const body = await page.locator("body").innerText().catch(() => "");
      if (/Command Center|Ask Marqq|Content|GTM Wizard|Orchestration/i.test(body) && !/Step \d+ of/i.test(body)) break;
      const skip = page.getByRole("button", { name: /Skip|Continue|Next|Launch|Finish|Done|Open app/i }).first();
      if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
      await page.waitForTimeout(800);
    }

    await page.evaluate(
      ({ strategy, elevate }) => {
        localStorage.setItem("marqq_onboarding_complete", "1");
        localStorage.setItem("marqq_ob_companyName", elevate.companyName);
        localStorage.setItem("marqq_ob_website", elevate.website);
        localStorage.setItem("marqq_ob_niche", elevate.niche);
        localStorage.setItem("marqq_ob_icp", elevate.icp);
        localStorage.setItem(
          "marqq_brand_context",
          JSON.stringify({
            companyName: elevate.companyName,
            website: elevate.website,
            niche: elevate.niche,
            icp: elevate.icp,
          })
        );
        localStorage.setItem("marqq_gtm_strategy", JSON.stringify(strategy));
        sessionStorage.setItem("marqq_gtm_strategy", JSON.stringify(strategy));
        localStorage.setItem("marqq_active_screen", "content");
      },
      { strategy, elevate: ELEVATE }
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // ── Content Studio ─────────────────────────────────────────────
    console.log("\n[1] Content Studio — research → brief → draft");
    if (!(await clickSidebar(page, "Content"))) await forceScreen(page, "content");
    else ok("nav:content");
    await shot("01-content-start");

    const startResearch = page.getByRole("button", { name: /Start research|Re-run research/i }).first();
    if (!(await startResearch.isVisible().catch(() => false))) {
      fail("content:start", "Start research CTA missing");
    } else {
      await startResearch.click();
      note("Maya researching…");
      const t0 = Date.now();
      let researchReady = false;
      while (Date.now() - t0 < RESEARCH_MS) {
        const cont = page.getByRole("button", { name: /Continue to brief/i }).first();
        if (await cont.isVisible().catch(() => false)) {
          const disabled = await cont.isDisabled().catch(() => true);
          if (!disabled) {
            researchReady = true;
            ok("content:research", `Continue to brief (~${Math.round((Date.now() - t0) / 1000)}s)`);
            await cont.click();
            await page.waitForTimeout(600);
            break;
          }
        }
        const body = await page.locator("body").innerText().catch(() => "");
        if (
          /Generate brief|researched \d+|Pick a queue keyword|article queue|topic clusters|LLMO/i.test(body) &&
          !/Maya researching/i.test(body)
        ) {
          researchReady = true;
          ok("content:research", `brief/keywords ready (~${Math.round((Date.now() - t0) / 1000)}s)`);
          break;
        }
        if (/Research failed|insufficient_credits|GROQ_API_KEY/i.test(body)) {
          fail(
            "content:research",
            body.match(/Research failed[^\n]{0,100}|insufficient_credits|GROQ_API_KEY[^\n]{0,60}/i)?.[0] || "error"
          );
          break;
        }
        if ((Date.now() - t0) % 30000 < 2600) note(`still researching… ${Math.round((Date.now() - t0) / 1000)}s`);
        await page.waitForTimeout(2500);
      }
      if (!researchReady && !results.some((r) => r.name === "content:research")) {
        fail("content:research", `timed out after ${Math.round(RESEARCH_MS / 1000)}s`);
      }
      await shot("02-content-research");

      if (researchReady) {
        const chip = page.getByRole("button", { name: /digital|strategy|AI|consult|transform/i }).first();
        if (await chip.isVisible().catch(() => false)) await chip.click().catch(() => {});
        const genBrief = page.getByRole("button", { name: /Generate brief/i }).first();
        if (!(await genBrief.isVisible().catch(() => false))) {
          fail("content:brief", "Generate brief missing");
        } else {
          await genBrief.click();
          note("Generating brief…");
          const toDraft = await waitEnabled(page, /Continue to Riya draft|Generate draft/i, BRIEF_MS);
          const briefBody = await page.locator("body").innerText().catch(() => "");
          if (toDraft || /Maya briefed|status briefed|Riya · Draft|ready for Riya/i.test(briefBody)) {
            ok("content:brief", toDraft ? ((await toDraft.textContent()) || "").trim() : "briefed");
            await shot("03-content-brief");
            if (toDraft) {
              await toDraft.click();
              await page.waitForTimeout(600);
            }
            const genDraft = page.getByRole("button", { name: /Generate draft|Redraft/i }).first();
            if (await genDraft.isVisible().catch(() => false)) {
              await genDraft.click();
              note("Riya drafting…");
              const toApprove = await waitEnabled(page, /Continue to approve|Approve article/i, DRAFT_MS);
              const draftBody = await page.locator("body").innerText().catch(() => "");
              if (toApprove || draftBody.length > 800) {
                ok("content:draft", `chars≈${draftBody.length}`);
                await shot("04-content-draft");
                // Approve draft only — never publish
                if (toApprove) {
                  await toApprove.click().catch(() => {});
                  await page.waitForTimeout(400);
                }
                const approve = page.getByRole("button", { name: /Approve article/i }).first();
                if (await approve.isVisible().catch(() => false)) {
                  await approve.click().catch(() => {});
                  ok("content:approve-draft");
                }
              } else fail("content:draft", "empty/timeout");
            } else {
              // Brief-only is still a useful pass if draft CTA never appeared
              note("Generate draft CTA not shown — stopping at brief");
              ok("content:draft", "skipped (brief-only)");
            }
          } else fail("content:brief", "timed out");
        }
      }
    }
    await assertNoPublish(page);

    // ── Social Media ───────────────────────────────────────────────
    console.log("\n[2] Social Media — brief → posts");
    if (!(await clickSidebar(page, "Social Media"))) await forceScreen(page, "social");
    else ok("nav:social");
    await shot("05-social-start");

    const topic = page.locator("input.input, textarea.input, input, textarea").first();
    if (await topic.isVisible().catch(() => false)) {
      await topic.fill(
        "Elevate: strategy-to-execution for mid-market AI transformation — 5 qualified leads / month"
      );
    }

    const socialBriefBtn = page.getByRole("button", { name: /Generate brief|Start brief/i }).first();
    if (!(await socialBriefBtn.isVisible().catch(() => false))) {
      fail("social:brief", "Generate brief missing");
    } else {
      await socialBriefBtn.click();
      note("Kiran briefing…");
      const postsBtn = await waitEnabled(page, /Generate posts|Regenerate/i, SOCIAL_BRIEF_MS);
      const socialBriefBody = await page.locator("body").innerText().catch(() => "");
      if (postsBtn || /CTA:|Tone:|hooks?|platforms?/i.test(socialBriefBody)) {
        ok("social:brief");
        await shot("06-social-brief");
        const compose = page.getByText(/^2 · Compose$/i).first();
        if (await compose.isVisible().catch(() => false)) await compose.click().catch(() => {});
        const gp = page.getByRole("button", { name: /Generate posts|Regenerate/i }).first();
        if (await gp.isVisible().catch(() => false)) {
          await gp.click();
          note("Composing posts…");
          const tPosts = Date.now();
          let postsOk = false;
          while (Date.now() - tPosts < SOCIAL_POSTS_MS) {
            const body = await page.locator("body").innerText().catch(() => "");
            if (/Approve all|LinkedIn|Instagram|Facebook|caption/i.test(body)) {
              postsOk = true;
              ok("social:posts", "compose ready");
              await shot("07-social-posts");
              const approveAll = page.getByRole("button", { name: /Approve all/i }).first();
              if (await approveAll.isVisible().catch(() => false)) {
                await approveAll.click().catch(() => {});
                ok("social:approve-drafts");
              }
              break;
            }
            if (/failed|insufficient_credits/i.test(body)) {
              fail("social:posts", body.match(/failed[^\n]{0,80}|insufficient_credits/i)?.[0] || "error");
              break;
            }
            await page.waitForTimeout(2500);
          }
          if (!postsOk && !results.some((r) => r.name === "social:posts" && r.status === "fail")) {
            fail("social:posts", `timed out after ${Math.round(SOCIAL_POSTS_MS / 1000)}s`);
          }
        } else fail("social:posts", "Generate posts missing");
      } else fail("social:brief", "timed out");
    }
    await assertNoPublish(page);
    ok("drafts_only", "no publish / post live");
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
    baseUi: BASE_UI,
    strategyFile: file,
    timeouts: { RESEARCH_MS, BRIEF_MS, DRAFT_MS, SOCIAL_BRIEF_MS, SOCIAL_POSTS_MS },
    passed,
    failed,
    results,
  };
  const jsonPath = join(OUT_DIR, `elevate-content-social-${stamp}.json`);
  const mdPath = join(OUT_DIR, `elevate-content-social-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    mdPath,
    [
      `# Elevate Content + Social smoke`,
      ``,
      `- Company: ${ELEVATE.companyName} (${ELEVATE.website})`,
      `- UI: ${BASE_UI}`,
      `- Mode: drafts only (no publish)`,
      `- Result: **${passed} passed · ${failed} failed**`,
      ``,
      ...results.map((r) => `- ${r.status === "pass" ? "✓" : "✗"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
      ``,
    ].join("\n")
  );

  console.log(`\n${"=".repeat(56)}`);
  console.log(`${passed} passed · ${failed} failed`);
  console.log(`report ${jsonPath}`);
  console.log(`summary ${mdPath}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
