/**
 * Always-interactive clicks during flash/anim/fade + interactionOpacityDuringAnimation.
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeConfig, BUILTIN_SEED } from '../functions/_shared/runtime-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'test-results/always-interactive');
fs.mkdirSync(OUT, { recursive: true });

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml'
};

const port = 8892;
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  // Stub /api/animations so installThresholdLootHook fetch does not 404-spam
  if (urlPath === '/api/animations') {
    const cfg = normalizeConfig(BUILTIN_SEED);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, settings: cfg.settings, animations: cfg.animations, source: 'test' }));
    return;
  }
  const file = path.join(root, urlPath.replace(/^\//, ''));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('no'); return;
  }
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(port, '127.0.0.1', r));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/tests/fixtures/always-interactive.html`, {
  waitUntil: 'networkidle',
  timeout: 30000
});
await page.waitForFunction(() => window.__result, null, { timeout: 15000 });
const result = await page.evaluate(() => window.__result);
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

let failed = 0;
if (!result.ok) {
  console.error('FAIL always-interactive / opacity fixture');
  failed = 1;
} else {
  console.log('PASS flash/anim/fade spawn default decor spores; opacity follows setting; not counted');
}

// normalizeConfig defaults + clamp
const n = normalizeConfig({ settings: {} });
if (n.settings.interactionOpacityDuringAnimation !== 0.8) {
  console.error('FAIL normalize default', n.settings);
  failed = 1;
} else console.log('PASS normalize default 0.8');
const n2 = normalizeConfig({ settings: { interactionOpacityDuringAnimation: 1.5 } });
if (n2.settings.interactionOpacityDuringAnimation !== 1) {
  console.error('FAIL normalize clamp hi', n2.settings);
  failed = 1;
} else console.log('PASS normalize clamp hi→1');
const n3 = normalizeConfig({ settings: { interactionOpacityDuringAnimation: -0.2 } });
if (n3.settings.interactionOpacityDuringAnimation !== 0) {
  console.error('FAIL normalize clamp lo', n3.settings);
  failed = 1;
} else console.log('PASS normalize clamp lo→0');

await page.screenshot({ path: path.join(OUT, 'fixture.png'), fullPage: true });
await browser.close();
server.close();
process.exit(failed);
