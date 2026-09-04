import assert from 'node:assert/strict';
import {
  resolveToolkitForAction,
  composioActionPermission,
  isReadOnlyComposioAction,
  isReadOnlyProxyRequest,
  composioProxyPermission,
} from '../server/services/composio.js';

const cases = {
  WORDPRESS_CREATE_POST: 'wordpress',
  WEBFLOW_CREATE_ITEM: 'webflow',
  SHOPIFY_CREATE_PRODUCT: 'shopify',
  MAILCHIMP_CREATE_CAMPAIGN: 'mailchimp',
  SENDGRID_SEND_EMAIL: 'sendgrid',
  MIXPANEL_QUERY_EVENTS: 'mixpanel',
  AMPLITUDE_GET_INSIGHTS: 'amplitude',
  SEMRUSH_DOMAIN_OVERVIEW: 'semrush',
  AHREFS_GET_BACKLINKS: 'ahrefs',
  SLACK_SEND_MESSAGE: 'slack',
  LINKEDINADS_CREATE_CAMPAIGN: 'linkedinads',
  GOOGLEDRIVE_LIST_FILES: 'googledrive',
};
for (const [slug, expected] of Object.entries(cases)) {
  assert.equal(resolveToolkitForAction(slug), expected, `${slug} should route to ${expected}`);
}
assert.equal(resolveToolkitForAction('UNKNOWN_ACTION'), null);
assert.equal(resolveToolkitForAction('UNKNOWN_ACTION', 'google_drive'), 'googledrive');
const permission = await composioActionPermission('WORDPRESS_CREATE_POST', 'legacy-routing-test');
assert.equal(permission.allowed, false);
assert.equal(permission.mode, 'draft_safe');

assert.equal(isReadOnlyComposioAction('APOLLO_PEOPLE_SEARCH'), true);
assert.equal(isReadOnlyComposioAction('APOLLO_SEARCH_NEWS_ARTICLES'), true);
assert.equal(isReadOnlyComposioAction('WORDPRESS_CREATE_POST'), false);

assert.equal(isReadOnlyProxyRequest('POST', 'https://api.apollo.io/api/v1/mixed_people/api_search'), true);
assert.equal(isReadOnlyProxyRequest('POST', 'https://api.apollo.io/api/v1/news_articles/search'), true);
assert.equal(isReadOnlyProxyRequest('GET', 'https://api.apollo.io/api/v1/people/123'), true);
assert.equal(isReadOnlyProxyRequest('POST', 'https://api.apollo.io/api/v1/people/bulk_match?reveal_phone_number=true'), false);
assert.equal(isReadOnlyProxyRequest('POST', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'), false);

const apolloSearchGate = composioProxyPermission('POST', 'https://api.apollo.io/api/v1/mixed_people/api_search', 'draft_safe');
assert.equal(apolloSearchGate.allowed, true);
assert.equal(apolloSearchGate.kind, 'read');
const phoneRevealGate = composioProxyPermission(
  'POST',
  'https://api.apollo.io/api/v1/people/bulk_match?reveal_phone_number=true',
  'draft_safe'
);
assert.equal(phoneRevealGate.allowed, false);
assert.match(phoneRevealGate.error, /Draft-safe mode/);

console.log('Composio routing tests passed');
