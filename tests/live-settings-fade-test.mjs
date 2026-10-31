/**
 * Playwright: live click-threshold + dark→light fade sampling (no single-frame jump).
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'test-results/live-settings');
fs.mkdirSync(OUT, { recursive: true });

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml'
};

const port = 8891;
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
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
await page.goto(`http://127.0.0.1:${port}/tests/fixtures/live-settings.html`, {
  waitUntil: 'networkidle',
  timeout: 30000
});
await page.waitForFunction(() => window.__result, null, { timeout: 15000 });
const result = await page.evaluate(() => window.__result);
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

let failed = 0;
if (!result.fadeOk) {
  console.error('FAIL fade sampling — abrupt jump or no intermediates');
  failed = 1;
} else {
  console.log('PASS fade sampling (multi-step luminance)');
}
if (!result.thrOk) {
  console.error('FAIL click threshold / stormReset live apply', result.thr);
  failed = 1;
} else {
  console.log('PASS click threshold live apply (3→3, 8→8) + fade ms');
}

// Public API (post-deploy will include settings; pre-deploy may lack — warn only if absent)
try {
  const url = process.env.YAITG_PUBLIC_URL || 'https://youareinthegame.com';
  const r = await fetch(`${url}/api/animations?cb=${Date.now()}`, { cache: 'no-store' });
  const j = await r.json();
  console.log('public /api/animations settings', j.settings, 'source', j.source);
  fs.writeFileSync(path.join(OUT, 'public-api.json'), JSON.stringify({ settings: j.settings, source: j.source }, null, 2));
} catch (e) {
  console.warn('public api check skipped', e.message);
}

await browser.close();
server.close();
process.exit(failed);
