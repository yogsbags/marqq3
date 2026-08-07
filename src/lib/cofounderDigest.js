/**
 * Co-founder digest — fetch helpers (mirrors src/lib/askMarqqChat.js conventions).
 */
import { apiFetch } from './apiFetch.js';

export async function fetchLatestDigest(workspaceId) {
  if (!workspaceId) return { ok: false, digest: null };
  try {
    const qs = new URLSearchParams({ workspaceId });
    const res = await apiFetch(`/api/cofounder-digest/latest?${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok: false, digest: null, error: data.error };
    return { ok: true, digest: data.digest || null, migrationPending: Boolean(data.migrationPending) };
  } catch (err) {
    return { ok: false, digest: null, error: err.message };
  }
}

export async function generateDigestNow(workspaceId, { force = false } = {}) {
  if (!workspaceId) return { ok: false };
  try {
    const res = await apiFetch('/api/cofounder-digest/generate', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, force }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok: false, error: data.error };
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function markDigestRead(digestId) {
  if (!digestId) return { ok: false };
  try {
    const res = await apiFetch('/api/cofounder-digest/read', {
      method: 'POST',
      body: JSON.stringify({ digestId }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok !== false };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
