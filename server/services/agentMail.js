/**
 * AgentMail bridge for proactive, draft-safe agent workflows.
 * Email is an event transport: replies become durable deployments, never
 * direct live actions.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, updateDb } from '../db.js';
import { ensureAgentCollections } from './agentOsStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://api.agentmail.to/v0';
const STATE_FILE = join(__dirname, '../data/agentmail-suggestions.json');

const AUTOMATIONS = {
  ga4: [
    { name: 'Weekly traffic report', agentName: 'maya', sectionId: 'measurement_optimization', openScreen: 'analytics', recurrenceMinutes: 10080 },
    { name: 'Daily traffic anomaly alert', agentName: 'maya', sectionId: 'measurement_optimization', openScreen: 'analytics', recurrenceMinutes: 1440 },
  ],
  gsc: [
    { name: 'Weekly SEO digest', agentName: 'maya', sectionId: 'market_analysis', openScreen: 'market', recurrenceMinutes: 10080 },
    { name: 'Daily rank-change alert', agentName: 'maya', sectionId: 'market_analysis', openScreen: 'market', recurrenceMinutes: 1440 },
  ],
  hubspot: [
    { name: 'Weekly deals report', agentName: 'arjun', sectionId: 'sales_strategy', openScreen: 'outreach', recurrenceMinutes: 10080 },
    { name: 'Monthly revenue intelligence', agentName: 'arjun', sectionId: 'sales_strategy', openScreen: 'outreach', recurrenceMinutes: 43200 },
  ],
  google_ads: [
    { name: 'Weekly campaign performance', agentName: 'zara', sectionId: 'marketing_strategy', openScreen: 'campaigns', recurrenceMinutes: 10080 },
    { name: 'Daily budget alert', agentName: 'zara', sectionId: 'marketing_strategy', openScreen: 'campaigns', recurrenceMinutes: 1440 },
  ],
};

function apiKey() {
  return String(process.env.AGENTMAIL_API_KEY || '').trim();
}

async function agentMailFetch(path, init = {}) {
  const key = apiKey();
  if (!key) throw new Error('AGENTMAIL_API_KEY is not configured');
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`AgentMail request failed: ${response.status} ${(await response.text()).slice(0, 240)}`);
  return response.status === 204 ? null : response.json();
}

async function readSuggestions() {
  try { return JSON.parse(await readFile(STATE_FILE, 'utf8')); } catch { return {}; }
}

async function writeSuggestions(value) {
  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(value, null, 2), 'utf8');
}

async function ensureInbox(workspaceId) {
  const list = await agentMailFetch('/inboxes');
  const items = list?.inboxes || list?.items || list?.data || [];
  const clientId = `marqq-${workspaceId}`;
  const existing = items.find((item) => item.client_id === clientId || item.clientId === clientId);
  if (existing?.inbox_id) return existing;
  return agentMailFetch('/inboxes', {
    method: 'POST',
    body: JSON.stringify({ display_name: `Marqq ${String(workspaceId).slice(0, 8)}`, client_id: clientId }),
  });
}

function connectorLabel(id) {
  return String(id || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getSuggestedAutomations(connectorId) {
  return (AUTOMATIONS[String(connectorId || '').toLowerCase()] || []).map((item, index) => ({ ...item, id: index + 1 }));
}

export async function sendIntegrationSuggestionEmail({ connectorId, workspaceId, userEmail, userName = '' } = {}) {
  const automations = getSuggestedAutomations(connectorId);
  if (!apiKey() || !userEmail || !automations.length) return { sent: false, reason: 'not_configured_or_no_suggestions' };
  const inbox = await ensureInbox(workspaceId);
  const name = userName ? ` ${String(userName).split(' ')[0]}` : '';
  const lines = automations.map((a) => `${a.id}. ${a.name} · every ${a.recurrenceMinutes >= 43200 ? 'month' : a.recurrenceMinutes >= 10080 ? 'week' : 'day'}`).join('\n');
  const result = await agentMailFetch(`/inboxes/${encodeURIComponent(inbox.inbox_id)}/messages/send`, {
    method: 'POST',
    body: JSON.stringify({
      to: [userEmail],
      subject: `${connectorLabel(connectorId)} is connected — choose Marqq automations`,
      text: `Hi${name},\n\nYour ${connectorLabel(connectorId)} connection is live. Reply with the numbers to activate, or reply “all”.\n\n${lines}\n\nMarqq will keep the runs draft-safe and ask for approval before live actions.`,
    }),
  });
  const threadId = result?.thread_id || result?.message_id || randomUUID();
  const suggestions = await readSuggestions();
  const record = { workspaceId, connectorId, userEmail, userName, inboxId: inbox.inbox_id, threadId, automations, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() };
  suggestions[`${inbox.inbox_id}/${threadId}`] = record;
  suggestions[`inbox/${inbox.inbox_id}`] = record;
  await writeSuggestions(suggestions);
  return { sent: true, inboxId: inbox.inbox_id, threadId, count: automations.length };
}

function parseReply(text) {
  const value = String(text || '').toLowerCase();
  if (/\b(all|yes|everything|activate all|schedule all)\b/.test(value)) return null;
  return [...new Set([...value.matchAll(/\b([1-9]\d?)\b/g)].map((m) => Number(m[1])).filter((n) => n > 0 && n <= 20))];
}

export async function handleAgentMailInbound(payload = {}) {
  const { from, text, html, subject, inbox_id: inboxId, thread_id: threadId, message_id: messageId } = payload;
  if (!from || !(text || html)) return { ignored: true, reason: 'missing from/text' };
  const suggestions = await readSuggestions();
  const pending = (threadId && suggestions[`${inboxId}/${threadId}`]) || suggestions[`inbox/${inboxId}`];
  if (!pending) return { handled: false, reason: 'no_pending_suggestion' };
  const selectedIds = parseReply(text || html);
  const selected = selectedIds === null ? pending.automations : (selectedIds || []).map((id) => pending.automations.find((a) => a.id === id)).filter(Boolean);
  if (!selected.length) return { handled: false, reason: 'no_automation_selection' };
  const created = [];
  updateDb((state) => {
    const next = ensureAgentCollections(state);
    const now = new Date().toISOString();
    const entries = selected.map((automation) => ({
      id: `dep_mail_${randomUUID().slice(0, 10)}`,
      agentName: automation.agentName,
      agentDisplayName: automation.agentName,
      workspaceId: pending.workspaceId,
      companyId: pending.workspaceId,
      sectionId: automation.sectionId,
      sectionTitle: automation.name,
      summary: `Proactive ${automation.name} requested by email reply from ${from}.`,
      bullets: [`Source connector: ${pending.connectorId}`, `Email thread: ${threadId || messageId || 'unknown'}`],
      openScreen: automation.openScreen,
      scheduleMode: 'recurring',
      recurrenceMinutes: automation.recurrenceMinutes,
      deliveryMode: 'draft',
      status: 'pending',
      createdAt: now,
      scheduledFor: now,
      runCount: 0,
      triggeredBy: 'agentmail_reply',
    }));
    created.push(...entries);
    return { ...next, agent_deployments: [...entries, ...next.agent_deployments] };
  });
  return { handled: true, type: 'automation_activation', workspaceId: pending.workspaceId, scheduled: created.map(({ id, sectionTitle }) => ({ id, name: sectionTitle })) };
}

export function verifyAgentMailWebhook(req) {
  const secret = String(process.env.AGENTMAIL_WEBHOOK_SECRET || '').trim();
  return !secret || String(req.headers['x-agentmail-signature'] || '') === secret;
}
