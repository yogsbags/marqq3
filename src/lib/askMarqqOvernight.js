/**
 * "Work on this overnight" — hands a chat ask to the agent deployment queue
 * instead of answering synchronously (mirrors src/lib/askMarqqChat.js conventions).
 */
import { apiFetch } from './apiFetch.js';
import { getActiveWorkspaceId } from './brandContext.js';

export async function queueOvernightAsk({ channel, message, agentName } = {}) {
  const workspaceId = getActiveWorkspaceId();
  if (!workspaceId || !message?.trim()) return { ok: false, error: 'message required' };
  try {
    const res = await apiFetch('/api/ask-marqq/queue-overnight', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, companyId: workspaceId, channel, message, agentName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok: false, error: data.error };
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
