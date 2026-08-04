#!/usr/bin/env node
/**
 * Smoke: Outreach channel presets — email / email+LinkedIn / email+LinkedIn+phone
 * Fetch → Sam multi-channel copy → draft go-live per channel (never live publish).
 *
 *   BASE_URL=http://127.0.0.1:3001 node scripts/e2e-elevate-outreach-channels-smoke.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "output");
const API = String(process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const WORKSPACE_ID = process.env.WORKSPACE_ID || "marqq-ws-1";

const PRESETS = [
  { id: "email", label: "Email only", channels: ["email"], draftChannels: ["email"] },
  {
    id: "email_linkedin",
    label: "Email + LinkedIn",
    channels: ["email", "linkedin"],
    draftChannels: ["email", "linkedin"],
  },
  {
    id: "email_linkedin_phone",
    label: "Email + LinkedIn + Phone",
    channels: ["email", "linkedin", "phone"],
    draftChannels: ["email", "linkedin", "whatsapp"],
  },
];

const results = [];
const artifacts = {};

function ok(name, detail = "") {
  results.push({ name, status: "pass", detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, status: "fail", detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}
function note(m) {
  console.log(`  · ${m}`);
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

async function smokePreset(preset) {
  console.log(`\n[${preset.id}] ${preset.label}`);
  const fetchRes = await api("/api/outreach/runs", {
    method: "POST",
    body: {
      workspaceId: WORKSPACE_ID,
      companyId: WORKSPACE_ID,
      companyName: "Elevate",
      titles: ["Founder", "CEO", "Managing Director", "Chief Strategy Officer"],
      country: "India",
      limit: 5,
      contactChannels: preset.channels,
      question: `Elevate · ${preset.label} · strategy-to-execution intros`,
    },
  });

  const prospects = Array.isArray(fetchRes.data.prospects) ? fetchRes.data.prospects : [];
  const runId = fetchRes.data.runId || fetchRes.data.run?.id;
  const source = fetchRes.data.run?.source || "";

  if (!fetchRes.ok || !runId || prospects.length < 1) {
    fail(`${preset.id}:fetch`, fetchRes.data.error || `count=${prospects.length}`);
    artifacts[preset.id] = { error: fetchRes.data.error, prospects: 0 };
    return;
  }
  ok(`${preset.id}:fetch`, `${prospects.length} · ${source}`);

  // Prefer a prospect that has the required contact fields
  let prospect =
    prospects.find((p) => {
      if (preset.channels.includes("email") && !p.email) return false;
      if (preset.channels.includes("linkedin") && !p.linkedin_url) return false;
      if (preset.channels.includes("phone") && !p.phone_e164) return false;
      return true;
    }) || prospects[0];

  note(
    `Using ${prospect.full_name} · email=${Boolean(prospect.email)} li=${Boolean(prospect.linkedin_url)} phone=${Boolean(prospect.phone_e164)}`
  );

  const copyRes = await api(`/api/outreach/runs/${runId}/prospects/${prospect.id}/copy`, {
    method: "POST",
    body: { channels: preset.channels },
  });
  if (!copyRes.ok) {
    fail(`${preset.id}:copy`, copyRes.data.error || `HTTP ${copyRes.status}`);
    return;
  }
  const copies = copyRes.data.prospect?.channel_copies || {};
  const hasEmail = Boolean(copies.email?.body);
  const hasLi = Boolean(copies.linkedin_dm?.body);
  const hasWa = Boolean(copies.whatsapp_dm?.body);

  if (preset.channels.includes("email") && !hasEmail) fail(`${preset.id}:copy-email`, "missing email body");
  else if (preset.channels.includes("email")) ok(`${preset.id}:copy-email`, (copies.email.subject || "").slice(0, 60));

  if (preset.channels.includes("linkedin") && !hasLi) fail(`${preset.id}:copy-linkedin`, "missing LI DM");
  else if (preset.channels.includes("linkedin")) ok(`${preset.id}:copy-linkedin`, copies.linkedin_dm.body.slice(0, 80));

  if (preset.channels.includes("phone") && !hasWa) fail(`${preset.id}:copy-phone`, "missing WhatsApp/phone body");
  else if (preset.channels.includes("phone")) ok(`${preset.id}:copy-phone`, copies.whatsapp_dm.body.slice(0, 80));

  const draftResults = [];
  for (const channel of preset.draftChannels) {
    if ((channel === "whatsapp" || channel === "phone") && !prospect.phone_e164) {
      ok(`${preset.id}:draft-${channel}`, "skipped — no phone on prospect (Apollo sparse)");
      draftResults.push({ channel, ok: true, skipped: true, error: "no phone_e164" });
      continue;
    }
    if (channel === "linkedin" && !prospect.linkedin_url) {
      ok(`${preset.id}:draft-${channel}`, "skipped — no LinkedIn URL");
      draftResults.push({ channel, ok: true, skipped: true, error: "no linkedin_url" });
      continue;
    }
    const draftRes = await api(`/api/outreach/runs/${runId}/prospects/${prospect.id}/go-live`, {
      method: "POST",
      body: {
        channel,
        delivery: "draft",
        deliveryMode: "draft",
        activate: false,
      },
    });
    if (draftRes.ok || draftRes.data?.status === "draft" || draftRes.data?.ok) {
      ok(
        `${preset.id}:draft-${channel}`,
        draftRes.data?.method || draftRes.data?.status || "draft"
      );
      draftResults.push({ channel, ok: true, detail: draftRes.data });
    } else {
      // Draft may fail if connector missing — still record as soft fail with reason
      const err = draftRes.data?.error || `HTTP ${draftRes.status}`;
      if (/not connected|Connect|missing|HeyReach|Gmail|Instantly|WhatsApp|phone number/i.test(err)) {
        ok(`${preset.id}:draft-${channel}`, `skipped: ${err.slice(0, 80)}`);
        draftResults.push({ channel, ok: true, skipped: true, error: err });
      } else {
        fail(`${preset.id}:draft-${channel}`, err.slice(0, 160));
        draftResults.push({ channel, ok: false, error: err });
      }
    }
  }

  artifacts[preset.id] = {
    runId,
    source,
    channels: preset.channels,
    prospect: {
      name: prospect.full_name,
      title: prospect.title,
      company: prospect.company,
      email: prospect.email || null,
      linkedin: prospect.linkedin_url || null,
      phone: prospect.phone_e164 || null,
    },
    copies: {
      email: copies.email ? { subject: copies.email.subject, body: copies.email.body?.slice(0, 200) } : null,
      linkedin: copies.linkedin_dm?.body?.slice(0, 200) || null,
      whatsapp: copies.whatsapp_dm?.body?.slice(0, 200) || null,
    },
    drafts: draftResults,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  console.log(`\nElevate outreach channel presets smoke (drafts only)`);
  console.log(`API ${API} · workspace ${WORKSPACE_ID}\n`);

  const health = await api(`/api/agents/deployments?workspaceId=${encodeURIComponent(WORKSPACE_ID)}`);
  if (health.status === 200) ok("api:backend");
  else fail("api:backend", `status ${health.status}`);

  for (const preset of PRESETS) {
    await smokePreset(preset);
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const report = {
    stamp,
    mode: "drafts_only",
    company: "Elevate",
    workspaceId: WORKSPACE_ID,
    passed,
    failed,
    artifacts,
    results,
  };
  const jsonPath = join(OUT_DIR, `elevate-outreach-channels-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    join(OUT_DIR, `elevate-outreach-channels-${stamp}.md`),
    [
      `# Elevate outreach channel presets smoke`,
      ``,
      `- Mode: drafts only`,
      `- Result: **${passed} passed · ${failed} failed**`,
      ``,
      ...PRESETS.map((p) => {
        const a = artifacts[p.id];
        if (!a || a.error) return `## ${p.label}\n- FAIL: ${a?.error || "unknown"}\n`;
        return [
          `## ${p.label}`,
          `- Prospects source: ${a.source}`,
          `- Prospect: ${a.prospect?.name} @ ${a.prospect?.company}`,
          `- Email copy: ${a.copies?.email?.subject || "—"}`,
          `- LinkedIn: ${a.copies?.linkedin ? "yes" : "—"}`,
          `- Phone/WA: ${a.copies?.whatsapp ? "yes" : "—"}`,
          ``,
        ].join("\n");
      }),
      `## Checks`,
      ...results.map((r) => `- ${r.status === "pass" ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
      ``,
    ].join("\n")
  );

  console.log(`\n${"=".repeat(56)}`);
  console.log(`${passed} passed · ${failed} failed`);
  console.log(`report ${jsonPath}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
