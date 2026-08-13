/**
 * Task-aware connector planning.
 *
 * Agent ownership answers "who should do this?". This module answers the
 * separate execution question: "what external data or action is needed, is
 * it connected, and which concrete resource should be used?".
 */

import { getWorkspacePreferences } from './workspacePrefs.js';

export const CONNECTOR_CAPABILITIES = Object.freeze({
  ga4: { label: 'Google Analytics', toolkit: 'ga4', resourceField: 'ga4_property_id', read: true, write: false },
  gsc: { label: 'Google Search Console', toolkit: 'gsc', resourceField: 'gsc_site_url', read: true, write: false },
  google_ads: { label: 'Google Ads', toolkit: 'google_ads', resourceField: 'google_ads_customer_id', read: true, write: true },
  meta_ads: { label: 'Meta Ads', toolkit: 'meta_ads', resourceField: 'meta_ads_account_id', read: true, write: true },
  linkedin: { label: 'LinkedIn', toolkit: 'linkedin', read: true, write: true },
  instagram: { label: 'Instagram', toolkit: 'instagram', resourceField: 'instagram_account_id', read: true, write: true },
  facebook: { label: 'Facebook Pages', toolkit: 'facebook', resourceField: 'facebook_page_id', read: true, write: true },
  youtube: { label: 'YouTube', toolkit: 'youtube', read: true, write: true },
  twitter: { label: 'X/Twitter', toolkit: 'twitter', read: true, write: true },
  apollo: { label: 'Apollo', toolkit: 'apollo', read: true, write: true },
  hunter: { label: 'Hunter', toolkit: 'hunter', read: true, write: false },
  hubspot: { label: 'HubSpot', toolkit: 'hubspot', read: true, write: true, resourceField: 'hubspot_account_id' },
  salesforce: { label: 'Salesforce', toolkit: 'salesforce', read: true, write: true, resourceField: 'salesforce_account_id' },
  klaviyo: { label: 'Klaviyo', toolkit: 'klaviyo', read: true, write: true },
  google_sheets: { label: 'Google Sheets', toolkit: 'google_sheets', resourceField: 'google_sheets_spreadsheet_id', read: true, write: true },
  google_docs: { label: 'Google Docs', toolkit: 'google_docs', resourceField: 'google_docs_document_id', read: true, write: true },
  github: { label: 'GitHub', toolkit: 'github', resourceField: 'github_repository', read: true, write: true },
  linkedin_ads: { label: 'LinkedIn Ads', toolkit: 'linkedin_ads', resourceField: 'linkedin_ads_account_id', read: true, write: true },
  google_drive: { label: 'Google Drive', toolkit: 'google_drive', read: true, write: true },
  wordpress: { label: 'WordPress', toolkit: 'wordpress', read: true, write: true },
  webflow: { label: 'Webflow', toolkit: 'webflow', read: true, write: true },
  shopify: { label: 'Shopify', toolkit: 'shopify', read: true, write: true },
  wix: { label: 'Wix', toolkit: 'wix', read: true, write: true },
  mailchimp: { label: 'Mailchimp', toolkit: 'mailchimp', read: true, write: true },
  sendgrid: { label: 'SendGrid', toolkit: 'sendgrid', read: true, write: true },
  mixpanel: { label: 'Mixpanel', toolkit: 'mixpanel', read: true, write: false },
  amplitude: { label: 'Amplitude', toolkit: 'amplitude', read: true, write: false },
  semrush: { label: 'Semrush', toolkit: 'semrush', read: true, write: false },
  ahrefs: { label: 'Ahrefs', toolkit: 'ahrefs', read: true, write: false },
  slack: { label: 'Slack', toolkit: 'slack', read: true, write: true },
});

/** Connector requirements for the machine-readable GTM workstream contract. */
export const WORKSTREAM_CONNECTOR_REQUIREMENTS = Object.freeze({
  'measurement-foundation': { required: ['ga4'], optional: ['gsc'] },
  'audience-and-topic-map': { required: [], optional: ['gsc'] },
  'content-and-seo-production': { required: [], optional: ['gsc'] },
  'activation-funnel': { required: ['ga4'], optional: [] },
  'consented-lifecycle': { required: [], optional: ['klaviyo', 'ga4'] },
  'pricing-learning': { required: [], optional: ['ga4'] },
  'claims-and-privacy-review': { required: [], optional: [] },
  'weekly-gtm-control-loop': { required: ['ga4'], optional: ['gsc', 'google_ads', 'meta_ads'] },
});

