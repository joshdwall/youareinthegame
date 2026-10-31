/**
 * Bounding-box parity: Cambio edit-mode props vs public force=cowboy flash props.
 * Normalized to the character box; ≤2px absolute OR ≤1% of character width for all 4 elements.
 * Viewports: 1920×1080, 1366×768, 390×844 (mobile).
 *
 * Requires local pages dev (default http://127.0.0.1:8788) with force gated.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../test-results/placement-parity');
fs.mkdirSync(OUT, { recursive: true });

const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8788';
const CAMBIO = process.env.YAITG_CAMBIO || `${BASE}/cambio/`;
const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '390x844', width: 390, height: 844 }
];

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log(`  PASS  ${msg}`);
  else { console.error(`  FAIL  ${msg}`); failures += 1; }
}

async function relativeBoxes(page, selector) {
  return page.evaluate((sel) => {
    const c = document.getElementById('mainCreature')?.getBoundingClientRect();
    if (!c) return { char: null, props: {} };
    const props = {};
    for (const p of document.querySelectorAll(sel)) {
      const id = p.dataset.elementId;
      if (!id) continue;
      const r = p.getBoundingClientRect();
      props[id] = {
        left: r.left - c.left,
        top: r.top - c.top,
        width: r.width,
        height: r.height
      };
    }
    return { char: { width: c.width, height: c.height }, props };
  }, selector);
}

const browser = await chromium.launch({ headless: true });
const results = {};

for (const vp of VIEWPORTS) {
  console.log(`\n== ${vp.name} ==`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();

  // --- Cambio edit-mode boxes ---
  await page.goto(CAMBIO, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#mainCreature', { timeout: 20000 });
  await page.waitForTimeout(800);
  // Enter cowboy edit
  await page.evaluate(async () => {
    const t = window.__cambioTest;
    if (t?.enterEdit) return t.enterEdit('cowboy');
    // fallback: click Edit on cowboy row
    const li = [...document.querySelectorAll('#animList li')].find((el) => el.dataset.id === 'cowboy');
    li?.querySelector('button')?.click(); // may be Play; try Edit
    const edit = [...(li?.querySelectorAll('button') || [])].find((b) => /Edit/i.test(b.textContent || ''));
    edit?.click();
  });
  // Prefer test helper
  await page.evaluate(() => {
    if (window.__cambioTest?.mountProps) {
      window.__cambioTest.mountProps('cowboy', { interactive: true });
    }
  });
  await page.waitForTimeout(500);
  // Wait for props
  await page.waitForSelector('.cambio-prop[data-element-id="hat"]', { timeout: 10000 }).catch(() => {});
  const cambio = await relativeBoxes(page, '.cambio-prop');
  await page.screenshot({ path: path.join(OUT, `cambio-edit-${vp.name}.png`) });

  // --- Public force=cowboy flash boxes ---
  await page.addInitScript(() => { document.documentElement.dataset.yaitgAllowForce = '1'; });
  await page.goto(`${BASE}/?force=cowboy&t=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#mainCreature', { timeout: 20000 });
  await page.waitForTimeout(1000);

  // Force upcoming + kick climax WITHOUT awaiting (capture mid-flash)
  const captured = await page.evaluate(async () => {
    const effect = window.__yaitgEffect;
    if (!effect) return { err: 'no effect' };
    try {
      const mod = await import('/runtime/public/thresholdActivation.js');
      const cowboy = (await (await fetch('/api/animations')).json()).animations?.find((a) => a.id === 'cowboy');
      mod.setUpcomingForTests?.({ id: 'cowboy', anim: cowboy });
      await mod.prepareUpcoming?.(document.getElementById('mainCreature'));
    } catch (_) {}
    effect.clickCount = effect.resetThreshold || 1;
    effect.finaleInProgress = false;
    effect.lightningSequenceActive = false;
    // Fire and return immediately so Playwright can sample boxes during flash
    if (effect.triggerLightningReset) effect.triggerLightningReset();
    else if (effect.onClimax) effect.onClimax();
    return { kicked: true };
  });

  // Poll for activation props during the flash window
  let pub = { char: null, props: {} };
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(50);
    pub = await relativeBoxes(page, '.activation-prop, #overlayLayer img[data-element-id]');
    if (Object.keys(pub.props).length >= 4) break;
  }
  await page.screenshot({ path: path.join(OUT, `public-flash-${vp.name}.png`) });

  const ids = ['hat', 'mustache', 'pistolL', 'pistolR'];
  const row = { cambio: cambio.props, public: pub.props, charW: cambio.char?.width || pub.char?.width, diffs: {} };
  for (const id of ids) {
    const a = cambio.props[id];
    const b = pub.props[id];
    if (!a || !b) {
      ok(false, `${vp.name} ${id}: missing (cambio=${!!a} public=${!!b})`);
      row.diffs[id] = { missing: true };
      continue;
    }
    const charW = row.charW || 1;
    const dx = Math.abs(a.left - b.left);
    const dy = Math.abs(a.top - b.top);
    const dw = Math.abs(a.width - b.width);
    const dh = Math.abs(a.height - b.height);
    const tolPx = 2;
    const tolPct = 0.01 * charW;
    const within = (v) => v <= tolPx || v <= tolPct;
    const pass = within(dx) && within(dy) && within(dw) && within(dh);
    ok(pass, `${vp.name} ${id}: Δl=${dx.toFixed(1)} Δt=${dy.toFixed(1)} Δw=${dw.toFixed(1)} Δh=${dh.toFixed(1)} (tol 2px/1%)`);
    row.diffs[id] = { dx, dy, dw, dh, pass, cambio: a, public: b };
  }
  results[vp.name] = row;
  await ctx.close();
}

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
await browser.close();
console.log('\nfailures:', failures);
process.exit(failures ? 1 : 0);
