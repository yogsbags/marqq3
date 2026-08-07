#!/usr/bin/env node
/**
 * GEO citation scanner smoke (Marqq-test product API).
 *
 *   BASE_URL=http://127.0.0.1:3001 node scripts/smoke-geo-citation.mjs
 *
 * Requires running Marqq-test server with APIFY_TOKEN.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(__dirname, "output");
const API = String(process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");

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
function ok(n, d = "") {
  results.push({ name: n, status: "pass", detail: d });
  console.log(`  ✓ ${n}${d ? ` — ${d}` : ""}`);
}
function fail(n, d = "") {
  results.push({ name: n, status: "fail", detail: d });
  console.error(`  ✗ ${n}${d ? ` — ${d}` : ""}`);
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log(`GEO citation smoke · API=${API}`);

  const health = await api("/api/geo/queries/preview", {
    method: "POST",
    body: {
      companyName: "Elevate",
      domain: "theelevate.co.in",
      keywords: ["digital transformation consulting", "AI transformation India"],
    },
  }).catch((e) => ({ ok: false, data: { error: e.message } }));

  if (!health.ok) {
    fail("geo:preview", health.data?.error || `API unreachable at ${API} — start Marqq-test server`);
    writeReport();
    process.exit(1);
  }
  ok("geo:preview", `${(health.data.queries || []).length} default queries`);

  const scan = await api("/api/geo/scan", {
    method: "POST",
    body: {
      workspaceId: "marqq-ws-1",
      companyName: "Elevate",
      domain: "theelevate.co.in",
      keywords: ["digital transformation consulting", "AI transformation strategy"],
      countryCode: "in",
      enablePerplexity: true,
    },
  });

  if (!scan.ok) {
    fail("geo:scan", scan.data?.error || JSON.stringify(scan.data).slice(0, 200));
    writeReport();
    process.exit(1);
  }

  const s = scan.data.scan;
  ok("geo:scan", `id=${s.id} visibility=${s.summary?.visibilityScore} band=${s.summary?.band}`);
  if ((s.llmo_notes || []).length) ok("geo:llmo_notes", `${s.llmo_notes.length} notes`);
  else fail("geo:llmo_notes", "missing");
  if ((s.perQuery || []).length >= 1) ok("geo:per_query", `${s.perQuery.length} rows`);
  else fail("geo:per_query", "empty");

  const latest = await api("/api/geo/scans/latest?workspaceId=marqq-ws-1");
  if (latest.ok && latest.data.scan?.id === s.id) ok("geo:latest", latest.data.scan.id);
  else fail("geo:latest", latest.data?.error || "mismatch");

  const byId = await api(`/api/geo/scans/${encodeURIComponent(s.id)}`);
  if (byId.ok) ok("geo:get", byId.data.scan.id);
  else fail("geo:get", byId.data?.error);

  writeReport(s);
}

function writeReport(scan = null) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const pass = results.filter((r) => r.status === "pass").length;
  const failN = results.filter((r) => r.status === "fail").length;
  const mdPath = join(OUT, `geo-citation-smoke-${stamp}.md`);
  writeFileSync(
    mdPath,
    [
      `# GEO citation scanner smoke`,
      ``,
      `- API: ${API}`,
      `- ${pass} pass · ${failN} fail`,
      ``,
      ...results.map((r) => `- ${r.status}: **${r.name}** — ${r.detail || ""}`),
      ``,
      scan
        ? `## Summary\n\`\`\`json\n${JSON.stringify(scan.summary, null, 2)}\n\`\`\`\n`
        : "",
    ].join("\n")
  );
  writeFileSync(join(OUT, `geo-citation-smoke-${stamp}.json`), JSON.stringify({ results, scan }, null, 2));
  console.log(`\n=== ${pass} pass / ${failN} fail ===\n${mdPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
