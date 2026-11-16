/**
 * Character clicks while the next costume's images are still decoding must
 * paint U+203D immediately, then swap to that costume. Clicks do not advance
 * the costume or start extra config fetches.
 *
 *   node tests/interrobang-gap.mjs
 * Serves this repo on 127.0.0.1 and stubs /api/animations (no KV).
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cowboy = JSON.parse(fs.readFileSync(path.join(root, 'content/animations-manifest.json'), 'utf8')).animations[0];
const config = {
  ok: true,
  updatedAt: '2026-11-11T00:00:00.000Z',
  costumeLibraryRevision: 1,
  settings: {
    selectionMode: 'alternate',
    clickThresholdMin: 30,
    clickThresholdMax: 30,
    openingAnimationId: 'cowboy',
    tapSporeBadgeEnabled: true,
    visitorsEnabled: false
  },
  animations: [
    cowboy,
    { id: 'ghost', label: 'Ghost', live: true, archived: false, order: 1, playMode: 'legacy-ghost', weight: 1 }
  ],
  directAnimations: [],
  placementsByAnimation: {},
  tiers: {},
  flags: {},
  seasons: []
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.join(root, path.normalize(rel));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('missing');
    return;
  }
  const ext = path.extname(file);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
  res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
let failures = 0;
function ok(cond, msg) {
  if (cond) console.log(`  PASS  ${msg}`);
  else { console.error(`  FAIL  ${msg}`); failures += 1; }
}

const browser = await chromium.launch({ headless: true });

async function boot(page, { stallAssets }) {
  let release = () => {};
  const gate = new Promise((resolve) => { release = resolve; });
  let animFetches = 0;
  await page.route('**/api/animations**', async (route) => {
    animFetches += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
  });
  // Stall only the upcoming cowboy art. Ghost sheets are part of effect init
  // and must load or effectsReady never flips.
  await page.route('**/assets/animations/cowboy/**', async (route) => {
    if (stallAssets) await gate;
    await route.continue();
  });
  page.__animFetches = () => animFetches;
  page.__releaseAssets = () => release();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.mushroomPlatypusApp?.effectsReady === true, null, { timeout: 20000 });
  return errors;
}

try {
  const stalled = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = await boot(stalled, { stallAssets: true });
  await stalled.waitForFunction(() => window.__yaitgUpcoming?.id === 'cowboy', null, { timeout: 10000 });
  const before = await stalled.evaluate(() => ({
    id: window.__yaitgUpcoming?.id || null,
    clicks: window.__yaitgEffect?.clickCount || 0,
    ready: !!window.__yaitgPrepared?.ready
  }));
  ok(before.ready === false, `cowboy preview is not ready while its images are stalled (ready=${before.ready})`);
  const box = await stalled.locator('#mainCreature').boundingBox();
  await stalled.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const immediate = await stalled.evaluate(() => {
    const nodes = [...document.querySelectorAll('.costume-preview-pending')];
    const sample = nodes[0];
    const rect = sample?.getBoundingClientRect();
    const opacity = sample ? getComputedStyle(sample).opacity : '0';
    return {
      marks: nodes.length,
      glyph: sample?.textContent || '',
      width: rect?.width || 0,
      opacity,
      clicks: window.__yaitgEffect?.clickCount || 0,
      id: window.__yaitgUpcoming?.id || null
    };
  });
  ok(immediate.marks >= 8, `first stalled click paints interrobang spores immediately (n=${immediate.marks})`);
  ok(immediate.glyph.includes('\u203D'), `mark is U+203D (got ${JSON.stringify(immediate.glyph)})`);
  ok(immediate.width >= 20 && Number(immediate.opacity) > 0.2, `mark is on screen (w=${immediate.width} opacity=${immediate.opacity})`);
  ok(immediate.clicks === before.clicks + 1, `stalled click counts once (${before.clicks} → ${immediate.clicks})`);
  await stalled.waitForTimeout(80);
  await stalled.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const second = await stalled.evaluate(() => ({
    marks: document.querySelectorAll('.costume-preview-pending').length,
    clicks: window.__yaitgEffect?.clickCount || 0,
    id: window.__yaitgUpcoming?.id || null,
    composites: document.querySelectorAll('.activation-composite').length
  }));
  ok(second.clicks === before.clicks + 2, `second stalled click also counts (${second.clicks})`);
  ok(second.marks > immediate.marks, `second click adds marks (${immediate.marks} → ${second.marks})`);
  ok(second.id === before.id && second.composites === 0, `clicks do not advance or reveal an unloaded costume (id=${second.id})`);
  ok(stalled.__animFetches() === 1, `clicks do not refetch animation config (fetches=${stalled.__animFetches()})`);
  stalled.__releaseAssets();
  await stalled.waitForFunction(() => (
    window.__yaitgPrepared?.ready === true &&
    document.querySelectorAll('.costume-preview-pending').length === 0 &&
    document.querySelectorAll('.activation-composite').length > 0
  ), null, { timeout: 10000 });
  const swapped = await stalled.evaluate(() => ({
    id: window.__yaitgUpcoming?.id,
    ready: window.__yaitgPrepared?.ready,
    composites: document.querySelectorAll('.activation-composite').length,
    pending: document.querySelectorAll('.costume-preview-pending').length,
    clicks: window.__yaitgEffect?.clickCount
  }));
  ok(swapped.ready && swapped.pending === 0 && swapped.composites > 0 && swapped.id === 'cowboy' && swapped.clicks === before.clicks + 2,
    `interrobangs swap to the cowboy preview (composites=${swapped.composites}, clicks=${swapped.clicks})`);
  ok(errors.length === 0, `no page errors during stalled clicks (${errors.join('; ')})`);
  await stalled.close();

  const fast = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const fastErrors = await boot(fast, { stallAssets: false });
  await fast.waitForFunction(() => window.__yaitgPrepared?.ready === true && window.__yaitgUpcoming?.id === 'cowboy', null, { timeout: 10000 });
  const fastBox = await fast.locator('#mainCreature').boundingBox();
  await fast.mouse.click(fastBox.x + fastBox.width / 2, fastBox.y + fastBox.height / 2);
  await fast.waitForTimeout(50);
  const fastClick = await fast.evaluate(() => ({
    pending: document.querySelectorAll('.costume-preview-pending').length,
    composites: document.querySelectorAll('.activation-composite').length,
    clicks: window.__yaitgEffect?.clickCount || 0
  }));
  ok(fastClick.pending === 0 && fastClick.composites > 0 && fastClick.clicks === 1,
    `a ready costume click shows the costume, not ‽ (composites=${fastClick.composites})`);
  ok(fastErrors.length === 0, `no page errors on the ready path (${fastErrors.join('; ')})`);
  await fast.close();
} finally {
  await browser.close();
  server.close();
}

console.log('failures:', failures);
process.exit(failures ? 1 : 0);
