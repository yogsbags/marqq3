/**
 * Customer 360 — unify CRM/Sheets leads + outreach prospects into account view.
 */

import { resolveCrmDestination } from './crmLeads.js';
import { fetchLeadsFromGoogleSheets, resolveOutreachSpreadsheet } from './googleSheetsLeads.js';
import { listOutreachRuns } from './outreach.js';
import { listWorkspaceOutreachRuns } from './outreachPersist.js';

function normEmail(v) {
  return String(v || '')
    .trim()
    .toLowerCase();
}

function normStatus(s) {
  const v = String(s || 'new').toLowerCase();
  if (/(repli|engaged|positive)/.test(v)) return 'replied';
  if (/(sent|delivered|go_?live|live|queued_sent)/.test(v)) return 'sent';
  if (/(draft|copy|sequenc|scheduled)/.test(v)) return 'drafted';
  if (/(bounc|fail|error|unsub)/.test(v)) return 'failed';
  if (/(fetch|new|crm|synced)/.test(v)) return 'fetched';
  return v || 'fetched';
}

function daysSince(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

function accountKey(row) {
  const email = normEmail(row.email);
  if (email) return `e:${email}`;
  const name = String(row.full_name || '').trim().toLowerCase();
  const company = String(row.company || '').trim().toLowerCase();
  if (name || company) return `n:${name}|${company}`;
  return `id:${row.id || row.prospect_id || Math.random()}`;
}

function mergeAccount(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v == null || v === '') continue;
    if (!out[k] || out[k] === '') out[k] = v;
  }
  // Prefer richer status (replied > sent > drafted > fetched)
  const rank = { replied: 4, sent: 3, drafted: 2, fetched: 1, failed: 0 };
  const a = normStatus(out.status);
  const b = normStatus(patch.status);
  if ((rank[b] || 0) >= (rank[a] || 0)) out.status = patch.status || out.status;
  if (patch.sent_at && (!out.sent_at || Date.parse(patch.sent_at) > Date.parse(out.sent_at || 0))) {
    out.sent_at = patch.sent_at;
  }
  if (patch.replied_at) out.replied_at = patch.replied_at;
  if (patch.run_id || patch.runId) out.run_id = patch.run_id || patch.runId;
  out.sources = Array.from(new Set([...(out.sources || []), ...(patch.sources || [])].filter(Boolean)));
  out.timeline = [...(out.timeline || []), ...(patch.timeline || [])].slice(-12);
  return out;
}

function prospectToAccount(p, { origin, runId, companyName } = {}) {
  const status = normStatus(p.status);
  const timeline = [];
  if (p.updated_at || p.sent_at || p.replied_at) {
    timeline.push({
      at: p.replied_at || p.sent_at || p.updated_at || new Date().toISOString(),
      event: status,
      detail: p.next_action || p.subject || origin || '',
    });
  }
  return {
    id: String(p.id || p.prospect_id || ''),
    full_name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
    first_name: p.first_name || '',
    last_name: p.last_name || '',
    email: p.email || '',
    phone: p.phone || p.phone_e164 || '',
    title: p.title || '',
    company: p.company || '',
    linkedin_url: p.linkedin_url || '',
    status,
    channel: p.channel || 'email',
    subject: p.subject || '',
    run_id: runId || p.run_id || p.runId || '',
    workspace_company: companyName || p.workspace_company || '',
    provider: p.provider || p.go_live?.result?.provider || '',
    sent_at: p.sent_at || '',
    replied_at: p.replied_at || '',
    next_action: p.next_action || '',
    source: p.source || origin || 'outreach',
    updated_at: p.updated_at || p.sent_at || '',
    origin: origin || p.origin || 'outreach',
    sources: [origin || p.origin || 'outreach'].filter(Boolean),
    timeline,
    at_risk: false,
    opportunity: status === 'replied' ? 'expansion_or_close' : status === 'sent' ? 'follow_up' : 'activate',
  };
}

function decorateRisk(account) {
  const status = normStatus(account.status);
  const age = daysSince(account.sent_at);
  let at_risk = false;
  let risk_reason = '';
  if (status === 'sent' && age != null && age >= 7 && !account.replied_at) {
    at_risk = true;
    risk_reason = `No reply ${age}d after send`;
  } else if (status === 'failed') {
    at_risk = true;
    risk_reason = 'Delivery failed';
  } else if (status === 'fetched' && age != null && age >= 14) {
    at_risk = true;
    risk_reason = 'Stale lead — never activated';
  }
  return {
    ...account,
    status,
    at_risk,
    risk_reason,
    days_since_sent: age,
    opportunity:
      status === 'replied'
        ? 'expansion_or_close'
        : status === 'sent'
          ? 'follow_up'
          : status === 'drafted'
            ? 'approve_and_send'
            : 'activate',
  };
}

/**
 * Build Customer 360 payload for a workspace.
 */
