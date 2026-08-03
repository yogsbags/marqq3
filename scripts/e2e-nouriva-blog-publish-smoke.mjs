#!/usr/bin/env node
/**
 * Nouriva blog publish smoke (Marqq2 go-live parity):
 *   research → brief → draft → approve → SEO format → (optional) GitHub live push
 *
 *   node scripts/e2e-nouriva-blog-publish-smoke.mjs
 *   CONTENT_PUBLISH_LIVE=1 node scripts/e2e-nouriva-blog-publish-smoke.mjs
 *
 * Default is dry_run (SEO package only). Live writes yogsbags/nouriva nouriva-landing/blog/{slug}.html
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const BASE = String(process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const LIVE = process.env.CONTENT_PUBLISH_LIVE === "1";

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
const note = (m) => console.log(`  · ${m}`);

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
  console.log(`\n[nouriva-blog-publish] ${BASE} · live=${LIVE}\n`);

  const health = await api("/health");
  if (!health.ok && !health.data?.status) {
    fail("health");
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
      brandContext: "Nouriva AI — lab-personalized nutrition for patients and clinical partners.",
    },
  });
  if (!create.ok) {
    fail("create", create.data?.error);
    process.exit(1);
  }
  const runId = create.data.runId;
  ok("create", runId);

  const research = await api(`/api/content/runs/${runId}/research`, { method: "POST" });
  if (!research.ok) {
    fail("research", research.data?.error);
    process.exit(1);
  }
  ok("research", `${research.data.plan?.article_queue?.length || 0} keywords`);

  const brief = await api(`/api/content/runs/${runId}/brief`, {
    method: "POST",
    body: { queueIndex: 0 },
  });
  if (!brief.ok) {
    fail("brief", brief.data?.error);
    process.exit(1);
  }
  ok("brief", brief.data.brief?.keyword);

  const draft = await api(`/api/content/runs/${runId}/draft`, { method: "POST" });
  if (!draft.ok) {
    fail("draft", draft.data?.error);
    process.exit(1);
  }
  ok(
    "draft",
    `${String(draft.data.article?.title || "").slice(0, 48)} · ${draft.data.article?.word_count || 0}w`
  );

  const approve = await api(`/api/content/runs/${runId}/approve`, { method: "POST" });
  if (!approve.ok) {
    fail("approve", approve.data?.error);
    process.exit(1);
  }
  ok("approve");

  const format = await api(`/api/content/runs/${runId}/publish`, {
    method: "POST",
    body: {
      publish_live: false,
      deploy_provider: process.env.BLOG_DEPLOY_PROVIDER || "github_actions",
    },
  });
  if (!format.ok) {
    fail("seo-format", format.data?.error);
    process.exit(1);
  }
  const pub = format.data.publish || {};
  if (!pub.seo?.ok) {
    fail("seo-format", `failed checks: ${(pub.seo?.failed || []).join(", ")}`);
    process.exit(1);
  }
  ok(
    "seo-format",
    `score=${pub.seo.score}% · ${pub.file_path} · ${pub.canonical}`
  );

  const requiredChecks = [
    "doctype",
    "title_tag",
    "meta_description",
    "canonical",
    "og_title",
    "json_ld_article",
    "json_ld_faq",
    "faq_section",
    "h1",
    "h2",
    "main",
  ];
  const missing = requiredChecks.filter((k) => !pub.seo?.checks?.[k]);
  if (missing.length) {
    fail("seo-checks", missing.join(", "));
    process.exit(1);
  }
  ok("seo-checks", requiredChecks.join(", "));
  if ((pub.faq_count || 0) >= 3) ok("faq-count", String(pub.faq_count));
  else fail("faq-count", `expected ≥3, got ${pub.faq_count || 0}`);

  mkdirSync(OUT_DIR, { recursive: true });
  if (pub.html) {
    writeFileSync(join(OUT_DIR, `blog-${pub.slug || "article"}.html`), pub.html);
  }

  if (LIVE) {
    const live = await api(`/api/content/runs/${runId}/publish`, {
      method: "POST",
      body: {
        publish_live: true,
        deploy_provider: process.env.BLOG_DEPLOY_PROVIDER || "github_actions",
        repo_owner: process.env.BLOG_GITHUB_OWNER || "yogsbags",
        repo_name: process.env.BLOG_GITHUB_REPO || "nouriva",
        path_prefix: process.env.BLOG_PATH_PREFIX || "nouriva-landing/blog",
        public_base: process.env.BLOG_PUBLIC_BASE_URL || "https://nouriva.tech",
        path_style: process.env.BLOG_PATH_STYLE || "slug_index",
      },
    });
    if (!live.ok) {
      fail("github-live", live.data?.error);
      process.exit(1);
    }
    const livePub = live.data.publish || {};
    ok(
      "github-live",
      `${livePub.file_path} · via=${livePub.github?.via || "?"} · deploy=${livePub.deployment?.status}`
    );

    const publicUrl = live.data.url || livePub.canonical || pub.canonical;
    if (publicUrl) {
      note(`Waiting for Cloudflare deploy → ${publicUrl}`);
      // Poll GitHub Actions for deploy-nouriva-landing
      let deployOk = false;
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 10000));
        try {
          const { execFileSync } = await import("node:child_process");
          const runs = execFileSync(
            "gh",
            ["run", "list", "--repo", "yogsbags/nouriva", "--workflow", "deploy-nouriva-landing.yml", "--limit", "1", "--json", "status,conclusion,url,displayTitle,createdAt"],
            { encoding: "utf8" }
          );
          const list = JSON.parse(runs || "[]");
          const latest = list[0];
          if (latest) {
            note(`Actions: ${latest.status}/${latest.conclusion || "…"} · ${latest.url}`);
            if (latest.status === "completed") {
              if (latest.conclusion === "success") {
                ok("cloudflare-actions", latest.url);
                deployOk = true;
              } else {
                fail("cloudflare-actions", `${latest.conclusion} · ${latest.url}`);
              }
              break;
            }
          }
        } catch (e) {
          note(`Actions poll: ${e.message}`);
        }
      }
      if (!deployOk && results.every((r) => r.name !== "cloudflare-actions" || r.status !== "fail")) {
        fail("cloudflare-actions", "timed out waiting for workflow");
      }

      // Verify live URL (allow a bit more for CF edge)
      let httpOk = false;
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const res = await fetch(publicUrl, { redirect: "follow" });
          const text = await res.text();
          if (res.ok && /<!DOCTYPE html>/i.test(text) && /Nouriva/i.test(text)) {
            ok("live-url", `${res.status} · ${publicUrl}`);
            httpOk = true;
            break;
          }
          note(`live-url attempt ${i + 1}: HTTP ${res.status}`);
        } catch (e) {
          note(`live-url attempt ${i + 1}: ${e.message}`);
        }
      }
      if (!httpOk) fail("live-url", publicUrl);
    }
  } else {
    ok("github-live", "skipped (set CONTENT_PUBLISH_LIVE=1)");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(OUT_DIR, `nouriva-blog-publish-smoke-${stamp}.md`);
  const passed = results.every((r) => r.status === "pass");
  writeFileSync(
    outPath,
    [
      `# Nouriva blog publish smoke`,
      ``,
      `- Base: ${BASE}`,
      `- Run: ${runId}`,
      `- Live: ${LIVE}`,
      `- Result: ${passed ? "PASS" : "FAIL"}`,
      `- Canonical: ${pub.canonical || ""}`,
      `- Path: ${pub.file_path || ""}`,
      ``,
      ...results.map(
        (r) => `- ${r.status === "pass" ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`
      ),
      ``,
    ].join("\n")
  );
  console.log(
    `\n${passed ? "PASS" : "FAIL"} · ${results.filter((r) => r.status === "pass").length}/${results.length} · ${outPath}\n`
  );
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
