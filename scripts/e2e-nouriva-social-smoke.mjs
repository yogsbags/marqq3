#!/usr/bin/env node
/**
 * Nouriva social text smoke (Kiran):
 *   create → brief → compose → approve
 *   node scripts/e2e-nouriva-social-smoke.mjs
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
const ok = (n, d = "") => { results.push({ name: n, status: "pass", detail: d }); console.log(`  ✓ ${n}${d ? ` — ${d}` : ""}`); };
const fail = (n, d = "") => { results.push({ name: n, status: "fail", detail: d }); console.error(`  ✗ ${n}${d ? ` — ${d}` : ""}`); };

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, data };
}

async function main() {
  console.log(`\n[nouriva-social] ${BASE}\n`);
  const health = await api("/health");
  if (!health.ok && !health.data?.status) { fail("health"); process.exit(1); }
  ok("health");

  const create = await api("/api/social/runs", {
    method: "POST",
    body: {
      companyName: "Nouriva AI",
      companyId: "marqq-ws-1",
      topic: "lab-personalized nutrition",
      channels: ["linkedin", "instagram", "twitter"],
    },
  });
  if (!create.ok) { fail("create", create.data?.error); process.exit(1); }
  const runId = create.data.runId;
  ok("create", runId);

  const brief = await api(`/api/social/runs/${runId}/brief`, { method: "POST", body: {} });
  if (!brief.ok) { fail("brief", brief.data?.error); process.exit(1); }
  ok("brief", brief.data.brief?.hook?.slice(0, 60));

  const compose = await api(`/api/social/runs/${runId}/compose`, { method: "POST" });
  if (!compose.ok) { fail("compose", compose.data?.error); process.exit(1); }
  ok("compose", `${(compose.data.posts || []).length} posts`);

  const approve = await api(`/api/social/runs/${runId}/approve`, { method: "POST" });
  if (!approve.ok) { fail("approve", approve.data?.error); process.exit(1); }
  ok("approve", String(approve.data.postCount));

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, `nouriva-social-smoke-${Date.now()}.json`);
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), results, runId, posts: compose.data.posts }, null, 2));
  console.log(`Report: ${out}`);
  const failed = results.filter((r) => r.status === "fail").length;
  console.log(`\n=== Nouriva social smoke: ${results.length - failed} pass · ${failed} fail ===\n`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
