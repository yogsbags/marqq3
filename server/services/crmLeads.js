/**
 * CRM lead sync — HubSpot/Salesforce if connected, else Google Sheets fallback.
 */

import { executeComposioAction, resolveConnectedAccountId } from './composio.js';
import { upsertProspectsToGoogleSheets } from './googleSheetsLeads.js';

async function connectorActive(companyId, connectorId) {
  try {
    await resolveConnectedAccountId(connectorId, companyId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve where leads should land for this workspace.
 * Priority: HubSpot → Salesforce → Google Sheets (default fallback).
 */
export async function resolveCrmDestination(companyId) {
  const id = String(companyId || 'marqq-ws-1').trim();
  if (await connectorActive(id, 'hubspot')) {
    return { destination: 'hubspot', fallback: false };
  }
  if (await connectorActive(id, 'salesforce')) {
    return { destination: 'salesforce', fallback: false };
  }
  if (await connectorActive(id, 'google_sheets')) {
    return { destination: 'google_sheets', fallback: true };
  }
  return { destination: null, fallback: false, reason: 'no_crm_or_sheets' };
}

async function syncToHubSpot(run, prospect, extras = {}) {
  const companyId = run.companyId || run.workspaceId;
  const email = String(prospect.email || '').trim();
  if (!email) return { ok: false, error: 'Prospect email required for HubSpot' };

  const first =
    prospect.first_name ||
    String(prospect.full_name || '')
      .split(/\s+/)[0] ||
    '';
  const last =
    prospect.last_name ||
    String(prospect.full_name || '')
      .split(/\s+/)
      .slice(1)
      .join(' ') ||
    '';

  const res = await executeComposioAction(
    'HUBSPOT_CREATE_CONTACT',
    {
      email,
      firstname: first,
      lastname: last,
      company: prospect.company || '',
      jobtitle: prospect.title || '',
      phone: prospect.phone_e164 || '',
      lifecyclestage: 'lead',
      hs_lead_status: String(extras.status || prospect.status || 'NEW'),
    },
    companyId,
    'hubspot'
  );

  // Some HubSpot tools use upsert / create-or-update
  if (res.error) {
    const upsert = await executeComposioAction(
      'HUBSPOT_CREATE_OR_UPDATE_CONTACT',
      {
        email,
        firstname: first,
        lastname: last,
        company: prospect.company || '',
        jobtitle: prospect.title || '',
      },
      companyId,
      'hubspot'
    );
    if (upsert.error) return { ok: false, error: res.error || upsert.error, destination: 'hubspot' };
    prospect.crm_sync = {
      destination: 'hubspot',
      at: new Date().toISOString(),
      status: extras.status || prospect.status,
      result: upsert.result,
    };
    return { ok: true, destination: 'hubspot', result: upsert.result };
  }

  prospect.crm_sync = {
    destination: 'hubspot',
    at: new Date().toISOString(),
    status: extras.status || prospect.status,
    result: res.result,
  };
  return { ok: true, destination: 'hubspot', result: res.result };
}

/**
 * Sync one or many prospects to CRM (or Sheets fallback).
 * Never throws — returns { ok, destination, ... } so outreach can continue.
 */
export async function syncProspectsToCrm(run, prospects, extras = {}) {
  const companyId = run?.companyId || run?.workspaceId || 'marqq-ws-1';
  const list = (Array.isArray(prospects) ? prospects : [prospects]).filter(Boolean);
  if (!list.length) return { ok: false, skipped: true, reason: 'no_prospects' };

  const dest = await resolveCrmDestination(companyId);

  if (dest.destination === 'hubspot') {
    const results = [];
    for (const p of list) {
      try {
        results.push(await syncToHubSpot(run, p, extras));
      } catch (err) {
        results.push({ ok: false, error: err.message || String(err), destination: 'hubspot' });
      }
    }
    const failed = results.filter((r) => !r.ok);
    // If HubSpot fully failed, fall back to Sheets when available
    if (failed.length === results.length && (await connectorActive(companyId, 'google_sheets'))) {
      const sheets = await upsertProspectsToGoogleSheets(run, list, {
        ...extras,
        source: extras.source || 'outreach_hubspot_fallback',
      });
      return { ...sheets, hubspot_failed: true, attempted: 'hubspot' };
    }
    return {
      ok: failed.length === 0,
      destination: 'hubspot',
      count: results.filter((r) => r.ok).length,
      results,
      error: failed[0]?.error || null,
    };
  }

  if (dest.destination === 'salesforce') {
    // Salesforce create is connector-specific; prefer Sheets until SF mapping is wired
    if (await connectorActive(companyId, 'google_sheets')) {
      const sheets = await upsertProspectsToGoogleSheets(run, list, {
        ...extras,
        source: extras.source || 'outreach_salesforce_sheets_bridge',
      });
      return { ...sheets, note: 'Salesforce connected — writing to Sheets bridge until SF create is mapped' };
    }
    return {
      ok: false,
      skipped: true,
      destination: 'salesforce',
      reason: 'salesforce_create_not_mapped',
    };
  }

  if (dest.destination === 'google_sheets') {
    return upsertProspectsToGoogleSheets(run, list, {
      ...extras,
      source: extras.source || 'outreach_sheets_fallback',
    });
  }

  return { ok: false, skipped: true, reason: dest.reason || 'no_crm_or_sheets' };
}

export async function syncProspectToCrm(run, prospect, extras = {}) {
  return syncProspectsToCrm(run, [prospect], extras);
}
