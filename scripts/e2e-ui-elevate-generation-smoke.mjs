#!/usr/bin/env node
/**
 * Elevate — deep generation smoke (drafts only).
 * Waits for real artifacts: prospects list, content brief/draft, social posts,
 * paid plan, creative concept/image, market research.
 *
 *   BASE_UI=http://localhost:5179 BASE_URL=http://127.0.0.1:3001 \
 *     node scripts/e2e-ui-elevate-generation-smoke.mjs
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

const FORBIDDEN = /Publish now|Publish live|Go live|Send now|Send email|Post live|Launch campaign/i;

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
const artifacts = { prospects: [], content: {}, social: {}, paid: {}, creative: {}, market: {} };

function ok(n, d = "") {
  results.push({ name: n, status: "pass", detail: d });
  console.log(`  ✓ ${n}${d ? ` — ${d}` : ""}`);
}
function fail(n, d = "") {
  results.push({ name: n, status: "fail", detail: d });
  console.error(`  ✗ ${n}${d ? ` — ${d}` : ""}`);
}
function note(m) {
  console.log(`  · ${m}`);
}

function loadStrategy() {
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith("elevate-ui-strategy-") && f.endsWith(".json"))
    .sort();
  if (!files.length) throw new Error("No elevate-ui-strategy-*.json");
  const raw = JSON.parse(readFileSync(join(OUT_DIR, files.at(-1)), "utf8"));
  return { file: files.at(-1), strategy: raw.strategy };
}

async function api(path, { method = "GET", body } = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok !== false, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err.message || "fetch failed" } };
  }
}

async function dismiss(page) {
  for (let i = 0; i < 2; i++) {
    if (!(await page.locator(".modal-overlay").first().isVisible().catch(() => false))) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
}

async function sidebar(page, label) {
  await dismiss(page);
  const item = page.locator("aside").getByText(label, { exact: true }).first();
  if (await item.isVisible().catch(() => false)) {
    await item.click({ force: true });
    await page.waitForTimeout(1000);
    return true;
  }
  return false;
}

async function forceScreen(page, id) {
  await page.evaluate((sid) => localStorage.setItem("marqq_active_screen", sid), id);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
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
  await page.waitForTimeout(400);
  const link = page.getByText(/Sign up/i).first();
  if (await link.isVisible().catch(() => false)) await link.click();
  else {
    await page.evaluate(() => localStorage.setItem("marqq_active_screen", "signup"));
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForTimeout(400);
  const name = page.locator("#su-name").first();
  if (await name.isVisible().catch(() => false)) await name.fill("Elevate Gen");
  await page.locator("input[type=email]").first().fill(email);
  const passes = page.locator("input[type=password]");
  await passes.nth(0).fill(password);
  if ((await passes.count()) >= 2) await passes.nth(1).fill(password);
  await page.getByRole("button", { name: /Create account|Sign up|Register/i }).first().click();
  await page.waitForTimeout(2200);
}

async function inject(page, strategy) {
  await page.evaluate(
    ({ strategy, company, workspaceId }) => {
      localStorage.setItem("marqq_onboarding_complete", "1");
      localStorage.setItem("marqq_workspace_id", workspaceId);
      localStorage.setItem(
        "marqq_active_workspace",
        JSON.stringify({ id: workspaceId, name: company.companyName, website_url: company.website, role: "owner" })
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
      localStorage.setItem("marqq_active_screen", "outreach");
      sessionStorage.setItem(
        "marqq_gtm_wizard",
        JSON.stringify({ stage: "document", phase: "document", answers: {}, drafts: {}, strategy, review: null })
      );
      sessionStorage.setItem("marqq_gtm_strategy", JSON.stringify(strategy));
    },
    { strategy, company: ELEVATE, workspaceId: WORKSPACE_ID }
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
}

async function clickBtn(page, nameRe) {
  const btn = page.getByRole("button", { name: nameRe }).first();
  if (!(await btn.isVisible().catch(() => false))) return null;
  const t = ((await btn.textContent()) || "").trim();
  if (FORBIDDEN.test(t)) {
    note(`skip forbidden: ${t}`);
    return null;
  }
  if (await btn.isDisabled().catch(() => true)) return null;
  await btn.click({ force: true });
  await page.waitForTimeout(600);
  return t;
}

async function waitEnabled(page, nameRe, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const btn = page.getByRole("button", { name: nameRe }).first();
    if (await btn.isVisible().catch(() => false)) {
      const disabled = await btn.isDisabled().catch(() => true);
      const text = ((await btn.textContent()) || "").trim();
      if (FORBIDDEN.test(text)) return null;
      if (!disabled && !/…|ing\.\.\.|researching|writing|generating|briefing|Searching|Polling|Fetching/i.test(text)) {
        return btn;
      }
    }
    await page.waitForTimeout(1500);
  }
  return null;
}

async function waitText(page, re, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const body = await page.locator("body").innerText().catch(() => "");
    if (re.test(body)) return body;
    await page.waitForTimeout(1500);
  }
  return null;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const email = `elevate.gen.${Date.now()}@marqq.test`;
  const password = "ElevateGen123!";

  const shot = async (name) => {
    const path = join(OUT_DIR, `elevate-gen-${name}-${stamp}.png`);
    await page.screenshot({ path, fullPage: true });
    console.log(`  📸 ${path}`);
    return path;
  };

  try {
    console.log("\nElevate deep generation smoke (drafts only)");
    console.log(`UI ${BASE_UI} · API ${API}\n`);

    const { file, strategy } = loadStrategy();
    note(`Strategy ${file} · ${strategy.sections?.length || 0} sections`);
    ok("strategy:loaded", `${strategy.sections?.length || 0} sections`);

    // --- API prospects first (prove list) ---
    console.log("\n[0] API — Apollo prospects for Elevate");
    const runRes = await api("/api/outreach/runs", {
      method: "POST",
      body: {
        workspaceId: WORKSPACE_ID,
        companyId: WORKSPACE_ID,
        companyName: "Elevate",
        titles: [ELEVATE.icp], // bad ICP prose — server must fallback
        country: "India",
        limit: 8,
        contactChannels: ["email"],
      },
    });
    const run = runRes.data.run || {};
    const prospects = Array.isArray(runRes.data.prospects)
      ? runRes.data.prospects
      : Array.isArray(run.prospects)
        ? run.prospects
        : [];
    artifacts.prospects = prospects.map((p) => ({
      name: p.full_name,
      title: p.title,
      company: p.company,
      email: p.email || null,
    }));
    if (prospects.length >= 3) {
      ok("api:prospects", `${prospects.length} · ${artifacts.prospects[0]?.name}`);
      writeFileSync(
        join(OUT_DIR, `elevate-gen-prospects-${stamp}.json`),
        JSON.stringify(
          { source: run.source || runRes.data.source, titles: run.titles, prospects: artifacts.prospects },
          null,
          2
        )
      );
    } else {
      fail("api:prospects", runRes.data.error || `count=${prospects.length} keys=${Object.keys(runRes.data || {})}`);
    }

    console.log("\n[1] Signup + inject Elevate");
    await signup(page, email, password);
    ok("signup");
    await inject(page, strategy);
    await shot("01-shell");

    // --- Outreach UI ---
    console.log("\n[2] Outreach — Fetch prospects until list visible");
    if (!(await sidebar(page, "Outreach Studio"))) await forceScreen(page, "outreach");
    else ok("nav:outreach");
    await page.waitForTimeout(800);

    let fetched = await clickBtn(page, /Fetch prospects|Refresh prospects/i);
    if (!fetched) fail("outreach:fetch-btn", "missing");
    else {
      note("Waiting for Apollo search to finish (up to 120s)…");
      const start = Date.now();
      let listOk = false;
      while (Date.now() - start < 120_000) {
        const searching = await page
          .getByRole("button", { name: /Searching Apollo/i })
          .first()
          .isVisible()
          .catch(() => false);
        const err = await page.getByText(/No prospects matched/i).first().isVisible().catch(() => false);
        const empty = await page.getByText(/No prospects yet/i).first().isVisible().catch(() => false);
        const selectCount = await page.getByRole("button", { name: /^Select$/i }).count();
        const body = await page.locator("body").innerText();
        const emailHits = (body.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).length;
        // Row-like: name + company visible after fetch
        if (!searching && !err && (selectCount >= 1 || emailHits >= 2)) {
          listOk = true;
          ok("outreach:prospects-list", `selects=${selectCount} emails≈${emailHits}`);
          await shot("02-prospects-list");
          if (selectCount >= 1) {
            await page.getByRole("button", { name: /^Select$/i }).first().click();
            await page.waitForTimeout(800);
            const gen = await clickBtn(page, /Generate copy|Generate sequence/i);
            if (gen) {
              note("Sam writing sequence…");
              const ready = await waitEnabled(page, /Continue to approve|Approve/i, 120_000);
              const copyBody = await page.locator("body").innerText();
              if (ready || /Subject:|Hi |Dear |sequence|email/i.test(copyBody)) {
                ok("outreach:copy", "draft sequence ready");
                artifacts.social.outreachCopy = true;
                await shot("03-outreach-copy");
              } else fail("outreach:copy", "no draft text");
            } else ok("outreach:selected", "prospect selected");
          }
          break;
        }
        if (!searching && err) {
          fail("outreach:prospects-list", "No prospects matched");
          await shot("02-prospects-fail");
          break;
        }
        if (!searching && empty && Date.now() - start > 15_000) {
          // Retry once if still empty after search ended
          note("Empty after search — retrying Fetch…");
          await clickBtn(page, /Fetch prospects|Refresh prospects/i);
          await page.waitForTimeout(2000);
        }
        await page.waitForTimeout(2000);
      }
      if (!listOk && !(await page.getByText(/No prospects matched/i).first().isVisible().catch(() => false))) {
        const body = await page.locator("body").innerText();
        fail("outreach:prospects-list", body.slice(0, 200));
        await shot("02-prospects-timeout");
      }
    }

    // --- Content ---
    console.log("\n[3] Content — research → brief → draft");
    if (!(await sidebar(page, "Content"))) await forceScreen(page, "content");
    await shot("04-content-start");

    const startResearch = page.getByRole("button", { name: /Start research|Re-run research/i }).first();
    if (await startResearch.isVisible().catch(() => false)) {
      await startResearch.click();
      note("Maya researching…");
    }

    // Wait until brief step or Generate brief visible
    const briefReady = await waitText(
      page,
      /Generate brief|researched \d+|Pick a queue keyword|2 · Brief/i,
      240_000
    );
    if (briefReady) {
      ok("content:research", "keywords/brief step ready");
      await shot("05-content-research");
      // Pick keyword if chips present
      const chip = page.getByRole("button", { name: /digital transformation|strategy|AI|consulting/i }).first();
      if (await chip.isVisible().catch(() => false)) await chip.click().catch(() => {});
      const genBrief = await clickBtn(page, /Generate brief/i);
      if (genBrief) {
        note("Generating brief…");
        const toDraft = await waitEnabled(page, /Continue to Riya draft|Generate draft/i, 180_000);
        const briefBody = await page.locator("body").innerText();
        if (toDraft || /H1|outline|angle|brief|keyword/i.test(briefBody)) {
          ok("content:brief", "brief generated");
          artifacts.content.brief = true;
          await shot("06-content-brief");
          if (toDraft) await toDraft.click();
          await page.waitForTimeout(600);
          const genDraft = await clickBtn(page, /Generate draft|Redraft/i);
          if (genDraft) {
            note("Riya drafting…");
            const toApprove = await waitEnabled(page, /Continue to approve|Approve article/i, 300_000);
            const draftBody = await page.locator("body").innerText();
            if (toApprove || draftBody.length > 800) {
              ok("content:draft", `chars≈${draftBody.length}`);
              artifacts.content.draft = draftBody.slice(0, 500);
              await shot("07-content-draft");
              if (toApprove) {
                await toApprove.click();
                await page.waitForTimeout(500);
                await clickBtn(page, /Approve article/i);
                ok("content:approve-draft");
              }
            } else fail("content:draft", "empty/timeout");
          } else fail("content:draft", "Generate draft missing");
        } else fail("content:brief", "timeout");
      } else fail("content:brief", "Generate brief missing");
    } else fail("content:research", "timeout");

    // --- Social ---
    console.log("\n[4] Social — Generate brief → posts");
    if (!(await sidebar(page, "Social Media"))) await forceScreen(page, "social");
    const topic = page.locator("input.input, textarea.input, input, textarea").first();
    if (await topic.isVisible().catch(() => false)) {
      await topic.fill("Elevate strategy-to-execution for mid-market AI transformation — 5 qualified leads / month");
    }
    if (await clickBtn(page, /Generate brief/i)) {
      note("Kiran briefing…");
      const postsBtn = await waitEnabled(page, /Generate posts|Regenerate/i, 150_000);
      await shot("08-social-brief");
      if (postsBtn || (await page.getByText(/CTA:|Tone:/i).first().isVisible().catch(() => false))) {
        ok("social:brief");
        artifacts.social.brief = true;
        const compose = page.getByText(/^2 · Compose$/i).first();
        if (await compose.isVisible().catch(() => false)) await compose.click().catch(() => {});
        const gp = page.getByRole("button", { name: /Generate posts|Regenerate/i }).first();
        if (await gp.isVisible().catch(() => false)) {
          await gp.click();
          note("Composing posts…");
          await waitText(page, /Approve all|LinkedIn|Instagram|Facebook|caption/i, 180_000);
          const socialBody = await page.locator("body").innerText();
          if (/LinkedIn|Instagram|Facebook|Approve all|caption/i.test(socialBody)) {
            ok("social:posts", "compose ready");
            artifacts.social.posts = true;
            await shot("09-social-posts");
            // Approve drafts only — never Post live
            await clickBtn(page, /Approve all/i);
          } else fail("social:posts", socialBody.slice(0, 160));
        } else fail("social:posts", "Generate posts missing");
      } else fail("social:brief", "timeout");
    } else fail("social:brief", "Generate brief missing");

    // --- Paid ---
    console.log("\n[5] Paid — Generate plan");
    if (!(await sidebar(page, "Paid Media"))) await forceScreen(page, "paid");
    // Ensure on Plan step
    const planTab = page.getByText(/2 · Plan|^Plan$/i).first();
    if (await planTab.isVisible().catch(() => false)) await planTab.click().catch(() => {});
    if (await clickBtn(page, /Generate plan/i)) {
      note("Zara planning…");
      const planReady = await waitText(
        page,
        /audience|budget|campaign|Meta|creative|Continue to creative|3 · Creative/i,
        180_000
      );
      if (planReady) {
        ok("paid:plan", "plan text ready");
        artifacts.paid.plan = true;
        await shot("10-paid-plan");
      } else fail("paid:plan", "timeout");
    } else fail("paid:plan", "Generate plan missing");

    // --- Creative ---
    console.log("\n[6] Creative — concept → image");
    if (!(await sidebar(page, "Creative Studio"))) await forceScreen(page, "creative");
    if (await clickBtn(page, /Generate viral concept|Generate concept/i)) {
      note("Riya concept…");
      const toImage = await waitEnabled(page, /Continue to image/i, 120_000);
      const conceptBody = await page.locator("body").innerText();
      if (toImage || /hook|concept|reel|script/i.test(conceptBody)) {
        ok("creative:concept");
        artifacts.creative.concept = true;
        await shot("11-creative-concept");
        if (toImage) await toImage.click();
        await page.waitForTimeout(500);
        if (await clickBtn(page, /Generate image|Regenerate/i)) {
          note("Image generating…");
          const toVideo = await waitEnabled(page, /Continue to video/i, 180_000);
          const img = page.locator("img[alt*='Creative' i], img").first();
          const hasImg = await img.isVisible().catch(() => false);
          if (toVideo || hasImg) {
            ok("creative:image", hasImg ? "img visible" : "continue ready");
            artifacts.creative.image = true;
            await shot("12-creative-image");
          } else fail("creative:image", "timeout");
        } else fail("creative:image", "Generate image missing");
      } else fail("creative:concept", "timeout");
    } else fail("creative:concept", "Generate concept missing");

    // --- Market ---
    console.log("\n[7] Market — wait for research finish");
    if (!(await sidebar(page, "Market Intelligence"))) await forceScreen(page, "market");
    await clickBtn(page, /Run live research|Refresh research|Refresh/i);
    note("Waiting for market research…");
    await page.waitForTimeout(5000);
    // Wait until Researching… goes away or competitors/signals appear
    for (let i = 0; i < 40; i++) {
      const t = await page.locator("body").innerText();
      if (!/Researching…|Researching\.\.\./i.test(t) && /competitor|signal|insight|market|ICP/i.test(t)) break;
      await page.waitForTimeout(3000);
    }
    const marketBody = await page.locator("body").innerText();
    if (marketBody.length > 400) {
      ok("market:output", `chars≈${marketBody.length}`);
      artifacts.market.chars = marketBody.length;
      await shot("13-market");
    } else fail("market:output", "thin");
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
    mode: "drafts_only_deep_generation",
    email,
    artifacts,
    passed,
    failed,
    results,
  };
  const jsonPath = join(OUT_DIR, `elevate-generation-smoke-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    join(OUT_DIR, `elevate-generation-smoke-${stamp}.md`),
    [
      `# Elevate deep generation smoke`,
      ``,
      `- Mode: drafts only`,
      `- Prospects: ${artifacts.prospects.length}`,
      ...artifacts.prospects.slice(0, 8).map((p) => `  - ${p.name} · ${p.title} @ ${p.company}`),
      `- Result: **${passed} passed · ${failed} failed**`,
      ``,
      ...results.map((r) => `- ${r.status === "pass" ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
      ``,
    ].join("\n")
  );

  console.log(`\n${"=".repeat(56)}`);
  console.log(`${passed} passed · ${failed} failed`);
  console.log(`prospects ${artifacts.prospects.length}`);
  console.log(`report ${jsonPath}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
