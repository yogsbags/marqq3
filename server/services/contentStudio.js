/**
 * Content Studio (slice 1) — SEO → Blog
 * Maya: research + brief · Riya: draft · Human: approve · GitHub blog publish
 * Skills via buildPlaybookFromPack (Marqq2 marketingskills).
 */

import { randomUUID } from 'node:crypto';
import { withGroqReasoning, resolveGroqModel, resolveGtmAutoSectionModel } from './groqReasoning.js';
import { buildPlaybookFromPack } from './gtmStrategySkills.js';
import { publishBlogPackage } from './blogPublish.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** @type {Map<string, object>} */
const runsById = new Map();

const RESEARCH_PACK = {
  primary: ['ai-seo', 'content-strategy', 'seo-audit'],
  secondary: ['programmatic-seo'],
};

const BRIEF_PACK = {
  primary: ['ai-seo', 'content-strategy', 'seo-audit'],
  secondary: ['copywriting'],
};

/** Marqq2 seo_article (B2B) — copywriting + SEO stack */
const DRAFT_PACK_B2B = {
  primary: ['ai-seo', 'schema-markup', 'seo-audit', 'content-strategy', 'copywriting'],
  secondary: ['programmatic-seo', 'copy-editing', 'humanizer'],
};

/** Marqq2 seo_article_b2c — humanizer first, then SEO + copywriting */
const DRAFT_PACK_B2C = {
  primary: ['humanizer', 'ai-seo', 'schema-markup', 'seo-audit', 'copywriting'],
  secondary: ['content-strategy', 'marketing-psychology', 'copy-editing', 'programmatic-seo'],
};

function draftPackForMarket(marketType) {
  return String(marketType || '').toLowerCase() === 'b2c' ? DRAFT_PACK_B2C : DRAFT_PACK_B2B;
}

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

async function groqJson({ system, user, model, temperature = 0.35 }) {
  const key = groqKey();
  if (!key) throw new Error('GROQ_API_KEY required for content studio');
  const resolved = model || resolveGroqModel();
  const body = withGroqReasoning({
    model: resolved,
    temperature,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Groq HTTP ${res.status}`);
  const text = data?.choices?.[0]?.message?.content || '{}';
  const parsed = parseJsonLoose(text);
  if (!parsed) throw new Error('Model returned non-JSON content');
  return parsed;
}

function publicRun(run) {
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    companyId: run.companyId,
    companyName: run.companyName,
    domain: run.domain,
    marketType: run.marketType,
    brandContext: run.brandContext,
    status: run.status,
    step: run.step,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    plan: run.plan,
    brief: run.brief,
    article: run.article,
    publish: run.publish,
    skills: run.skills,
  };
}

export function getContentRun(runId) {
  return runsById.get(runId) || null;
}

export function listContentRuns(workspaceId) {
  return [...runsById.values()].filter((r) => !workspaceId || r.workspaceId === workspaceId);
}

export async function createContentRun(input = {}) {
  const companyName = String(input.companyName || 'Your company').trim();
  const domain = String(input.domain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
  const run = {
    id: randomUUID(),
    workspaceId: String(input.workspaceId || input.companyId || 'marqq-ws-1').trim(),
    companyId: String(input.companyId || input.workspaceId || 'marqq-ws-1').trim(),
    companyName,
    domain,
    marketType: String(input.marketType || input.market_type || 'b2c').toLowerCase(),
    brandContext: String(input.brandContext || input.brand_context || '').trim(),
    quantifiedTarget: String(input.quantifiedTarget || input.quantified_target || '').trim(),
    timelineTarget: String(input.timelineTarget || input.timeline_target || '').trim(),
    status: 'created',
    step: 'research',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    plan: null,
    brief: null,
    article: null,
    publish: null,
    skills: {},
  };
  runsById.set(run.id, run);
  return publicRun(run);
}

/**
 * Maya — keyword / topical plan (simplified build_seo_organic_plan).
 */
export async function runContentResearch(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Content run not found');

  const playbookResult = await buildPlaybookFromPack(RESEARCH_PACK, { label: 'seo_research' });
  run.skills.research = {
    skillIds: playbookResult.skillIds,
    loaded: playbookResult.loaded,
    warning: playbookResult.warning || null,
  };

  const model = resolveGtmAutoSectionModel(); // compound-mini can web-search when available
  const parsed = await groqJson({
    model,
    temperature: 0.3,
    system: [
      'You are Maya, Marqq SEO / search intelligence agent.',
      'Build a practical SEO organic content plan for a blog.',
      'Return ONLY JSON with keys:',
      'topical_authority (string),',
      'topic_clusters (array of { name, why }),',
      'article_queue (array of 4-6 objects: { keyword, topic, intent, priority, why, estimated_difficulty }),',
      'content_gaps (array of { cluster, note }),',
      'llmo_notes (array of short strings about AI-answer / GEO visibility),',
      'data_source (string describing how you inferred keywords).',
      playbookResult.playbook ? `\n${playbookResult.playbook}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    user: JSON.stringify(
      {
        company: run.companyName,
        domain: run.domain,
        market_type: run.marketType,
        brand_context: run.brandContext || `${run.companyName} — brand context from onboarding`,
        quantified_target: run.quantifiedTarget || null,
        timeline_target: run.timelineTarget || null,
      },
      null,
      2
    ),
  });

  const queue = Array.isArray(parsed.article_queue)
    ? parsed.article_queue
        .map((row, i) => ({
          id: `q-${i + 1}`,
          keyword: String(row.keyword || row.topic || '').trim(),
          topic: String(row.topic || row.keyword || '').trim(),
          intent: String(row.intent || 'informational').trim(),
          priority: Number(row.priority) || i + 1,
          why: String(row.why || '').trim(),
          estimated_difficulty: String(row.estimated_difficulty || 'medium').trim(),
        }))
        .filter((row) => row.keyword)
    : [];

  if (!queue.length) {
    throw new Error('Research returned no article_queue items');
  }

  run.plan = {
    topical_authority: String(parsed.topical_authority || '').trim(),
    topic_clusters: Array.isArray(parsed.topic_clusters) ? parsed.topic_clusters : [],
    article_queue: queue,
    content_gaps: Array.isArray(parsed.content_gaps) ? parsed.content_gaps : [],
    llmo_notes: Array.isArray(parsed.llmo_notes) ? parsed.llmo_notes : [],
    data_source: String(parsed.data_source || 'groq').trim(),
    agent: 'maya',
    createdAt: new Date().toISOString(),
  };
  run.status = 'researched';
  run.step = 'brief';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), plan: run.plan };
}

