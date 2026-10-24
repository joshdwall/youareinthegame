/**
 * Local gateway — GET /api/yaitg/session-assignment (dev :8765).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processSessionAssignment } from '../../sites/youareinthegame/functions/_shared/session-assignment-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_HUB = path.resolve(__dirname, '../..');
const YAITG_SITE = path.join(SITE_HUB, 'sites', 'youareinthegame');
const RATE_MIRROR = path.join(YAITG_SITE, '.harness', 'yaitg-rate-limit');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(YAITG_SITE, rel), 'utf8'));
}

function loadRegistriesFromDisk() {
  return {
    policy: readJson('content/session-policy.json'),
    charactersRegistry: readJson('content/characters-registry.json'),
    vignettesRegistry: readJson('content/vignettes-registry.json')
  };
}

function ensureRateDir() {
  fs.mkdirSync(RATE_MIRROR, { recursive: true });
}

/**
 * Minimal KV-like adapter for local rate limiting.
 */
function createLocalRateKv() {
  ensureRateDir();
  return {
    async get(key) {
      const p = path.join(RATE_MIRROR, `${key.replace(/[:/\\]/g, '_')}.txt`);
      if (!fs.existsSync(p)) return null;
      try {
        const stat = fs.statSync(p);
        if (Date.now() - stat.mtimeMs > 3600 * 1000) {
          fs.unlinkSync(p);
          return null;
        }
        return fs.readFileSync(p, 'utf8');
      } catch {
        return null;
      }
    },
    async put(key, value) {
      const p = path.join(RATE_MIRROR, `${key.replace(/[:/\\]/g, '_')}.txt`);
      fs.writeFileSync(p, String(value), 'utf8');
    }
  };
}

/**
 * @param {import('http').IncomingMessage} req
 */
export async function handleYaitgSessionAssignment(req) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  }

  const request = new Request(url.href, { method: 'GET', headers });
  const registries = loadRegistriesFromDisk();
  const result = await processSessionAssignment({
    request,
    env: {
      YAITG_SESSION_SECRET: process.env.YAITG_SESSION_SECRET || 'dev-yaitg-session-secret-change-me',
      YAITG_RATE_MAX: process.env.YAITG_RATE_MAX || '30',
      YAITG_RATE_WINDOW_SEC: process.env.YAITG_RATE_WINDOW_SEC || '3600'
    },
    kv: createLocalRateKv(),
    cache: null,
    registries,
    gateway: 'local-gateway'
  });

  return {
    status: result.status,
    body: result.body,
    setCookie: result.setCookie
  };
}

export function yaitgSessionHealth() {
  return {
    siteDir: YAITG_SITE,
    rateMirror: RATE_MIRROR
  };
}
