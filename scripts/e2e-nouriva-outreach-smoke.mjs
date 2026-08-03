#!/usr/bin/env node
/**
 * Nouriva outreach E2E smoke (Marqq-test):
 *   Apollo fetch → select → cold-email copy → Gmail send (test To) → poll replies
 *
 *   OUTREACH_TEST_TO=yogsbags@gmail.com node scripts/e2e-nouriva-outreach-smoke.mjs
 *
 * Requires: backend :3001, COMPOSIO Apollo+Gmail active for marqq-ws-1, GROQ key
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE = String(process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const TEST_TO = process.env.OUTREACH_TEST_TO || "yogsbags@gmail.com";
const COMPANY_ID = process.env.COMPANY_ID || "marqq-ws-1";

function loadEnv() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const results = [];
function ok(name, detail = "") {
  results.push({ name, status: "pass", detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, status: "fail", detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { res, data };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`\n[nouriva-outreach] ${BASE} · testTo=${TEST_TO} · company=${COMPANY_ID}\n`);

  const health = await api("/health");
  if (health.res.ok) ok("health");
  else fail("health", String(health.res.status));

  const int = await api(`/api/integrations?companyId=${encodeURIComponent(COMPANY_ID)}`);
  const connectors = int.data.connectors || [];
  const apollo = connectors.find((c) => c.id === "apollo");
  const gmail = connectors.find((c) => c.id === "gmail");
  if (apollo?.connected || apollo?.status === "active") ok("connector:apollo");
  else fail("connector:apollo", JSON.stringify(apollo));
  if (gmail?.connected || gmail?.status === "active") ok("connector:gmail");
  else fail("connector:gmail", JSON.stringify(gmail));

  console.log("\n[1] Fetch Apollo prospects");
  const runRes = await api("/api/outreach/runs", {
    method: "POST",
    body: {
      companyName: "Nouriva AI",
      companyId: COMPANY_ID,
      workspaceId: COMPANY_ID,
      question:
        "B2B clinical partners for Nouriva AI — lab-personalized nutrition. Book a 15-min intro.",
      titles: [
        "Endocrinologist",
        "Dietitian",
        "Medical Director",
        "Head of Nutrition",
        "Clinical Nutrition Manager",
      ],
      industries: ["hospital & health care", "medical practice"],
      contactChannels: ["email"],
      country: "India",
      limit: 5,
    },
  });
  if (!runRes.res.ok || !runRes.data.ok) {
    fail("fetch:apollo", runRes.data.error || JSON.stringify(runRes.data).slice(0, 300));
  } else {
    ok("fetch:apollo", `${(runRes.data.prospects || []).length} prospects · ${runRes.data.run?.source}`);
  }

  const runId = runRes.data.runId;
  const prospects = runRes.data.prospects || [];
  const prospect = prospects.find((p) => p.email) || prospects[0];
  if (!prospect) {
    fail("select:prospect", "no prospects");
    writeReport();
    process.exit(1);
  }
  ok("select:prospect", `${prospect.full_name} <${prospect.email || "no-email"}>`);

  console.log("\n[2] Generate cold-email copy (Sam)");
  const copyRes = await api(`/api/outreach/runs/${runId}/prospects/${prospect.id}/copy`, {
    method: "POST",
    body: { channels: ["email"] },
  });
  if (!copyRes.res.ok || !copyRes.data.ok) {
    fail("copy:cold-email", copyRes.data.error || JSON.stringify(copyRes.data).slice(0, 300));
  } else {
    const p = copyRes.data.prospect;
    ok(
      "copy:cold-email",
      `subj="${(p.subject || "").slice(0, 48)}" body=${(p.body || "").length} chars`
    );
  }

  const subject = copyRes.data.prospect?.subject || `Nouriva intro — ${prospect.company}`;
  const body =
    copyRes.data.prospect?.body ||
    `Hi ${String(prospect.full_name || "").split(" ")[0]},\n\nQuick note from Nouriva AI — we help clinicians turn lab markers into practical meal guidance for patients.\n\nOpen to a 15-minute chat this week?\n\nBest,\nArjun (Marqq / Nouriva)`;

  console.log(`\n[3] Approve & send via Gmail → ${TEST_TO}`);
  const sendRes = await api(`/api/outreach/runs/${runId}/prospects/${prospect.id}/send-now`, {
    method: "POST",
    body: { subject, body, testTo: TEST_TO },
  });
  if (!sendRes.res.ok || !sendRes.data.ok) {
    fail("send:gmail", sendRes.data.error || JSON.stringify(sendRes.data).slice(0, 400));
  } else {
    ok("send:gmail", `to=${sendRes.data.to || TEST_TO} method=${sendRes.data.method}`);
  }

  console.log("\n[4] Poll Gmail replies inbox");
  const pollRes = await api(`/api/outreach/runs/${runId}/poll-gmail-replies`, { method: "POST" });
  if (!pollRes.res.ok || !pollRes.data.ok) {
    fail("inbox:poll", pollRes.data.error || JSON.stringify(pollRes.data).slice(0, 300));
  } else {
    ok(
      "inbox:poll",
      `${(pollRes.data.replies || []).length} replies · fresh=${(pollRes.data.fresh || []).length}`
    );
  }

  writeReport({ runId, prospect, subject, testTo: TEST_TO, send: sendRes.data, poll: pollRes.data });
  const failed = results.filter((r) => r.status === "fail").length;
  const passed = results.filter((r) => r.status === "pass").length;
  console.log(`\n=== Nouriva outreach smoke: ${passed} pass · ${failed} fail ===\n`);
  if (failed) process.exitCode = 1;
}

function writeReport(extra = {}) {
  const path = join(OUT_DIR, `nouriva-outreach-smoke-${Date.now()}.json`);
  writeFileSync(
    path,
    JSON.stringify({ at: new Date().toISOString(), base: BASE, results, ...extra }, null, 2)
  );
  console.log(`Report: ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
