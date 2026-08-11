/**
 * Dedicated Marqq background worker.
 *
 * The API process serves HTTP only. This process owns durable deployment,
 * outreach, digest, and self-review schedulers so API replicas cannot compete
 * for background work.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDeploymentScheduler } from './services/agentScheduler.js';
import { startCofounderDigestScheduler } from './services/cofounderDigestScheduler.js';
import { startAgentSelfReviewScheduler } from './services/agentSelfReviewScheduler.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(filePath, { overwrite = true } = {}) {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    if (!overwrite && process.env[key]) continue;
    process.env[key] = value;
  }
}

loadEnvFile(join(ROOT, '.env'), { overwrite: true });
loadEnvFile(join(ROOT, '.env.marqq-live'), { overwrite: false });

startDeploymentScheduler();
startCofounderDigestScheduler();
startAgentSelfReviewScheduler();

// Scheduler timers intentionally use unref() so they do not hold normal API
// tests open. The dedicated worker needs one live handle to remain resident.
setInterval(() => {}, 60 * 60 * 1000);
console.log('🚀 Marqq background worker running');
