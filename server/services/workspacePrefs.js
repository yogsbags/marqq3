/**
 * Workspace connector preferences (shared by integrations + CRM Sheets sync).
 */

export const preferencesStore = new Map();

export const WORKSPACE_DEFAULT_PREFS = {
  google_ads_customer_id: '',
  meta_ads_account_id: process.env.META_AD_ACCOUNT_ID || '',
  linkedin_ads_account_id: '',
  ga4_property_id: '',
  gsc_site_url: '',
  google_sheets_spreadsheet_id: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '',
  google_sheets_worksheet: process.env.GOOGLE_SHEETS_WORKSHEET || 'Leads',
  salesforce_account_id: '',
  hubspot_account_id: '',
};

export function getWorkspacePreferences(companyId = 'marqq-ws-1') {
  const id = String(companyId || 'marqq-ws-1').trim();
  return { ...WORKSPACE_DEFAULT_PREFS, ...(preferencesStore.get(id) || {}) };
}

export function patchWorkspacePreferences(companyId, patch = {}) {
  const id = String(companyId || 'marqq-ws-1').trim();
  const next = { ...getWorkspacePreferences(id), ...patch };
  preferencesStore.set(id, next);
  return next;
}
