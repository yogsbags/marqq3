/**
 * Google Sheets lead CRM (fallback when HubSpot/Salesforce not connected).
 * Uses Composio GOOGLESHEETS_* tools per docs.composio.dev/toolkits/googlesheets.
 */

import { executeComposioAction, resolveConnectedAccountId } from './composio.js';
import { getWorkspacePreferences, patchWorkspacePreferences } from './workspacePrefs.js';

/** Dedicated CRM tab — created via ADD_SHEET when missing. */
export const DEFAULT_LEADS_WORKSHEET = 'Leads';

export const OUTREACH_SHEET_HEADERS = [
  'prospect_id',
  'full_name',
  'first_name',
  'last_name',
  'email',
  'phone',
  'title',
  'company',
  'linkedin_url',
  'status',
  'channel',
  'subject',
  'run_id',
  'workspace_id',
  'workspace_company',
  'provider',
  'campaign_id',
  'sent_at',
  'replied_at',
  'scheduled_for',
  'next_action',
  'source',
  'updated_at',
];

async function sheetsConnected(companyId) {
  try {
    await resolveConnectedAccountId('google_sheets', companyId);
    return true;
  } catch {
    return false;
  }
}

function extractSpreadsheetId(result) {
  const r = result?.result || result?.data || result || {};
  return (
    r.spreadsheetId ||
    r.spreadsheet_id ||
    r.id ||
    r.sheetId ||
    r.data?.spreadsheetId ||
    r.data?.spreadsheet_id ||
    r.data?.id ||
    null
  );
}

function extractSheetNames(result) {
  const r = result?.result || result?.data || result || {};
  const lists = [
    r.sheet_names,
    r.sheetNames,
    r.sheets,
    r.names,
    r.data?.sheet_names,
    r.data?.sheets,
    Array.isArray(r) ? r : null,
  ];
  for (const list of lists) {
    if (!Array.isArray(list) || !list.length) continue;
    return list
      .map((item) => {
        if (typeof item === 'string') return item;
        return item?.title || item?.name || item?.properties?.title || '';
      })
      .filter(Boolean);
  }
  // GET_SPREADSHEET_INFO shape
  if (Array.isArray(r.sheets)) {
    return r.sheets
      .map((s) => s?.properties?.title || s?.title || s?.name || '')
      .filter(Boolean);
  }
  return [];
}

function rowObjectFromProspect(run, prospect, extras = {}) {
  const first =
    prospect.first_name ||
    String(prospect.full_name || '')
      .trim()
      .split(/\s+/)[0] ||
    '';
  const last =
    prospect.last_name ||
    String(prospect.full_name || '')
      .trim()
      .split(/\s+/)
      .slice(1)
      .join(' ') ||
    '';
  return {
    prospect_id: String(prospect.id || ''),
    full_name: String(prospect.full_name || ''),
    first_name: first,
    last_name: last,
    email: String(prospect.email || ''),
    phone: String(prospect.phone_e164 || ''),
    title: String(prospect.title || ''),
    company: String(prospect.company || ''),
    linkedin_url: String(prospect.linkedin_url || ''),
    status: String(extras.status || prospect.status || 'fetched'),
    channel: String(extras.channel || prospect.go_live?.channel || 'email'),
    subject: String(prospect.subject || extras.subject || ''),
    run_id: String(run?.id || ''),
    workspace_id: String(run?.companyId || run?.workspaceId || ''),
    workspace_company: String(run?.companyName || ''),
    provider: String(extras.provider || prospect.go_live?.result?.provider || ''),
    campaign_id: String(
      extras.campaign_id ||
        prospect.go_live?.result?.campaign_id ||
        prospect.gmail_thread_id ||
        ''
    ),
    sent_at: String(prospect.sent_at || extras.sent_at || ''),
    replied_at: String(extras.replied_at || (prospect.status === 'replied' ? new Date().toISOString() : '')),
    scheduled_for: String(prospect.scheduled_for || ''),
    next_action: String(extras.next_action || ''),
    source: String(extras.source || run?.source || 'outreach'),
    updated_at: new Date().toISOString(),
  };
}

