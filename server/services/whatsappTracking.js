/**
 * WhatsApp delivery status + inbound reply tracking.
 * Primary path: Meta Cloud API webhook (statuses + messages).
 * Optional: Composio poll trigger WHATSAPP_MESSAGE_STATUS_UPDATED_TRIGGER.
 */

import { executeComposioAction } from './composio.js';

/** @type {Map<string, object>} message_id → tracking row */
const byMessageId = new Map();
/** @type {Map<string, object[]>} runId → status events */
const eventsByRun = new Map();
/** Inbound WhatsApp replies (run-linked when phone matches a prospect) */
const inboundReplies = [];

function pushRunEvent(runId, event) {
  if (!runId) return;
  const list = eventsByRun.get(runId) || [];
  list.unshift(event);
  eventsByRun.set(runId, list.slice(0, 200));
}

export function registerWhatsAppSend({
  runId,
  prospectId,
  companyId,
  messageId,
  toNumber,
  templateName = null,
  phoneNumberId = null,
} = {}) {
  const id = String(messageId || '').trim();
  if (!id) return null;
  const row = {
    message_id: id,
    run_id: runId || null,
    prospect_id: prospectId || null,
    company_id: companyId || null,
    to_number: String(toNumber || '').replace(/[^\d]/g, ''),
    template_name: templateName || null,
    phone_number_id: phoneNumberId || null,
    delivery_status: 'sent',
    status_history: [{ status: 'sent', at: new Date().toISOString() }],
    updated_at: new Date().toISOString(),
  };
  byMessageId.set(id, row);
  pushRunEvent(runId, { type: 'sent', ...row });
  return row;
}

export function getWhatsAppStatus(messageId) {
  return byMessageId.get(String(messageId || '')) || null;
}

export function listWhatsAppStatusesForRun(runId) {
  const events = eventsByRun.get(runId) || [];
  const latestByMsg = new Map();
  for (const e of events) {
    const mid = e.message_id;
    if (mid && !latestByMsg.has(mid)) latestByMsg.set(mid, e);
  }
  return {
    statuses: [...latestByMsg.values()],
    events: events.slice(0, 50),
    inbound: inboundReplies.filter((r) => r.run_id === runId).slice(0, 50),
  };
}

function applyStatusUpdate({
  messageId,
  status,
  timestamp,
  recipientId,
  errors,
  conversation,
  pricing,
  raw,
}) {
  const id = String(messageId || '').trim();
  if (!id || !status) return null;
  const existing = byMessageId.get(id) || {
    message_id: id,
    run_id: null,
    prospect_id: null,
    to_number: String(recipientId || '').replace(/[^\d]/g, ''),
    delivery_status: 'unknown',
    status_history: [],
  };
  const at = timestamp
    ? new Date(Number(timestamp) * (String(timestamp).length <= 10 ? 1000 : 1)).toISOString()
    : new Date().toISOString();
  existing.delivery_status = status;
  existing.status_history = [...(existing.status_history || []), { status, at, errors: errors || null }];
  existing.updated_at = at;
  if (recipientId) existing.to_number = String(recipientId).replace(/[^\d]/g, '');
  if (conversation) existing.conversation = conversation;
  if (pricing) existing.pricing = pricing;
  existing.last_raw = raw || null;
  byMessageId.set(id, existing);
  pushRunEvent(existing.run_id, { type: 'status', ...existing });
  return existing;
}

/**
 * Process Meta Cloud API webhook body (entry[].changes[].value.statuses|messages)
 * and flattened / Composio trigger payloads.
 */
