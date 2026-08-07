#!/usr/bin/env node
/**
 * Direct Postgres admin connection — for DDL that the Supabase JS client
 * (PostgREST) cannot do: CREATE TABLE, ALTER PUBLICATION, RLS policies, etc.
 *
 * Loads connection parts (not a single connection string) from
 * .env / .env.marqq-live, because the DB password contains characters
 * (# and $) that break naive URI parsing unless percent-encoded.
 *
 * Exports a `withClient(fn)` helper so callers never have to touch the
 * password directly, and a CLI mode: `node scripts/db-admin.mjs "<sql>"`
 * for one-off statements (used interactively, not committed anywhere).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

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

function resolveConfig() {
  const { SUPABASE_DB_HOST, SUPABASE_DB_PORT, SUPABASE_DB_NAME, SUPABASE_DB_USER, SUPABASE_DB_PASSWORD } = process.env;
  if (!SUPABASE_DB_HOST || !SUPABASE_DB_PASSWORD) {
    throw new Error('Missing SUPABASE_DB_HOST / SUPABASE_DB_PASSWORD (see .env.marqq-live)');
  }
  return {
    host: SUPABASE_DB_HOST,
    port: Number(SUPABASE_DB_PORT || 5432),
    database: SUPABASE_DB_NAME || 'postgres',
    user: SUPABASE_DB_USER || 'postgres',
    password: SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  };
}

export async function withClient(fn) {
  const client = new pg.Client(resolveConfig());
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// CLI mode: node scripts/db-admin.mjs "SELECT 1"
if (import.meta.url === `file://${process.argv[1]}`) {
  const sql = process.argv[2];
  if (!sql) {
    console.error('Usage: node scripts/db-admin.mjs "<sql statement>"');
    process.exit(1);
  }
  withClient(async (client) => {
    const result = await client.query(sql);
    console.log(JSON.stringify({ rowCount: result.rowCount, rows: result.rows }, null, 2));
  }).catch((err) => {
    console.error('DB admin query failed:', err.message);
    process.exit(1);
  });
}