const TEXT_RULES = [
  { connector: 'ga4', pattern: /\b(ga4|google analytics|activation|activation rate|conversion|conversion rate|funnel|retention|traffic|sessions)\b/i, explicit: /\b(ga4|google analytics)\b/i },
  { connector: 'gsc', pattern: /\b(gsc|search console|organic clicks|search impressions|queries|rankings|seo visibility)\b/i, explicit: /\b(gsc|search console)\b/i },
  { connector: 'google_ads', pattern: /\b(google ads|search ads|google campaign|ppc|cpc)\b/i, explicit: /\bgoogle ads\b/i },
  { connector: 'meta_ads', pattern: /\b(meta ads|facebook ads|instagram ads|paid social|ad spend|roas)\b/i, explicit: /\bmeta ads\b/i },
  { connector: 'instagram', pattern: /\b(instagram account|instagram post|instagram reel|instagram publishing)\b/i, explicit: /\binstagram\b/i },
  { connector: 'facebook', pattern: /\b(facebook page|facebook post|facebook publishing)\b/i, explicit: /\bfacebook page\b/i },
  { connector: 'linkedin', pattern: /\b(linkedin post|linkedin publishing|linkedin company page)\b/i, explicit: /\blinkedin\b/i },
  { connector: 'apollo', pattern: /\b(apollo|prospecting|account list|lead enrichment)\b/i, explicit: /\bapollo\b/i },
  { connector: 'hubspot', pattern: /\b(hubspot|crm pipeline|deal stage|contact sync)\b/i, explicit: /\bhubspot\b/i },
  { connector: 'salesforce', pattern: /\b(salesforce|crm pipeline|opportunity sync)\b/i, explicit: /\bsalesforce\b/i },
  { connector: 'klaviyo', pattern: /\b(klaviyo|lifecycle email|email flow|nurture sequence)\b/i, explicit: /\bklaviyo\b/i },
  { connector: 'google_sheets', pattern: /\b(google sheets|spreadsheet|sheet sync)\b/i, explicit: /\bgoogle sheets\b/i },
  { connector: 'google_docs', pattern: /\b(google docs|google document|shared doc|doc editor)\b/i, explicit: /\bgoogle docs\b/i },
  { connector: 'github', pattern: /\b(github|repository|repo|codebase)\b/i, explicit: /\bgithub\b/i },
  { connector: 'wordpress', pattern: /\b(wordpress|wp blog|wordpress publication)\b/i, explicit: /\bwordpress\b/i },
  { connector: 'webflow', pattern: /\b(webflow|webflow cms)\b/i, explicit: /\bwebflow\b/i },
  { connector: 'shopify', pattern: /\b(shopify|product catalog|storefront)\b/i, explicit: /\bshopify\b/i },
  { connector: 'mailchimp', pattern: /\b(mailchimp|email campaign|newsletter)\b/i, explicit: /\bmailchimp\b/i },
  { connector: 'sendgrid', pattern: /\b(sendgrid|transactional email)\b/i, explicit: /\bsendgrid\b/i },
  { connector: 'mixpanel', pattern: /\bmixpanel\b/i, explicit: /\bmixpanel\b/i },
  { connector: 'amplitude', pattern: /\bamplitude\b/i, explicit: /\bamplitude\b/i },
  { connector: 'semrush', pattern: /\bsemrush\b/i, explicit: /\bsemrush\b/i },
  { connector: 'ahrefs', pattern: /\bahrefs\b/i, explicit: /\bahrefs\b/i },
  { connector: 'slack', pattern: /\b(slack|team notification)\b/i, explicit: /\bslack\b/i },
];

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
}

function normalizeMode(value) {
  const raw = String(value || 'draft_safe').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ['draft_safe', 'live_drafts', 'live_publish'].includes(raw) ? raw : 'draft_safe';
}

export function inferConnectorNeeds({ target = '', task = '', requiredConnectors = [], optionalConnectors = [] } = {}) {
  const text = `${target} ${task}`;
  const inferred = TEXT_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.connector);
  const explicitRequired = unique(requiredConnectors);
  const explicitOptional = unique(optionalConnectors);
  const named = TEXT_RULES.filter((rule) => rule.explicit?.test(text)).map((rule) => rule.connector).filter((id) => !explicitOptional.includes(id));
  return {
    required: unique([...explicitRequired, ...named, ...inferred.filter((id) => explicitOptional.includes(id) === false && /publish|send|create|update|sync|spend|launch|manage|write/i.test(text))]),
    optional: unique([...explicitOptional, ...inferred]).filter((id) => !explicitRequired.includes(id)),
  };
}

