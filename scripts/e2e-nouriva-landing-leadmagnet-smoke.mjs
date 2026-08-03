#!/usr/bin/env node
/**
 * Nouriva landing + lead magnet publish smoke:
 *   landing: generate (page-cro/copywriting/form-cro) → approve → package/publish
 *   lead magnet: design (lead-magnets) → gated page → approve → package/publish
 *   capture: POST /api/leads/capture → Sheets
 *
 *   node scripts/e2e-nouriva-landing-leadmagnet-smoke.mjs
 *   LANDING_PUBLISH_LIVE=1 node scripts/e2e-nouriva-landing-leadmagnet-smoke.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE = String(process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const LIVE = process.env.LANDING_PUBLISH_LIVE === "1";

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
  console.log(`\n[nouriva-landing-leadmagnet] ${BASE} · live=${LIVE}\n`);
  mkdirSync(OUT_DIR, { recursive: true });

  const health = await api("/health");
  if (!health.ok && !health.data?.status) {
    fail("health");
    process.exit(1);
  }
  ok("health");

  // ── Landing page ──────────────────────────────────────────────────────────
  const lpCreate = await api("/api/landing/runs", {
    method: "POST",
    body: {
      companyId: "marqq-ws-1",
      companyName: "Nouriva AI",
      product: "Nouriva AI",
      offer: "Lab-personalized nutrition plans you can follow in a real Indian kitchen",
      audience: "Health-conscious adults who want food advice tied to their labs and goals",
      goal: "lead_gen",
      cta: "Start free scan",
      brandContext: "Nouriva AI — scan labs or preferences, get a plan tailored to you. App-first B2C.",
    },
  });
  if (!lpCreate.ok) {
    fail("landing/create", lpCreate.data?.error);
    process.exit(1);
  }
  const lpId = lpCreate.data.runId;
  ok("landing/create", lpId);

  const lpGen = await api(`/api/landing/runs/${lpId}/generate`, { method: "POST", body: {} });
  if (!lpGen.ok || !lpGen.data?.run?.page?.html) {
    fail("landing/generate", lpGen.data?.error);
    process.exit(1);
  }
  const skills = (lpGen.data.run.skill_alignment?.skills || []).join(",");
  ok("landing/generate", `${lpGen.data.run.page.slug} · skills=${skills}`);
  writeFileSync(join(OUT_DIR, "nouriva-landing-page.html"), lpGen.data.run.page.html);

  const lpAppr = await api(`/api/landing/runs/${lpId}/approve`, { method: "POST" });
  if (!lpAppr.ok) fail("landing/approve", lpAppr.data?.error);
  else ok("landing/approve");

  const lpPub = await api(`/api/landing/runs/${lpId}/publish`, {
    method: "POST",
    body: { publish_live: LIVE },
  });
  if (!lpPub.ok) fail("landing/publish", lpPub.data?.error);
  else {
    ok("landing/publish", `${LIVE ? "live" : "draft"} · ${lpPub.data.url || ""}`);
    if (lpPub.data.publish?.html) {
      writeFileSync(join(OUT_DIR, "nouriva-landing-publish.html"), lpPub.data.publish.html);
    }
  }

  // ── Lead magnet ───────────────────────────────────────────────────────────
  const lmCreate = await api("/api/lead-magnets/runs", {
    method: "POST",
    body: {
      companyId: "marqq-ws-1",
      companyName: "Nouriva AI",
      magnetType: "checklist",
      audience: "Busy professionals who want healthier Indian meals without a dietitian on call",
      goal: "capture",
      brandContext: "Nouriva AI — personalized nutrition from labs + preferences.",
    },
  });
  if (!lmCreate.ok) {
    fail("magnet/create", lmCreate.data?.error);
    process.exit(1);
  }
  const lmId = lmCreate.data.runId;
  ok("magnet/create", lmId);

  const lmDesign = await api(`/api/lead-magnets/runs/${lmId}/design`, { method: "POST", body: {} });
  if (!lmDesign.ok || !lmDesign.data?.run?.concept?.title) {
    fail("magnet/design", lmDesign.data?.error);
    process.exit(1);
  }
  ok("magnet/design", lmDesign.data.run.concept.title);

  const lmGen = await api(`/api/lead-magnets/runs/${lmId}/generate`, { method: "POST", body: {} });
  if (!lmGen.ok || !lmGen.data?.run?.page?.html) {
    fail("magnet/generate", lmGen.data?.error);
    process.exit(1);
  }
  const hasForm = /data-marqq-lead-form/i.test(lmGen.data.run.page.html);
  ok("magnet/generate", `${lmGen.data.run.page.slug} · form=${hasForm}`);
  writeFileSync(join(OUT_DIR, "nouriva-lead-magnet-page.html"), lmGen.data.run.page.html);

  const lmAppr = await api(`/api/lead-magnets/runs/${lmId}/approve`, { method: "POST" });
  if (!lmAppr.ok) fail("magnet/approve", lmAppr.data?.error);
  else ok("magnet/approve");

  const lmPub = await api(`/api/lead-magnets/runs/${lmId}/publish`, {
    method: "POST",
    body: { publish_live: LIVE },
  });
  if (!lmPub.ok) fail("magnet/publish", lmPub.data?.error);
  else ok("magnet/publish", `${LIVE ? "live" : "draft"} · ${lmPub.data.url || ""}`);

  // ── Capture → Sheets ──────────────────────────────────────────────────────
  const capture = await api("/api/leads/capture", {
    method: "POST",
    body: {
      companyId: "marqq-ws-1",
      companyName: "Nouriva AI",
      name: "Yogesh Bags",
      email: "yogsbags@gmail.com",
      lead_magnet: lmDesign.data.run.concept.title,
      source: "e2e-landing-smoke",
    },
  });
  if (!capture.ok) fail("leads/capture", capture.data?.error);
  else ok("leads/capture", capture.data.crm?.destination || "ok");

  const summary = {
    live: LIVE,
    landing: { runId: lpId, url: lpPub.data?.url, skills },
    magnet: { runId: lmId, title: lmDesign.data.run.concept.title, url: lmPub.data?.url, form: hasForm },
    results,
  };
  writeFileSync(join(OUT_DIR, "nouriva-landing-leadmagnet-smoke.json"), JSON.stringify(summary, null, 2));

  const failed = results.filter((r) => r.status === "fail").length;
  console.log(`\n${failed ? "FAILED" : "PASSED"} · ${results.length - failed}/${results.length} · ${OUT_DIR}\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
