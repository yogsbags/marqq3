import { apiFetch } from './apiFetch.js';
import { getActiveWorkspaceId } from './brandContext.js';

const ACTIVE_MODULE_KEY = 'marqq_active_gtm_module_id';

function activeModuleId() {
  try {
    return localStorage.getItem(ACTIVE_MODULE_KEY) || 'active';
  } catch {
    return 'active';
  }
}

export function isPersistableAskMessage(m) {
  if (!m?.text?.trim()) return false;
  if (m.sender === 'You') return true;
  if (m.sender !== 'Marqq') return false;
  if (['Thinking', 'Ready', 'Section context', 'Attachment'].includes(m.confidence)) return false;
  return true;
}

export async function fetchAskMarqqChat(channel, { moduleId } = {}) {
  const workspaceId = getActiveWorkspaceId();
  if (!workspaceId || !channel) return { ok: false, messages: [] };
  const mod = moduleId || activeModuleId();
  const qs = new URLSearchParams({
    workspaceId,
    channel,
    moduleId: mod,
  });
  try {
    const res = await apiFetch(`/api/ask-marqq/chat?${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok: false, messages: [], error: data.error };
    return {
      ok: true,
      messages: data.conversation?.messages || [],
      conversationId: data.conversation?.id,
      provider: data.provider,
    };
  } catch (err) {
    return { ok: false, messages: [], error: err.message };
  }
}

export async function persistAskMarqqMessages(channel, messages, { moduleId } = {}) {
  const workspaceId = getActiveWorkspaceId();
  if (!workspaceId || !channel) return { ok: false };
  const durable = (messages || []).filter(isPersistableAskMessage);
  if (!durable.length) return { ok: true, skipped: true };
  const mod = moduleId || activeModuleId();
  try {
    const res = await apiFetch('/api/ask-marqq/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        channel,
        moduleId: mod,
        messages: durable,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok: false, error: data.error };
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Merge seed/welcome rows with persisted turns (persisted wins for durable chat). */
export function mergeSeedWithPersisted(seedMessages = [], persisted = []) {
  const seeds = Array.isArray(seedMessages) ? seedMessages : [];
  const saved = (Array.isArray(persisted) ? persisted : []).filter(isPersistableAskMessage);
  if (!saved.length) return seeds;
  const header = seeds.filter(
    (m) => m.confidence === 'Ready' || m.confidence === 'Section context' || m.id?.toString?.().startsWith?.('welcome')
  );
  return [...header, ...saved];
}