export function handleWhatsAppWebhookPayload(payload = {}, { resolveProspectByPhone } = {}) {
  const results = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : null;

  if (entries) {
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change.value || {};
        if (change.field && change.field !== 'messages') continue;
        const phoneNumberId = value.metadata?.phone_number_id || value.phone_number_id || null;

        for (const st of Array.isArray(value.statuses) ? value.statuses : []) {
          const updated = applyStatusUpdate({
            messageId: st.id,
            status: st.status,
            timestamp: st.timestamp,
            recipientId: st.recipient_id,
            errors: st.errors,
            conversation: st.conversation,
            pricing: st.pricing,
            raw: st,
          });
          results.push({ kind: 'status', status: updated?.delivery_status || st.status, message_id: st.id });
        }

        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        for (const msg of Array.isArray(value.messages) ? value.messages : []) {
          if (msg.type && msg.type !== 'text' && !msg.text?.body && !msg.button?.text) {
            results.push({ kind: 'inbound', status: 'ignored', reason: `unsupported_type:${msg.type}`, id: msg.id });
            continue;
          }
          const from = msg.from || contacts[0]?.wa_id || '';
          const text =
            msg.text?.body ||
            msg.button?.text ||
            msg.interactive?.button_reply?.title ||
            msg.interactive?.list_reply?.title ||
            '';
          const linked = typeof resolveProspectByPhone === 'function' ? resolveProspectByPhone(from) : null;
          const reply = {
            id: msg.id || `wa-${from}-${msg.timestamp || Date.now()}`,
            provider: 'whatsapp',
            channel: 'whatsapp',
            from,
            phone: from,
            phone_number_id: phoneNumberId,
            body: text,
            received_at: msg.timestamp
              ? new Date(Number(msg.timestamp) * 1000).toISOString()
              : new Date().toISOString(),
            run_id: linked?.runId || null,
            prospect_id: linked?.prospectId || null,
            prospect_name: linked?.prospectName || null,
          };
          inboundReplies.unshift(reply);
          if (inboundReplies.length > 500) inboundReplies.length = 500;
          if (linked?.runId) pushRunEvent(linked.runId, { type: 'inbound', ...reply });
          results.push({ kind: 'inbound', status: 'recorded', id: reply.id, run_id: reply.run_id });
        }
      }
    }
    return {
      ok: true,
      status: results.some((r) => r.status === 'recorded' || r.kind === 'status')
        ? 'processed'
        : results[0]?.status || 'ignored',
      results,
    };
  }

  // Composio trigger / flattened payloads
  const messageId =
    payload.message_id ||
    payload.messageId ||
    payload.id ||
    payload.wamid ||
    payload.data?.message_id ||
    payload.data?.id;
  const status =
    payload.status ||
    payload.delivery_status ||
    payload.message_status ||
    payload.data?.status;
  if (messageId && status) {
    const updated = applyStatusUpdate({
      messageId,
      status,
      timestamp: payload.timestamp || payload.data?.timestamp,
      recipientId: payload.recipient_id || payload.to || payload.phone,
      errors: payload.errors,
      raw: payload,
    });
    return { ok: true, status: 'processed', results: [{ kind: 'status', ...updated }] };
  }

  return { ok: true, status: 'ignored', results: [] };
}

/**
 * Best-effort poll of Composio status trigger (may be unavailable depending on toolkit version).
 */
export async function pollWhatsAppMessageStatusTrigger(companyId) {
  const res = await executeComposioAction(
    'WHATSAPP_MESSAGE_STATUS_UPDATED_TRIGGER',
    {},
    companyId,
    'whatsapp'
  );
  if (res.error) {
    return {
      ok: false,
      error: res.error,
      hint: 'Prefer Meta webhook → /api/webhooks/whatsapp for delivery updates (sent/delivered/read/failed)',
    };
  }
  const payloads = Array.isArray(res.result) ? res.result : res.result ? [res.result] : [];
  const applied = [];
  for (const p of payloads) {
    const out = handleWhatsAppWebhookPayload(p);
    applied.push(out);
  }
  return { ok: true, polled: payloads.length, applied };
}

export function listRecentInboundReplies({ runId = null, limit = 50 } = {}) {
  const list = runId ? inboundReplies.filter((r) => r.run_id === runId) : inboundReplies;
  return list.slice(0, limit);
}