export function buildConnectorPlan({ target = '', task = '', requiredConnectors = [], optionalConnectors = [], actionMode = 'draft_safe', preferences = {}, connectedConnectors = null } = {}) {
  const mode = normalizeMode(actionMode);
  const needs = inferConnectorNeeds({ target, task, requiredConnectors, optionalConnectors });
  const ids = unique([...needs.required, ...needs.optional]);
  return ids.map((connectorId) => {
    const capability = CONNECTOR_CAPABILITIES[connectorId] || { label: connectorId, toolkit: connectorId, read: true, write: false };
    const required = needs.required.includes(connectorId);
    const selectedResource = preferences[capability.resourceField] || null;
    const connectionWasChecked = connectedConnectors !== null && connectedConnectors !== undefined;
    const connected = connectionWasChecked && (connectedConnectors[connectorId] === true || connectedConnectors[connectorId]?.connected === true);
    const hasWriteIntent = /publish|send|create|update|sync|spend|launch|manage|write/i.test(task);
    const providerDraftIntent = /draft|save|preview|prepare|stage/i.test(task);
    const writeAllowed = mode === 'live_publish' || (mode === 'live_drafts' && providerDraftIntent);
    let status = connected ? 'connected' : 'unknown';
    let reason = connected ? 'Active connector detected.' : 'Connection status has not been checked yet.';
    if (required && connectionWasChecked && !connected) {
      status = 'needs_connection';
      reason = `Connect ${capability.label} before this task can run.`;
    } else if (connected && capability.resourceField && !selectedResource) {
      status = 'needs_resource_selection';
      reason = `Choose the ${capability.label.toLowerCase()} resource to use.`;
    }
    if (hasWriteIntent && !capability.write) {
      status = required ? 'unsupported_action' : status;
      reason = `${capability.label} supports data access here, but not this write action.`;
    } else if (hasWriteIntent && !writeAllowed) {
      status = 'blocked_by_mode';
      reason = mode === 'draft_safe' ? 'Draft-safe mode blocks external writes.' : 'Only provider-draft actions are allowed in Live drafts mode.';
    }
    return {
      connectorId,
      label: capability.label,
      purpose: required ? 'Required input or action' : 'Optional enrichment',
      required,
      access: hasWriteIntent ? (capability.write ? 'write' : 'read') : 'read',
      selectedResource,
      resourceField: capability.resourceField || null,
      status,
      reason,
      actionMode: mode,
    };
  });
}

export function buildWorkstreamConnectorPlan({ workstreamId, task = '', actionMode = 'draft_safe', preferences = {}, connectedConnectors = null } = {}) {
  const requirements = WORKSTREAM_CONNECTOR_REQUIREMENTS[String(workstreamId || '').trim()] || { required: [], optional: [] };
  return buildConnectorPlan({
    target: `workstream:${workstreamId || 'unknown'}`,
    task,
    requiredConnectors: requirements.required,
    optionalConnectors: requirements.optional,
    actionMode,
    preferences,
    connectedConnectors,
  });
}

export async function resolveConnectorReadiness({ workspaceId, connectorPlan = [], discoverResources = false } = {}) {
  // Keep the pure planner free of the Composio/Agent OS import cycle. Network
  // dependencies are loaded only when readiness is explicitly requested.
  const [{ resolveConnectedAccountId }, { listIntegrationResources, supportedResourceConnector }, { loadWorkspacePreferencesFromSupabase }] = await Promise.all([
    import('./composio.js'),
    import('./integrationResources.js'),
    import('./agentSupabase.js'),
  ]);
  const plan = Array.isArray(connectorPlan) ? connectorPlan : [];
  const persisted = await loadWorkspacePreferencesFromSupabase(workspaceId).catch(() => null);
  const preferences = { ...getWorkspacePreferences(workspaceId), ...(persisted || {}) };
  return Promise.all(plan.map(async (item) => {
    try {
      const accountId = await resolveConnectedAccountId(item.connectorId, workspaceId);
      let resources = [];
      let discoveryError = null;
      if (discoverResources && supportedResourceConnector(item.connectorId)) {
        const discovered = await listIntegrationResources(item.connectorId, workspaceId);
        if (discovered?.ok === false) discoveryError = discovered.error || `Unable to verify ${item.label}.`;
        resources = discovered.resources || [];
      }
      const configuredResource = preferences[item.resourceField] || item.selectedResource || null;
      const selectedResource = configuredResource || (resources.length === 1 ? resources[0].id : null);
      const selectedExists = !selectedResource || !resources.length || resources.some((resource) => resource.id === selectedResource);
      const status = discoveryError
        ? (item.required ? 'resource_discovery_failed' : 'optional_unavailable')
        : !selectedExists
        ? 'needs_resource_selection'
        : item.resourceField && !selectedResource
          ? 'needs_resource_selection'
          : 'ready';
      return {
        ...item,
        status,
        accountId,
        selectedResource,
        resources,
        reason: discoveryError
          ? discoveryError
          : status === 'ready'
          ? 'Connector and resource are ready.'
          : selectedExists
            ? `Choose the ${item.label.toLowerCase()} resource to use.`
            : `The selected ${item.label.toLowerCase()} resource is not available to this connection.`,
      };
    } catch (error) {
      return { ...item, status: item.required ? 'needs_connection' : 'optional_unavailable', accountId: null, resources: [], error: error.message || String(error), reason: error.message || `Connect ${item.label}.` };
    }
  }));
}

export function connectorPlanSummary(plan = []) {
  const items = Array.isArray(plan) ? plan : [];
  return {
    required: items.filter((item) => item.required).map((item) => item.connectorId),
    optional: items.filter((item) => !item.required).map((item) => item.connectorId),
    blocking: items.filter((item) => item.required && !['connected', 'ready'].includes(item.status)).map((item) => item.connectorId),
    ready: items.filter((item) => ['connected', 'ready'].includes(item.status)).map((item) => item.connectorId),
  };
}