/**
 * Maya — SEO brief for one queue item (or custom keyword).
 */
export async function runContentBrief(runId, { queueIndex, keyword, topic } = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Content run not found');
  if (!run.plan?.article_queue?.length && !keyword && !topic) {
    throw new Error('Run research first, or pass keyword/topic');
  }

  let seed = null;
  if (keyword || topic) {
    seed = {
      keyword: String(keyword || topic).trim(),
      topic: String(topic || keyword).trim(),
      intent: 'informational',
      why: 'Manual keyword brief',
    };
  } else {
    const idx = Math.min(
      Math.max(Number(queueIndex) || 0, 0),
      run.plan.article_queue.length - 1
    );
    seed = run.plan.article_queue[idx];
  }

  const playbookResult = await buildPlaybookFromPack(BRIEF_PACK, { label: 'seo_brief' });
  run.skills.brief = {
    skillIds: playbookResult.skillIds,
    loaded: playbookResult.loaded,
    warning: playbookResult.warning || null,
  };

  const parsed = await groqJson({
    temperature: 0.35,
    system: [
      'You are Maya, Marqq SEO agent writing a brief for Riya (content).',
      'Return ONLY JSON with keys:',
      'keyword, topic, intent, outline (array of H2 strings), secondary_keywords (array),',
      'faq_questions (array of strings), audience, angle, cta, why.',
      'Outline: 5-8 H2s. Secondary keywords: 3-6. FAQ: 3-5.',
      playbookResult.playbook ? `\n${playbookResult.playbook}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    user: JSON.stringify(
      {
        company: run.companyName,
        domain: run.domain,
        market_type: run.marketType,
        brand_context: run.brandContext,
        seed,
        plan_authority: run.plan?.topical_authority || null,
      },
      null,
      2
    ),
  });

  run.brief = {
    keyword: String(parsed.keyword || seed.keyword).trim(),
    topic: String(parsed.topic || seed.topic || seed.keyword).trim(),
    intent: String(parsed.intent || seed.intent || 'informational').trim(),
    outline: Array.isArray(parsed.outline) ? parsed.outline.map(String) : [],
    secondary_keywords: Array.isArray(parsed.secondary_keywords)
      ? parsed.secondary_keywords.map(String)
      : [],
    faq_questions: Array.isArray(parsed.faq_questions) ? parsed.faq_questions.map(String) : [],
    audience: String(parsed.audience || '').trim(),
    angle: String(parsed.angle || '').trim(),
    cta: String(parsed.cta || '').trim(),
    why: String(parsed.why || seed.why || '').trim(),
    agent: 'maya',
    createdAt: new Date().toISOString(),
  };
  run.status = 'briefed';
  run.step = 'draft';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), brief: run.brief };
}

/**
 * Riya — SEO blog draft (Marqq2 create_seo_article skill parity).
 * B2C: humanizer primary + second humanizer pass. Always: ai-seo + copywriting + schema/seo-audit.
 */
export async function runContentDraft(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Content run not found');
  if (!run.brief?.keyword) throw new Error('Create a brief before drafting');

  const isB2c = String(run.marketType || '').toLowerCase() === 'b2c';
  const draftPack = draftPackForMarket(run.marketType);
  const playbookResult = await buildPlaybookFromPack(draftPack, { label: isB2c ? 'seo_article_b2c' : 'seo_article' });
  run.skills.draft = {
    skillIds: playbookResult.skillIds,
    loaded: playbookResult.loaded,
    warning: playbookResult.warning || null,
    pack: isB2c ? 'seo_article_b2c' : 'seo_article',
  };

  const wordTarget = isB2c ? 1200 : 1400;
  const b2cVoice = isB2c
    ? [
        'B2C voice (required): write like a helpful human expert talking to consumers — concrete, specific, slightly uneven rhythm.',
        'Benefits over features; customer language over jargon.',
        'Avoid AI tells: significance inflation, "it\'s not just X, it\'s Y", em-dash stacks, rule of three, landscape/testament/delve, chatbot closers.',
        'Personality OK; NEVER invent stats, studies, quotes, or testimonials.',
      ].join(' ')
    : 'B2B voice: clear, expert, decision-maker friendly. No invented claims.';

  const parsed = await groqJson({
    temperature: isB2c ? 0.5 : 0.4,
    system: [
      'You are Riya, Marqq content agent writing a page-1 / AEO-ready SEO blog article.',
      'Apply the marketing skill playbook (ai-seo, schema-markup, seo-audit, content-strategy, copywriting' +
        (isB2c ? ', humanizer, marketing-psychology, copy-editing' : ', copy-editing') +
        ').',
      'Return ONLY JSON with keys: title, meta_description, slug, html, word_count, key_takeaway.',
      'html must be semantic HTML fragments only (h1 optional once, h2/h3/p/ul/li/aside/details/summary) — no html/body wrappers.',
      'Structure: answer-first intro, #key-takeaway aside after intro, H2 sections from brief.outline, REQUIRED FAQ block, short conclusion + soft CTA.',
      'FAQ is mandatory for SEO/AEO: include <h2>Frequently Asked Questions…</h2> then <section id="faq"> with 4–6 <details><summary>Question?</summary><p>Answer…</p></details> pairs.',
      'Use brief.faq_questions when provided; otherwise invent intent-matching questions readers actually search. Answers must be concrete (2–4 sentences), never empty.',
      'Naturally spray primary + secondary keywords (title, first 100 words, one H2, FAQ). Never stuff.',
      'meta_description ≤155 chars, benefit-led.',
      b2cVoice,
      `Target ~${wordTarget} words.`,
      playbookResult.playbook ? `\n${playbookResult.playbook}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    user: JSON.stringify(
      {
        company: run.companyName,
        domain: run.domain,
        market_type: run.marketType,
        brand_context: run.brandContext,
        brief: run.brief,
        skill_pack: isB2c ? 'seo_article_b2c' : 'seo_article',
      },
      null,
      2
    ),
  });

  const title = String(parsed.title || run.brief.topic).trim();
  let html = String(parsed.html || '').trim();
  if (!html) throw new Error('Draft returned empty html');

  // Ensure key takeaway block exists
  const takeaway = String(parsed.key_takeaway || '').trim();
  if (takeaway && !/id=["']key-takeaway["']/i.test(html)) {
    html = html.replace(
      /<\/h1>/i,
      `</h1>\n<aside id="key-takeaway"><p>${takeaway.replace(/</g, '&lt;')}</p></aside>`
    );
  }

  // FAQ is required for SEO-rich blogs — repair if model omitted it
  html = ensureFaqSection(html, {
    keyword: run.brief.keyword,
    faqQuestions: run.brief.faq_questions || [],
    company: run.companyName,
  });

  let humanizerMeta = {
    skill: 'humanizer',
    requested: isB2c,
    applied: false,
    reason: isB2c ? 'pending' : 'skipped_not_b2c',
  };

  if (isB2c) {
    const humanized = await humanizeArticleHtml(html, {
      title,
      keyword: run.brief.keyword,
      audience: run.brief.audience,
      brandContext: run.brandContext,
    });
    if (humanized.html) {
      html = humanized.html;
      humanizerMeta = { ...humanizerMeta, applied: humanized.applied, reason: humanized.reason };
    } else {
      humanizerMeta = { ...humanizerMeta, applied: false, reason: humanized.reason || 'pass_failed' };
    }
    // Humanizer must not drop FAQ — re-assert after rewrite
    html = ensureFaqSection(html, {
      keyword: run.brief.keyword,
      faqQuestions: run.brief.faq_questions || [],
      company: run.companyName,
    });
    run.skills.humanizer = humanizerMeta;
  }

  // Light copy-editing pass cue recorded even when not a separate LLM call for B2B
  run.skills.copy_editing = {
    skill: 'copy-editing',
    note: isB2c ? 'Applied via humanizer + draft playbook' : 'Loaded in draft playbook secondary',
  };

  run.article = {
    title,
    meta_description: String(parsed.meta_description || '').trim().slice(0, 160),
    slug: slugify(parsed.slug || title),
    html,
    word_count: Number(parsed.word_count) || html.split(/\s+/).filter(Boolean).length,
    primary_keyword: run.brief.keyword,
    secondary_keywords: run.brief.secondary_keywords || [],
    key_takeaway: takeaway || null,
    agent: 'riya',
    status: 'draft',
    skill_pack: isB2c ? 'seo_article_b2c' : 'seo_article',
    humanizer: humanizerMeta,
    createdAt: new Date().toISOString(),
  };
  run.status = 'drafted';
  run.step = 'approve';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), article: run.article };
}

