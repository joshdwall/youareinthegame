/**
 * Regression: alternate ghost↔cowboy with and without reloads; cowboy full transition.
 * Serves repo root + stub /api/animations (alternate, ghost+cowboy live).
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeConfig, BUILTIN_SEED } from '../functions/_shared/runtime-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'test-results/alternate-reload-cowboy');
const SHOTS = '/workspace/cowboy-transition-shots';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg'
};

const cfg = normalizeConfig(BUILTIN_SEED);
cfg.settings.selectionMode = 'alternate';
cfg.settings.clickThresholdMin = 2;
cfg.settings.clickThresholdMax = 2;

const port = 8897;
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/api/animations') {
    // Include placements so cowboy prepareUpcoming works without fallback race
    let placements = {};
    try {
      const pj = JSON.parse(fs.readFileSync(path.join(root, 'content/cambio-placements.json'), 'utf8'));
      placements = pj?.byAnimation || {};
    } catch (_) {}
    const body = {
      ok: true,
      settings: cfg.settings,
      animations: cfg.animations,
      flags: cfg.flags,
      seasons: cfg.seasons || [],
      tiers: cfg.tiers || {},
      placementsByAnimation: Object.fromEntries(
        Object.entries(placements).map(([id, block]) => [id, { elements: block.elements || block }])
      ),
      source: 'test-alternate'
    };
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
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
const BASE = `http://127.0.0.1:${port}`;

function ok(cond, msg) {
  if (cond) console.log(`  PASS  ${msg}`);
  else {
    console.error(`  FAIL  ${msg}`);
    failures += 1;
  }
}
let failures = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function snapshot(page) {
  return page.evaluate(() => {
    const up = window.__yaitgUpcoming;
    let cursor = null;
    try {
      cursor = window.__yaitgSelectionCursor || JSON.parse(localStorage.getItem('yaitg.selectionCursor') || 'null');
    } catch (_) {}
    const overlay = document.getElementById('overlayLayer');
    const props = overlay
      ? [...overlay.querySelectorAll('img, .activation-prop, [data-element-id]')].map((el) => ({
          id: el.getAttribute('data-element-id') || el.alt || el.className,
          src: (el.getAttribute('src') || '').split('/').pop()
        }))
      : [];
    const flash = document.querySelector('.activation-flash-host, .activation-flash-layer, .lightning-flash');
    const spores = document.querySelectorAll('.activation-spore, .firework-spore, .spore').length;
    const guns = props.filter((p) => /revolver|pistol|gun/i.test(`${p.id} ${p.src}`));
    const eff = window.__yaitgEffect;
    return {
      upcomingId: up?.id || null,
      cursor,
      finale: !!(eff?.finaleInProgress || eff?.lightningSequenceActive),
      overlayKids: props.length,
      props,
      guns: guns.length,
      spores,
      flashPresent: !!flash,
      flashOpacity: flash ? getComputedStyle(flash).opacity : null
    };
  });
}

async function lowerThreshold(page) {
  await page.evaluate(() => {
    const eff = window.__yaitgEffect || window.currentEffect;
    if (eff) {
      eff.clickThreshold = 2;
      eff.resetThreshold = 2;
      eff.__liveClickThresholdMin = 2;
      eff.__liveClickThresholdMax = 2;
      if (typeof eff.applyLiveClickThreshold === 'function') {
        eff.applyLiveClickThreshold({ clickThresholdMin: 2, clickThresholdMax: 2 });
      }
      eff.clickCount = 0;
    }
  });
}

async function waitNotBusy(page, timeoutMs = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const busy = await page.evaluate(() => {
      const e = window.__yaitgEffect;
      if (!e) return false;
      if (e.finaleInProgress || e.lightningSequenceActive) return true;
      if (typeof e.isActivationInteractionBusy === 'function' && e.isActivationInteractionBusy()) return true;
      return false;
    });
    if (!busy) return;
    await wait(150);
  }
}

async function clickToThreshold(page) {
  // Prior round's reset fade marks clicks decorative — wait it out or threshold never fires.
  await waitNotBusy(page);
  await lowerThreshold(page);
  const creature = page.locator('#mainCreature');
  for (let i = 0; i < 10; i++) {
    await creature.click({ force: true, position: { x: 40, y: 40 } });
    await wait(150);
    const busy = await page.evaluate(() => {
      const e = window.__yaitgEffect;
      return !!(e?.finaleInProgress || e?.lightningSequenceActive);
    });
    if (busy) break;
  }
}

async function waitActivationStart(page, timeoutMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await snapshot(page);
    if (s.finale || s.overlayKids > 0 || s.flashPresent) return s;
    await wait(100);
  }
  return snapshot(page);
}

async function waitCycleIdle(page, { playedId, timeoutMs = 45000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await snapshot(page);
    // Idle only after recordPlayed(playedId) + pickUpcoming assigned a *new* upcoming.
    const playedOk = !playedId || s.cursor?.lastPlayedId === playedId;
    const advanced = !playedId || (s.upcomingId && s.upcomingId !== playedId);
    if (!s.finale && s.upcomingId && playedOk && advanced) return s;
    await wait(200);
  }
  return snapshot(page);
}

const browser = await chromium.launch({ headless: true });

// ---------- A) No reload: ghost, cowboy, ghost, cowboy ----------
{
  console.log('\n--- no-reload alternate ---');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#mainCreature', { timeout: 20000 });
  await page.waitForFunction(() => window.__yaitgUpcoming?.id, null, { timeout: 15000 });
  await wait(500);

  const seq = [];
  for (let round = 0; round < 4; round++) {
    const before = await snapshot(page);
    seq.push(before.upcomingId);
    console.log(`  round ${round} upcoming=${before.upcomingId} cursor=`, before.cursor);

    await clickToThreshold(page);
    const mid = await waitActivationStart(page);

    if (before.upcomingId === 'cowboy') {
      await page.screenshot({ path: path.join(SHOTS, `local-cowboy-r${round}-mid.png`) });
      await page.screenshot({ path: path.join(OUT, `cowboy-r${round}-mid.png`) });
      ok(mid.overlayKids >= 3 || mid.props.length >= 3, `cowboy r${round} overlays mounted (got ${mid.overlayKids})`);
      ok(mid.flashPresent || mid.finale, `cowboy r${round} flash/finale active`);
      // Sample again shortly for spores/guns during sequence
      await wait(600);
      const mid2 = await snapshot(page);
      await page.screenshot({ path: path.join(SHOTS, `local-cowboy-r${round}-spores.png`) });
      ok(mid2.spores > 0 || mid.spores > 0 || mid2.overlayKids > 0, `cowboy r${round} spores or overlays visible`);
      ok(
        mid2.guns > 0 || mid.guns > 0 || mid2.props.some((p) => /revolver|pistol/i.test(`${p.id}${p.src}`)),
        `cowboy r${round} gun props present`
      );
    }

    const after = await waitCycleIdle(page, { playedId: before.upcomingId });
    ok(!!after.upcomingId && after.upcomingId !== before.upcomingId,
      `r${round} advanced ${before.upcomingId} → ${after.upcomingId}`);
  }
  ok(seq.join(',') === 'ghost,cowboy,ghost,cowboy', `no-reload seq ${seq}`);
  ok(errors.filter((e) => !/favicon/i.test(e)).length === 0, `no console errors (${errors.length})`);
  fs.writeFileSync(path.join(OUT, 'no-reload.json'), JSON.stringify({ seq, errors }, null, 2));
  await ctx.close();
}

// ---------- B) Reload between rounds: still ghost, cowboy, ghost, cowboy ----------
{
  console.log('\n--- reload-between alternate ---');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#mainCreature', { timeout: 20000 });
  await page.waitForFunction(() => window.__yaitgUpcoming?.id, null, { timeout: 15000 });

  const seq = [];
  for (let round = 0; round < 4; round++) {
    if (round > 0) {
      await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForFunction(() => window.__yaitgUpcoming?.id, null, { timeout: 15000 });
      await wait(400);
    }
    const before = await snapshot(page);
    seq.push(before.upcomingId);
    console.log(`  round ${round} upcoming=${before.upcomingId} cursor=`, before.cursor);

    // Cursor must be v2 lastPlayed (or null on first), never treat upcoming as played
    if (before.cursor?.v != null) {
      ok(before.cursor.v === 2, `cursor v2 on round ${round}`);
    }

    await clickToThreshold(page);
    const mid = await waitActivationStart(page);
    if (before.upcomingId === 'cowboy') {
      await page.screenshot({ path: path.join(SHOTS, `local-reload-cowboy-r${round}.png`) });
      ok(mid.overlayKids >= 3 || mid.finale, `reload path cowboy overlays/finale r${round}`);
    }
    await waitCycleIdle(page, { playedId: before.upcomingId });
  }
  ok(seq.join(',') === 'ghost,cowboy,ghost,cowboy', `reload-between seq ${seq}`);
  fs.writeFileSync(path.join(OUT, 'reload-between.json'), JSON.stringify({ seq }, null, 2));
  await ctx.close();
}

// ---------- C) Reload while cowboy is queued (after ghost played) keeps cowboy ----------
{
  console.log('\n--- reload while cowboy queued ---');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__yaitgUpcoming?.id === 'ghost', null, { timeout: 15000 });
  await clickToThreshold(page);
  await waitCycleIdle(page, { playedId: 'ghost' });
  const queued = await snapshot(page);
  ok(queued.upcomingId === 'cowboy', `after ghost, upcoming cowboy (got ${queued.upcomingId})`);
  ok(queued.cursor?.lastPlayedId === 'ghost', `lastPlayed=ghost while cowboy queued`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__yaitgUpcoming?.id, null, { timeout: 15000 });
  const afterReload = await snapshot(page);
  ok(afterReload.upcomingId === 'cowboy', `reload keeps cowboy queued (got ${afterReload.upcomingId})`);
  fs.writeFileSync(path.join(OUT, 'reload-while-queued.json'), JSON.stringify({ queued, afterReload }, null, 2));
  await ctx.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ failures }, null, 2));
console.log(failures ? `\nFAILED ${failures}` : '\nALL alternate-reload-cowboy tests passed');
process.exit(failures ? 1 : 0);
