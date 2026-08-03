/**
 * Lead Magnets studio — Riya concept (lead-magnets) + Tara/Sam gated LP (page-cro/form-cro).
 * Capture posts to /api/leads/capture → Google Sheets CRM fallback.
 */

import { randomUUID } from 'node:crypto';
import { withGroqReasoning, resolveGroqModel } from './groqReasoning.js';
import { buildPlaybookFromPack } from './gtmStrategySkills.js';
import { publishStaticHtmlPage } from './blogPublish.js';
import { syncProspectsToCrm } from './crmLeads.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const runsById = new Map();

const CONCEPT_PACK = {
  primary: ['lead-magnets', 'copywriting'],
  secondary: ['content-strategy'],
};

const PAGE_PACK = {
  primary: ['page-cro', 'form-cro', 'copywriting'],
  secondary: ['lead-magnets'],
};

function groqKey() {
  return process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '';
}

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

function escapeAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function groqJson({ system, user, temperature = 0.35 }) {
  const key = groqKey();
  if (!key) throw new Error('GROQ_API_KEY required for lead magnet studio');
  const body = withGroqReasoning({
    model: resolveGroqModel(),
    temperature,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: 7000,
  });
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Groq HTTP ${res.status}`);
  const parsed = parseJsonLoose(data?.choices?.[0]?.message?.content || '{}');
  if (!parsed) throw new Error('Model returned non-JSON');
  return parsed;
}

function publicRun(run) {
  return {
    id: run.id,
    companyId: run.companyId,
    companyName: run.companyName,
    audience: run.audience,
    goal: run.goal,
    magnetType: run.magnetType,
    brandContext: run.brandContext,
    status: run.status,
    concept: run.concept,
    page: run.page,
    publish: run.publish,
    skill_alignment: run.skill_alignment,
    approvedAt: run.approvedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function captureEndpoint(companyId) {
  const base = String(process.env.LEAD_CAPTURE_PUBLIC_URL || process.env.MARQQ_PUBLIC_API_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (base) return `${base}/api/leads/capture`;
  return `/api/leads/capture?companyId=${encodeURIComponent(companyId)}`;
}

function injectLeadForm(html, { leadMagnet, cta, companyId, captureUrl }) {
  let out = String(html || '');
  if (!out) return out;
  if (/data-marqq-lead-form/i.test(out)) return out;

  const form = `<section id="marqq-lead-magnet" aria-labelledby="marqq-lead-magnet-title"><h2 id="marqq-lead-magnet-title">Get your free ${escapeAttr(leadMagnet)}</h2><p>Enter your details and we’ll send it over.</p><form data-marqq-lead-form><label>First name<input name="name" autocomplete="given-name" required></label><label>Email<input type="email" name="email" autocomplete="email" required></label><button type="submit">${escapeAttr(cta || 'Send me the download')}</button><p data-marqq-form-status role="status"></p></form><script>(function(){const form=document.querySelector('[data-marqq-lead-form]');if(!form)return;form.addEventListener('submit',async function(event){event.preventDefault();const status=form.querySelector('[data-marqq-form-status]');status.textContent='Saving…';try{const response=await fetch('${escapeAttr(captureUrl)}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyId:'${escapeAttr(companyId)}',name:form.elements.name.value,email:form.elements.email.value,lead_magnet:'${escapeAttr(leadMagnet)}',source:window.location.href})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not save your details');status.textContent='You’re in — check your inbox.';form.reset();}catch(error){status.textContent=error.message||'Could not save your details';}});})();</script></section>`;
  const css = `<style id="marqq-lead-capture-styles">#marqq-lead-magnet{max-width:720px;margin:2rem auto 4rem;padding:2rem;border-radius:20px;background:#0F3D2E;color:#FAF7F0}#marqq-lead-magnet form{display:grid;gap:1rem}#marqq-lead-magnet label{display:grid;gap:.4rem}#marqq-lead-magnet input{padding:.85rem 1rem;border-radius:10px;border:1px solid #A8C4B5;font:inherit}#marqq-lead-magnet button{width:max-content;padding:.9rem 1.25rem;border:0;border-radius:999px;background:#E8A341;color:#0F3D2E;font:inherit;font-weight:700;cursor:pointer}</style>`;

  if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, `${css}</head>`);
  else out = css + out;
  if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `${form}</body>`);
  else out = `${out}${form}`;
  return out;
}

