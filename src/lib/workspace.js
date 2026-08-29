/**
 * Active workspace helpers — UUID from Supabase membership (cache in localStorage).
 */
import { apiFetch } from './apiFetch.js';

export const WORKSPACE_STORAGE_KEY = 'marqq_workspace_id';
export const ACTIVE_WORKSPACE_KEY = 'marqq_active_workspace';
export const WORKSPACE_CHANGED_EVENT = 'marqq:workspace-changed';

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
  // does not keep another brand's market analysis when switching workspaces.
  if (prevId && prevId !== workspace.id) {
    try {
      for (const key of ['marqq_gtm_wizard', 'marqq_gtm_strategy', 'marqq_gtm_briefs_complete', 'marqq_ask_context']) {
        sessionStorage.removeItem(key);
      }
      // Onboarding fields are legacy browser caches. Never let the previous
      // workspace become the visible fallback while the new workspace loads.
      for (const key of ['marqq_ob_companyName', 'marqq_ob_website', 'marqq_ob_tagline', 'marqq_ob_tone', 'marqq_ob_niche', 'marqq_ob_icp', 'marqq_ob_customerType', 'marqq_ob_audienceIndustry', 'marqq_ob_buyerRole', 'marqq_ob_companySize', 'marqq_ob_audienceLocation', 'marqq_ob_audienceProblem', 'marqq_ob_audienceNotes', 'marqq_ob_outcome', 'marqq_ob_timeWindow', 'marqq_ob_target', 'marqq_ob_baseline', 'marqq_brand_context']) {
        localStorage.removeItem(key);
      }
    } catch {
      /* ignore */
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WORKSPACE_CHANGED_EVENT, { detail: workspace }));
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
export async function ensureUserWorkspace({ name = 'My workspace', websiteUrl = null } = {}) {
  try {
    const res = await apiFetch('/api/workspaces');
    if (!res.ok) {
      console.warn('[workspace] list failed', res.status);
      return null;
    }
    const json = await res.json();
    const list = Array.isArray(json.workspaces) ? json.workspaces : [];
    if (!list.length) {
      // The server normally provisions the first workspace during GET. Keep a
      // client-side recovery path for older/local deployments where that
      // compatibility behavior is unavailable or the response is empty.
      const create = await apiFetch('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: String(name || 'My workspace').trim() || 'My workspace', website_url: websiteUrl || null }),
      });
      const created = await create.json().catch(() => ({}));
      if (!create.ok || !created.workspace?.id) {
        console.warn('[workspace] create fallback failed', create.status, created.error || 'unknown error');
        return null;
      }
      setActiveWorkspace(created.workspace);
      return created.workspace;
    }

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

export function isUuidWorkspaceId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

/** @deprecated Use getActiveWorkspaceId — kept for gradual migration. */
export const WORKSPACE_ID = LEGACY_WORKSPACE_ID;
