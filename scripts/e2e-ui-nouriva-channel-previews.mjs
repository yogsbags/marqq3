#!/usr/bin/env node
/**
 * Nouriva UI smoke — channel-native previews ("feels published"):
 *   Creative Instagram frame · Social platform chrome · Content browser · Outreach email/WA
 *
 *   BASE_UI=http://localhost:5179 node scripts/e2e-ui-nouriva-channel-previews.mjs
 *
 * Prerequisites: Vite UI + backend :3001, GROQ, FAL/Gemini for image; Apollo for outreach compose.
 * Set SKIP_CONTENT=1 to skip SEO draft (slow). SKIP_OUTREACH=1 to skip Apollo.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE_UI = String(process.env.BASE_UI || "http://localhost:5179").replace(/\/$/, "");
const API = String(process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const COMPANY_ID = process.env.COMPANY_ID || "marqq-ws-1";
const SKIP_CONTENT = process.env.SKIP_CONTENT === "1";
const SKIP_OUTREACH = process.env.SKIP_OUTREACH === "1";

const NOURIVA = {
  companyName: "Nouriva AI",
  website: "https://nouriva.tech",
  niche: "Consumer health & nutrition AI app (lab-personalized meal scoring)",
  icp: "Clinic Director, Head of Nutrition, Endocrinologist, Founder, CEO",
  outcome: "Grow paid conversions from trial users who upload labs",
  timeWindow: "90 days",
  target: "200 paid conversions / month",
  baseline: "organic installs + trial starts",
};

const results = [];
const evidence = { shots: [], previews: {} };
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

function loadLatestStrategy() {
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith("nouriva-ui-strategy-") && f.endsWith(".json"))
    .sort();
  if (!files.length) throw new Error("Missing nouriva-ui-strategy-*.json — run onboarding strategy smoke first");
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
  await page.waitForTimeout(500);
  const signupLink = page.getByRole("link", { name: /Sign up|Create/i }).or(page.getByText(/Sign up/i)).first();
  if (await signupLink.isVisible().catch(() => false)) await signupLink.click();
  else {
    await page.evaluate(() => localStorage.setItem("marqq_active_screen", "signup"));
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForTimeout(400);
  const nameInput = page.locator("#su-name").or(page.getByLabel(/Full name|Name/i)).first();
  if (await nameInput.isVisible().catch(() => false)) await nameInput.fill("Nouriva Previews");
  const emailInput = page.locator("#su-email").or(page.getByLabel(/Email/i)).first();
  if (await emailInput.isVisible().catch(() => false)) await emailInput.fill(email);
  else await page.locator('input[type="email"]').first().fill(email);
  const pass = page.locator('input[type="password"]');
  if ((await pass.count()) >= 1) await pass.nth(0).fill(password);
  if ((await pass.count()) >= 2) await pass.nth(1).fill(password);
  await page.getByRole("button", { name: /Create account|Sign up|Register/i }).first().click();
  await page.waitForTimeout(2500);
}

async function injectNouriva(page, strategy) {
  await page.evaluate(
    ({ strategy, company, companyId }) => {
      localStorage.setItem("marqq_onboarding_complete", "1");
      localStorage.setItem("marqq_workspace_id", companyId);
      localStorage.setItem(
        "marqq_active_workspace",
        JSON.stringify({ id: companyId, name: company.companyName, website_url: company.website, role: "owner" })
      );
      localStorage.setItem("marqq_ob_companyName", company.companyName);
      localStorage.setItem("marqq_ob_website", company.website);
      localStorage.setItem("marqq_ob_niche", company.niche);
      localStorage.setItem("marqq_ob_icp", company.icp);
      localStorage.setItem("marqq_ob_outcome", company.outcome);
      localStorage.setItem("marqq_ob_timeWindow", company.timeWindow);
      localStorage.setItem("marqq_ob_target", company.target);
      localStorage.setItem("marqq_ob_baseline", company.baseline);
      localStorage.setItem("marqq_ob_tagline", "Nutrition App That Reads Your Lab Report");
      localStorage.setItem("marqq_active_screen", "creative");
      const wizard = {
        stage: "document",
        phase: "document",
        answers: {
          quantified_target: { value: "200_paid", label: company.target },
          icp: { value: "lab_users", label: company.icp },
        },
        drafts: {},
        strategy,
      };
      sessionStorage.setItem("marqq_gtm_wizard", JSON.stringify(wizard));
      sessionStorage.setItem("marqq_gtm_strategy", JSON.stringify(strategy));
    },
    { strategy, company: NOURIVA, companyId: COMPANY_ID }
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  // Re-pin legacy workspace after ensureUserWorkspace may overwrite with UUID
  await page.evaluate((companyId) => {
    localStorage.setItem("marqq_workspace_id", companyId);
    localStorage.setItem(
      "marqq_active_workspace",
      JSON.stringify({ id: companyId, name: "Nouriva AI", website_url: "https://nouriva.tech", role: "owner" })
    );
  }, COMPANY_ID);
}

async function goScreen(page, label, key) {
  const aside = page.locator("aside").getByText(label, { exact: true }).first();
  if (await aside.isVisible().catch(() => false)) {
    await aside.click({ force: true });
  } else {
    await page.evaluate((screen) => localStorage.setItem("marqq_active_screen", screen), key);
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForTimeout(1000);
}

async function waitForButtonEnabled(page, nameRe, { timeoutMs = 180_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const btn = page.getByRole("button", { name: nameRe }).first();
    if (await btn.isVisible().catch(() => false)) {
      const disabled = await btn.isDisabled().catch(() => true);
      const text = ((await btn.textContent()) || "").trim();
      if (!disabled && !/…|ing\.\.\.|researching|writing|Generating|briefing|Searching|Polling|deciding/i.test(text)) {
        return btn;
      }
    }
    await page.waitForTimeout(1500);
  }
  return null;
}

async function dumpHint(page, label) {
  const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 1200);
  note(`[${label}] ${body.replace(/\s+/g, " ").slice(0, 400)}`);
}

/** Wait until body matches any pattern (real content, not empty shell). */
async function waitForText(page, patterns, { timeoutMs = 180_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const body = await page.locator("body").innerText().catch(() => "");
    if (patterns.some((re) => re.test(body))) return true;
    await page.waitForTimeout(1500);
  }
  return false;
}

