#!/usr/bin/env node
/**
 * Gmail Composio connector smoke (Marqq-test).
 *
 * 1) Confirm COMPOSIO_GMAIL_AUTH_CONFIG_ID
 * 2) GET /api/integrations → gmail active?
 * 3) If not, print OAuth URL (or open with OPEN=1)
 * 4) Optionally hit Marqq2 content-engine poll-gmail-replies when MARQQ2_BASE is set
 *
 *   node scripts/marqq2-playbooks/e2e-gmail-connector-smoke.mjs
 *   OPEN=1 node scripts/marqq2-playbooks/e2e-gmail-connector-smoke.mjs
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const BASE = String(process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const MARQQ2 = String(process.env.MARQQ2_BASE || "").replace(/\/$/, "");
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

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  process.exitCode = 1;
}

async function main() {
  console.log(`\n[gmail-smoke] company=${COMPANY_ID} api=${BASE}`);
  const authId = process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;
  if (!authId) fail("COMPOSIO_GMAIL_AUTH_CONFIG_ID missing");
  else ok(`auth config ${authId}`);

  const listRes = await fetch(`${BASE}/api/integrations?companyId=${encodeURIComponent(COMPANY_ID)}`);
  const listJson = await listRes.json().catch(() => ({}));
  const gmail = (listJson.connectors || []).find((c) => c.id === "gmail");
  if (!gmail) {
    fail("gmail not in connectors list — restart backend after adding gmail to defaults");
  } else if (gmail.connected || gmail.status === "active") {
    ok(`gmail connected (${gmail.status})`);
  } else {
    console.log(`  · gmail status=${gmail.status || "not_connected"} — requesting OAuth link`);
    const connectRes = await fetch(`${BASE}/api/integrations/connect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId: COMPANY_ID, connectorId: "gmail" }),
    });
    const connectJson = await connectRes.json().catch(() => ({}));
    if (connectJson.ok && connectJson.redirectUrl) {
      ok(`OAuth URL: ${connectJson.redirectUrl}`);
      if (process.env.OPEN === "1") {
        spawnSync("open", [connectJson.redirectUrl], { stdio: "ignore" });
        console.log("  · opened browser — complete Google OAuth, then re-run this script");
      }
    } else {
      fail(`connect failed: ${connectJson.error || JSON.stringify(connectJson)}`);
    }
  }

  // Marqq2 outreach Gmail playbook endpoints (optional)
  if (MARQQ2) {
    console.log(`\n[gmail-smoke] Marqq2 outreach playbook @ ${MARQQ2}`);
    const health = await fetch(`${MARQQ2}/api/health`).catch(() => null);
    if (!health?.ok) {
      console.log("  · Marqq2 content-engine not reachable — skip gmail-draft / poll-gmail-replies");
    } else {
      ok("content-engine health");
      const poll = await fetch(`${MARQQ2}/api/outreach/poll-gmail-replies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: COMPANY_ID }),
      }).catch((e) => ({ ok: false, error: e }));
      if (poll?.ok) {
        const body = await poll.json().catch(() => ({}));
        ok(`poll-gmail-replies → ${JSON.stringify(body).slice(0, 160)}`);
      } else {
        console.log(
          `  · poll-gmail-replies skipped/failed (needs live outreach runs): ${poll?.error || poll?.status || ""}`
        );
      }
    }
  } else {
    console.log("\n  · Set MARQQ2_BASE=http://127.0.0.1:3008 to also smoke Marqq2 gmail-draft / poll-gmail-replies");
  }

  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
