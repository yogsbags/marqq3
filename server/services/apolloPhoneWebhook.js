/**
 * Apollo async phone enrichment webhook store.
 * Apollo POSTs phone numbers here after reveal_phone_number=true bulk/single match.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { executeComposioProxy } from './composio.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const STORE_PATH = join(DATA_DIR, 'apollo-phone-webhooks.json');

/** @type {Map<string, object>} */
const jobs = new Map();
/** @type {object[]} */
const deliveries = [];

function loadDisk() {
  try {
    if (!existsSync(STORE_PATH)) return;
    const raw = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
    for (const d of raw.deliveries || []) deliveries.push(d);
    for (const [id, job] of Object.entries(raw.jobs || {})) jobs.set(id, job);
  } catch {
    /* ignore */
  }
}

function saveDisk() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const payload = {
      updatedAt: new Date().toISOString(),
      jobs: Object.fromEntries(jobs.entries()),
      deliveries: deliveries.slice(-100),
    };
    writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.warn('[apollo-phone] disk save failed:', err.message);
  }
}

loadDisk();

function normalizePeople(body = {}) {
  const people = Array.isArray(body.people)
    ? body.people
    : Array.isArray(body.matches)
      ? body.matches.map((m) => m.person || m).filter(Boolean)
      : body.person
        ? [body.person]
        : [];
  return people.map((p) => {
    const phones = Array.isArray(p.phone_numbers) ? p.phone_numbers : [];
    const primary =
      phones.find((x) => x.type_cd === 'mobile') ||
      phones.find((x) => x.sanitized_number || x.raw_number) ||
      null;
    return {
      id: p.id || null,
      status: p.status || body.status || null,
      phone_e164: primary?.sanitized_number || primary?.raw_number || null,
      phone_raw: primary?.raw_number || null,
      phone_type: primary?.type_cd || null,
      phone_numbers: phones.map((x) => ({
        sanitized_number: x.sanitized_number || null,
        raw_number: x.raw_number || null,
        type_cd: x.type_cd || null,
        status_cd: x.status_cd || null,
        confidence_cd: x.confidence_cd || null,
      })),
    };
  });
}

export function createPhoneEnrichJob({ companyId, people = [], webhookBase } = {}) {
  const jobId = randomUUID();
  const job = {
    id: jobId,
    companyId: companyId || null,
    status: 'pending',
    requestedAt: new Date().toISOString(),
    completedAt: null,
    peopleRequested: people.map((p) => ({
      id: p.id || null,
      email: p.email || null,
      full_name: p.full_name || p.name || null,
      linkedin_url: p.linkedin_url || null,
    })),
    people: [],
    credits_consumed: null,
    webhookUrl: `${String(webhookBase || '').replace(/\/$/, '')}/api/webhooks/apollo?job=${jobId}`,
    error: null,
  };
  jobs.set(jobId, job);
  saveDisk();
  return job;
}

export function ingestApolloPhoneWebhook(body = {}, query = {}) {
  const jobId = String(query.job || body.job_id || body.jobId || '').trim() || null;
  const people = normalizePeople(body);
  const delivery = {
    id: randomUUID(),
    jobId,
    receivedAt: new Date().toISOString(),
    status: body.status || null,
    total_requested_enrichments: body.total_requested_enrichments ?? null,
    unique_enriched_records: body.unique_enriched_records ?? null,
    missing_records: body.missing_records ?? null,
    credits_consumed: body.credits_consumed ?? null,
    people,
    rawKeys: Object.keys(body || {}),
  };
  deliveries.unshift(delivery);
  if (deliveries.length > 100) deliveries.length = 100;

  if (jobId && jobs.has(jobId)) {
    const job = jobs.get(jobId);
    const byId = new Map(people.filter((p) => p.id).map((p) => [p.id, p]));
    job.people = (job.peopleRequested || []).map((req) => {
      const hit = (req.id && byId.get(req.id)) || people.find((p) => p.email && p.email === req.email) || null;
      return {
        ...req,
        phone_e164: hit?.phone_e164 || null,
        phone_raw: hit?.phone_raw || null,
        phone_type: hit?.phone_type || null,
        phone_numbers: hit?.phone_numbers || [],
        enrich_status: hit?.status || null,
      };
    });
    // Also keep unmatched webhook people
    for (const p of people) {
      if (p.id && !job.people.some((x) => x.id === p.id)) {
        job.people.push({
          id: p.id,
          email: null,
          full_name: null,
          linkedin_url: null,
          phone_e164: p.phone_e164,
          phone_raw: p.phone_raw,
          phone_type: p.phone_type,
          phone_numbers: p.phone_numbers,
          enrich_status: p.status,
        });
      }
    }
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.credits_consumed = body.credits_consumed ?? job.credits_consumed;
    jobs.set(jobId, job);
  }

  saveDisk();
  console.log(
    '[webhook/apollo]',
    `job=${jobId || 'none'}`,
    `people=${people.length}`,
    `phones=${people.filter((p) => p.phone_e164).length}`
  );
  return { ok: true, jobId, deliveryId: delivery.id, peopleCount: people.length };
}

export function getPhoneEnrichJob(jobId) {
  return jobs.get(String(jobId || '').trim()) || null;
}

export function listPhoneEnrichJobs(limit = 20) {
  return [...jobs.values()]
    .sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')))
    .slice(0, limit);
}

export function listPhoneDeliveries(limit = 20) {
  return deliveries.slice(0, limit);
}

/**
 * Trigger Apollo bulk_match with reveal_phone_number → async webhook.
 * Max 10 people per Apollo bulk call.
 */
export async function requestApolloPhoneReveal({
  companyId,
  people = [],
  webhookBase,
} = {}) {
  const base =
    webhookBase ||
    process.env.APP_URL ||
    process.env.PUBLIC_BASE_URL ||
    'https://marqq3-production.up.railway.app';
  const slice = (Array.isArray(people) ? people : []).slice(0, 10);
  if (!slice.length) throw new Error('people[] required (Apollo id and/or email)');
  if (!companyId) throw new Error('companyId required');

  const job = createPhoneEnrichJob({ companyId, people: slice, webhookBase: base });
  const details = slice.map((p) => {
    const row = {};
    if (p.id) row.id = p.id;
    if (p.email) row.email = p.email;
    if (p.first_name) row.first_name = p.first_name;
    if (p.last_name) row.last_name = p.last_name;
    if (p.organization_name || p.company) row.organization_name = p.organization_name || p.company;
    return row;
  });

  const webhookUrl = encodeURIComponent(job.webhookUrl);
  const endpoint = `https://api.apollo.io/api/v1/people/bulk_match?reveal_personal_emails=false&reveal_phone_number=true&webhook_url=${webhookUrl}`;

  const proxy = await executeComposioProxy({
    toolkit: 'apollo',
    userId: companyId,
    method: 'POST',
    endpoint,
    body: { details },
  });

  if (proxy.error) {
    job.status = 'error';
    job.error = proxy.error;
    job.completedAt = new Date().toISOString();
    jobs.set(job.id, job);
    saveDisk();
    throw new Error(proxy.error);
  }

  job.status = 'awaiting_webhook';
  job.syncResultSummary = {
    keys: proxy.result && typeof proxy.result === 'object' ? Object.keys(proxy.result).slice(0, 20) : [],
    matches: Array.isArray(proxy.result?.matches) ? proxy.result.matches.length : null,
  };
  jobs.set(job.id, job);
  saveDisk();

  return {
    ok: true,
    jobId: job.id,
    webhookUrl: job.webhookUrl,
    status: job.status,
    peopleCount: slice.length,
    sync: proxy.result || null,
  };
}