export function createLeadMagnetRun(input = {}) {
  const companyId = String(input.companyId || input.workspaceId || 'marqq-ws-1').trim();
  const run = {
    id: randomUUID(),
    companyId,
    workspaceId: companyId,
    companyName: String(input.companyName || 'Nouriva AI').trim(),
    audience: String(input.audience || '').trim(),
    goal: String(input.goal || 'capture').trim(),
    magnetType: String(input.magnetType || input.type || 'checklist').trim(),
    brandContext: String(input.brandContext || input.brand_context || '').trim(),
    status: 'created',
    concept: null,
    page: null,
    publish: null,
    skill_alignment: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  runsById.set(run.id, run);
  return publicRun(run);
}

export function getLeadMagnetRun(runId) {
  const run = runsById.get(runId);
  return run ? publicRun(run) : null;
}

export async function designLeadMagnet(runId, patch = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Lead magnet run not found');
  Object.assign(run, {
    audience: patch.audience ?? run.audience,
    goal: patch.goal ?? run.goal,
    magnetType: patch.magnetType ?? patch.type ?? run.magnetType,
    brandContext: patch.brandContext ?? patch.brand_context ?? run.brandContext,
  });

  const pack = await buildPlaybookFromPack(CONCEPT_PACK, { label: 'lead_magnets' });
  const parsed = await groqJson({
    system:
      'You are Riya designing a high-converting lead magnet. Apply the lead-magnets skill. Return JSON only. No invented conversion rates.',
    user: `Design one lead magnet for ${run.companyName}.

Type preference: ${run.magnetType}
Audience: ${run.audience || 'ICP from GTM'}
Goal: ${run.goal}
Brand context: ${run.brandContext || 'n/a'}

${pack.playbook ? `Skill playbook:\n${pack.playbook}\n` : ''}

Return ONLY JSON:
{
  "title": "asset title",
  "hook": "one-line promise",
  "format": "checklist|cheat_sheet|template|guide|...",
  "outline": ["section 1", "section 2"],
  "takeaways": ["..."],
  "distribution": ["landing page", "email", "..."],
  "cta": "opt-in button text",
  "nurture_next": "what email 1 after download should do"
}`,
  });

  run.concept = {
    title: parsed.title || `${run.companyName} checklist`,
    hook: parsed.hook || '',
    format: parsed.format || run.magnetType,
    outline: Array.isArray(parsed.outline) ? parsed.outline : [],
    takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways : [],
    distribution: Array.isArray(parsed.distribution) ? parsed.distribution : [],
    cta: parsed.cta || 'Send me the download',
    nurture_next: parsed.nurture_next || '',
  };
  run.skill_alignment = {
    concept: {
      skills: [...CONCEPT_PACK.primary, ...(CONCEPT_PACK.secondary || [])],
      playbook_loaded: Boolean(pack.loaded),
      agents: ['riya'],
    },
  };
  run.status = 'concept';
  run.updatedAt = new Date().toISOString();
  return publicRun(run);
}

export async function generateLeadMagnetPage(runId, patch = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Lead magnet run not found');
  if (!run.concept && !patch.concept) {
    await designLeadMagnet(runId, patch);
  }

  const concept = run.concept;
  const pack = await buildPlaybookFromPack(PAGE_PACK, { label: 'lead_magnet_landing' });
  const captureUrl = captureEndpoint(run.companyId);

  const parsed = await groqJson({
    system:
      'You are Tara + Sam building a gated lead-magnet landing page. Apply page-cro and form-cro. Return JSON only. Never invent fake social proof metrics.',
    user: `Build a gated landing page for this lead magnet.

Company: ${run.companyName}
Magnet title: ${concept.title}
Hook: ${concept.hook}
Format: ${concept.format}
Outline: ${(concept.outline || []).join('; ')}
CTA: ${concept.cta}
Audience: ${run.audience || 'n/a'}
Brand: ${run.brandContext || 'n/a'}

${pack.playbook ? `Skill playbook:\n${pack.playbook}\n` : ''}

Return ONLY JSON:
{
  "title": "page title",
  "slug": "url-slug",
  "meta_description": "≤155 chars",
  "page_structure": [{ "label": "hero", "heading": "...", "content": "...", "cta": "..." }],
  "html": "<!DOCTYPE html>... full page (form optional — platform injects capture form) ...",
  "ab_tests": ["..."]
}`,
  });

  let html = String(parsed.html || '').trim();
  html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();
  if (!html) throw new Error('Lead magnet page HTML empty');

  html = injectLeadForm(html, {
    leadMagnet: concept.title,
    cta: concept.cta,
    companyId: run.companyId,
    captureUrl,
  });

  run.page = {
    title: parsed.title || concept.title,
    slug: slugify(parsed.slug || concept.title),
    meta_description: String(parsed.meta_description || concept.hook || '').slice(0, 160),
    page_structure: Array.isArray(parsed.page_structure) ? parsed.page_structure : [],
    html,
    ab_tests: Array.isArray(parsed.ab_tests) ? parsed.ab_tests : [],
    lead_capture: {
      destination: 'google_sheets',
      endpoint: captureUrl,
      lead_magnet: concept.title,
    },
  };
  run.skill_alignment = {
    ...(run.skill_alignment || {}),
    page: {
      skills: [...PAGE_PACK.primary, ...(PAGE_PACK.secondary || [])],
      playbook_loaded: Boolean(pack.loaded),
      agents: ['tara', 'sam'],
    },
  };
  run.status = 'generated';
  run.updatedAt = new Date().toISOString();
  return publicRun(run);
}

export function patchLeadMagnetPage(runId, patch = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Lead magnet run not found');
  if (!run.page) run.page = {};
  for (const key of ['title', 'slug', 'meta_description', 'html']) {
    if (patch[key] != null) run.page[key] = patch[key];
  }
  if (patch.slug) run.page.slug = slugify(patch.slug);
  run.updatedAt = new Date().toISOString();
  return publicRun(run);
}

export function approveLeadMagnet(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Lead magnet run not found');
  if (!run.page?.html) throw new Error('Generate a page before approving');
  run.status = 'approved';
  run.approvedAt = new Date().toISOString();
  run.updatedAt = run.approvedAt;
  return publicRun(run);
}

export async function publishLeadMagnet(runId, { publish_live = false, ...overrides } = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Lead magnet run not found');
  if (!run.page?.html) throw new Error('No page HTML to publish');

  const result = await publishStaticHtmlPage({
    html: run.page.html,
    title: run.page.title,
    slug: run.page.slug,
    meta_description: run.page.meta_description,
    companyName: run.companyName,
    companyId: run.companyId,
    publish_live: Boolean(publish_live),
    path_prefix: overrides.path_prefix || process.env.LEAD_MAGNET_PATH_PREFIX || 'nouriva-landing/lp',
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

/** Public form capture → CRM/Sheets */
export async function captureLeadMagnetSubmission(body = {}) {
  const companyId = String(body.companyId || body.workspaceId || 'marqq-ws-1').trim();
  const email = String(body.email || '').trim();
  const name = String(body.name || body.full_name || '').trim();
  if (!email) return { ok: false, error: 'email required' };

  const parts = name.split(/\s+/).filter(Boolean);
  const prospect = {
    id: `capture_${Date.now()}`,
    full_name: name || email.split('@')[0],
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' '),
    email,
    title: '',
    company: String(body.company || '').trim(),
    status: 'fetched',
    source: body.source || 'landing_page',
    next_action: 'deliver_lead_magnet',
  };

  const run = {
    id: `capture_run_${Date.now()}`,
    companyId,
    workspaceId: companyId,
    companyName: String(body.companyName || 'Nouriva AI'),
    source: 'lead_magnet_capture',
  };

  const sync = await syncProspectsToCrm(run, [prospect], {
    status: 'fetched',
    next_action: `deliver:${String(body.lead_magnet || 'lead magnet').slice(0, 120)}`,
    source: body.source || 'landing_page',
    channel: 'web_form',
  });

  return {
    ok: Boolean(sync?.ok),
    lead: prospect,
    crm: sync,
  };
}
