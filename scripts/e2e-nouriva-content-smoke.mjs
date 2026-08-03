#!/usr/bin/env node
/**
 * Nouriva content E2E smoke (Marqq-test slice 1 — SEO → Blog):
 *   create run → Maya research → Maya brief → Riya draft → approve
 *
 *   node scripts/e2e-nouriva-content-smoke.mjs
 *
 * Requires: backend :3001, GROQ_API_KEY (skills from Marqq2 marketingskills when available)
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE = String(process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");

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
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}

async function main() {
  console.log(`\n[nouriva-content] ${BASE} · SEO→Blog slice 1\n`);

  const health = await api("/health");
  if (!health.ok && health.status !== 200) {
    fail("health", JSON.stringify(health.data));
    process.exit(1);
  }
  ok("health");

  const create = await api("/api/content/runs", {
    method: "POST",
    body: {
      companyName: "Nouriva AI",
      companyId: "marqq-ws-1",
      workspaceId: "marqq-ws-1",
      domain: "nouriva.tech",
      marketType: "b2c",
      brandContext:
        "Nouriva AI — lab-personalized nutrition for patients and clinical partners.",
    },
  });
  if (!create.ok) {
    fail("create:run", create.data?.error || JSON.stringify(create.data));
    process.exit(1);
  }
  const runId = create.data.runId || create.data.run?.id;
  ok("create:run", runId);

  console.log("\n[1] Maya research");
  const research = await api(`/api/content/runs/${runId}/research`, { method: "POST" });
  if (!research.ok) {
    fail("research", research.data?.error || JSON.stringify(research.data));
    process.exit(1);
  }
  const queue = research.data.plan?.article_queue || [];
  ok("research", `${queue.length} queue items · source=${research.data.plan?.data_source || "?"}`);

  console.log("\n[2] Maya brief");
  const brief = await api(`/api/content/runs/${runId}/brief`, {
    method: "POST",
    body: { queueIndex: 0 },
  });
  if (!brief.ok) {
    fail("brief", brief.data?.error || JSON.stringify(brief.data));
    process.exit(1);
  }
  ok(
    "brief",
    `kw="${brief.data.brief?.keyword}" outline=${(brief.data.brief?.outline || []).length}`
  );

  console.log("\n[3] Riya draft");
  const draft = await api(`/api/content/runs/${runId}/draft`, { method: "POST" });
  if (!draft.ok) {
    fail("draft", draft.data?.error || JSON.stringify(draft.data));
    process.exit(1);
  }
  const article = draft.data.article || {};
  ok(
    "draft",
    `title="${String(article.title || "").slice(0, 48)}" words=${article.word_count || 0}`
  );

  console.log("\n[4] Approve");
  const patch = await api(`/api/content/runs/${runId}/article`, {
    method: "PATCH",
    body: { title: `${article.title} (smoke)` },
  });
  if (!patch.ok) {
    fail("patch", patch.data?.error || JSON.stringify(patch.data));
    process.exit(1);
  }
  ok("patch", "title tweaked");

  const approve = await api(`/api/content/runs/${runId}/approve`, { method: "POST" });
  if (!approve.ok) {
    fail("approve", approve.data?.error || JSON.stringify(approve.data));
    process.exit(1);
  }
  ok("approve", approve.data.status || approve.data.run?.status);

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, `nouriva-content-smoke-${Date.now()}.json`);
  writeFileSync(
    out,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        base: BASE,
        results,
        runId,
        keyword: brief.data.brief?.keyword,
        title: approve.data.article?.title || article.title,
        word_count: article.word_count,
        skills: draft.data.run?.skills || research.data.run?.skills,
      },
      null,
      2
    )
  );
  console.log(`Report: ${out}`);

  const failed = results.filter((r) => r.status === "fail").length;
  const passed = results.filter((r) => r.status === "pass").length;
  console.log(`\n=== Nouriva content smoke: ${passed} pass · ${failed} fail ===\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
