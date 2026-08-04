/**
 * Active workspace helpers — UUID from Supabase membership (cache in localStorage).
 */
import { apiFetch } from './apiFetch.js';

export const WORKSPACE_STORAGE_KEY = 'marqq_workspace_id';
export const ACTIVE_WORKSPACE_KEY = 'marqq_active_workspace';

/** Legacy shared entity — only for Composio fallbacks when no UUID yet. */
export const LEGACY_WORKSPACE_ID = 'marqq-ws-1';

export function getActiveWorkspaceId() {
  try {
    const id = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (id && id !== LEGACY_WORKSPACE_ID) return id;
    const raw = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) return parsed.id;
    }
  } catch {
    /* ignore */
  }
  return LEGACY_WORKSPACE_ID;
}

export function setActiveWorkspace(workspace) {
  if (!workspace?.id) return;
  const prevId = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace.id);
  localStorage.setItem(
    ACTIVE_WORKSPACE_KEY,
    JSON.stringify({
      id: workspace.id,
      name: workspace.name || '',
      website_url: workspace.website_url || '',
      role: workspace.role || 'owner',
    })
  );
  // Switching workspaces — drop session strategy/chat seeds so Ask Marqq
  // does not keep another brand's market analysis (e.g. Nouriva → Elevate).
  if (prevId && prevId !== workspace.id) {
    try {
      for (const key of ['marqq_gtm_wizard', 'marqq_gtm_strategy', 'marqq_gtm_briefs_complete', 'marqq_ask_context']) {
        sessionStorage.removeItem(key);
      }
      const brandRaw = localStorage.getItem('marqq_brand_context');
      if (brandRaw) {
        const brand = JSON.parse(brandRaw);
        if (brand?.workspaceId && brand.workspaceId !== workspace.id) {
          localStorage.removeItem('marqq_brand_context');
        }
      }
    } catch {
      /* ignore */
    }
  }
}

export function getActiveWorkspaceMeta() {
  try {
    const raw = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Ensure the signed-in user has a workspace; auto-provisions on first call.
 * Returns the active workspace object or null.
 */
export async function ensureUserWorkspace() {
  try {
    const res = await apiFetch('/api/workspaces');
    if (!res.ok) {
      console.warn('[workspace] list failed', res.status);
      return null;
    }
    const json = await res.json();
    const list = Array.isArray(json.workspaces) ? json.workspaces : [];
    if (!list.length) return null;

    const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    const found = stored ? list.find((w) => w.id === stored) : null;
    const active = found || list[0];
    setActiveWorkspace(active);
    return active;
  } catch (err) {
    console.warn('[workspace] ensure failed', err);
    return null;
  }
}

/** @deprecated Use getActiveWorkspaceId — kept for gradual migration. */
export const WORKSPACE_ID = LEGACY_WORKSPACE_ID;