function valuesFromRowObject(obj) {
  return OUTREACH_SHEET_HEADERS.map((h) => String(obj[h] ?? ''));
}

/**
 * Ensure a dedicated Leads tab exists (GET_SHEET_NAMES → ADD_SHEET → header seed via VALUES_UPDATE).
 */
export async function ensureLeadsWorksheet(companyId, spreadsheetId, preferred = DEFAULT_LEADS_WORKSHEET) {
  const desired = String(preferred || DEFAULT_LEADS_WORKSHEET).trim() || DEFAULT_LEADS_WORKSHEET;
  const aliases = [desired, DEFAULT_LEADS_WORKSHEET, 'Outreach Leads', 'Sheet1'];

  let names = [];
  const listed = await executeComposioAction(
    'GOOGLESHEETS_GET_SHEET_NAMES',
    { spreadsheet_id: spreadsheetId, spreadsheetId },
    companyId,
    'google_sheets'
  );
  if (!listed.error) {
    names = extractSheetNames(listed);
  }
  if (!names.length) {
    const info = await executeComposioAction(
      'GOOGLESHEETS_GET_SPREADSHEET_INFO',
      {
        spreadsheet_id: spreadsheetId,
        spreadsheetId,
        fields: 'sheets.properties(sheetId,title)',
      },
      companyId,
      'google_sheets'
    );
    if (!info.error) names = extractSheetNames(info);
  }

  const lower = names.map((n) => n.toLowerCase());
  for (const alias of aliases) {
    const idx = lower.indexOf(String(alias).toLowerCase());
    if (idx >= 0) return { ok: true, worksheet: names[idx], created: false, names };
  }

  // Create dedicated Leads tab (docs: title / sheet_name + force_unique)
  const added = await executeComposioAction(
    'GOOGLESHEETS_ADD_SHEET',
    {
      spreadsheet_id: spreadsheetId,
      spreadsheetId,
      title: desired,
      sheet_name: desired,
      force_unique: true,
    },
    companyId,
    'google_sheets'
  );
  if (added.error) {
    // Fall back to first existing tab
    if (names.length) {
      return { ok: true, worksheet: names[0], created: false, names, warning: added.error };
    }
    return { ok: false, error: added.error, names };
  }

  const createdName =
    added.result?.replies?.[0]?.addSheet?.properties?.title ||
    added.result?.title ||
    added.result?.sheet_name ||
    desired;

  // Seed header row via preferred VALUES_UPDATE (sheet_name + first_cell_location)
  await executeComposioAction(
    'GOOGLESHEETS_VALUES_UPDATE',
    {
      spreadsheet_id: spreadsheetId,
      spreadsheetId,
      sheet_name: createdName,
      values: [OUTREACH_SHEET_HEADERS],
      first_cell_location: 'A1',
      value_input_option: 'USER_ENTERED',
    },
    companyId,
    'google_sheets'
  );

  return { ok: true, worksheet: createdName, created: true, names: [...names, createdName] };
}

/**
 * Resolve spreadsheet id: prefs → env → search by title → optionally create.
 */
