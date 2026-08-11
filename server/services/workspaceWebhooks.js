import crypto from 'node:crypto';
import { getSupabaseAdminClient } from '../lib/supabase.js';

const SECRET_BYTES = 32;
const MASTER_KEY_ENV = 'WEBHOOK_ENCRYPTION_KEY';

function masterKey() {
  const configured = String(process.env[MASTER_KEY_ENV] || '').trim();
  if (configured) {
    const decoded = /^[0-9a-f]{64}$/i.test(configured)
      ? Buffer.from(configured, 'hex')
      : Buffer.from(configured, 'base64');
    if (decoded.length === 32) return decoded;
    throw new Error(`${MASTER_KEY_ENV} must decode to exactly 32 bytes`);
  }
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!serviceKey) throw new Error(`${MASTER_KEY_ENV} is required when Supabase is configured`);
  return crypto.createHash('sha256').update(`${serviceKey}:marqq-webhooks:v1`).digest();
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decryptSecret(value) {
  const [ivValue, tagValue, ciphertextValue] = String(value || '').split('.');
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error('Invalid encrypted webhook secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function endpointUrl(id, provider) {
  const base = String(process.env.PUBLIC_BASE_URL || process.env.APP_URL || '').replace(/\/$/, '');
  return `${base}/api/webhooks/${encodeURIComponent(provider)}/${encodeURIComponent(id)}`;
}

function normalizeProvider(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function normalizeRow(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    connectedAccountId: row.connected_account_id || null,
    events: Array.isArray(row.events) ? row.events : [],
    active: row.active !== false,
    createdAt: row.created_at,
    rotatedAt: row.rotated_at,
    lastSeenAt: row.last_seen_at,
    endpointUrl: endpointUrl(row.id, row.provider),
    secretMasked: '••••••••••••••••',
  };
}

export async function listWorkspaceWebhookEndpoints({ workspaceId, provider } = {}) {
  const client = getSupabaseAdminClient();
  if (!client) return [];
  let query = client.from('workspace_webhook_endpoints').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false });
  if (provider) query = query.eq('provider', normalizeProvider(provider));
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeRow);
}

export async function createOrRotateWorkspaceWebhookEndpoint({ workspaceId, provider, connectedAccountId = null, events = [] } = {}) {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('Supabase is not configured');
  const normalizedProvider = normalizeProvider(provider);
  if (!workspaceId || !normalizedProvider) throw new Error('workspaceId and provider are required');
  const secret = crypto.randomBytes(SECRET_BYTES).toString('base64url');
  const id = `whk_${crypto.randomBytes(12).toString('hex')}`;
  const now = new Date().toISOString();
  const { data, error } = await client
    .from('workspace_webhook_endpoints')
    .upsert({
      id,
      workspace_id: workspaceId,
      provider: normalizedProvider,
      // Empty string makes the provider-level endpoint unique when no
      // provider account has been selected yet (Postgres NULLs are distinct).
      connected_account_id: connectedAccountId ? String(connectedAccountId) : '',
      secret_ciphertext: encryptSecret(secret),
      secret_hash: hashSecret(secret),
      events: Array.isArray(events) ? events : [],
      active: true,
      rotated_at: now,
    }, { onConflict: 'workspace_id,provider,connected_account_id' })
    .select('*')
    .single();
  if (error) throw error;
  return { ...normalizeRow(data), secret, secretShownOnce: true };
}

export async function revealWorkspaceWebhookSecret({ workspaceId, endpointId } = {}) {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('Supabase is not configured');
  const { data, error } = await client.from('workspace_webhook_endpoints').select('*').eq('id', endpointId).eq('workspace_id', workspaceId).eq('active', true).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...normalizeRow(data), secret: decryptSecret(data.secret_ciphertext) };
}

export async function revokeWorkspaceWebhookEndpoint({ workspaceId, endpointId } = {}) {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('Supabase is not configured');
  const { data, error } = await client.from('workspace_webhook_endpoints').update({ active: false }).eq('id', endpointId).eq('workspace_id', workspaceId).select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function verifyWorkspaceWebhookSecret({ endpointId, provider, receivedSecret } = {}) {
  const client = getSupabaseAdminClient();
  if (!client || !endpointId || !receivedSecret) return null;
  const { data, error } = await client.from('workspace_webhook_endpoints').select('*').eq('id', endpointId).eq('provider', normalizeProvider(provider)).eq('active', true).maybeSingle();
  if (error || !data || !safeEqual(data.secret_hash, hashSecret(receivedSecret))) return null;
  await client.from('workspace_webhook_endpoints').update({ last_seen_at: new Date().toISOString() }).eq('id', endpointId);
  return { ...normalizeRow(data), workspaceId: data.workspace_id };
}

export async function recordWorkspaceWebhookEvent({ endpointId, workspaceId, provider, eventKey, payload } = {}) {
  const client = getSupabaseAdminClient();
  if (!client) return { duplicate: false, persisted: false };
  const { data, error } = await client.from('workspace_webhook_events').insert({
    endpoint_id: endpointId,
    workspace_id: workspaceId,
    provider: normalizeProvider(provider),
    event_key: String(eventKey || crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex')),
    payload: payload || {},
    status: 'received',
  }).select('id').maybeSingle();
  if (error?.code === '23505') return { duplicate: true, persisted: true };
  if (error) throw error;
  return { duplicate: false, persisted: Boolean(data) };
}
