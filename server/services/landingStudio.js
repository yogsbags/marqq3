/**
 * Landing Pages studio — Tara structure + Sam HTML via page-cro / copywriting / form-cro.
 * Publish to nouriva-landing/lp/{slug}.html (GitHub → Cloudflare).
 */

import { randomUUID } from 'node:crypto';
import { buildPlaybookFromPack } from './gtmStrategySkills.js';
import { publishStaticHtmlPage } from './blogPublish.js';
import { meteredStudioJson, assertCanAfford } from './credits/index.js';
import { getInjectableRulesBlock } from './agentInstructions.js';

const runsById = new Map();

const LANDING_PACK = {
  primary: ['page-cro', 'copywriting', 'form-cro'],
  secondary: ['marketing-psychology'],
};


function parseJsonLoose(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

async function groqJson({ system, user, model, temperature = 0.35, max_tokens = 4000, workspaceId = 'marqq-ws-1' }) {
  return meteredStudioJson({
    workspaceId,
    feature: 'landing_studio',
    system,
    user,
    model: model || undefined,
    temperature,
    max_tokens,
    meta: { studio: 'landing_studio' },
  });
}


function publicRun(run) {
  return {
    id: run.id,
    companyId: run.companyId,
    companyName: run.companyName,
    product: run.product,
    offer: run.offer,
    audience: run.audience,
    goal: run.goal,
    cta: run.cta,
    brandContext: run.brandContext,
    status: run.status,
    page: run.page,
    publish: run.publish,
    skill_alignment: run.skill_alignment,
    approvedAt: run.approvedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

export function createLandingRun(input = {}) {
  const companyId = String(input.companyId || input.workspaceId || 'marqq-ws-1').trim();
  const run = {
    id: randomUUID(),
    companyId,
    workspaceId: companyId,
    companyName: String(input.companyName || 'Nouriva AI').trim(),
    product: String(input.product || input.companyName || 'Nouriva AI').trim(),
    offer: String(input.offer || '').trim(),
    audience: String(input.audience || '').trim(),
    goal: String(input.goal || 'lead_gen').trim(),
    cta: String(input.cta || 'Get started').trim(),
    brandContext: String(input.brandContext || input.brand_context || '').trim(),
    status: 'created',
    page: null,
    publish: null,
    skill_alignment: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  runsById.set(run.id, run);
  return publicRun(run);
}

export function getLandingRun(runId) {
  const run = runsById.get(runId);
  return run ? publicRun(run) : null;
}

export async function generateLandingPage(runId, patch = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Landing run not found');
  assertCanAfford(run.workspaceId || run.companyId, 'landing_studio');

  Object.assign(run, {
    product: patch.product ?? run.product,
    offer: patch.offer ?? run.offer,
    audience: patch.audience ?? run.audience,
    goal: patch.goal ?? run.goal,
    cta: patch.cta ?? run.cta,
    brandContext: patch.brandContext ?? patch.brand_context ?? run.brandContext,
  });

  const pack = await buildPlaybookFromPack(LANDING_PACK, { label: 'create_landing_page' });
  const taraRules = await getInjectableRulesBlock(run.workspaceId || run.companyId, 'tara');
  const parsed = await groqJson({
    workspaceId: run.workspaceId || run.companyId || 'marqq-ws-1',
    system:
      'You are Tara (page structure) + Sam (conversion copy). Apply page-cro, copywriting, and form-cro. Return JSON only. Never invent fake testimonials, review scores, or case-study numbers — use honest placeholders.' +
      taraRules,
    user: `Build a conversion-ready landing page for website publish.

Product: ${run.product}
Offer / value prop: ${run.offer || run.product}
Audience: ${run.audience || 'n/a'}
Primary goal: ${run.goal}
Primary CTA: ${run.cta}
Brand context: ${run.brandContext || 'n/a'}
Company: ${run.companyName}

${pack.playbook ? `Marketing skill playbook (authoritative):\n${pack.playbook}\n` : ''}

Return ONLY JSON:
{
  "title": "page title",
  "slug": "url-slug",
  "meta_description": "≤155 chars",
  "page_structure": [
    { "label": "hero", "heading": "...", "content": "...", "cta": "..." }
  ],
  "html": "<!DOCTYPE html>... full single-page HTML ...",
  "ab_tests": ["hero headline variant to test"]
}

Rules:
- 5-second clarity; one primary CTA; benefit-led headlines
- Sections: hero, problem/benefits, how it works, social proof placeholders, FAQ, closing CTA (min 6)
- Mobile-friendly semantic HTML; include meta description in <head>
- CTA copy communicates value (not Submit/Learn More alone)
- No invented stats`,
  });

  let html = String(parsed.html || '').trim();
  html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();
  const page_structure = Array.isArray(parsed.page_structure) ? parsed.page_structure : [];
  if (!html && !page_structure.length) throw new Error('Landing generation returned empty page');

  // If model only returned structure, assemble a minimal HTML shell for preview/publish
  if (!html && page_structure.length) {
    const sections = page_structure
      .map(
        (s) =>
          `<section><h2>${escape(s.heading || s.label || '')}</h2><p>${escape(s.content || '')}</p>${
            s.cta ? `<p><a class="cta" href="#cta">${escape(s.cta)}</a></p>` : ''
          }</section>`
      )
      .join('\n');
    html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(
      parsed.title || run.product
    )}</title><meta name="description" content="${escape(parsed.meta_description || '')}"></head><body><main>${sections}</main></body></html>`;
  }

  run.page = {
    title: parsed.title || `${run.product} — ${run.offer || 'Offer'}`.slice(0, 80),
    slug: slugify(parsed.slug || parsed.title || run.product),
    meta_description: String(parsed.meta_description || '').slice(0, 160),
    page_structure,
    html,
    ab_tests: Array.isArray(parsed.ab_tests) ? parsed.ab_tests : [],
  };
  run.skill_alignment = {
    skill_key: 'create_landing_page',
    skills: [...LANDING_PACK.primary, ...(LANDING_PACK.secondary || [])],
    playbook_loaded: Boolean(pack.loaded),
    agents: ['tara', 'sam'],
  };
  run.status = 'generated';
  run.updatedAt = new Date().toISOString();
  return publicRun(run);
}

function escape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function patchLandingPage(runId, patch = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Landing run not found');
  if (!run.page) run.page = {};
  for (const key of ['title', 'slug', 'meta_description', 'html']) {
    if (patch[key] != null) run.page[key] = patch[key];
  }
  if (patch.slug) run.page.slug = slugify(patch.slug);
  run.updatedAt = new Date().toISOString();
  return publicRun(run);
}

export function approveLandingPage(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Landing run not found');
  if (!run.page?.html) throw new Error('Generate a page before approving');
  run.status = 'approved';
  run.approvedAt = new Date().toISOString();
  run.updatedAt = run.approvedAt;
  return publicRun(run);
}

export async function publishLandingPage(runId, { publish_live = false, ...overrides } = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Landing run not found');
  if (!run.page?.html) throw new Error('No page HTML to publish');
  if (run.status !== 'approved' && publish_live) {
    // allow explicit live from smoke after approve
  }

  const result = await publishStaticHtmlPage({
    html: run.page.html,
    title: run.page.title,
    slug: run.page.slug,
    meta_description: run.page.meta_description,
    companyName: run.companyName,
    companyId: run.companyId,
    publish_live: Boolean(publish_live),
    path_prefix: overrides.path_prefix || process.env.LANDING_PATH_PREFIX || 'nouriva-landing/lp',
    public_base: overrides.public_base || process.env.LANDING_PUBLIC_BASE_URL || 'https://nouriva.tech',
    url_prefix: overrides.url_prefix || '/lp',
    overrides,
  });

  run.publish = result.publish || result;
  run.status = result.ok && publish_live ? 'published' : result.ok ? 'packaged' : 'publish_error';
  run.updatedAt = new Date().toISOString();
  if (!result.ok) {
    const err = new Error(result.error || 'Publish failed');
    err.publish = result;
    throw err;
  }
  return { run: publicRun(run), ...result };
}