export async function resolveOutreachSpreadsheet(companyId, { createIfMissing = true } = {}) {
  const prefs = getWorkspacePreferences(companyId);
  let spreadsheetId = String(
    prefs.google_sheets_spreadsheet_id || process.env.GOOGLE_SHEETS_SPREADSHEET_ID || ''
  ).trim();
  let worksheet = String(
    prefs.google_sheets_worksheet || process.env.GOOGLE_SHEETS_WORKSHEET || DEFAULT_LEADS_WORKSHEET
  ).trim();
  // Migrate legacy Sheet1 default → dedicated Leads tab
  if (!prefs.google_sheets_worksheet && worksheet === 'Sheet1') {
    worksheet = DEFAULT_LEADS_WORKSHEET;
  }

  if (!(await sheetsConnected(companyId))) {
    return { ok: false, skipped: true, reason: 'google_sheets_not_connected' };
  }

  if (spreadsheetId) {
    const ensured = await ensureLeadsWorksheet(companyId, spreadsheetId, worksheet);
    if (!ensured.ok) {
      return { ok: false, error: ensured.error, spreadsheetId };
    }
    return {
      ok: true,
      spreadsheetId,
      worksheet: ensured.worksheet,
      created: Boolean(ensured.created),
      tabCreated: Boolean(ensured.created),
    };
  }

  const title = `Marqq Outreach · ${companyId}`;

  const search = await executeComposioAction(
    'GOOGLESHEETS_SEARCH_SPREADSHEETS',
    { query: title, name: title },
    companyId,
    'google_sheets'
  );
  if (!search.error) {
    const hits =
      search.result?.files ||
      search.result?.spreadsheets ||
      search.result?.data ||
      search.result?.results ||
      (Array.isArray(search.result) ? search.result : []);
    const match = (Array.isArray(hits) ? hits : []).find((f) => {
      const name = String(f.name || f.title || '').toLowerCase();
      return name === title.toLowerCase() || name.includes('marqq outreach');
    });
    const foundId = match?.id || match?.spreadsheetId || match?.spreadsheet_id || null;
    if (foundId) {
      const ensured = await ensureLeadsWorksheet(companyId, String(foundId), worksheet);
      const finalWs = ensured.ok ? ensured.worksheet : worksheet;
      patchWorkspacePreferences(companyId, {
        google_sheets_spreadsheet_id: String(foundId),
        google_sheets_worksheet: finalWs,
      });
      return {
        ok: true,
        spreadsheetId: String(foundId),
        worksheet: finalWs,
        created: false,
        tabCreated: Boolean(ensured.created),
        title,
      };
    }
  }

  if (!createIfMissing) {
    return { ok: false, skipped: true, reason: 'spreadsheet_id_missing' };
  }

  // Create workbook with Leads-oriented sheet + header row
  let created = await executeComposioAction(
    'GOOGLESHEETS_SHEET_FROM_JSON',
    {
      title,
      sheet_name: worksheet,
      data: [Object.fromEntries(OUTREACH_SHEET_HEADERS.map((h) => [h, h]))],
      json_data: [Object.fromEntries(OUTREACH_SHEET_HEADERS.map((h) => [h, h]))],
    },
    companyId,
    'google_sheets'
  );
  spreadsheetId = extractSpreadsheetId(created);

  if (!spreadsheetId) {
    created = await executeComposioAction(
      'GOOGLESHEETS_CREATE_GOOGLE_SHEET1',
      { title, sheet_name: worksheet },
      companyId,
      'google_sheets'
    );
    spreadsheetId = extractSpreadsheetId(created);
    if (spreadsheetId) {
      // Prefer VALUES_UPDATE over deprecated BATCH_UPDATE / raw append for headers
      const headerWrite = await executeComposioAction(
        'GOOGLESHEETS_VALUES_UPDATE',
        {
          spreadsheet_id: spreadsheetId,
          spreadsheetId,
          sheet_name: worksheet,
          values: [OUTREACH_SHEET_HEADERS],
          first_cell_location: 'A1',
          value_input_option: 'USER_ENTERED',
        },
        companyId,
        'google_sheets'
      );
      if (headerWrite.error) {
        await executeComposioAction(
          'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND',
          {
            spreadsheet_id: spreadsheetId,
            spreadsheetId,
            range: 'A1',
            values: [OUTREACH_SHEET_HEADERS],
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
          },
          companyId,
          'google_sheets'
        );
      }
    }
  }

  if (!spreadsheetId) {
    return {
      ok: false,
      error:
        created?.error ||
        'Could not create Google Sheet — set google_sheets_spreadsheet_id under Integrations preferences',
      raw: created?.result || null,
    };
  }

  const ensured = await ensureLeadsWorksheet(companyId, spreadsheetId, worksheet);
  const finalWs = ensured.ok ? ensured.worksheet : worksheet;
  patchWorkspacePreferences(companyId, {
    google_sheets_spreadsheet_id: spreadsheetId,
    google_sheets_worksheet: finalWs,
  });

  return {
    ok: true,
    spreadsheetId,
    worksheet: finalWs,
    created: true,
    tabCreated: Boolean(ensured.created),
    title,
  };
}

