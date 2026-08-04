/**
 * Ask Marqq chat persistence — conversations + messages.
 * Supabase when workspace UUID + userId; otherwise FS fallback.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabaseWriteClient, getSupabaseReadClient } from '../lib/supabase.js';
import { useSupabasePersistence, isUuidWorkspace } from '../lib/persistence.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FS_PATH = join(__dirname, '../data/ask-marqq-chats.json');

export function askChannelId(channel, moduleId = 'active') {
  const ch = String(channel || 'general').trim() || 'general';
  const mod = String(moduleId || 'active').trim() || 'active';
  return `ask-marqq:${mod}:${ch}`;
}

function writeClient() {
  if (!useSupabasePersistence()) return null;
  return getSupabaseWriteClient();
}

function readClient() {
  if (!useSupabasePersistence()) return null;
  return getSupabaseReadClient();
}

function ensureFs() {
  mkdirSync(dirname(FS_PATH), { recursive: true });
  if (!existsSync(FS_PATH)) writeFileSync(FS_PATH, JSON.stringify({ conversations: {} }, null, 2));
}

function loadFs() {
  ensureFs();
  try {
    return JSON.parse(readFileSync(FS_PATH, 'utf8'));
  } catch {
    return { conversations: {} };
  }
}

function saveFs(data) {
  ensureFs();
  writeFileSync(FS_PATH, JSON.stringify(data, null, 2));
}

function fsKey(workspaceId, userId, channelId) {
  return `${workspaceId}::${userId || 'anon'}::${channelId}`;
}

function encodeMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  try {
    return JSON.stringify({ meta });
  } catch {
    return null;
  }
}

function decodeMeta(reasoning) {
  if (!reasoning) return {};
  try {
    const parsed = JSON.parse(reasoning);
    return parsed?.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
  } catch {
    return {};
  }
}

function toUiMessage(row) {
  const meta = decodeMeta(row.reasoning);
  const isUser = row.sender === 'user';
  return {
    id: row.id,
    sender: isUser ? 'You' : 'Marqq',
    time: row.created_at ? new Date(row.created_at).toLocaleString() : 'Earlier',
    text: row.content || '',
    confidence: meta.confidence || (isUser ? undefined : 'Saved'),
    sources: meta.sources || undefined,
    attachments: meta.attachments || undefined,
    revision: meta.revision || null,
    revisionApplied: Boolean(meta.revisionApplied),
    sectionId: meta.sectionId || undefined,
    persisted: true,
  };
}

function isPersistableUiMessage(m) {
  if (!m?.text?.trim()) return false;
  if (m.sender === 'You') return true;
  if (m.sender !== 'Marqq') return false;
  if (['Thinking', 'Ready', 'Section context', 'Attachment'].includes(m.confidence)) return false;
  return true;
}

export function uiMessageToRow(m) {
  const sender = m.sender === 'You' ? 'user' : 'ai';
  return {
    sender,
    content: String(m.text || ''),
    meta: {
      confidence: m.confidence,
      sources: m.sources,
      attachments: m.attachments,
      revision: m.revision || null,
      revisionApplied: Boolean(m.revisionApplied),
      sectionId: m.sectionId,
      uiSender: m.sender,
    },
  };
}

async function ensureConversationFs({ workspaceId, userId, channelId, name }) {
  const data = loadFs();
  if (!data.conversations) data.conversations = {};
  const key = fsKey(workspaceId, userId, channelId);
  let conv = data.conversations[key];
  if (!conv) {
    const now = new Date().toISOString();
    conv = {
      id: randomUUID(),
      workspace_id: workspaceId,
      user_id: userId || null,
      channel_id: channelId,
      name: name || channelId,
      created_at: now,
      last_message_at: now,
      messages: [],
    };
    data.conversations[key] = conv;
    saveFs(data);
  }
  return conv;
}

async function ensureConversationDb({ workspaceId, userId, channelId, name }) {
  const db = writeClient();
  if (!db || !isUuidWorkspace(workspaceId) || !userId) return null;

  const { data: existing, error: findErr } = await db
    .from('conversations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('channel_id', channelId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) {
    console.warn('[ask-marqq] find conversation:', findErr.message);
    return null;
  }
  if (existing) return existing;

  const { data, error } = await db
    .from('conversations')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      channel_id: channelId,
      name: name || channelId,
      last_message_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) {
    console.warn('[ask-marqq] create conversation:', error.message);
    return null;
  }
  return data;
}

export async function loadAskMarqqChat({
  workspaceId,
  userId = null,
  channel,
  moduleId = 'active',
} = {}) {
  if (!workspaceId || !channel) return { ok: false, error: 'workspaceId and channel required' };
  const channelId = askChannelId(channel, moduleId);

  const db = readClient();
  if (db && isUuidWorkspace(workspaceId) && userId) {
    try {
      const { data: conv, error } = await db
        .from('conversations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .eq('channel_id', channelId)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (conv) {
        const { data: msgs, error: msgErr } = await db
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true });
        if (msgErr) throw msgErr;
        return {
          ok: true,
          provider: 'supabase',
          conversation: {
            id: conv.id,
            workspaceId,
            channelId,
            name: conv.name,
            messages: (msgs || []).map(toUiMessage),
          },
        };
      }
    } catch (err) {
      console.warn('[ask-marqq] load supabase failed, trying FS:', err.message);
    }
  }

  const conv = await ensureConversationFs({ workspaceId, userId, channelId, name: `#${channel}` });
  return {
    ok: true,
    provider: 'fs',
    conversation: {
      id: conv.id,
      workspaceId,
      channelId,
      name: conv.name,
      messages: (conv.messages || []).map(toUiMessage),
    },
  };
}

export async function appendAskMarqqMessages({
  workspaceId,
  userId = null,
  channel,
  moduleId = 'active',
  messages = [],
} = {}) {
  if (!workspaceId || !channel) return { ok: false, error: 'workspaceId and channel required' };
  const channelId = askChannelId(channel, moduleId);
  const rowsIn = (Array.isArray(messages) ? messages : [])
    .map((m) => {
      if (m.sender === 'You' || m.sender === 'Marqq') return uiMessageToRow(m);
      if (m.sender === 'user' || m.sender === 'ai') {
        return { sender: m.sender, content: String(m.content || m.text || ''), meta: m.meta || {} };
      }
      return null;
    })
    .filter((m) => m && String(m.content || '').trim());

  if (!rowsIn.length) return { ok: true, appended: 0, skipped: true };

  const now = new Date().toISOString();
  const db = writeClient();

  if (db && isUuidWorkspace(workspaceId) && userId) {
    try {
      const conv = await ensureConversationDb({
        workspaceId,
        userId,
        channelId,
        name: `#${channel}`,
      });
      if (!conv) throw new Error('conversation unavailable');

      const inserts = rowsIn.map((m) => ({
        conversation_id: conv.id,
        workspace_id: workspaceId,
        user_id: userId,
        content: m.content,
        reasoning: encodeMeta(m.meta),
        sender: m.sender,
        created_at: now,
      }));

      const { data: inserted, error } = await db.from('messages').insert(inserts).select('*');
      if (error) throw error;

      await db
        .from('conversations')
        .update({ last_message_at: now })
        .eq('id', conv.id);

      return {
        ok: true,
        provider: 'supabase',
        conversationId: conv.id,
        appended: inserted?.length || inserts.length,
        messages: (inserted || []).map(toUiMessage),
      };
    } catch (err) {
      console.warn('[ask-marqq] append supabase failed, using FS:', err.message);
    }
  }

  const conv = await ensureConversationFs({ workspaceId, userId, channelId, name: `#${channel}` });
  const data = loadFs();
  const key = fsKey(workspaceId, userId, channelId);
  const stored = data.conversations[key] || conv;
  const added = rowsIn.map((m) => ({
    id: randomUUID(),
    conversation_id: stored.id,
    workspace_id: workspaceId,
    user_id: userId,
    content: m.content,
    reasoning: encodeMeta(m.meta),
    sender: m.sender,
    created_at: now,
  }));
  stored.messages = [...(stored.messages || []), ...added];
  stored.last_message_at = now;
  data.conversations[key] = stored;
  saveFs(data);

  return {
    ok: true,
    provider: 'fs',
    conversationId: stored.id,
    appended: added.length,
    messages: added.map(toUiMessage),
  };
}

export { isPersistableUiMessage };
