#!/usr/bin/env node
/**
 * Nouriva creative smoke (Riya image/video):
 *   create → concept → image → video → approve
 *   node scripts/e2e-nouriva-creative-smoke.mjs
 *
 * Image needs GEMINI_API_KEY and/or FAL_KEY. Video render is best-effort (prompt_ready OK).
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
  console.log(`\n[nouriva-creative] ${BASE}\n`);
  const health = await api("/health");
  if (!health.ok && !health.data?.status) { fail("health"); process.exit(1); }
  ok("health");

  const create = await api("/api/creative/runs", {
    method: "POST",
    body: {
      companyName: "Nouriva AI",
      companyId: "marqq-ws-1",
      workspaceId: "marqq-ws-1",
      topic: "lab-personalized Indian meal plans from blood markers",
      platform: "instagram",
      aspectRatio: "9:16",
    },
  });
  if (!create.ok) { fail("create", create.data?.error); process.exit(1); }
  const runId = create.data.runId || create.data.run?.id;
  const assets = create.data.run?.brandAssets;
  ok("create", runId);
  if (assets?.logoPublicUrl || assets?.logoUrl) {
    ok("brand-logo", assets.logoPublicUrl ? "public" : assets.logoUrl);
  } else {
    fail("brand-logo", "no logo resolved for marqq-ws-1");
  }

  const concept = await api(`/api/creative/runs/${runId}/concept`, {
    method: "POST",
    body: { topic: "lab-personalized Indian meal plans from blood markers", platform: "instagram" },
  });
  if (!concept.ok) { fail("concept", concept.data?.error); process.exit(1); }
  const plan = concept.data.concept?.video_plan;
  ok("concept", concept.data.concept?.headline?.slice(0, 50));
  if (plan?.aspect_ratio === "9:16" && plan?.render_mode) {
    ok(
      "viral-plan",
      `${plan.channel_label || "?"} · ${plan.format} · ${plan.aspect_ratio} · ${plan.duration_seconds}s · ${plan.render_mode}`,
    );
  } else {
    fail("viral-plan", JSON.stringify(plan || {}));
  }
  if (plan?.hook) ok("hook", String(plan.hook).slice(0, 80));
  else fail("hook", "missing");

  const image = await api(`/api/creative/runs/${runId}/image`, { method: "POST" });
  if (!image.ok) { fail("image", image.data?.error); process.exit(1); }
  const wm = image.data.image?.watermark;
  ok(
    "image",
    `${image.data.image?.host || "?"} · ${image.data.image?.model || "?"} · watermark=${wm?.applied ? "yes" : "no"}`,
  );
  if (wm?.applied) ok("logo-watermark", "composited");
  else fail("logo-watermark", wm?.error || "not applied");

  const video = await api(`/api/creative/runs/${runId}/video`, {
    method: "POST",
    body: { generate: process.env.CREATIVE_GENERATE_VIDEO === "1" },
  });
  if (!video.ok) { fail("video", video.data?.error); process.exit(1); }

  let videoPayload = video.data.video;
  if (video.data.poll && videoPayload?.status === "processing") {
    ok("video-submit", `${videoPayload.model || "?"} · ${videoPayload.plan?.render_mode || "?"}`);
    const started = Date.now();
    let done = false;
    while (Date.now() - started < 180000) {
      await new Promise((r) => setTimeout(r, 3000));
      const poll = await api(`/api/creative/runs/${runId}/video/poll`, { method: "POST" });
      if (!poll.ok) { fail("video-poll", poll.data?.error); process.exit(1); }
      videoPayload = poll.data.video;
      if (poll.data.done) {
        done = true;
        break;
      }
    }
    if (!done && videoPayload?.status === "processing") {
      ok("video", "processing_timeout → prompt usable");
    } else {
      ok("video", `${videoPayload?.status}${videoPayload?.url ? " +url" : ""}`);
    }
  } else {
    const mode = videoPayload?.plan?.render_mode || videoPayload?.model || "?";
    ok("video", `${videoPayload?.status || "?"} · ${mode}${videoPayload?.url ? " +url" : " prompt_only"}`);
  }

  const approve = await api(`/api/creative/runs/${runId}/approve`, { method: "POST" });
  if (!approve.ok) { fail("approve", approve.data?.error); process.exit(1); }
  ok("approve", approve.data.status);

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, `nouriva-creative-smoke-${Date.now()}.json`);
  writeFileSync(
    out,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        runId,
        concept: concept.data.concept,
        image: { host: image.data.image?.host, model: image.data.image?.model, hasUrl: Boolean(image.data.image?.url) },
        video: videoPayload,
      },
      null,
      2
    )
  );
  console.log(`Report: ${out}`);
  const failed = results.filter((r) => r.status === "fail").length;
  console.log(`\n=== Nouriva creative smoke: ${results.length - failed} pass · ${failed} fail ===\n`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
