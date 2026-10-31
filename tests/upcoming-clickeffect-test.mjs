/**
 * Upcoming-at-cycle-start: with force=cowboy, pre-threshold character clicks
 * spawn composite clickEffect spores; activation then plays cowboy.
 * Access-gated force via dataset.yaitgAllowForce.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../test-results/upcoming-click');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8788';

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log(`  PASS  ${msg}`);
  else { console.error(`  FAIL  ${msg}`); failures += 1; }
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.addInitScript(() => { document.documentElement.dataset.yaitgAllowForce = '1'; });
await page.goto(`${BASE}/?force=cowboy&t=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#mainCreature', { timeout: 20000 });
await page.waitForTimeout(1500);

const upcoming = await page.evaluate(() => window.__yaitgUpcoming?.id || null);
ok(upcoming === 'cowboy', `upcoming at cycle start is cowboy (got ${upcoming})`);

// Click character a few times BEFORE threshold; expect composite click spores
const clickStats = await page.evaluate(async () => {
  const creature = document.getElementById('mainCreature');
  const effect = window.__yaitgEffect;
  // Keep below threshold
  if (effect) {
    effect.resetThreshold = 999;
    effect.clickCount = 0;
  }
  const before = document.querySelectorAll('.activation-click-spore, .activation-composite').length;
  // Synthetic clicks via effect path
  const rect = document.querySelector('.container').getBoundingClientRect();
  const cr = creature.getBoundingClientRect();
  const x = cr.left + cr.width / 2 - rect.left;
  const y = cr.top + cr.height / 2 - rect.top;
  for (let i = 0; i < 3; i++) {
    effect?.onSporeClick?.(x, y);
  }
  await new Promise((r) => setTimeout(r, 200));
  const composites = document.querySelectorAll('.activation-click-spore, .activation-composite').length;
  const ghostImgs = [...document.querySelectorAll('img.spore')].filter((img) =>
    /ghost-spores/.test(img.src || '')
  ).length;
  return { before, composites, ghostImgs, clickCount: effect?.clickCount };
});

ok(clickStats.composites > 0, `pre-threshold cowboy clicks spawn composite spores (n=${clickStats.composites})`);
await page.screenshot({ path: path.join(OUT, 'cowboy-click-preview.png') });

// Ghost force: should use ghost spores path
await page.goto(`${BASE}/?force=ghost&t=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#mainCreature', { timeout: 20000 });
await page.waitForTimeout(1200);
const ghostUp = await page.evaluate(() => window.__yaitgUpcoming?.id || null);
ok(ghostUp === 'ghost', `upcoming force=ghost is ghost (got ${ghostUp})`);

const ghostClick = await page.evaluate(async () => {
  const effect = window.__yaitgEffect;
  if (effect) { effect.resetThreshold = 999; effect.clickCount = 0; }
  const creature = document.getElementById('mainCreature');
  const rect = document.querySelector('.container').getBoundingClientRect();
  const cr = creature.getBoundingClientRect();
  const x = cr.left + cr.width / 2 - rect.left;
  const y = cr.top + cr.height / 2 - rect.top;
  effect?.onSporeClick?.(x, y);
  await new Promise((r) => setTimeout(r, 150));
  const composites = document.querySelectorAll('.activation-click-spore').length;
  const spores = document.querySelectorAll('img.spore').length;
  return { composites, spores };
});
ok(ghostClick.composites === 0 && ghostClick.spores > 0,
  `ghost upcoming uses image spores not composites (composites=${ghostClick.composites} spores=${ghostClick.spores})`);

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ upcoming, clickStats, ghostUp, ghostClick }, null, 2));
await browser.close();
console.log('failures:', failures);
process.exit(failures ? 1 : 0);
