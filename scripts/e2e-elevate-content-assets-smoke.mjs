#!/usr/bin/env node
/**
 * Elevate — SEO blog + Social + Landing + Lead Magnet generation smoke (drafts only).
 *
 *   Content:  create → research → brief → draft → approve
 *   Social:   create → brief → compose → approve
 *   Landing:  create → generate → approve → package/publish (publish_live=false)
 *   Magnet:   create → design → generate → approve → package (publish_live=false)
 *
 * Never live-publishes. Saves HTML/JSON artifacts under scripts/output/.
 *
 *   BASE_URL=http://127.0.0.1:3001 node scripts/e2e-elevate-content-assets-smoke.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "output");
const API = String(process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const WORKSPACE_ID = process.env.WORKSPACE_ID || "marqq-ws-1";

const ELEVATE = {
  companyName: "Elevate",
  website: "https://theelevate.co.in",
  domain: "theelevate.co.in",
  niche: "Management strategy, AI solutions & digital transformation consulting",
  icp: "Growth-stage companies and mid-market leaders seeking strategy-to-execution partners",
  offer: "Strategy-to-execution partnership for AI transformation and growth",
  cta: "Book a strategy consult",
  brandContext:
    "Elevate (theelevate.co.in) — management strategy, AI solutions, and digital transformation consulting for Indian growth-stage and mid-market leaders.",
};

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
const artifacts = {};

function ok(n, d = "") {
  results.push({ name: n, status: "pass", detail: d });
  console.log(`  ✓ ${n}${d ? ` — ${d}` : ""}`);
}
function fail(n, d = "") {
  results.push({ name: n, status: "fail", detail: d });
  console.error(`  ✗ ${n}${d ? ` — ${d}` : ""}`);
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

async function smokeContent() {
  console.log("\n[1] Content Studio — SEO research → brief → blog draft");
  const create = await api("/api/content/runs", {
    method: "POST",
    body: {
      companyName: ELEVATE.companyName,
      companyId: WORKSPACE_ID,
      workspaceId: WORKSPACE_ID,
      domain: ELEVATE.domain,
      marketType: "b2b",
      brandContext: ELEVATE.brandContext,
    },
  });
  if (!create.ok) {
    fail("content:create", create.data?.error || JSON.stringify(create.data).slice(0, 160));
    return;
  }
  const runId = create.data.runId || create.data.run?.id;
  ok("content:create", runId);

  note("Maya researching…");
  const research = await api(`/api/content/runs/${runId}/research`, { method: "POST" });
  if (!research.ok) {
    fail("content:research", research.data?.error || JSON.stringify(research.data).slice(0, 160));
    return;
  }
  const queue = research.data.plan?.article_queue || [];
  ok("content:research", `${queue.length} queue · ${research.data.plan?.data_source || "?"}`);

  note("Maya briefing…");
  const brief = await api(`/api/content/runs/${runId}/brief`, {
    method: "POST",
    body: { queueIndex: 0 },
  });
  if (!brief.ok) {
    fail("content:brief", brief.data?.error || JSON.stringify(brief.data).slice(0, 160));
    return;
  }
  ok(
    "content:brief",
    `kw="${brief.data.brief?.keyword || "?"}" outline=${(brief.data.brief?.outline || []).length}`
  );

  note("Riya drafting…");
  const draft = await api(`/api/content/runs/${runId}/draft`, { method: "POST" });
  if (!draft.ok) {
    fail("content:draft", draft.data?.error || JSON.stringify(draft.data).slice(0, 160));
    return;
  }
  const article = draft.data.article || {};
  ok(
    "content:draft",
    `title="${String(article.title || "").slice(0, 56)}" words=${article.word_count || 0}`
  );

  const approve = await api(`/api/content/runs/${runId}/approve`, { method: "POST" });
  if (!approve.ok) fail("content:approve", approve.data?.error);
  else ok("content:approve", approve.data.status || approve.data.run?.status || "approved");

  artifacts.content = {
    runId,
    keyword: brief.data.brief?.keyword,
    title: article.title,
    word_count: article.word_count,
    outline: brief.data.brief?.outline || [],
    excerpt: String(article.markdown || article.body || "").slice(0, 600),
  };
  writeFileSync(
    join(OUT_DIR, `elevate-content-article-${runId}.md`),
    `# ${article.title || "Elevate article"}\n\n${article.markdown || article.body || ""}\n`
  );
}

async function smokeSocial() {
  console.log("\n[2] Social Studio — brief → compose → approve");
  const create = await api("/api/social/runs", {
    method: "POST",
    body: {
      companyName: ELEVATE.companyName,
      companyId: WORKSPACE_ID,
      topic:
        "Elevate strategy-to-execution for mid-market AI transformation — 5 qualified leads / month",
      channels: ["linkedin", "instagram", "twitter"],
      brandContext: ELEVATE.brandContext,
    },
  });
  if (!create.ok) {
    fail("social:create", create.data?.error);
    return;
  }
  const runId = create.data.runId;
  ok("social:create", runId);

  note("Kiran briefing…");
  const brief = await api(`/api/social/runs/${runId}/brief`, { method: "POST", body: {} });
  if (!brief.ok) {
    fail("social:brief", brief.data?.error);
    return;
  }
  ok("social:brief", String(brief.data.brief?.hook || brief.data.brief?.angle || "").slice(0, 80));

  note("Composing posts…");
  const compose = await api(`/api/social/runs/${runId}/compose`, { method: "POST" });
  if (!compose.ok) {
    fail("social:compose", compose.data?.error);
    return;
  }
  const posts = compose.data.posts || [];
  ok("social:compose", `${posts.length} posts`);

  const approve = await api(`/api/social/runs/${runId}/approve`, { method: "POST" });
  if (!approve.ok) fail("social:approve", approve.data?.error);
  else ok("social:approve", String(approve.data.postCount ?? posts.length));

  artifacts.social = {
    runId,
    hook: brief.data.brief?.hook || null,
    posts: posts.map((p) => ({
      channel: p.channel || p.platform,
      text: String(p.text || p.caption || p.body || "").slice(0, 280),
    })),
  };
  writeFileSync(join(OUT_DIR, `elevate-social-posts-${runId}.json`), JSON.stringify(artifacts.social, null, 2));
}

async function smokeLanding() {
  console.log("\n[3] Landing Pages — generate → approve → draft package");
  const create = await api("/api/landing/runs", {
    method: "POST",
    body: {
      companyId: WORKSPACE_ID,
      companyName: ELEVATE.companyName,
      product: ELEVATE.companyName,
      offer: ELEVATE.offer,
      audience: ELEVATE.icp,
      goal: "lead_gen",
      cta: ELEVATE.cta,
      brandContext: ELEVATE.brandContext,
    },
  });
  if (!create.ok) {
    fail("landing:create", create.data?.error);
    return;
  }
  const runId = create.data.runId;
  ok("landing:create", runId);

  note("Tara + Sam generating LP…");
  const gen = await api(`/api/landing/runs/${runId}/generate`, { method: "POST", body: {} });
  if (!gen.ok || !gen.data?.run?.page?.html) {
    fail("landing:generate", gen.data?.error || "no html");
    return;
  }
  const skills = (gen.data.run.skill_alignment?.skills || []).join(",");
  ok("landing:generate", `${gen.data.run.page.slug} · skills=${skills || "n/a"} · html=${gen.data.run.page.html.length}`);

  const approve = await api(`/api/landing/runs/${runId}/approve`, { method: "POST" });
  if (!approve.ok) fail("landing:approve", approve.data?.error);
  else ok("landing:approve");

  const pub = await api(`/api/landing/runs/${runId}/publish`, {
    method: "POST",
    body: { publish_live: false },
  });
  if (!pub.ok) fail("landing:draft-package", pub.data?.error);
  else ok("landing:draft-package", pub.data.url || "packaged");

  artifacts.landing = {
    runId,
    slug: gen.data.run.page.slug,
    skills: gen.data.run.skill_alignment?.skills || [],
    url: pub.data?.url || null,
    htmlChars: gen.data.run.page.html.length,
  };
  writeFileSync(join(OUT_DIR, `elevate-landing-${runId}.html`), gen.data.run.page.html);
  if (pub.data?.publish?.html) {
    writeFileSync(join(OUT_DIR, `elevate-landing-publish-${runId}.html`), pub.data.publish.html);
  }
}

async function smokeLeadMagnet() {
  console.log("\n[4] Lead Magnets — design → gated page → approve → draft package");
  const create = await api("/api/lead-magnets/runs", {
    method: "POST",
    body: {
      companyId: WORKSPACE_ID,
      companyName: ELEVATE.companyName,
      magnetType: "checklist",
      audience: ELEVATE.icp,
      goal: "capture",
      brandContext: ELEVATE.brandContext,
    },
  });
  if (!create.ok) {
    fail("magnet:create", create.data?.error);
    return;
  }
  const runId = create.data.runId;
  ok("magnet:create", runId);

  note("Riya designing…");
  const design = await api(`/api/lead-magnets/runs/${runId}/design`, { method: "POST", body: {} });
  if (!design.ok || !design.data?.run?.concept?.title) {
    fail("magnet:design", design.data?.error || "no concept");
    return;
  }
  ok("magnet:design", design.data.run.concept.title);

  note("Generating gated page…");
  const gen = await api(`/api/lead-magnets/runs/${runId}/generate`, { method: "POST", body: {} });
  if (!gen.ok || !gen.data?.run?.page?.html) {
    fail("magnet:generate", gen.data?.error || "no html");
    return;
  }
  const hasForm = /data-marqq-lead-form|type=["']email["']|name=["']email["']/i.test(gen.data.run.page.html);
  ok("magnet:generate", `${gen.data.run.page.slug} · form=${hasForm} · html=${gen.data.run.page.html.length}`);

  const approve = await api(`/api/lead-magnets/runs/${runId}/approve`, { method: "POST" });
  if (!approve.ok) fail("magnet:approve", approve.data?.error);
  else ok("magnet:approve");

  const pub = await api(`/api/lead-magnets/runs/${runId}/publish`, {
    method: "POST",
    body: { publish_live: false },
  });
  if (!pub.ok) fail("magnet:draft-package", pub.data?.error);
  else ok("magnet:draft-package", pub.data.url || "packaged");

  artifacts.magnet = {
    runId,
    title: design.data.run.concept.title,
    slug: gen.data.run.page.slug,
    hasForm,
    url: pub.data?.url || null,
    htmlChars: gen.data.run.page.html.length,
  };
  writeFileSync(join(OUT_DIR, `elevate-lead-magnet-${runId}.html`), gen.data.run.page.html);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  console.log("\nElevate content assets smoke (drafts only)");
  console.log(`API ${API} · ${ELEVATE.companyName} · ${ELEVATE.website}\n`);

  const health = await api("/health");
  if (health.status === 200 || health.data?.status || health.ok) ok("api:health");
  else {
    const dep = await api(`/api/agents/deployments?workspaceId=${encodeURIComponent(WORKSPACE_ID)}`);
    if (dep.status === 200) ok("api:health", "deployments ok");
    else fail("api:health", `status ${health.status}`);
  }

  await smokeContent();
  await smokeSocial();
  await smokeLanding();
  await smokeLeadMagnet();

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const report = {
    stamp,
    company: ELEVATE,
    mode: "drafts_only",
    workspaceId: WORKSPACE_ID,
    passed,
    failed,
    artifacts,
    results,
  };
  const jsonPath = join(OUT_DIR, `elevate-content-assets-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(
    join(OUT_DIR, `elevate-content-assets-${stamp}.md`),
    [
      `# Elevate content assets smoke`,
      ``,
      `- Mode: drafts only (no live publish)`,
      `- Result: **${passed} passed · ${failed} failed**`,
      ``,
      `## Artifacts`,
      `- Content: ${artifacts.content?.title || "—"} (${artifacts.content?.word_count || 0} words)`,
      `- Social: ${(artifacts.social?.posts || []).length} posts`,
      `- Landing: ${artifacts.landing?.slug || "—"} (${artifacts.landing?.htmlChars || 0} chars)`,
      `- Lead magnet: ${artifacts.magnet?.title || "—"} · form=${artifacts.magnet?.hasForm}`,
      ``,
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