export async function buildCustomer360(companyId, { limit = 75 } = {}) {
  const id = String(companyId || 'marqq-ws-1').trim();
  const dest = await resolveCrmDestination(id);

  // Sheets leads
  let sheets = { ok: false, leads: [] };
  if (dest.destination === 'google_sheets' || !dest.destination) {
    sheets = await fetchLeadsFromGoogleSheets(id, { limit });
  }
  if (!sheets.ok && dest.destination === 'google_sheets') {
    const resolved = await resolveOutreachSpreadsheet(id, { createIfMissing: false });
    if (resolved.ok) {
      sheets = {
        ok: true,
        spreadsheetId: resolved.spreadsheetId,
        worksheet: resolved.worksheet,
        url: `https://docs.google.com/spreadsheets/d/${resolved.spreadsheetId}`,
        leads: [],
        count: 0,
      };
    }
  }

  // Outreach (memory + Supabase)
  const memoryRuns = listOutreachRuns(id);
  const dbRuns = await listWorkspaceOutreachRuns(id, { limit: 20 });
  const runById = new Map();
  for (const r of [...dbRuns, ...memoryRuns]) {
    if (r?.id) runById.set(r.id, r);
  }
  const runs = [...runById.values()];

  const byKey = new Map();

  for (const lead of sheets.leads || []) {
    const acct = decorateRisk(prospectToAccount(lead, { origin: 'google_sheets', runId: lead.run_id }));
    const key = accountKey(acct);
    byKey.set(key, mergeAccount(byKey.get(key) || acct, acct));
  }

  for (const run of runs) {
    for (const p of run.prospects || []) {
      const acct = decorateRisk(
        prospectToAccount(p, {
          origin: 'outreach',
          runId: run.id,
          companyName: run.companyName,
        })
      );
      const key = accountKey(acct);
      byKey.set(key, decorateRisk(mergeAccount(byKey.get(key) || acct, { ...acct, sources: ['outreach'] })));
    }
  }

  let accounts = [...byKey.values()].map(decorateRisk);
  accounts.sort((a, b) => {
    const ta = Date.parse(a.replied_at || a.sent_at || a.updated_at || 0) || 0;
    const tb = Date.parse(b.replied_at || b.sent_at || b.updated_at || 0) || 0;
    return tb - ta;
  });
  accounts = accounts.slice(0, Math.min(Math.max(Number(limit) || 75, 1), 150));

  const summary = {
    total: accounts.length,
    replied: accounts.filter((a) => a.status === 'replied').length,
    sent: accounts.filter((a) => a.status === 'sent').length,
    drafted: accounts.filter((a) => a.status === 'drafted').length,
    fetched: accounts.filter((a) => a.status === 'fetched').length,
    at_risk: accounts.filter((a) => a.at_risk).length,
    opportunities: accounts.filter((a) => a.status === 'replied' || a.opportunity === 'follow_up').length,
  };

  const segments = [
    {
      id: 'engaged',
      name: 'Engaged / replied',
      count: summary.replied,
      signal: 'Positive reply or engagement',
      next: 'Hand to Tara for close / expansion',
    },
    {
      id: 'in_flight',
      name: 'In-flight outreach',
      count: summary.sent + summary.drafted,
      signal: 'Sequence live or draft ready',
      next: 'Monitor replies · keep drip running',
    },
    {
      id: 'pipeline',
      name: 'New / fetched leads',
      count: summary.fetched,
      signal: 'In CRM/Sheets, not activated',
      next: 'Generate copy in Outreach Studio',
    },
    {
      id: 'at_risk',
      name: 'At risk',
      count: summary.at_risk,
      signal: 'Stale send or failed delivery',
      next: 'Re-engage or archive',
    },
  ];

  const next_actions = [];
  if (summary.at_risk) {
    next_actions.push({
      priority: 'high',
      title: `Review ${summary.at_risk} at-risk account(s)`,
      screen: 'outreach',
      why: 'No reply after send or failed delivery',
    });
  }
  if (summary.replied) {
    next_actions.push({
      priority: 'high',
      title: `Follow up ${summary.replied} replied account(s)`,
      screen: 'outreach',
      why: 'Warm thread — close or expand',
    });
  }
  if (summary.fetched) {
    next_actions.push({
      priority: 'medium',
      title: `Activate ${summary.fetched} fetched lead(s)`,
      screen: 'outreach',
      why: 'In CRM but no outreach yet',
    });
  }
  if (!accounts.length) {
    next_actions.push({
      priority: 'medium',
      title: 'Fetch prospects or sync CRM leads',
      screen: 'outreach',
      why: 'Customer 360 is empty until leads land in Sheets/CRM or Outreach',
    });
  }

  return {
    ok: true,
    companyId: id,
    destination: dest,
    sheets: sheets.ok
      ? {
          spreadsheetId: sheets.spreadsheetId,
          worksheet: sheets.worksheet,
          url: sheets.url,
          count: sheets.count ?? sheets.leads?.length ?? 0,
        }
      : null,
    summary,
    segments,
    next_actions,
    accounts,
    runs: runs.map((r) => ({
      id: r.id,
      companyName: r.companyName,
      prospectCount: (r.prospects || []).length,
      source: r.source,
      createdAt: r.createdAt || r.updatedAt,
    })),
    generated_at: new Date().toISOString(),
  };
}
