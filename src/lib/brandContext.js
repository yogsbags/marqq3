/** Client helpers for persisted brand / company context. */

export const BRAND_CONTEXT_KEY = "marqq_brand_context";
export const WORKSPACE_ID = "marqq-ws-1";

export function loadLocalBrandContext() {
  try {
    const raw = localStorage.getItem(BRAND_CONTEXT_KEY);
    return raw ? JSON.parse(raw) : null;
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
    workspaceId: WORKSPACE_ID,
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
  const local = saveLocalBrandContext(context);
  try {
    const res = await fetch("/api/brand-dna/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context),
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
  try {
    const res = await fetch(`/api/brand-dna/context?workspaceId=${encodeURIComponent(WORKSPACE_ID)}`);
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
  try {
    const res = await fetch(
      `/api/brand-dna/knowledge-base?workspaceId=${encodeURIComponent(WORKSPACE_ID)}`
    );
    const json = await res.json().catch(() => ({}));
    if (Array.isArray(json?.files)) return json.files;
  } catch {
    /* fall through */
  }
  const ctx = loadLocalBrandContext();
  return Array.isArray(ctx?.knowledgeFiles) ? ctx.knowledgeFiles : [];
}
