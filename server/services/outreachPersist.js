/**
 * Persist outreach runs to Marqq2 outreach_runs / outreach_prospects.
 */
import { getSupabaseWriteClient, getSupabaseReadClient } from '../lib/supabase.js';
import { useSupabasePersistence } from '../lib/persistence.js';

function writeClient() {
  if (!useSupabasePersistence()) return null;
  return getSupabaseWriteClient();
}

function runToRow(run) {
  return {
    id: run.id,
    workspace_id: String(run.workspaceId || run.companyId || ''),
    company_id: String(run.companyId || run.workspaceId || ''),
    company_name: run.companyName || '',
    question: run.question || run.goal || '',
    channel: run.channel || 'email',
    target: run.target || 'decision',
    goal: run.goal || 'reply',
    source: run.source || null,
    campaigns: run.campaigns || [],
    replies: run.replies || [],
    sequence_emails: run.sequence_emails || [],
    sender_name: run.senderName || run.sender_name || null,
    analytics_events: run.analytics_events || [],
    tracking_enabled: Boolean(run.tracking_enabled),
    target_config: run.target_config || run.apollo || null,
    updated_at: new Date().toISOString(),
  };
}

function prospectToRow(runId, p) {
  return {
    id: String(p.id),
    run_id: runId,
    full_name: p.full_name || p.fullName || null,
    first_name: p.first_name || null,
    last_name: p.last_name || null,
    title: p.title || null,
    company: p.company || null,
    industry: p.industry || null,
    email: p.email || null,
    linkedin_url: p.linkedin_url || p.linkedinUrl || null,
    city: p.city || null,
    state: p.state || null,
    seniority: p.seniority || null,
    status: p.status || 'fetched',
    subject: p.subject || null,
    body: p.body || null,
    gmail_thread_id: p.gmail_thread_id || null,
    gmail_message_id: p.gmail_message_id || null,
    sent_at: p.sent_at || null,
    send_meta: p.send_meta || {},
    raw: p,
    updated_at: new Date().toISOString(),
  };
}

function prospectFromRow(row) {
  if (row.raw && typeof row.raw === 'object') {
    return { ...row.raw, id: row.id, status: row.status || row.raw.status };
  }
  return {
    id: row.id,
    full_name: row.full_name,
    first_name: row.first_name,
    last_name: row.last_name,
    title: row.title,
    company: row.company,
    industry: row.industry,
    email: row.email,
    linkedin_url: row.linkedin_url,
    city: row.city,
    state: row.state,
    seniority: row.seniority,
    status: row.status,
    subject: row.subject,
    body: row.body,
    gmail_thread_id: row.gmail_thread_id,
    gmail_message_id: row.gmail_message_id,
    sent_at: row.sent_at,
    send_meta: row.send_meta || {},
  };
}

function runFromRows(runRow, prospectRows = []) {
  const targetConfig = runRow.target_config || null;
  const contactChannels = Array.isArray(targetConfig?.contactChannels)
    ? targetConfig.contactChannels
    : runRow.channel
      ? [runRow.channel]
      : ['email'];
  return {
    id: runRow.id,
    workspaceId: runRow.workspace_id,
    companyId: runRow.company_id,
    companyName: runRow.company_name,
    question: runRow.question,
    channel: runRow.channel,
    contactChannels,
    target: runRow.target,
    goal: runRow.goal,
    source: runRow.source || targetConfig?.source || null,
    campaigns: runRow.campaigns || [],
    replies: runRow.replies || [],
    sequence_emails: runRow.sequence_emails || [],
    senderName: runRow.sender_name,
    prospects: (prospectRows || []).map(prospectFromRow),
    createdAt: runRow.created_at,
    updatedAt: runRow.updated_at,
    apollo: targetConfig,
    target_config: targetConfig,
  };
}

export async function persistOutreachRun(run) {
  const db = writeClient();
  if (!db || !run?.id) return false;
  try {
    const { error: runError } = await db.from('outreach_runs').upsert(runToRow(run), { onConflict: 'id' });
    if (runError) {
      console.warn('[outreach persist] run:', runError.message);
      return false;
    }
    await db.from('outreach_prospects').delete().eq('run_id', run.id);
    const rows = (run.prospects || []).map((p) => prospectToRow(run.id, p));
    if (rows.length) {
      const { error: pErr } = await db.from('outreach_prospects').insert(rows);
      if (pErr) {
        console.warn('[outreach persist] prospects:', pErr.message);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.warn('[outreach persist]', err.message);
    return false;
  }
}

export async function loadOutreachRun(runId) {
  const db = getSupabaseReadClient();
  if (!db || !useSupabasePersistence() || !runId) return null;
  try {
    const { data: runRow, error } = await db.from('outreach_runs').select('*').eq('id', runId).maybeSingle();
    if (error || !runRow) return null;
    const { data: prospects } = await db.from('outreach_prospects').select('*').eq('run_id', runId);
    return runFromRows(runRow, prospects || []);
  } catch {
    return null;
  }
}

/** Load recent outreach runs + prospects for a workspace (Customer 360). */
export async function listWorkspaceOutreachRuns(workspaceId, { limit = 20 } = {}) {
  const db = getSupabaseReadClient();
  if (!db || !useSupabasePersistence() || !workspaceId) return [];
  try {
    const { data: runRows, error } = await db
      .from('outreach_runs')
      .select('*')
      .or(`workspace_id.eq.${workspaceId},company_id.eq.${workspaceId}`)
      .order('updated_at', { ascending: false })
      .limit(Math.min(Math.max(Number(limit) || 20, 1), 50));
    if (error || !runRows?.length) return [];

    const runs = [];
    for (const runRow of runRows) {
      const { data: prospects } = await db.from('outreach_prospects').select('*').eq('run_id', runRow.id);
      runs.push(runFromRows(runRow, prospects || []));
    }
    return runs;
  } catch (err) {
    console.warn('[outreach persist] list workspace:', err.message);
    return [];
  }
}
