import { executeComposioAction } from './composio.js';

const RESOURCE_CONFIG = {
  meta_ads: {
    label: 'Meta ad accounts',
    field: 'meta_ads_account_id',
    actions: ['METAADS_LIST_BUSINESS_AD_ACCOUNTS', 'METAADS_GET_AD_ACCOUNTS'],
  },
  ga4: {
    label: 'GA4 properties',
    field: 'ga4_property_id',
    actions: ['GOOGLE_ANALYTICS_LIST_PROPERTIES_FILTERED', 'GOOGLE_ANALYTICS_LIST_ACCOUNT_SUMMARIES'],
  },
  google_ads: {
    label: 'Google Ads customers',
    field: 'google_ads_customer_id',
    actions: ['GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS', 'GOOGLEADS_LIST_SUB_ACCOUNTS'],
  },
  gsc: {
    label: 'Search Console sites',
    field: 'gsc_site_url',
    actions: ['GOOGLE_SEARCH_CONSOLE_LIST_SITES'],
  },
  facebook: {
    label: 'Facebook Pages',
    field: 'facebook_page_id',
    actions: ['FACEBOOK_LIST_MANAGED_PAGES', 'FACEBOOK_GET_USER_PAGES'],
  },
  instagram: {
    label: 'Instagram accounts',
    field: 'instagram_account_id',
    actions: ['INSTAGRAM_GET_USER_INFO'],
    single: true,
  },
  google_sheets: {
    label: 'Google Sheets spreadsheets',
    field: 'google_sheets_spreadsheet_id',
    actions: ['GOOGLESHEETS_SEARCH_SPREADSHEETS'],
    toolkit: 'googlesheets',
  },
  google_docs: {
    label: 'Google Docs documents',
    field: 'google_docs_document_id',
    actions: ['GOOGLEDOCS_SEARCH_DOCUMENTS'],
    toolkit: 'googledocs',
  },
  github: {
    label: 'GitHub repositories',
    field: 'github_repository',
    actions: ['GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER', 'GITHUB_LIST_REPOSITORIES'],
    toolkit: 'github',
  },
};

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['items', 'data', 'accounts', 'adAccounts', 'properties', 'propertySummaries', 'accountSummaries', 'results', 'files', 'documents', 'spreadsheets']) {
    if (Array.isArray(value[key])) return value[key];
    if (value[key] && typeof value[key] === 'object') {
      const nested = asArray(value[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}

function normalizeResource(item, connectorId) {
  if (!item || typeof item !== 'object') return null;
  const id = String(
    item.id || item.account_id || item.accountId || item.customerId || item.customer_id || item.resourceName || item.resource_name ||
    item.property || item.property_id || item.propertyId || item.siteUrl || item.site_url || item.fileId || item.file_id || item.documentId || item.document_id || item.full_name || item.name || item.html_url || item.username || ''
  ).trim();
  if (!id) return null;
  const name = String(
    item.name || item.displayName || item.display_name || item.accountName || item.account_name || item.customerName || item.customer_name ||
    item.propertyName || item.siteUrl || item.site_url || item.title || item.documentTitle || item.fileName || item.full_name || item.name || item.username || id
  ).trim();
  const parent = String(item.parent || item.account || item.accountName || item.account_name || item.owner?.login || item.owner?.html_url || '').trim();
  return {
    id,
    name,
    description: parent && parent !== name ? parent : connectorId === 'ga4' ? 'Google Analytics property' : connectorId === 'google_sheets' ? 'Google Sheets spreadsheet' : connectorId === 'google_docs' ? 'Google Docs document' : 'Connected resource',
  };
}

export function supportedResourceConnector(connectorId) {
  return Boolean(RESOURCE_CONFIG[String(connectorId || '').toLowerCase()]);
}

export async function listIntegrationResources(connectorId, workspaceId) {
  const id = String(connectorId || '').toLowerCase();
  const config = RESOURCE_CONFIG[id];
  if (!config) return { ok: false, supported: false, resources: [], error: 'Resource discovery is not available for this connector yet.' };

  let lastError = null;
  for (const action of config.actions) {
    const result = await executeComposioAction(action, {}, workspaceId, config.toolkit || (id === 'ga4' ? 'google_analytics' : id === 'meta_ads' ? 'metaads' : null));
    if (result?.error) {
      lastError = result.error;
      continue;
    }
    const payload = result.result;
    const rawResources = config.single && payload && typeof payload === 'object'
      ? [payload]
      : asArray(payload);
    const resources = rawResources
      .map((item) => normalizeResource(item, id))
      .filter(Boolean);
    const unique = [...new Map(resources.map((item) => [item.id, item])).values()];
    if (unique.length) {
      return { ok: true, supported: true, connectorId: id, label: config.label, field: config.field, resources: unique };
    }
  }

  return {
    ok: false,
    supported: true,
    connectorId: id,
    label: config.label,
    field: config.field,
    resources: [],
    error: lastError || `No ${config.label.toLowerCase()} were returned.`,
  };
}
