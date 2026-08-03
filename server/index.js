import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRoutes from './routes/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnvFile(filePath, { overwrite = true } = {}) {
  if (!existsSync(filePath)) return false;
  try {
    const raw = readFileSync(filePath, 'utf8');
    let count = 0;
    for (const line of raw.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (!match) continue;
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!overwrite && process.env[key]) continue;
      process.env[key] = value;
      count += 1;
    }
    console.log(`✓ Loaded ${count} vars from ${filePath.split('/').pop()}`);
    return true;
  } catch (e) {
    console.warn(`Notice: Could not parse ${filePath}:`, e.message);
    return false;
  }
}

loadEnvFile(join(ROOT, '.env'), { overwrite: true });
// Fill gaps from marqq-live (Gemini/Fal/ImgBB live there for creatives)
loadEnvFile(join(ROOT, '.env.marqq-live'), { overwrite: false });

export const apiApp = express();
apiApp.use(cors());
apiApp.use(bodyParser.json({ limit: '20mb' }));
apiApp.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }));

apiApp.use('/api', apiRoutes);

apiApp.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Marqq REST API Server', timestamp: new Date().toISOString() });
});

const isDirectRun = process.argv[1] && process.argv[1].endsWith('server/index.js');
if (isDirectRun) {
  const PORT = process.env.PORT || 3001;
  apiApp.listen(PORT, () => {
    console.log(`🚀 Marqq Standalone Backend Server running on http://localhost:${PORT}`);
  });
}