/**
 * Upsert prospects into the Leads sheet (key = email).
 * Write order per Composio docs: UPSERT_ROWS → VALUES_UPDATE (append) → VALUES_APPEND.
 */
export async function upsertProspectsToGoogleSheets(run, prospects, extras = {}) {
  const companyId = run?.companyId || run?.workspaceId || 'marqq-ws-1';
  const resolved = await resolveOutreachSpreadsheet(companyId);
  if (!resolved.ok) return resolved;

  const list = (Array.isArray(prospects) ? prospects : [prospects]).filter(Boolean);
  if (!list.length) return { ok: false, error: 'No prospects to sync' };

  const rows = list.map((p) => rowObjectFromProspect(run, p, extras));
  const values = rows.map(valuesFromRowObject);
  const worksheet = resolved.worksheet || DEFAULT_LEADS_WORKSHEET;

  // 1) Preferred: upsert by email
  let write = await executeComposioAction(
    'GOOGLESHEETS_UPSERT_ROWS',
    {
      spreadsheet_id: resolved.spreadsheetId,
      spreadsheetId: resolved.spreadsheetId,
      sheet_name: worksheet,
      worksheet_name: worksheet,
      key_column: 'email',
      rows,
      values,
      headers: OUTREACH_SHEET_HEADERS,
    },
    companyId,
    'google_sheets'
  );
  let tool = 'GOOGLESHEETS_UPSERT_ROWS';

  // 2) Docs-preferred write: VALUES_UPDATE — omit first_cell_location to append rows
  if (write.error) {
    write = await executeComposioAction(
      'GOOGLESHEETS_VALUES_UPDATE',
      {
        spreadsheet_id: resolved.spreadsheetId,
        spreadsheetId: resolved.spreadsheetId,
        sheet_name: worksheet,
        values,
        value_input_option: 'USER_ENTERED',
        // omit first_cell_location → append as new rows
      },
      companyId,
      'google_sheets'
    );
    tool = 'GOOGLESHEETS_VALUES_UPDATE';
  }

  // 3) Last resort: classic values.append
  if (write.error) {
    write = await executeComposioAction(
      'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND',
      {
        spreadsheet_id: resolved.spreadsheetId,
        spreadsheetId: resolved.spreadsheetId,
        range: `'${String(worksheet).replace(/'/g, "''")}'!A1`,
        values,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
      },
      companyId,
      'google_sheets'
    );
    tool = 'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND';
  }

  if (write.error) {
    return {
      ok: false,
      error: write.error,
      spreadsheetId: resolved.spreadsheetId,
      worksheet,
      tool,
    };
  }

  patchWorkspacePreferences(companyId, {
    google_sheets_spreadsheet_id: resolved.spreadsheetId,
    google_sheets_worksheet: worksheet,
  });

  for (const p of list) {
    p.crm_sync = {
      destination: 'google_sheets',
      spreadsheet_id: resolved.spreadsheetId,
      worksheet,
      tool,
      at: new Date().toISOString(),
      status: extras.status || p.status || 'synced',
    };
  }

  return {
    ok: true,
    destination: 'google_sheets',
    spreadsheetId: resolved.spreadsheetId,
    worksheet,
    tool,
    created: Boolean(resolved.created),
    tabCreated: Boolean(resolved.tabCreated),
    count: list.length,
    url: `https://docs.google.com/spreadsheets/d/${resolved.spreadsheetId}`,
  };
}

function extractGridValues(result) {
  const r = result?.result || result?.data || result || {};
  if (Array.isArray(r.values)) return r.values;
  if (Array.isArray(r.valueRanges?.[0]?.values)) return r.valueRanges[0].values;
  if (Array.isArray(r.data?.values)) return r.data.values;
  if (Array.isArray(r.data?.valueRanges?.[0]?.values)) return r.data.valueRanges[0].values;
  // Some Composio wrappers nest under spreadsheet
  if (Array.isArray(r.spreadsheet?.values)) return r.spreadsheet.values;
  return [];
}

