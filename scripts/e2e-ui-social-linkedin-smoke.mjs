#!/usr/bin/env node
/**
 * Social Studio UI smoke — signup → brief draft → LinkedIn compose (drafts only).
 *
 *   BASE_UI=http://localhost:5179 node scripts/e2e-ui-social-linkedin-smoke.mjs
 *   BRAND=elevate|nouriva BASE_UI=http://localhost:5179 node scripts/e2e-ui-social-linkedin-smoke.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE_UI = String(process.env.BASE_UI || "http://localhost:5179").replace(/\/$/, "");
const SOCIAL_BRIEF_MS = Number(process.env.SOCIAL_BRIEF_TIMEOUT_MS || 150_000);
const SOCIAL_POSTS_MS = Number(process.env.SOCIAL_POSTS_TIMEOUT_MS || 180_000);
const BRAND_KEY = String(process.env.BRAND || "elevate").toLowerCase().trim();

const BRANDS = {
  elevate: {
    id: "elevate",
    companyName: "Elevate",
    website: "https://theelevate.co.in",
    niche: "Management strategy, AI solutions & digital transformation consulting",
    icp: "CDO, Head of Digital Transformation, Head of AI/ML, DX program leads at mid-market BFSI and growth companies",
    strategyPrefix: "elevate-ui-strategy-",
    topic:
      "Elevate for mid-market DX leaders: strategy decks that never become delivery — cover AI AND non-AI digital transformation (operating model, change, governance, execution handoffs)",
    signupName: "Elevate Social LI",
    emailPrefix: "elevate.social.li",
  },
  nouriva: {
    id: "nouriva",
    companyName: "Nouriva AI",
    website: "https://nouriva.tech",
    niche: "Lab-driven personalized nutrition for Indian adults seeking meal guidance",
    icp: "Health-conscious Indian adults aged 25–55 seeking lab-based meal guidance and Indian-cuisine nutrition (not CPG brand marketers or corporate wellness buyers)",
    strategyPrefix: "nouriva-ui-strategy-",
    topic:
      "Nouriva AI: how health-conscious Indians 25–55 know which everyday Indian meals actually match their latest labs",
    signupName: "Nouriva Social LI",
    emailPrefix: "nouriva.social.li",
  },
};

const BRAND = BRANDS[BRAND_KEY] || BRANDS.elevate;
if (!BRANDS[BRAND_KEY]) {
  console.warn(`Unknown BRAND=${BRAND_KEY}, defaulting to elevate`);
}

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

function loadStrategy(prefix) {
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort();
  if (!files.length) return { file: null, strategy: null };
  const raw = JSON.parse(readFileSync(join(OUT_DIR, files.at(-1)), "utf8"));
  return { file: files.at(-1), strategy: raw.strategy || raw };
}

const BANNED_OPENERS = /Excited to announce|I'm humbled|Thrilled to share|Delighted to share/i;
const FAKE_METRIC_RE =
  /(\b\d{1,3}\s*%|\b\d+\s*(?:clients?|firms?|companies|customers)\b|\bin our (?:recent )?work with\s+\d+)/i;

function scoreCaption(caption) {
  const text = String(caption || "").trim();
  const lines = text.split(/\n+/).filter(Boolean);
  const first = lines[0] || "";
  const last5 = lines.slice(-5).join("\n");
  const valueExchange =
    /like this post/i.test(last5) &&
    /comment\s+["“']?\w+/i.test(last5) &&
    /connect/i.test(last5) &&
    (/i'?ll send|i will send|send (it|the|you)/i.test(last5) ||
      /\b(pdf|checklist|spreadsheet|excel|scorecard|kpi|template|playbook)\b/i.test(text));
  return {
    chars: text.length,
    hook: first.slice(0, 180),
    hasWhitespace: /\n\n/.test(text),
    endsWithQuestion: /\?\s*$/.test(text) || /\?\s*$/m.test(last5),
    valueExchange,
    bannedOpener: BANNED_OPENERS.test(text),
    fakeMetricSmell: FAKE_METRIC_RE.test(text),
    postableShape: text.length >= 1200 && first.length >= 20 && first.length <= 220,
  };
}

async function waitComposeIdle(page, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const writing = page.getByRole("button", { name: /Writing/i }).first();
    if (await writing.isVisible().catch(() => false)) {
      await page.waitForTimeout(1500);
      continue;
    }
    const btn = page.getByRole("button", { name: /Generate posts|Regenerate/i }).first();
    if (await btn.isVisible().catch(() => false)) {
      const disabled = await btn.isDisabled().catch(() => true);
      if (!disabled) return true;
    }
    await page.waitForTimeout(1000);
  }
  return false;
}

async function readLinkedInCaptions(page) {
  // compose cards OR approve cards (compose API sets step=approve and applyRun navigates away)
  let cards = page.locator('[data-testid="social-post-card"][data-channel="linkedin"]');
  if ((await cards.count()) === 0) {
    cards = page.locator('[data-testid="social-approve-card"][data-channel="linkedin"]');
  }
  let n = await cards.count();

  // Fallback without testids: heading "linkedin · …" + following textarea
  if (!n) {
    const headings = page.locator("div").filter({ hasText: /^linkedin\s*·/i });
    const count = await headings.count().catch(() => 0);
    const out = [];
    for (let i = 0; i < Math.min(count, 12); i++) {
      const h = headings.nth(i);
      const text = ((await h.innerText().catch(() => "")) || "").trim();
      if (!/^linkedin\s*·/i.test(text.split("\n")[0] || "")) continue;
      const angle = (text.match(/^linkedin\s*·\s*([a-z0-9_-]+)/i) || [])[1] || "";
      const box = h.locator("xpath=ancestor::div[.//textarea][1]");
      const caption = await box.locator("textarea").first().inputValue().catch(() => "");
      if (String(caption || "").trim().length > 40) {
        out.push({ angle: angle.toLowerCase(), caption: String(caption).trim() });
      }
    }
    // de-dupe
    const seen = new Set();
    return out.filter((p) => {
      const k = p.caption.slice(0, 80);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    const angle = (await card.getAttribute("data-angle")) || "";
    const caption = await card
      .locator('[data-testid="social-post-caption"], textarea')
      .first()
      .inputValue()
      .catch(() => "");
    out.push({ angle, caption: String(caption || "").trim() });
  }
  return out.filter((p) => p.caption.length > 40);
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
    await page.waitForTimeout(800);
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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const shotDir = join(OUT_DIR, `social-li-smoke-${BRAND.id}-${stamp}`);
  mkdirSync(shotDir, { recursive: true });
  const { chromium } = await loadPlaywright();
  const { file, strategy } = loadStrategy(BRAND.strategyPrefix);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const email = `${BRAND.emailPrefix}.${Date.now()}@marqq.test`;
  const password = "SocialSmoke123!";

  const shot = async (name) => {
    await page.screenshot({ path: join(shotDir, `${name}.png`), fullPage: true }).catch(() => {});
  };

  /** @type {Array<{angle:string,caption:string,score:ReturnType<typeof scoreCaption>}>} */
  let capturedPosts = [];

  console.log("\nSocial LinkedIn UI smoke (drafts only)");
  console.log(`Brand ${BRAND.companyName} (${BRAND.id})`);
  console.log(`UI ${BASE_UI}`);
  console.log(`Strategy ${file || "(none)"}\n`);

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
    if (await nameInput.isVisible().catch(() => false)) await nameInput.fill(BRAND.signupName);
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
      if (/Command Center|Ask Marqq|Content|GTM Wizard|Orchestration|Social Media/i.test(body) && !/Step \d+ of/i.test(body)) break;
      const skip = page.getByRole("button", { name: /Skip|Continue|Next|Launch|Finish|Done|Open app/i }).first();
      if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
      await page.waitForTimeout(800);
    }

    await page.evaluate(
      ({ strategy, brand }) => {
        localStorage.setItem("marqq_onboarding_complete", "1");
        localStorage.setItem("marqq_ob_companyName", brand.companyName);
        localStorage.setItem("marqq_ob_website", brand.website);
        localStorage.setItem("marqq_ob_niche", brand.niche);
        localStorage.setItem("marqq_ob_icp", brand.icp);
        localStorage.setItem(
          "marqq_brand_context",
          JSON.stringify({
            companyName: brand.companyName,
            website: brand.website,
            niche: brand.niche,
            icp: brand.icp,
          })
        );
        if (strategy) {
          localStorage.setItem("marqq_gtm_strategy", JSON.stringify(strategy));
          sessionStorage.setItem("marqq_gtm_strategy", JSON.stringify(strategy));
        }
        localStorage.setItem("marqq_active_screen", "social");
      },
      { strategy, brand: BRAND }
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    console.log("\n[1] Social Media — brief draft UI");
    if (!(await clickSidebar(page, "Social Media"))) await forceScreen(page, "social");
    else ok("nav:social");
    await shot("01-social-start");

    const body0 = await page.locator("body").innerText().catch(() => "");
    if (/Social Studio|Generate brief|Kiran|Channels|Topic/i.test(body0)) ok("social:screen", "studio visible");
    else fail("social:screen", "Social studio UI not recognized");

    // Prefer topic field labeled/near Social studio
    const topic = page.getByLabel(/topic|post about|what should we post/i).first()
      .or(page.locator("textarea").first())
      .or(page.locator("input.input, textarea.input").first());
    if (await topic.isVisible().catch(() => false)) {
      await topic.fill(BRAND.topic);
      ok("social:topic-filled");
    } else {
      note("topic input not found — continuing with defaults");
    }

    const socialBriefBtn = page.getByRole("button", { name: /Generate brief|Start brief/i }).first();
    if (!(await socialBriefBtn.isVisible().catch(() => false))) {
      fail("social:brief", "Generate brief missing");
      await shot("02-social-brief-missing");
    } else {
      await socialBriefBtn.click();
      note("Kiran briefing…");
      await waitEnabled(page, /Generate posts|Regenerate|Continue to compose/i, SOCIAL_BRIEF_MS);
      const socialBriefBody = await page.locator("body").innerText().catch(() => "");
      const briefSignals =
        /CTA:|Tone:|Continue to compose|Kiran wrote the social brief/i.test(socialBriefBody);
      if (briefSignals) {
        ok(
          "social:brief",
          socialBriefBody.match(/.{0,40}(AI|playbook|deck|strategy).{0,90}/i)?.[0]?.replace(/\s+/g, " ").slice(0, 120) ||
            "brief surfaced"
        );
        await shot("02-social-brief");

        if (BANNED_OPENERS.test(socialBriefBody)) {
          fail("social:brief-virality", "banned corporate opener in brief UI");
        } else {
          ok("social:brief-virality", "no banned openers in brief UI");
        }

        console.log("\n[2] LinkedIn post creation");
        // Header "linkedin ●" alone is NOT compose-ready — leave brief step first
        const continueCompose = page.getByRole("button", { name: /Continue to compose/i }).first();
        if (await continueCompose.isVisible().catch(() => false)) {
          await continueCompose.click();
          await page.waitForTimeout(500);
        } else {
          const composeTab = page.getByRole("button", { name: /^2 · Compose$/i }).first();
          if (await composeTab.isVisible().catch(() => false)) await composeTab.click().catch(() => {});
        }

        const gp = page.getByRole("button", { name: /Generate posts|Regenerate/i }).first();
        if (!(await gp.isVisible().catch(() => false))) {
          fail("social:posts", "Generate posts missing on compose step");
          await shot("03-social-posts-missing");
        } else {
          await gp.click();
          note("Composing posts… waiting for Writing… to finish + caption cards");
          // Compose may auto-jump to Approve (run.step=approve) — wait for either surface
          const tPosts = Date.now();
          let liCaptions = [];
          while (Date.now() - tPosts < SOCIAL_POSTS_MS) {
            const writing = page.getByRole("button", { name: /Writing/i }).first();
            if (await writing.isVisible().catch(() => false)) {
              await page.waitForTimeout(1500);
              continue;
            }
            liCaptions = await readLinkedInCaptions(page);
            if (liCaptions.length) break;
            // Also click Approve tab if compose finished and journey jumped
            const approveTab = page.getByRole("button", { name: /^3 · Approve/i }).first();
            if (await approveTab.isVisible().catch(() => false)) {
              const cls = (await approveTab.getAttribute("class").catch(() => "")) || "";
              if (/btn-primary/i.test(cls) || /Composed|Approve & publish/i.test(await page.locator("body").innerText().catch(() => ""))) {
                await approveTab.click().catch(() => {});
              }
            }
            const body = await page.locator("body").innerText().catch(() => "");
            if (/failed|insufficient_credits|GROQ_API_KEY/i.test(body)) {
              fail(
                "social:posts",
                body.match(/failed[^\n]{0,80}|insufficient_credits|GROQ_API_KEY[^\n]{0,60}/i)?.[0] || "error"
              );
              break;
            }
            await page.waitForTimeout(2000);
          }

          if (!liCaptions.length) {
            fail("social:posts", "no LinkedIn caption cards with body text");
            await shot("03-social-posts-timeout");
          } else {
            capturedPosts = liCaptions.map((p) => ({ ...p, score: scoreCaption(p.caption) }));
            const sample = capturedPosts[0];
            ok(
              "social:posts",
              `${capturedPosts.length} LinkedIn caption(s); first ${sample.score.chars} chars`
            );
            await shot("03-social-posts");

            ok("social:linkedin-card", `angles: ${capturedPosts.map((p) => p.angle).join(", ")}`);

            if (capturedPosts.some((p) => p.score.bannedOpener)) {
              fail("social:linkedin-virality", "banned opener in caption");
            } else {
              ok("social:linkedin-virality", "no banned openers in captions");
            }

            if (capturedPosts.some((p) => p.score.fakeMetricSmell)) {
              fail("social:linkedin-truth", "fake metric smell in caption");
            } else {
              ok("social:linkedin-truth", "no unverified % / client-count smell");
            }

            const postable = capturedPosts.filter(
              (p) => p.score.postableShape && p.score.valueExchange
            );
            if (postable.length) {
              ok(
                "social:linkedin-postable",
                `${postable.length}/${capturedPosts.length} value-exchange (like+comment+connect+send asset)`
              );
            } else {
              fail(
                "social:linkedin-postable",
                `missing value CTA; sample hook=${JSON.stringify(sample.score.hook)} valueExchange=${sample.score.valueExchange}`
              );
            }

            const toApprove = page
              .getByTestId("social-continue-approve")
              .or(page.getByRole("button", { name: /Continue to approve/i }))
              .first();
            if (await toApprove.isVisible().catch(() => false)) {
              await toApprove.click();
              await page.waitForTimeout(800);
            } else {
              const approveTab = page.getByRole("button", { name: /^3 · Approve/i }).first();
              if (await approveTab.isVisible().catch(() => false)) await approveTab.click().catch(() => {});
              await page.waitForTimeout(500);
            }

            const preview = page.locator('[data-testid="social-channel-preview"][data-channel="linkedin"]').first();
            const previewFallback = page.getByText(/Channel preview|feels published/i).first();
            if (await preview.isVisible().catch(() => false)) {
              await preview.scrollIntoViewIfNeeded().catch(() => {});
              ok("social:linkedin-preview", "channel preview visible");
              await shot("04-linkedin-preview");
              await preview.screenshot({ path: join(shotDir, "04b-linkedin-preview-card.png") }).catch(() => {});
            } else if (await previewFallback.isVisible().catch(() => false)) {
              await previewFallback.scrollIntoViewIfNeeded().catch(() => {});
              ok("social:linkedin-preview", "channel preview label visible");
              await shot("04-linkedin-preview");
            } else {
              fail("social:linkedin-preview", "approve preview missing");
              await shot("04-linkedin-preview-missing");
            }
          }
        }
      } else {
        fail("social:brief", "timed out / no brief signals");
        await shot("02-social-brief-fail");
      }
    }

    const forbiddenBtn = page.getByRole("button", { name: FORBIDDEN }).first();
    if (await forbiddenBtn.isVisible().catch(() => false)) {
      note(`live CTA visible (not clicked): ${((await forbiddenBtn.textContent()) || "").trim()}`);
    }
    ok("drafts_only", "no publish / post live clicked");
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
    brand: BRAND.id,
    company: {
      companyName: BRAND.companyName,
      website: BRAND.website,
      niche: BRAND.niche,
      icp: BRAND.icp,
    },
    baseUi: BASE_UI,
    strategyFile: file,
    passed,
    failed,
    results,
    linkedinPosts: capturedPosts.map((p) => ({
      angle: p.angle,
      chars: p.score.chars,
      hook: p.score.hook,
      hasWhitespace: p.score.hasWhitespace,
      endsWithQuestion: p.score.endsWithQuestion,
      valueExchange: p.score.valueExchange,
      bannedOpener: p.score.bannedOpener,
      fakeMetricSmell: p.score.fakeMetricSmell,
      postableShape: p.score.postableShape,
      caption: p.caption,
    })),
    shots: shotDir,
  };
  const jsonPath = join(OUT_DIR, `social-li-smoke-${BRAND.id}-${stamp}.json`);
  const mdPath = join(OUT_DIR, `social-li-smoke-${BRAND.id}-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    mdPath,
    [
      `# Social LinkedIn UI smoke — ${BRAND.companyName}`,
      ``,
      `- Brand: ${BRAND.id}`,
      `- UI: ${BASE_UI}`,
      `- Mode: drafts only`,
      `- Result: **${passed} passed · ${failed} failed**`,
      `- Shots: \`${shotDir}\``,
      ``,
      `## LinkedIn captions`,
      ...(capturedPosts.length
        ? capturedPosts.flatMap((p) => [
            ``,
            `### ${p.angle} (${p.score.chars} chars)`,
            ``,
            "```",
            p.caption,
            "```",
            ``,
            `- postableShape: ${p.score.postableShape}`,
            `- valueExchange: ${p.score.valueExchange}`,
            `- endsWithQuestion: ${p.score.endsWithQuestion}`,
            `- fakeMetricSmell: ${p.score.fakeMetricSmell}`,
          ])
        : ["", "_No LinkedIn captions captured._"]),
      ``,
      `## Checks`,
      ...results.map((r) => `- ${r.status === "pass" ? "✓" : "✗"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
      ``,
    ].join("\n")
  );

  console.log(`\n${"=".repeat(56)}`);
  console.log(`${passed} passed · ${failed} failed`);
  console.log(`report ${jsonPath}`);
  console.log(`shots ${shotDir}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
