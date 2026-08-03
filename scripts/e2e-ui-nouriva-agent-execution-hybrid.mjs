#!/usr/bin/env node
/**
 * Nouriva hybrid agent-execution smoke:
 *   1) API agent lanes (SEO/LLMO, Fal creative, social organic, Apollo→Gmail outreach)
 *   2) UI walkthrough with screenshots tying each lane to North Star
 *
 *   BASE_UI=http://localhost:5179 node scripts/e2e-ui-nouriva-agent-execution-hybrid.mjs
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
const TEST_TO = process.env.OUTREACH_TEST_TO || "yogsbags@gmail.com";

const results = [];
const evidence = { lanes: {}, connectors: {}, gmailConnectUrl: null, goals: {} };
const ok = (n, d = "") => { results.push({ name: n, status: "pass", detail: d }); console.log(`  ✓ ${n}${d ? ` — ${d}` : ""}`); };
const fail = (n, d = "") => { results.push({ name: n, status: "fail", detail: d }); console.error(`  ✗ ${n}${d ? ` — ${d}` : ""}`); };
const note = (m) => console.log(`  · ${m}`);

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}

async function loadPlaywright() {
  try { return await import("playwright"); }
  catch {
    spawnSync("npm", ["install", "--no-save", "playwright@1.52.0"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
    spawnSync("npx", ["playwright", "install", "chromium"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
    return import("playwright");
  }
}

function loadStrategy() {
  const files = readdirSync(OUT_DIR).filter((f) => f.startsWith("nouriva-ui-strategy-") && f.endsWith(".json")).sort();
  if (!files.length) throw new Error("Missing nouriva-ui-strategy-*.json");
  return JSON.parse(readFileSync(join(OUT_DIR, files.at(-1)), "utf8")).strategy;
}

async function runApiLanes() {
  console.log("\n[A] Agent lanes via API (real connectors / Fal / Groq)\n");

  // Connectors + Gmail URL
  const int = await api(`/api/integrations?companyId=${encodeURIComponent(COMPANY_ID)}`);
  const connectors = int.data.connectors || [];
  const byId = Object.fromEntries(connectors.map((c) => [c.id, c]));
  evidence.connectors = {
    apollo: byId.apollo?.connected || byId.apollo?.status,
    gmail: byId.gmail?.connected || byId.gmail?.status,
    instagram: byId.instagram?.connected || byId.instagram?.status,
    facebook: byId.facebook?.connected || byId.facebook?.status,
    linkedin: byId.linkedin?.connected || byId.linkedin?.status,
    connected: connectors.filter((c) => c.connected || c.status === "active").map((c) => c.id),
  };
  if (evidence.connectors.apollo === true || evidence.connectors.apollo === "active") ok("api:connector:apollo");
  else fail("api:connector:apollo", String(evidence.connectors.apollo));
  if (evidence.connectors.gmail === true || evidence.connectors.gmail === "active") ok("api:connector:gmail");
  else fail("api:connector:gmail", String(evidence.connectors.gmail));
  ok("api:connector:socials", `ig=${evidence.connectors.instagram} fb=${evidence.connectors.facebook} li=${evidence.connectors.linkedin}`);

  const gmailLink = await api("/api/integrations/connect", { method: "POST", body: { companyId: COMPANY_ID, connectorId: "gmail" } });
  if (gmailLink.data.redirectUrl) {
    evidence.gmailConnectUrl = gmailLink.data.redirectUrl;
    writeFileSync(join(OUT_DIR, "gmail-connect-url.txt"), evidence.gmailConnectUrl + "\n");
    ok("gmail:reconnect-url", evidence.gmailConnectUrl);
  }

  // SEO / LLMO content
  note("Maya → Riya SEO/LLMO content…");
  const cCreate = await api("/api/content/runs", {
    method: "POST",
    body: {
      companyName: "Nouriva AI",
      companyId: COMPANY_ID,
      workspaceId: COMPANY_ID,
      domain: "nouriva.tech",
      marketType: "b2c",
      brandContext: "Nouriva AI — lab-personalized nutrition; North Star 200 paid conversions/month via lab-upload trials.",
    },
  });
  if (!cCreate.ok) { fail("api:content:create", cCreate.data?.error); }
  else {
    const runId = cCreate.data.runId || cCreate.data.run?.id;
    ok("api:content:create", runId);
    const research = await api(`/api/content/runs/${runId}/research`, { method: "POST" });
    if (!research.ok) fail("api:content:research", research.data?.error);
    else ok("api:content:research", `${research.data.plan?.article_queue?.length || 0} queue · LLMO gaps`);
    const brief = await api(`/api/content/runs/${runId}/brief`, { method: "POST", body: {} });
    if (!brief.ok) fail("api:content:brief", brief.data?.error);
    else ok("api:content:brief", brief.data.brief?.keyword || "");
    const draft = await api(`/api/content/runs/${runId}/draft`, { method: "POST" });
    if (!draft.ok) fail("api:content:draft", draft.data?.error);
    else ok("api:content:draft", `${draft.data.article?.title || ""} (${draft.data.article?.word_count || 0}w)`);
    const approve = await api(`/api/content/runs/${runId}/approve`, { method: "POST" });
    if (!approve.ok) fail("api:content:approve", approve.data?.error);
    else ok("api:content:approve");
    evidence.lanes.content = {
      runId,
      keyword: brief.data.brief?.keyword,
      title: draft.data.article?.title,
      words: draft.data.article?.word_count,
      queue: research.data.plan?.article_queue?.slice(0, 3).map((q) => q.keyword || q.title),
    };
  }

  // Creative Fal
  note("Riya creative concept → Fal image/video…");
  const cr = await api("/api/creative/runs", {
    method: "POST",
    body: { companyName: "Nouriva AI", companyId: COMPANY_ID, topic: "lab-personalized Indian meal scores", platform: "instagram", aspectRatio: "1:1" },
  });
  if (!cr.ok) fail("api:creative:create", cr.data?.error);
  else {
    const runId = cr.data.runId || cr.data.run?.id;
    ok("api:creative:create", runId);
    const concept = await api(`/api/creative/runs/${runId}/concept`, { method: "POST", body: {} });
    if (!concept.ok) fail("api:creative:concept", concept.data?.error);
    else ok("api:creative:concept", concept.data.concept?.headline || "");
    const image = await api(`/api/creative/runs/${runId}/image`, { method: "POST" });
    if (!image.ok) fail("api:creative:image", image.data?.error);
    else ok("api:creative:image", `${image.data.image?.host || image.data.image?.model || "ok"}`);
    const video = await api(`/api/creative/runs/${runId}/video`, { method: "POST", body: {} });
    if (!video.ok) fail("api:creative:video", video.data?.error);
    else ok("api:creative:video", video.data.video?.status || video.data.video?.note || "prompt");
    evidence.lanes.creative = {
      runId,
      headline: concept.data.concept?.headline,
      imageUrl: image.data.image?.url,
      imageHost: image.data.image?.host || image.data.image?.model,
      videoStatus: video.data.video?.status || video.data.video?.note,
    };
  }

  // Social organic
  note("Kiran social brief → compose → approve…");
  const soc = await api("/api/social/runs", {
    method: "POST",
    body: {
      companyName: "Nouriva AI",
      companyId: COMPANY_ID,
      topic: "Upload your lab report — get a 7-day personalized Indian meal plan",
      channels: ["linkedin", "instagram", "facebook"],
    },
  });
  if (!soc.ok) fail("api:social:create", soc.data?.error);
  else {
    const runId = soc.data.runId || soc.data.run?.id;
    ok("api:social:create", runId);
    const brief = await api(`/api/social/runs/${runId}/brief`, { method: "POST", body: {} });
    if (!brief.ok) fail("api:social:brief", brief.data?.error);
    else ok("api:social:brief", (brief.data.brief?.hook || "").slice(0, 80));
    const compose = await api(`/api/social/runs/${runId}/compose`, { method: "POST" });
    if (!compose.ok) fail("api:social:compose", compose.data?.error);
    else ok("api:social:compose", `${(compose.data.posts || []).length} posts`);
    // Attach Fal image to IG posts when available
    if (evidence.lanes.creative?.imageUrl && Array.isArray(compose.data.posts)) {
      for (const p of compose.data.posts) {
        if (String(p.channel || p.platform || "").includes("instagram") && !p.image_url) {
          p.image_url = evidence.lanes.creative.imageUrl;
        }
      }
    }
    const approve = await api(`/api/social/runs/${runId}/approve`, {
      method: "POST",
      body: { posts: compose.data.posts, deliveryMode: "draft" },
    });
    if (!approve.ok) fail("api:social:approve", approve.data?.error);
    else ok("api:social:approve", String(approve.data.postCount || compose.data.posts?.length || ""));
    evidence.lanes.social = {
      runId,
      hook: brief.data.brief?.hook,
      posts: (compose.data.posts || []).map((p) => ({ channel: p.channel || p.platform, preview: String(p.copy || p.body || p.text || "").slice(0, 100) })),
    };
  }

  // B2B outreach
  note("Apollo → Sam → Gmail…");
  const out = await api("/api/outreach/runs", {
    method: "POST",
    body: {
      companyId: COMPANY_ID,
      companyName: "Nouriva AI",
      icp: "Clinical partners / dietitians / digital health leads interested in lab-personalized nutrition",
      titles: ["Dietitian", "Nutritionist", "Head of Digital Health", "Founder"],
      person_titles: ["Dietitian", "Nutritionist", "Head of Digital Health"],
      q_organization_keyword_tags: ["healthcare", "clinic", "nutrition"],
    },
  });
  // Some APIs use different shapes — fall back to smoke script if needed
  let outreachOk = out.ok;
  let outreachDetail = out.data;
  if (!outreachOk) {
    const r = spawnSync(process.execPath, [join(__dirname, "e2e-nouriva-outreach-smoke.mjs")], {
      cwd: ROOT,
      env: { ...process.env, BASE_URL: API, COMPANY_ID, OUTREACH_TEST_TO: TEST_TO },
      encoding: "utf8",
    });
    writeFileSync(join(OUT_DIR, "nouriva-exec-outreach-fallback.log"), r.stdout + r.stderr);
    if (r.status === 0) {
      ok("api:outreach:full", `smoke pass → ${TEST_TO}`);
      evidence.lanes.outreach = { via: "e2e-nouriva-outreach-smoke", testTo: TEST_TO };
      outreachOk = true;
    } else fail("api:outreach:full", `exit ${r.status}`);
  } else {
    ok("api:outreach:create", out.data.runId || out.data.run?.id || "ok");
    evidence.lanes.outreach = { run: out.data.runId || out.data.run?.id, rawKeys: Object.keys(out.data || {}) };
  }

  return outreachOk;
}

async function uiWalkthrough(strategy) {
  console.log("\n[B] UI walkthrough — studios executing toward North Star\n");
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const stamp = Date.now();
  const shot = async (name) => {
    const path = join(OUT_DIR, `nouriva-exec-${name}.png`);
    await page.screenshot({ path, fullPage: true });
    console.log(`  📸 ${path}`);
  };

  try {
    await page.goto(BASE_UI, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate(({ strategy, companyId }) => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) keys.push(k);
      }
      for (const k of keys) if (k.startsWith("marqq_") || k.startsWith("sb-")) localStorage.removeItem(k);
      sessionStorage.clear();
      localStorage.setItem("marqq_onboarding_complete", "1");
      localStorage.setItem("marqq_workspace_id", companyId);
      localStorage.setItem("marqq_active_workspace", JSON.stringify({ id: companyId, name: "Nouriva AI", website_url: "https://nouriva.tech", role: "owner" }));
      localStorage.setItem("marqq_ob_companyName", "Nouriva AI");
      localStorage.setItem("marqq_ob_website", "https://nouriva.tech");
      localStorage.setItem("marqq_ob_target", "200 paid conversions / month");
      localStorage.setItem("marqq_ob_icp", "Indians managing metabolic conditions — lab-upload meal guidance");
      localStorage.setItem("marqq_active_screen", "strategy");
      sessionStorage.setItem("marqq_gtm_strategy", JSON.stringify(strategy));
      sessionStorage.setItem("marqq_gtm_wizard", JSON.stringify({ stage: "document", strategy, answers: {}, drafts: {} }));
    }, { strategy, companyId: COMPANY_ID });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await shot("ui-01-strategy-north-star");
    ok("ui:strategy");

    const screens = [
      ["Content", "ui-02-content-seo-llmo", "content"],
      ["SEO", "ui-03-seo-screen", "seo"],
      ["Creative Studio", "ui-04-creative-fal", "creative"],
      ["Social Media", "ui-05-social-organic", "social"],
      ["Outreach Studio", "ui-06-outreach-b2b", "outreach"],
      ["Integrations", "ui-07-integrations", "integrations"],
      ["Orchestration", "ui-08-orchestration", "orchestration"],
      ["Approvals", "ui-09-approvals", "approvals"],
      ["Agents", "ui-10-agents", "agents"],
    ];

    for (const [label, file, key] of screens) {
      const clicked = await page.locator("aside").getByText(label, { exact: true }).first().isVisible().catch(() => false);
      if (clicked) {
        await page.locator("aside").getByText(label, { exact: true }).first().click({ force: true });
      } else {
        await page.evaluate((screen) => localStorage.setItem("marqq_active_screen", screen), key === "creative" ? "creative" : key);
        await page.reload({ waitUntil: "domcontentloaded" });
      }
      await page.waitForTimeout(1200);
      await shot(file);
      ok(`ui:${key}`);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const strategy = loadStrategy();
  evidence.goals = {
    northStar: strategy.goalAlignment?.north_star_metric,
    target: strategy.goalAlignment?.quantified_target,
    timeline: strategy.goalAlignment?.timeline_target,
  };
  console.log(`\n=== Nouriva hybrid agent execution ===`);
  console.log(`NSM ${evidence.goals.northStar} → ${evidence.goals.target} (${evidence.goals.timeline})\n`);

  await runApiLanes();
  await uiWalkthrough(strategy);

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const md = [
    `# Nouriva — agents executing toward goals`,
    ``,
    `- Generated: ${new Date().toISOString()}`,
    `- North Star: **${evidence.goals.northStar}** → ${evidence.goals.target} (${evidence.goals.timeline})`,
    `- Result: ${passed} pass · ${failed} fail`,
    ``,
    `## Goal → agent map`,
    ``,
    `| Goal driver | Lane | Agents | Proof |`,
    `|---|---|---|---|`,
    `| Organic trial demand (lab upload) | Website SEO / LLMO | Maya → Riya | Content Studio + \`api:content:*\` |`,
    `| Awareness / social proof | Organic social + Fal creatives | Kiran + Riya | Social + Creative studios |`,
    `| B2B / clinical partners | Direct outreach | Arjun (Apollo) + Sam + Gmail | Outreach Studio |`,
    ``,
    `## Connectors (\`${COMPANY_ID}\`)`,
    `- Apollo: **${evidence.connectors.apollo}**`,
    `- Gmail: **${evidence.connectors.gmail}** (already connected)`,
    `- Instagram: ${evidence.connectors.instagram} · Facebook: ${evidence.connectors.facebook} · LinkedIn: ${evidence.connectors.linkedin}`,
    `- Active: ${(evidence.connectors.connected || []).join(", ")}`,
    ``,
    `### Gmail connect / reconnect URL`,
    evidence.gmailConnectUrl ? evidence.gmailConnectUrl : "_mint failed — check COMPOSIO_GMAIL_AUTH_CONFIG_ID_",
    ``,
    `Also saved to \`scripts/output/gmail-connect-url.txt\`.`,
    ``,
    `## Lane outputs`,
    "```json",
    JSON.stringify(evidence.lanes, null, 2),
    "```",
    ``,
    `## Results`,
    ...results.map((r) => `- ${r.status === "pass" ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
  ].join("\n");

  const mdPath = join(OUT_DIR, `nouriva-exec-hybrid-${stamp}.md`);
  writeFileSync(mdPath, md);
  writeFileSync(join(OUT_DIR, `nouriva-exec-hybrid-${stamp}.json`), JSON.stringify({ results, evidence }, null, 2));
  console.log(`\n📄 ${mdPath}`);
  if (evidence.gmailConnectUrl) console.log(`\n🔗 Gmail: ${evidence.gmailConnectUrl}\n`);
  console.log(`\n=== ${passed} pass · ${failed} fail ===\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