function rowsToLeadObjects(values) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const headers = (values[0] || []).map((h) => String(h || '').trim().toLowerCase());
  const headerIndex = (name) => headers.indexOf(String(name).toLowerCase());
  const pick = (row, name) => {
    const i = headerIndex(name);
    return i >= 0 ? String(row[i] ?? '').trim() : '';
  };

  const leads = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    if (!row.some((c) => String(c || '').trim())) continue;
    const email = pick(row, 'email');
    const fullName = pick(row, 'full_name') || [pick(row, 'first_name'), pick(row, 'last_name')].filter(Boolean).join(' ');
    if (!email && !fullName) continue;
    leads.push({
      id: pick(row, 'prospect_id') || `sheet-${i}`,
      prospect_id: pick(row, 'prospect_id'),
      full_name: fullName || email,
      first_name: pick(row, 'first_name'),
      last_name: pick(row, 'last_name'),
      email,
      phone: pick(row, 'phone'),
      title: pick(row, 'title'),
      company: pick(row, 'company'),
      linkedin_url: pick(row, 'linkedin_url'),
      status: pick(row, 'status') || 'fetched',
      channel: pick(row, 'channel') || 'email',
      subject: pick(row, 'subject'),
      run_id: pick(row, 'run_id'),
      workspace_id: pick(row, 'workspace_id'),
      provider: pick(row, 'provider'),
      campaign_id: pick(row, 'campaign_id'),
      sent_at: pick(row, 'sent_at'),
      replied_at: pick(row, 'replied_at'),
      scheduled_for: pick(row, 'scheduled_for'),
      next_action: pick(row, 'next_action'),
      source: pick(row, 'source') || 'google_sheets',
      updated_at: pick(row, 'updated_at'),
      origin: 'google_sheets',
    });
  }
  return leads;
}

/**
 * Read CRM lead rows from the Outreach spreadsheet (Leads / Sheet1).
 */
export async function fetchLeadsFromGoogleSheets(companyId, { limit = 100 } = {}) {
  const resolved = await resolveOutreachSpreadsheet(companyId, { createIfMissing: false });
  if (!resolved.ok) {
    return { ok: false, leads: [], reason: resolved.reason || resolved.error || 'sheets_unavailable' };
  }

  const worksheets = Array.from(
    new Set([resolved.worksheet, DEFAULT_LEADS_WORKSHEET, 'Sheet1', 'Outreach Leads'].filter(Boolean))
  );
  let lastError = null;

  for (const worksheet of worksheets) {
    const quoted = `'${String(worksheet).replace(/'/g, "''")}'`;
    const range = `${quoted}!A1:W${Math.min(Math.max(Number(limit) || 100, 10) + 1, 501)}`;

    let read = await executeComposioAction(
      'GOOGLESHEETS_BATCH_GET',
      {
        spreadsheet_id: resolved.spreadsheetId,
        spreadsheetId: resolved.spreadsheetId,
        ranges: [range],
      },
      companyId,
      'google_sheets'
    );
    if (read.error) {
      read = await executeComposioAction(
        'GOOGLESHEETS_VALUES_GET',
        {
          spreadsheet_id: resolved.spreadsheetId,
          spreadsheetId: resolved.spreadsheetId,
          range,
          sheet_name: worksheet,
        },
        companyId,
        'google_sheets'
      );
    }
    if (read.error) {
      lastError = read.error;
      continue;
    }

    const values = extractGridValues(read);
    const leads = rowsToLeadObjects(values);
    if (leads.length || values.length) {
      return {
        ok: true,
        spreadsheetId: resolved.spreadsheetId,
        worksheet,
        url: `https://docs.google.com/spreadsheets/d/${resolved.spreadsheetId}`,
        leads,
        count: leads.length,
      };
    }
  }

  return {
    ok: false,
    leads: [],
    spreadsheetId: resolved.spreadsheetId,
    error: lastError || 'No lead rows found',
  };
}
