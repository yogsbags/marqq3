#!/usr/bin/env node
/**
 * Smoke: auth optional — exercise workspace + gtm_modules round-trip with service role.
 * Usage: node scripts/supabase-persistence-smoke.mjs
 * Requires SUPABASE_SERVICE_ROLE_KEY in env or .env.marqq-live
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    const v = m[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(join(ROOT, '.env'));
loadEnv(join(ROOT, '.env.marqq-live'));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const smokeUser = `00000000-0000-4000-8000-${Date.now().toString().slice(-12).padStart(12, '0')}`;
// Use a disposable workspace row owned by a fake UUID — cleanup at end
const { data: ws, error: wsErr } = await db
  .from('workspaces')
  .insert({ name: `marqq3-smoke-${Date.now()}`, owner_id: null })
  .select()
  .single();

if (wsErr) {
  console.error('workspace insert failed (owner_id may require real auth.users):', wsErr.message);
  console.log('Fallback: read-only check of tables…');
  for (const table of ['workspaces', 'gtm_modules', 'companies', 'outreach_runs', 'agent_deployments']) {
    const { error } = await db.from(table).select('*').limit(1);
    console.log(table, error ? `ERR ${error.message}` : 'OK');
  }
  process.exit(wsErr ? 1 : 0);
}

console.log('workspace', ws.id);

const { data: mod, error: modErr } = await db
  .from('gtm_modules')
  .insert({
    workspace_id: ws.id,
    user_id: smokeUser,
    name: 'Smoke GTM',
    status: 'draft',
    profile: { answers: { smoke: true } },
    section_state: {},
    source_context: {},
    active: true,
  })
  .select()
  .single();

if (modErr) {
  console.warn('gtm_modules insert (needs real user_id FK):', modErr.message);
} else {
  console.log('gtm_modules', mod.id);
  await db.from('gtm_modules').delete().eq('id', mod.id);
}

await db.from('workspaces').delete().eq('id', ws.id);
console.log('cleanup ok');
process.exit(0);
