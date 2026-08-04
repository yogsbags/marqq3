/** Client helpers for persisted brand / company context. */
import { getActiveWorkspaceId, LEGACY_WORKSPACE_ID } from './workspace.js';
import { apiFetch } from './apiFetch.js';

export const BRAND_CONTEXT_KEY = "marqq_brand_context";

export { getActiveWorkspaceId, LEGACY_WORKSPACE_ID } from './workspace.js';

/**
 * @deprecated Call getActiveWorkspaceId() — kept so older imports that
 * accidentally treat WORKSPACE_ID as a value still resolve at access time via getter.
 * Prefer: import { getActiveWorkspaceId } from '../lib/workspace'
 */
export function WORKSPACE_ID() {
  return getActiveWorkspaceId();
}

export function loadLocalBrandContext() {
  try {
    const raw = localStorage.getItem(BRAND_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Drop Brand DNA left over from a different workspace (e.g. Nouriva → Elevate).
    const activeWs = getActiveWorkspaceId();
    if (
      parsed?.workspaceId &&
      activeWs &&
      parsed.workspaceId !== activeWs &&
      activeWs !== LEGACY_WORKSPACE_ID
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocalBrandContext(patch) {
  const existing = loadLocalBrandContext() || {};
  const next = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(BRAND_CONTEXT_KEY, JSON.stringify(next));
  return next;
}

export function buildBrandContextFromOnboarding({
  companyName,
  website,
  niche,
  icp,
  outcome,
  timeWindow,
  target,
  baseline,
  brandTagline,
  toneOfVoice,
  voiceTranscript,
  kbFiles,
  logoUrl,
  groqData,
}) {
  return {
    workspaceId: getActiveWorkspaceId(),
    companyName,
    website,
    niche,
    icp,
    outcome,
    timeWindow,
    target,
    baseline,
    brandTagline,
    toneOfVoice,
    voiceTranscript: voiceTranscript || "",
    logoUrl: logoUrl || "",
    brandSummary: groqData?.brandSummary || "",
    positioningTags: groqData?.positioningTags || [],
    colors: groqData?.colors || [],
    fonts: groqData?.fonts || "",
    knowledgeFiles: Array.isArray(kbFiles) ? kbFiles : [],
  };
}

export async function persistBrandContext(context) {
  const withWs = { ...context, workspaceId: context.workspaceId || getActiveWorkspaceId() };
  const local = saveLocalBrandContext(withWs);
  try {
    const res = await apiFetch("/api/brand-dna/context", {
      method: "POST",
      body: JSON.stringify(withWs),
    });
    const json = await res.json().catch(() => ({}));
    if (json?.context) {
      saveLocalBrandContext(json.context);
      return json.context;
    }
  } catch {
    /* local still saved */
  }
  return local;
}

export async function fetchBrandContext() {
  const workspaceId = getActiveWorkspaceId();
  try {
    const res = await apiFetch(`/api/brand-dna/context?workspaceId=${encodeURIComponent(workspaceId)}`);
    const json = await res.json().catch(() => ({}));
    if (json?.context) {
      saveLocalBrandContext(json.context);
      return json.context;
    }
  } catch {
    /* fall through */
  }
  return loadLocalBrandContext();
}

export async function fetchKnowledgeFiles() {
  const workspaceId = getActiveWorkspaceId();
  try {
    const res = await apiFetch(
      `/api/brand-dna/knowledge-base?workspaceId=${encodeURIComponent(workspaceId)}`
    );
    const json = await res.json().catch(() => ({}));
    if (Array.isArray(json?.files)) return json.files;
  } catch {
    /* fall through */
  }
  const ctx = loadLocalBrandContext();
  return Array.isArray(ctx?.knowledgeFiles) ? ctx.knowledgeFiles : [];
}