/** Ensure article HTML includes a usable FAQ block (≥3 Q&As) for SEO/AEO. */
function ensureFaqSection(html, { keyword = '', faqQuestions = [], company = 'our product' } = {}) {
  const countDetails = (h) => (String(h).match(/<details[\s>]/gi) || []).length;
  const hasFaqId = /id=["']faq["']/i.test(html);
  if (hasFaqId && countDetails(html) >= 3) return html;

  const escape = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const kw = String(keyword || 'this topic').trim();
  const brand = String(company || 'our product').trim() || 'our product';
  const defaults = [
    `What is ${kw} and why does it matter?`,
    `How does ${kw} work in practice?`,
    `Who should consider ${kw}?`,
    `How long before I see results with ${kw}?`,
    `How is ${brand}'s approach to ${kw} different?`,
  ];
  const questions = (Array.isArray(faqQuestions) && faqQuestions.length ? faqQuestions : defaults)
    .map(String)
    .map((q) => q.trim())
    .filter((q) => q.length >= 8)
    .slice(0, 6);

  while (questions.length < 4) {
    questions.push(defaults[questions.length] || `What should I know about ${kw}?`);
  }

  const details = questions
    .map((q, i) => {
      const answer =
        i === 0
          ? `${escape(kw)} is a practical way to get clearer, more personalized guidance instead of one-size-fits-all advice. The goal is decisions you can act on with confidence.`
          : i === 1
            ? `You start with your own context (labs, goals, or constraints), then get a plan tailored to that signal. ${escape(brand)} turns that into steps you can follow in daily life.`
            : i === 2
              ? `Anyone who wants more than generic tips — especially people managing conditions, plateaus, or busy routines — tends to benefit most from a structured ${escape(kw)} approach.`
              : `Most people notice clearer habits within 1–2 weeks; deeper biomarker or outcome shifts usually take longer depending on baseline and consistency.`;
      return `<details><summary>${escape(q)}</summary><p>${answer}</p></details>`;
    })
    .join('\n');

  const block = `\n<h2>Frequently Asked Questions about ${escape(kw)}</h2>\n<section id="faq">\n${details}\n</section>\n`;

  if (/<\/article>/i.test(html)) {
    return html.replace(/<\/article>/i, `${block}</article>`);
  }
  const lastH2 = html.lastIndexOf('<h2');
  if (lastH2 > html.length * 0.55) {
    return `${html.slice(0, lastH2)}${block}${html.slice(lastH2)}`;
  }
  return `${html.trim()}\n${block}`;
}

/** Second-pass humanizer (Marqq2 B2C create_seo_article parity). */
async function humanizeArticleHtml(html, { title, keyword, audience, brandContext } = {}) {
  const pack = await buildPlaybookFromPack(
    { primary: ['humanizer', 'copy-editing'], secondary: ['copywriting'] },
    { label: 'humanizer_pass' }
  );
  if (!pack.loaded) {
    return { html, applied: false, reason: 'humanizer_skill_missing' };
  }
  try {
    const key = groqKey();
    if (!key) return { html, applied: false, reason: 'no_groq' };
    const body = withGroqReasoning({
      model: resolveGroqModel(),
      temperature: 0.45,
      messages: [
        {
          role: 'system',
          content: [
            'You are the blader/humanizer + copy-editing pass for a B2C SEO blog.',
            'Rewrite the HTML article body so it sounds human. Preserve ALL HTML tags, ids, and structure (h1/h2/aside/details/faq).',
            'Keep <section id="faq"> and every <details>/<summary> pair intact — never remove or empty the FAQ block.',
            'Never invent facts, stats, quotes, or citations. Output HTML fragment only — no markdown fences.',
            pack.playbook || '',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify(
            {
              title,
              keyword,
              audience,
              brand_context: brandContext,
              html,
            },
            null,
            2
          ),
        },
      ],
    });
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { html, applied: false, reason: data?.error?.message || `HTTP ${res.status}` };
    let out = String(data?.choices?.[0]?.message?.content || '').trim();
    out = out.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();
    if (!out || out.length < 200) return { html, applied: false, reason: 'empty_rewrite' };
    return { html: out, applied: true, reason: 'ok' };
  } catch (err) {
    return { html, applied: false, reason: err.message || String(err) };
  }
}

export function patchContentArticle(runId, patch = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Content run not found');
  if (!run.article) throw new Error('No article to edit — draft first');
  const allowed = ['title', 'meta_description', 'slug', 'html'];
  for (const key of allowed) {
    if (patch[key] !== undefined) run.article[key] = String(patch[key]);
  }
  if (patch.html != null) {
    run.article.word_count = String(patch.html).split(/\s+/).filter(Boolean).length;
  }
  if (patch.slug != null) run.article.slug = slugify(patch.slug);
  run.article.updatedAt = new Date().toISOString();
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), article: run.article };
}