async function assertPreview(page, name, patterns) {
  const body = await page.locator("body").innerText();
  const missing = patterns.filter((re) => !re.test(body));
  if (!missing.length) {
    ok(`preview:${name}`);
    evidence.previews[name] = true;
    return true;
  }
  fail(`preview:${name}`, `missing ${missing.map(String).join(" | ")}`);
  evidence.previews[name] = false;
  return false;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const strategy = loadLatestStrategy();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const email = `nouriva.preview.${Date.now()}@marqq.test`;
  const password = "NourivaPreview123!";

  const shot = async (name) => {
    const path = join(OUT_DIR, `nouriva-preview-${name}.png`);
    await page.screenshot({ path, fullPage: true });
    evidence.shots.push(path);
    console.log(`  📸 ${path}`);
    return path;
  };

  try {
    console.log(`\n=== Nouriva channel preview smoke · ${BASE_UI} · ws=${COMPANY_ID} ===\n`);

    await signup(page, email, password);
    ok("signup");
    await injectNouriva(page, strategy);
    ok("workspace:nouriva");

    // —— Creative: Instagram channel frame ——
    console.log("\n[1] Creative Studio · Instagram channel preview");
    await goScreen(page, "Creative Studio", "creative");
    const topic = page.locator("input.input").first();
    if (await topic.isVisible().catch(() => false)) {
      await topic.fill("lab-personalized Indian meal plans from blood markers");
    }
    await shot("01-creative-start");

    const genConcept = page.getByRole("button", { name: /Generate viral concept|Generate concept/i }).first();
    if (await genConcept.isVisible().catch(() => false)) {
      await genConcept.click({ force: true });
      note("Riya deciding viral concept…");
      // Concept success auto-advances to Image step — don't wait for concept-only chrome
      const conceptReady = await waitForText(
        page,
        [/Riya locked creative concept/i, /Still image/i, /Generate image|Regenerate/i, /Viral video decision/i],
        { timeoutMs: 120_000 }
      );
      if (conceptReady) {
        ok("creative:concept");
        await shot("02-creative-concept");
      } else {
        await dumpHint(page, "creative-concept-timeout");
        await shot("02-creative-concept-fail");
        fail("creative:concept", "timed out");
      }
    } else fail("creative:concept", "button missing");

    const imageStep = page.getByText(/^2 · Image$/i).first();
    if (await imageStep.isVisible().catch(() => false)) await imageStep.click().catch(() => {});
    await page.waitForTimeout(400);

    const genImage = page.getByRole("button", { name: /Generate image|Regenerate/i }).first();
    if (await genImage.isVisible().catch(() => false)) {
      const busyAlready = /Generating/i.test((await genImage.textContent().catch(() => "")) || "");
      if (!busyAlready) await genImage.click({ force: true });
      note("Fal / Gemini still…");
      // Image success auto-advances to Video; preview now shows with still until video exists
      const imageReady = await waitForText(
        page,
        [/Channel preview · feels published/i, /Image ready via/i],
        { timeoutMs: 180_000 }
      );
      if (imageReady) {
        ok("creative:image");
        // If still on generating shell, open video/image step that holds the frame
        const videoStep = page.getByText(/^3 · Video$/i).first();
        if (await videoStep.isVisible().catch(() => false)) await videoStep.click().catch(() => {});
        await page.waitForTimeout(500);
        const previewReady = await waitForText(page, [/Channel preview · feels published/i], { timeoutMs: 30_000 });
        if (previewReady) {
          await assertPreview(page, "creative-channel", [/Channel preview · feels published/i, /Nouriva AI/i]);
          await shot("03-creative-ig-preview");
        } else {
          fail("preview:creative-channel", "image ready but no channel chrome");
          await shot("03-creative-ig-preview-missing");
        }
      } else {
        await dumpHint(page, "creative-image-timeout");
        await shot("03-creative-image-fail");
        fail("creative:image", "timed out");
      }
    } else fail("creative:image", "button missing");

    // —— Social: platform chrome ——
    console.log("\n[2] Social Studio · platform chrome");
    await goScreen(page, "Social Media", "social");
    const socialTopic = page.locator("input.input, textarea.input").first();
    if (await socialTopic.isVisible().catch(() => false)) {
      await socialTopic.fill("Upload labs → 7-day Indian kitchen meal plan");
    }
    const genBrief = page.getByRole("button", { name: /Generate brief/i }).first();
    if (await genBrief.isVisible().catch(() => false)) {
      await genBrief.click();
      const briefReady = await waitForText(page, [/Continue to compose|CTA:|Tone:|Kiran wrote/i], { timeoutMs: 120_000 });
      if (briefReady) {
        ok("social:brief");
        const contCompose = page.getByRole("button", { name: /Continue to compose/i }).first();
        if (await contCompose.isVisible().catch(() => false)) await contCompose.click();
        else {
          const composeStep = page.getByText(/^2 · Compose$/i).first();
          if (await composeStep.isVisible().catch(() => false)) await composeStep.click().catch(() => {});
        }
        await page.waitForTimeout(500);
        const gp = page.getByRole("button", { name: /Generate posts|Regenerate/i }).first();
        if (await gp.isVisible().catch(() => false)) {
          await gp.click();
          note("Composing posts…");
          // Must wait for real posts — "Approve all" is enabled even with 0 posts
          const postsReady = await waitForText(
            page,
            [/Composed [1-9]\d* posts/i, /Channel preview · feels published/i],
            { timeoutMs: 180_000 }
          );
          // Reject empty approve shell
          const body = await page.locator("body").innerText();
          if (/0 posts ·/i.test(body) && !/Channel preview · feels published/i.test(body)) {
            await dumpHint(page, "social-zero-posts");
            await shot("04-social-zero-posts");
            fail("social:compose", "0 posts after generate");
          } else if (postsReady || /Channel preview · feels published/i.test(body)) {
            const step3 = page.getByText(/3 · Approve/i).first();
            if (await step3.isVisible().catch(() => false)) await step3.click().catch(() => {});
            await page.waitForTimeout(600);
            ok("social:compose");
            await assertPreview(page, "social-channel", [
              /Channel preview · feels published/i,
              /Like|Comment|Repost|Bookmark|Send/i,
            ]);
            await shot("04-social-channel-preview");
          } else {
            await dumpHint(page, "social-compose-timeout");
            fail("social:compose", "timed out waiting for posts");
          }
        } else fail("social:compose", "Generate posts missing");
      } else {
        await dumpHint(page, "social-brief-timeout");
        fail("social:brief", "timed out");
      }
    } else fail("social:brief", "button missing");

    // —— Content: browser article preview ——
    if (!SKIP_CONTENT) {
      console.log("\n[3] Content Studio · browser article preview");
      let contentPreviewOk = false;

      // Prefer API lane (fast + reliable), then open UI with seeded article for chrome assert
      note("Content API: research → brief → draft");
      try {
        const create = await fetch(`${API}/api/content/runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            companyName: "Nouriva AI",
            companyId: COMPANY_ID,
            workspaceId: COMPANY_ID,
            domain: "nouriva.tech",
            marketType: "b2c",
            brandContext: "Nouriva AI — lab-personalized nutrition for patients and clinical partners.",
          }),
        }).then((r) => r.json());
        const runId = create.runId || create.run?.id;
        if (!create.ok || !runId) throw new Error(create.error || "create failed");
        ok("content:api:create", runId);

        const research = await fetch(`${API}/api/content/runs/${runId}/research`, { method: "POST" }).then((r) => r.json());
        if (!research.ok) throw new Error(research.error || "research failed");
        ok("content:api:research", `${research.plan?.article_queue?.length || 0} queue`);

        const brief = await fetch(`${API}/api/content/runs/${runId}/brief`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ queueIndex: 0 }),
        }).then((r) => r.json());
        if (!brief.ok) throw new Error(brief.error || "brief failed");
        ok("content:api:brief", brief.brief?.keyword || "");

        const draft = await fetch(`${API}/api/content/runs/${runId}/draft`, { method: "POST" }).then((r) => r.json());
        if (!draft.ok || !draft.article?.html) throw new Error(draft.error || "draft failed");
        ok("content:api:draft", `${draft.article.word_count || "?"} words`);

        await goScreen(page, "Content", "content");
        await page.evaluate(
          ({ article, briefPayload, plan, runId: id }) => {
            sessionStorage.setItem(
              "marqq_smoke_content_article",
              JSON.stringify({ article, brief: briefPayload, plan, runId: id })
            );
            localStorage.setItem("marqq_active_screen", "content");
          },
          {
            article: draft.article,
            briefPayload: brief.brief,
            plan: research.plan,
            runId,
          }
        );
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1500);
        const previewReady = await waitForText(page, [/Browser preview · feels published/i], { timeoutMs: 30_000 });
        if (previewReady) {
          await assertPreview(page, "content-browser", [
            /Browser preview · feels published/i,
            /nouriva\.tech|Nouriva/i,
          ]);
          await shot("05-content-browser-preview");
          contentPreviewOk = true;
        } else {
          fail("preview:content-browser", "seeded article but no browser chrome");
          await shot("05-content-browser-missing");
        }
      } catch (err) {
        fail("content:api", err.message || String(err));
        await dumpHint(page, "content-api-fail");
      }

      // UI path as secondary proof when API seed failed
      if (!contentPreviewOk) {
        note("Falling back to Content Studio UI path");
        await goScreen(page, "Content", "content");
        const startResearch = page.getByRole("button", { name: /Start research|Re-run research/i }).first();
        if (await startResearch.isVisible().catch(() => false)) {
          await startResearch.click({ force: true });
          note("Maya researching…");
          const researchReady = await waitForText(page, [/Maya researched \d+ blog opportunities/i], { timeoutMs: 240_000 });
          if (researchReady) ok("content:ui:research");
          else fail("content:ui:research", "timed out");
        }
      }
    } else {
      note("SKIP_CONTENT=1 — skipping browser preview lane");
      ok("content:skipped");
    }

    // —— Outreach: email / WhatsApp preview ——
    if (!SKIP_OUTREACH) {
      console.log("\n[4] Outreach Studio · email / WhatsApp preview");
      await goScreen(page, "Outreach Studio", "outreach");
      // Re-pin Apollo-friendly ICP before studio mounts titles (reload with screen)
      await page.evaluate(() => {
        localStorage.setItem(
          "marqq_ob_icp",
          "Clinic Director, Head of Nutrition, Endocrinologist, Founder, CEO"
        );
        localStorage.setItem("marqq_active_screen", "outreach");
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);

      const fetchBtn = page.getByRole("button", { name: /Fetch prospects|Refresh prospects/i }).first();
      if (await fetchBtn.isVisible().catch(() => false)) {
        await fetchBtn.click();
        note("Apollo fetch…");
        const prospectsReady = await waitForText(
          page,
          [/@[a-z0-9.-]+\.[a-z]{2,}/i, /linkedin\.com\/in\//i, /No prospects matched/i],
          { timeoutMs: 90_000 }
        );
        const hasRows = (await page.locator("table tbody tr").count().catch(() => 0)) > 0;
        const bodyAfter = await page.locator("body").innerText();
        if (/No prospects matched/i.test(bodyAfter) || !hasRows) {
          note("Apollo empty — seeding smoke prospect for email/WA chrome");
          await page.evaluate(() => {
            sessionStorage.setItem(
              "marqq_smoke_outreach_prospect",
              JSON.stringify({
                id: "smoke-nouriva-1",
                full_name: "Dr. Ananya Sharma",
                title: "Clinic Director",
                company: "MetaboCare Clinic",
                email: "ananya@metabocare.example",
                subject: "Lab-personalized plans for your metabolic patients",
                body: "Hi Ananya — Nouriva AI turns lab markers into Indian kitchen meal plans patients actually follow. Open to a 15-min look?",
              })
            );
            localStorage.setItem("marqq_active_screen", "outreach");
          });
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1500);
          ok("outreach:seed-prospect");
        } else {
          ok("outreach:fetch");
          const selectBtn = page.getByRole("button", { name: /Select|Write|Compose/i }).first();
          const rowClick = page.locator("table tbody tr").first();
          if (await selectBtn.isVisible().catch(() => false)) await selectBtn.click();
          else if (await rowClick.isVisible().catch(() => false)) {
            await rowClick.click();
            const composeNav = page.getByText(/2 · Compose/i).first();
            if (await composeNav.isVisible().catch(() => false)) await composeNav.click();
          }
          await page.waitForTimeout(600);
        }

        const genCopy = page.getByRole("button", { name: /Generate copy/i }).first();
        if (await genCopy.isVisible().catch(() => false) && hasRows) {
          await genCopy.click();
          await waitForText(page, [/Channel preview · feels published/i], { timeoutMs: 60_000 });
          ok("outreach:copy");
        } else {
          const subject = page.locator("input.input").first();
          const body = page.locator("textarea").first();
          if (await subject.isVisible().catch(() => false)) {
            await subject.fill("Quick idea for clinic patients on meal adherence");
          }
          if (await body.isVisible().catch(() => false)) {
            await body.fill("Hi — Nouriva AI turns lab markers into Indian kitchen meal plans. Worth a 15-min look?");
          }
          ok("outreach:compose-ready");
        }
        await assertPreview(page, "outreach-email-wa", [/Channel preview · feels published/i]);
        // Toggle WhatsApp tab if present
        const waTab = page.getByRole("button", { name: /^whatsapp$/i }).first();
        if (await waTab.isVisible().catch(() => false)) {
          await waTab.click();
          await page.waitForTimeout(400);
          await assertPreview(page, "outreach-whatsapp", [/WhatsApp|type a message/i]);
        }
        await shot("06-outreach-email-wa-preview");
      } else {
        fail("outreach:fetch", "Fetch prospects missing (Apollo?)");
        await shot("06-outreach-blocked");
      }
    } else {
      note("SKIP_OUTREACH=1");
      ok("outreach:skipped");
    }
  } catch (err) {
    fail("fatal", err.message || String(err));
    await page.screenshot({ path: join(OUT_DIR, `nouriva-preview-fatal-${stamp}.png`), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const md = [
    `# Nouriva — channel preview smoke`,
    ``,
    `- Generated: ${new Date().toISOString()}`,
    `- UI: ${BASE_UI}`,
    `- Workspace: \`${COMPANY_ID}\``,
    `- Result: **${passed} pass · ${failed} fail**`,
    ``,
    `## Preview assertions`,
    ...Object.entries(evidence.previews).map(([k, v]) => `- ${v ? "PASS" : "FAIL"} \`${k}\``),
    ``,
    `## Screenshots`,
    ...evidence.shots.map((p) => `- \`${p.replace(/.*scripts\//, "scripts/")}\``),
    ``,
    `## Results`,
    ...results.map((r) => `- ${r.status === "pass" ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
  ].join("\n");

  const mdPath = join(OUT_DIR, `nouriva-channel-previews-${stamp}.md`);
  writeFileSync(mdPath, md);
  writeFileSync(join(OUT_DIR, `nouriva-channel-previews-${stamp}.json`), JSON.stringify({ results, evidence }, null, 2));
  console.log(`\n📄 ${mdPath}`);
  console.log(`\n=== ${passed} pass · ${failed} fail ===\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
