/**
 * Agent report card — fetch helpers for AgentsHub.jsx (mirrors
 * src/lib/cofounderDigest.js conventions).
 */
import { apiFetch } from './apiFetch.js';

export async function fetchWorkspaceReportCards(workspaceId) {
  if (!workspaceId) return { ok: false, cards: {} };
  try {
    const res = await apiFetch(`/api/agents/report-cards?workspaceId=${encodeURIComponent(workspaceId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok: false, cards: {}, error: data.error };
    return { ok: true, cards: data.cards || {} };
  } catch (err) {
    return { ok: false, cards: {}, error: err.message };
  }
}

export async function fetchAgentInstructions(workspaceId, agentName) {
  if (!workspaceId || !agentName) return { ok: false, instructions: null };
  try {
    const qs = new URLSearchParams({ workspaceId, agentName });
    const res = await apiFetch(`/api/agents/instructions?${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok: false, instructions: null, error: data.error };
    return { ok: true, instructions: data.instructions || null };
  } catch (err) {
    return { ok: false, instructions: null, error: err.message };
  }
}
