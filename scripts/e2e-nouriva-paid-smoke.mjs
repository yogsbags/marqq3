#!/usr/bin/env node
/**
 * Nouriva paid smoke (Zara draft Meta campaign — slice 1):
 *   create → goals → plan → creative-draft → approve
 *   Local draft only — no Meta create / no spend.
 *   node scripts/e2e-nouriva-paid-smoke.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE = String(process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");

function loadEnv() {
  for (const name of [".env", ".env.marqq-live"]) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}
loadEnv();

const results = [];
const ok = (n, d = "") => {
  results.push({ name: n, status: "pass", detail: d });
  console.log(`  ✓ ${n}${d ? ` — ${d}` : ""}`);
};
const fail = (n, d = "") => {
  results.push({ name: n, status: "fail", detail: d });
  console.error(`  ✗ ${n}${d ? ` — ${d}` : ""}`);
};

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}

async function main() {
  console.log(`\n[nouriva-paid] ${BASE} · draft/PAUSED only\n`);
  const health = await api("/health");
  if (!health.ok && !health.data?.status) {
    fail("health");
    process.exit(1);
  }
  ok("health");

  const create = await api("/api/paid/runs", {
    method: "POST",
    body: {
      companyName: "Nouriva AI",
      companyId: "marqq-ws-1",
      workspaceId: "marqq-ws-1",
      deliveryMode: "draft",
      northStarMetric: "Activated Paid Users",
      quantifiedTarget: "500 Activated Paid Users",
      timeline: "90 days",
      audience: "Health-conscious adults with recent lab reports seeking personalized nutrition",
      website: "https://nouriva.tech",
      metaAccountId: "act_1721558035534754",
      topic: "paid acquisition for lab-personalized nutrition",
    },
  });
  if (!create.ok) {
    fail("create", create.data?.error);
    process.exit(1);
  }
  const runId = create.data.runId;
  ok("create", runId);

  const goals = await api(`/api/paid/runs/${runId}/goals`, {
    method: "PATCH",
    body: {
      quantifiedTarget: "500 Activated Paid Users",
      timeline: "90 days",
      selectedChannel: "Meta Ads",
    },
  });
  if (!goals.ok) {
    fail("goals", goals.data?.error);
    process.exit(1);
  }
  ok("goals", goals.data.goals?.quantifiedTarget);

  const plan = await api(`/api/paid/runs/${runId}/plan`, { method: "POST" });
  if (!plan.ok) {
    fail("plan", plan.data?.error);
    process.exit(1);
  }
  ok(
    "plan",
    `${plan.data.plan?.objective || "?"} · $${plan.data.plan?.daily_budget_usd || "?"}/day · ${String(plan.data.plan?.campaign_name || "").slice(0, 40)}`
  );

  const draft = await api(`/api/paid/runs/${runId}/creative-draft`, {
    method: "POST",
    body: { generateImage: process.env.PAID_GENERATE_IMAGE === "1" },
  });
  if (!draft.ok) {
    fail("creative-draft", draft.data?.error);
    process.exit(1);
  }
  const cd = draft.data.creativeDraft;
  if (cd?.meta_campaign_id || cd?.meta_ad_id) {
    fail("creative-draft", "Unexpected Meta IDs on draft");
    process.exit(1);
  }
  ok(
    "creative-draft",
    `${cd?.creative_draft_id || "?"} · ${String(cd?.headline || "").slice(0, 40)}${cd?.image_url ? " +img" : ""}`
  );

  const approve = await api(`/api/paid/runs/${runId}/approve`, { method: "POST" });
  if (!approve.ok) {
    fail("approve", approve.data?.error);
    process.exit(1);
  }
  if (approve.data.meta?.spend) {
    fail("approve", "Spend flag set — abort");
    process.exit(1);
  }
  ok("approve", approve.data.creative_draft_id || approve.data.status);

  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(OUT_DIR, `nouriva-paid-smoke-${stamp}.md`);
  const passed = results.every((r) => r.status === "pass");
  writeFileSync(
    outPath,
    [
      `# Nouriva paid smoke`,
      ``,
      `- Base: ${BASE}`,
      `- Run: ${runId}`,
      `- Result: ${passed ? "PASS" : "FAIL"}`,
      `- Slice: local draft only (no Meta create)`,
      ``,
      ...results.map((r) => `- ${r.status === "pass" ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
      ``,
    ].join("\n")
  );
  console.log(`\n${passed ? "PASS" : "FAIL"} · ${results.filter((r) => r.status === "pass").length}/${results.length} · ${outPath}\n`);
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
