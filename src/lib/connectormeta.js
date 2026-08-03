/** Shared Composio connector labels for gates + CTAs */

export const CONNECTOR_DISPLAY = {
  ga4: { label: 'Google Analytics', bg: '#F9AB00' },
  gsc: { label: 'Search Console', bg: '#4285F4' },
  google_ads: { label: 'Google Ads', bg: '#34A853' },
  meta_ads: { label: 'Meta Ads', bg: '#0668E1' },
  linkedin_ads: { label: 'LinkedIn Ads', bg: '#0A66C2' },
  hubspot: { label: 'HubSpot', bg: '#FF7A59' },
  salesforce: { label: 'Salesforce', bg: '#00A1E0' },
  zoho_crm: { label: 'Zoho CRM', bg: '#E71E63' },
  apollo: { label: 'Apollo', bg: '#5B6CFF' },
  hunter: { label: 'Hunter', bg: '#FA5320' },
  semrush: { label: 'Semrush', bg: '#FF6A00' },
  ahrefs: { label: 'Ahrefs', bg: '#0A66FF' },
  mixpanel: { label: 'Mixpanel', bg: '#5F2EEA' },
  amplitude: { label: 'Amplitude', bg: '#1C6BFF' },
  klaviyo: { label: 'Klaviyo', bg: '#1A1A1A' },
  mailchimp: { label: 'Mailchimp', bg: '#FFE01B' },
  instantly: { label: 'Instantly', bg: '#6366F1' },
  heyreach: { label: 'HeyReach', bg: '#111827' },
  lemlist: { label: 'Lemlist', bg: '#F97316' },
  whatsapp: { label: 'WhatsApp', bg: '#25D366' },
  sendgrid: { label: 'SendGrid', bg: '#1A82E2' },
  gmail: { label: 'Gmail', bg: '#EA4335' },
  outlook: { label: 'Outlook', bg: '#0078D4' },
  zoho_mail: { label: 'Zoho Mail', bg: '#E71E63' },
  slack: { label: 'Slack', bg: '#4A154B' },
  shopify: { label: 'Shopify', bg: '#008060' },
  wix: { label: 'Wix', bg: '#0C6EFC' },
  hostinger: { label: 'Hostinger', bg: '#673DE6' },
  firecrawl: { label: 'Firecrawl', bg: '#111827' },
  github: { label: 'GitHub', bg: '#24292F' },
  railway: { label: 'Railway', bg: '#111827' },
  cloudflare: { label: 'Cloudflare', bg: '#F38020' },
  linkedin: { label: 'LinkedIn', bg: '#0A66C2' },
  facebook: { label: 'Facebook', bg: '#0866FF' },
  instagram: { label: 'Instagram', bg: '#E1306C' },
  twitter: { label: 'X (Twitter)', bg: '#111827' },
  moengage: { label: 'MoEngage', bg: '#4F46E5' },
  clevertap: { label: 'CleverTap', bg: '#FF6B6B' },
  wordpress: { label: 'WordPress', bg: '#21759B' },
  webflow: { label: 'Webflow', bg: '#4353FF' },
  google_docs: { label: 'Google Docs', bg: '#4285F4' },
  google_sheets: { label: 'Google Sheets', bg: '#0F9D58' },
  google_drive: { label: 'Google Drive', bg: '#4285F4' },
  google_calendar: { label: 'Google Calendar', bg: '#4285F4' },
  youtube: { label: 'YouTube', bg: '#FF0000' },
  one_drive: { label: 'OneDrive', bg: '#0078D4' },
  microsoft_sheets: { label: 'Microsoft Excel', bg: '#217346' },
  reddit: { label: 'Reddit', bg: '#FF4500' },
  canva: { label: 'Canva', bg: '#00C4CC' },
  pexels: { label: 'Pexels', bg: '#05A081' },
  gemini: { label: 'Google Gemini', bg: '#4285F4' },
  make: { label: 'Make', bg: '#6D00CC' },
  apify: { label: 'Apify', bg: '#1DB954' },
  snowflake: { label: 'Snowflake', bg: '#29B5E8' },
  openai: { label: 'OpenAI', bg: '#10A37F' },
  anthropic: { label: 'Anthropic', bg: '#D97757' },
  perplexity: { label: 'Perplexity', bg: '#1A1A1A' }
};

export function connectorLabel(id) {
  return CONNECTOR_DISPLAY[id]?.label || id;
}

/** Match Integrations menu: prefer `connected`, also accept active-ish status strings. */
export function isConnectorActive(connector) {
  if (!connector) return false;
  if (connector.connected) return true;
  const status = String(connector.status || '').toLowerCase();
  return status === 'active' || status === 'connected' || status === 'success';
}