export function approveContentArticle(runId) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Content run not found');
  if (!run.article?.html) throw new Error('No article to approve');
  run.article.status = 'approved';
  run.article.approvedAt = new Date().toISOString();
  run.status = 'approved';
  run.step = 'publish';
  run.updatedAt = new Date().toISOString();
  return { run: publicRun(run), article: run.article, status: 'approved' };
}

/**
 * Format SEO package and optionally push to GitHub (Marqq2 publish_live gate).
 * Default: dry_run package with SEO validation. Live needs publish_live=true.
 */
export async function publishContentArticle(runId, { publish_live = false, ...overrides } = {}) {
  const run = runsById.get(runId);
  if (!run) throw new Error('Content run not found');
  if (!run.article?.html) throw new Error('No article to publish — draft + approve first');
  if (run.article.status !== 'approved') {
    // auto-approve on explicit publish intent
    run.article.status = 'approved';
    run.article.approvedAt = new Date().toISOString();
  }

  const result = await publishBlogPackage({
    article: {
      ...run.article,
      companyName: run.companyName,
      secondary_keywords: run.article.secondary_keywords || run.brief?.secondary_keywords || [],
    },
    companyName: run.companyName,
    companyId: run.companyId || run.workspaceId,
    publish_live: Boolean(publish_live),
    overrides,
  });

  run.publish = {
    ...(result.publish || {}),
    html: result.publish?.html || null,
    ok: result.ok,
    error: result.error || null,
    note: result.note || null,
    url: result.url || result.publish?.canonical || null,
    at: new Date().toISOString(),
  };
  // Drop huge html from list payloads? Keep for UI preview — it's one article.
  run.status = result.ok
    ? publish_live
      ? 'published'
      : 'publish_ready'
    : 'publish_failed';
  run.step = 'publish';
  run.updatedAt = new Date().toISOString();

  if (!result.ok) {
    const err = new Error(result.error || 'Publish failed');
    err.publish = run.publish;
    throw err;
  }

  return {
    run: publicRun(run),
    publish: run.publish,
    url: result.url || run.publish.canonical,
  };
}
