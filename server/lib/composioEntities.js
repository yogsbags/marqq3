/**
 * Composio entity (user_id) resolution.
 *
 * New workspaces must only see their own connected accounts.
 * Demo sharing (Nouriva / COMPOSIO_ENTITY_ALIASES) is opt-in via
 * COMPOSIO_SHARE_DEMO_ENTITIES=1 — never default for fresh signups.
 */

export const DEMO_COMPOSIO_ENTITY_ID = 'b08d3df3-c1a9-4632-96ec-e6e5b703c2a0';
export const LEGACY_COMPOSIO_ENTITIES = new Set(['marqq-ws-1', 'default']);

export function shareDemoComposioEntities() {
  const raw = String(process.env.COMPOSIO_SHARE_DEMO_ENTITIES || '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/**
 * @param {string} companyId Composio user_id / workspace id
 * @returns {string[]}
 */
export function resolveComposioEntityIds(companyId) {
  const primary = String(companyId || '').trim();
  const ids = new Set(primary ? [primary] : []);

  if (!shareDemoComposioEntities()) {
    return [...ids];
  }

  const raw = process.env.COMPOSIO_ENTITY_ALIASES || '';
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (id) ids.add(id);
  }
  if (!primary || LEGACY_COMPOSIO_ENTITIES.has(primary)) {
    ids.add(DEMO_COMPOSIO_ENTITY_ID);
  }
  return [...ids];
}
