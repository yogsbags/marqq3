/**
 * Blog website publish — Marqq2 go-live parity (GitHub → site deploy)
 * SEO HTML document + optional GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS
 * Deploy: GitHub Actions / Cloudflare (Nouriva) or Railway when repo is linked
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeComposioAction } from './composio.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHROME_PATH = join(__dirname, '../templates/nouriva-blog-chrome.json');

let chromeCache = null;
function loadNourivaChrome() {
  if (chromeCache) return chromeCache;
  if (!existsSync(CHROME_PATH)) {
    throw new Error(`Missing Nouriva blog chrome template at ${CHROME_PATH}`);
  }
  chromeCache = JSON.parse(readFileSync(CHROME_PATH, 'utf8'));
  return chromeCache;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function publishConfig(overrides = {}) {
  const owner = String(
    overrides.repo_owner ||
      overrides.owner ||
      process.env.BLOG_GITHUB_OWNER ||
      process.env.GITHUB_OWNER ||
      'yogsbags'
  ).trim();
  const repo = String(
    overrides.repo_name ||
      overrides.repo ||
      process.env.BLOG_GITHUB_REPO ||
      process.env.GITHUB_REPO ||
      'nouriva'
  ).trim();
  const branch = String(
    overrides.branch || process.env.BLOG_GITHUB_BRANCH || process.env.GITHUB_BRANCH || 'main'
  ).trim();
  const pathPrefix = String(
    overrides.path_prefix || process.env.BLOG_PATH_PREFIX || 'blog'
  )
    .trim()
    .replace(/^\/|\/$/g, '');
  const publicBase = String(
    overrides.public_base || process.env.BLOG_PUBLIC_BASE_URL || ''
  )
    .trim()
    .replace(/\/$/, '');
  const deployProvider = String(
    overrides.deploy_provider || process.env.BLOG_DEPLOY_PROVIDER || 'github_actions'
  ).trim();
  // Nouriva live site uses /blog/{slug}/ → blog/{slug}/index.html (not flat .html)
  const pathStyle = String(
    overrides.path_style || process.env.BLOG_PATH_STYLE || 'slug_index'
  ).trim(); // slug_index | flat_html
  return { owner, repo, branch, pathPrefix, publicBase, deployProvider, pathStyle };
}

/** Strip accidental full-document wrappers; keep article fragment HTML. */
function normalizeArticleBody(raw, title) {
  let body = String(raw || '').trim();
  if (!body) throw new Error('Article HTML is empty');
  if (/<html[\s>]/i.test(body)) {
    const art = body.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (art) body = art[1].trim();
    else {
      const main = body.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
      body = (main ? main[1] : body)
        .replace(/<\/?(?:html|head|body|main|header|footer|nav)[^>]*>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .trim();
    }
  }
  // Drop our old bare-shell meta/cta/footer leftovers if present
  body = body
    .replace(/<p class="meta">[\s\S]*?<\/p>/i, '')
    .replace(/<p><a class="cta"[\s\S]*?<\/p>/i, '')
    .replace(/<footer class="site">[\s\S]*?<\/footer>/i, '')
    .trim();
  if (!/<h1[\s>]/i.test(body)) {
    body = `<h1>${escapeHtml(title)}</h1>\n${body}`;
  }
  return body;
}

/**
 * Full SEO blog HTML using live Nouriva site chrome (nav, blog-shell, footer).
 */
export function buildSeoBlogDocument(article = {}, opts = {}) {
  const cfg = publishConfig(opts);
  const chrome = loadNourivaChrome();
  const title = String(article.title || 'Untitled').trim();
  const meta = String(article.meta_description || '').trim().slice(0, 160);
  const slug = slugify(article.slug || title) || 'article';
  const body = normalizeArticleBody(article.html, title);
  const canonical = `${cfg.publicBase}/blog/${slug}`;
  const keyword = String(article.primary_keyword || '').trim();
  const published = article.approvedAt || article.createdAt || new Date().toISOString();
  const company = String(opts.companyName || article.companyName || 'Your company').trim();
  const pageTitle = title.includes(company) ? title : `${title} | ${company}`;
  const file_path =
    cfg.pathStyle === 'flat_html'
      ? `${cfg.pathPrefix}/${slug}.html`
      : `${cfg.pathPrefix}/${slug}/index.html`;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: meta || undefined,
    datePublished: published,
    dateModified: new Date().toISOString(),
    author: { '@type': 'Organization', name: company },
    publisher: {
      '@type': 'Organization',
      name: company,
      url: cfg.publicBase,
      logo: { '@type': 'ImageObject', url: `${cfg.publicBase}/favicon.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    keywords: [keyword, ...(article.secondary_keywords || [])].filter(Boolean).join(', ') || undefined,
  };

  const html = `<!DOCTYPE html><html lang="${escapeHtml(chrome.lang || 'en-IN')}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><meta name="theme-color" content="${escapeHtml(chrome.themeColor || '#0F3D2E')}"><meta name="robots" content="index,follow"><title>${escapeHtml(pageTitle)}</title>${meta ? `<meta name="description" content="${escapeHtml(meta)}">` : ''}${keyword ? `<meta name="keywords" content="${escapeHtml(keyword)}">` : ''}<link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(title)}">${meta ? `<meta property="og:description" content="${escapeHtml(meta)}">` : ''}<meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:site_name" content="${escapeHtml(company)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}">${meta ? `<meta name="twitter:description" content="${escapeHtml(meta)}">` : ''}${chrome.fontsLink || ''}${chrome.styleBlock || ''}${chrome.blogNavFixStyle || ''}<script type="application/ld+json">${JSON.stringify(schema)}</script></head><body>
${chrome.navHtml || ''}
<main class="blog-shell"><div class="container blog-wrap"><a class="blog-back" href="/blog/">← Blog</a><div class="blog-card"><div class="blog-kicker">${escapeHtml(chrome.kicker || `${company} · Insights`)}</div><!-- META: ${escapeHtml(meta)} -->
<!-- SLUG: ${escapeHtml(slug)} -->
<article>
${body}
</article></div></div></main>
${chrome.footerHtml || ''}
${chrome.scrollScript || ''}
</body></html>`;

  return {
    html,
    slug,
    title,
    meta_description: meta,
    canonical,
    file_path,
    seo: validateSeoDocument(html, { title: pageTitle, meta, canonical }),
  };
}

export function validateSeoDocument(html, { title, meta, canonical } = {}) {
  const checks = {
    doctype: /<!DOCTYPE html>/i.test(html),
    title_tag: Boolean(title) && /<title>[^<]*<\/title>/i.test(html) && html.includes(String(title).slice(0, 40)),
    meta_description: Boolean(meta) && /name="description"/i.test(html),
    canonical: Boolean(canonical) && /rel="canonical"/i.test(html),
    og_title: /property="og:title"/i.test(html),
    json_ld_article: /"@type"\s*:\s*"Article"/i.test(html) || /"@type":"Article"/i.test(html),
    h1: /<h1[\s>]/i.test(html),
    h2: /<h2[\s>]/i.test(html),
    main: /<main[\s>]/i.test(html),
    viewport: /name="viewport"/i.test(html),
    site_nav: /class="nav"/i.test(html) || /id="nav"/i.test(html),
    site_footer: /class="footer"/i.test(html) || /id="support"/i.test(html),
    blog_shell: /class="blog-shell"/i.test(html),
  };
  const failed = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);
  return {
    ok: failed.length === 0,
    checks,
    failed,
    score: Math.round(
      (Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100
    ),
  };
}

function extractGithubSha(result) {
  const data = result?.result || result?.data || result || {};
  return (
    data.sha ||
    data.content?.sha ||
    data.data?.sha ||
    data.response?.sha ||
    null
  );
}

async function getGithubFileSha({ owner, repo, path, branch, entityId }) {
  const res = await executeComposioAction(
    'GITHUB_GET_REPOSITORY_CONTENT',
    { owner, repo, path, ref: branch },
    entityId,
    'github'
  );
  if (res.error) return null;
  return extractGithubSha(res);
}

/**
 * Format SEO package (always). Push to GitHub when publish_live=true (Marqq2 gate).
 */
export async function publishBlogPackage({
  article,
  companyName,
  companyId,
  publish_live = false,
  overrides = {},
} = {}) {
  const cfg = publishConfig(overrides);
  const formatted = buildSeoBlogDocument(article, { ...overrides, companyName });
  if (!formatted.seo.ok) {
    return {
      ok: false,
      error: `SEO formatting failed: ${formatted.seo.failed.join(', ')}`,
      formatted,
    };
  }

  const packagePayload = {
    connector: 'github',
    status: 'formatted',
    publish_live: Boolean(publish_live),
    title: formatted.title,
    slug: formatted.slug,
    meta_description: formatted.meta_description,
    canonical: formatted.canonical,
    file_path: formatted.file_path,
    html_bytes: Buffer.byteLength(formatted.html, 'utf8'),
    seo: formatted.seo,
    repo: { owner: cfg.owner, name: cfg.repo, branch: cfg.branch },
    deployment: {
      provider: cfg.deployProvider,
      status: publish_live ? 'pending_push' : 'dry_run',
      workflow:
        cfg.deployProvider === 'railway'
          ? 'Railway auto-deploy from GitHub'
          : '.github/workflows/deploy-nouriva-landing.yml',
      note:
        cfg.deployProvider === 'railway'
          ? 'GitHub push should trigger Railway redeploy for the linked service.'
          : 'GitHub push under nouriva-landing/** triggers Cloudflare Worker deploy via Actions.',
      public_url: formatted.canonical,
    },
    html: formatted.html,
  };

  if (!publish_live) {
    return {
      ok: true,
      requires_approval: true,
      note: 'Draft package only — set publish_live=true to write GitHub (Marqq2 gate).',
      publish: packagePayload,
    };
  }

  const entityId = String(companyId || process.env.COMPOSIO_ENTITY_ID || 'marqq-ws-1').trim();
  const sha = await getGithubFileSha({
    owner: cfg.owner,
    repo: cfg.repo,
    path: formatted.file_path,
    branch: cfg.branch,
    entityId,
  });

  const args = {
    owner: cfg.owner,
    repo: cfg.repo,
    path: formatted.file_path,
    branch: cfg.branch,
    message: `Marqq publish blog: ${formatted.title}`,
    content: Buffer.from(formatted.html, 'utf8').toString('base64'),
  };
  if (sha) args.sha = sha;

  const result = await executeComposioAction(
    'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS',
    args,
    entityId,
    'github'
  );

  if (result.error) {
    return {
      ok: false,
      error: result.error,
      publish: packagePayload,
      raw: result.raw || null,
    };
  }

  packagePayload.status = 'published';
  packagePayload.deployment.status = 'queued_by_repository_push';
  packagePayload.github = {
    sha: extractGithubSha(result) || sha,
    connectedAccountId: result.connectedAccountId || null,
    result: result.result || null,
  };

  // Best-effort Railway status if toolkit connected
  if (cfg.deployProvider === 'railway') {
    const rail = await executeComposioAction(
      'RAILWAY_LIST_ENVIRONMENT_PATCHES',
      {},
      entityId,
      'railway'
    );
    packagePayload.railway = rail.error
      ? { ok: false, error: rail.error }
      : { ok: true, result: rail.result };
  }

  return {
    ok: true,
    publish: packagePayload,
    url: formatted.canonical,
  };
}
