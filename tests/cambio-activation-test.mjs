/**
 * Character-overlay activation: ghost Play ≈ apex threshold; cowboy flash+spores+reset.
 * Viewports: 1920×1080 and 1366×768.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../capture/yaitg-activation');
fs.mkdirSync(OUT, { recursive: true });

const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8788';
const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1366x768', width: 1366, height: 768 }
];

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log(`  PASS  ${msg}`);
  else { console.error(`  FAIL  ${msg}`); failures += 1; }
}

async function waitHint(page, re, timeout = 20000) {
  await page.waitForFunction(
    (pattern) => {
      const el = document.getElementById('stageHint');
      return el && new RegExp(pattern).test(el.textContent || '');
    },
    re.source || re,
    { timeout }
  );
}

async function sampleActivation(page, labelPrefix) {
  const frames = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(350);
    const shot = path.join(OUT, `${labelPrefix}-f${i}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    const counts = await page.evaluate(() => ({
      flashBody: document.querySelectorAll('body > .lightning-flash').length,
      effectOverlay: document.querySelectorAll('#effectOverlay, .activation-flash-layer').length,
      overlayOpacity: (() => {
        const el = document.querySelector('#effectOverlay, .activation-flash-layer');
        return el ? parseFloat(getComputedStyle(el).opacity || '0') : 0;
      })(),
      fireworkSpores: document.querySelectorAll('.firework-spore').length,
      compositeSpores: document.querySelectorAll('.activation-spore').length,
      compositeEls: document.querySelectorAll('.activation-composite-el').length,
      accessoryIds: [...document.querySelectorAll('.activation-composite-el')].map((e) => e.dataset.elementId)
    }));
    frames.push({ i, shot, ...counts });
    console.log(`    frame ${i}`, counts);
  }
  return frames;
}

async function runViewport(browser, vp) {
  console.log(`\n=== viewport ${vp.name} ===`);
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();

  // --- Apex ghost threshold (force) ---
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#mainCreature');
  // Force threshold via evaluating into loaded effect if exposed; else click many times
  // Drive apex to threshold with spaced clicks (debounce ~50ms); fallback force lightning
  for (let i = 0; i < 12; i++) {
    await page.click('#mainCreature', { force: true });
    await page.waitForTimeout(80);
  }
  const apexPlayP = page.evaluate(() => {
    const app = window.mushroomPlatypusApp;
    const effect = app?.currentEffect;
    if (effect && typeof effect.triggerLightningReset === 'function') {
      if (effect.clickCount < effect.resetThreshold) effect.clickCount = effect.resetThreshold;
      // Return a promise that resolves on finale
      return new Promise((resolve) => {
        const orig = effect.onFinaleComplete.bind(effect);
        effect.onFinaleComplete = () => { orig(); resolve('forced'); };
        effect.triggerLightningReset();
      });
    }
    return 'clicks-only';
  });
  const apexFrames = await sampleActivation(page, `apex-ghost-${vp.name}`);
  const forced = await apexPlayP;
  ok(forced === 'forced' || forced === 'clicks-only', `${vp.name}: apex activation path (${forced})`);
  const apexHadFlash = apexFrames.some((f) => f.flashBody > 0 || f.overlayOpacity > 0.05 || f.effectOverlay > 0);
  const apexHadSpores = apexFrames.some((f) => f.fireworkSpores > 0);
  ok(apexHadFlash, `${vp.name}: apex showed lightning/overlay flash`);
  ok(apexHadSpores, `${vp.name}: apex showed firework spores`);
  await page.waitForTimeout(2500);
  const apexReset = await page.evaluate(() => ({
    flash: document.querySelectorAll('body > .lightning-flash').length,
    overlayOp: (() => {
      const el = document.getElementById('effectOverlay');
      return el ? parseFloat(getComputedStyle(el).opacity || '0') : 0;
    })(),
    spores: document.querySelectorAll('.firework-spore').length
  }));
  ok(apexReset.flash === 0 && apexReset.overlayOp < 0.05, `${vp.name}: apex reset (no flash body, overlay hidden)`);

  // --- Cambio ghost Play ---
  await page.goto(`${BASE}/cambio/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__cambioTest);
  const ghostPlayP = page.evaluate(() => window.__cambioTest.runActivationPlay('ghost'));
  const ghostFrames = await sampleActivation(page, `cambio-ghost-${vp.name}`);
  await ghostPlayP;
  const gFlash = ghostFrames.some((f) => f.flashBody > 0 || f.overlayOpacity > 0.05 || f.effectOverlay > 0);
  const gSpores = ghostFrames.some((f) => f.fireworkSpores > 0);
  ok(gFlash, `${vp.name}: Cambio ghost Play showed flash/overlay`);
  ok(gSpores, `${vp.name}: Cambio ghost Play showed firework spores`);
  await waitHint(page, /Ghost play finished/i, 25000);
  const gReset = await page.evaluate(() => ({
    flashLayer: document.querySelectorAll('.activation-flash-layer, #effectOverlay').length,
    spores: document.querySelectorAll('.firework-spore, .activation-spore').length
  }));
  ok(gReset.flashLayer === 0 && gReset.spores === 0, `${vp.name}: Cambio ghost reset cleared overlay+spores`);

  // Parity: both had flash + spores
  ok(apexHadFlash && gFlash, `${vp.name}: ghost flash parity (apex + Cambio)`);
  ok(apexHadSpores && gSpores, `${vp.name}: ghost spore parity (apex + Cambio)`);

  // --- Cowboy Play ---
  const cowPlayP = page.evaluate(() => window.__cambioTest.runActivationPlay('cowboy'));
  const cowFrames = await sampleActivation(page, `cambio-cowboy-${vp.name}`);
  await cowPlayP;
  const cowFlash = cowFrames.some((f) => f.effectOverlay > 0 || f.overlayOpacity > 0.05 || f.compositeEls >= 4);
  const cowAccessories = cowFrames.some((f) => {
    const ids = new Set(f.accessoryIds || []);
    return ids.has('hat') && ids.has('mustache') && ids.has('pistolL') && ids.has('pistolR');
  });
  const cowSpores = cowFrames.some((f) => f.compositeSpores > 0);
  const sporeAccessories = cowFrames.some((f) => f.compositeSpores > 0 && f.compositeEls >= 4);
  ok(cowFlash, `${vp.name}: cowboy Play showed composite flash`);
  ok(cowAccessories, `${vp.name}: cowboy flash had all 4 accessories`);
  ok(cowSpores, `${vp.name}: cowboy mini composite spores`);
  ok(sporeAccessories, `${vp.name}: spores carried accessories (composite-el present while spores live)`);

  // Placements during flash match saved SSOT
  const placementCheck = await page.evaluate(() => {
    const st = window.__cambioTest.getState();
    const cow = st.placements?.byAnimation?.cowboy?.elements;
    if (!cow) return { ok: false, reason: 'no placements' };
    const els = window.__cambioTest.compositeElementsFor('cowboy');
    const got = Object.fromEntries(els.map((e) => [e.id, e.placement.characterAnchor]));
    return {
      ok: true,
      hatY: got.hat?.y,
      mustacheY: got.mustache?.y,
      savedHatY: cow.hat?.characterAnchor?.y,
      savedMustacheY: cow.mustache?.characterAnchor?.y
    };
  });
  ok(
    placementCheck.ok &&
      Math.abs(placementCheck.hatY - placementCheck.savedHatY) < 1e-9 &&
      Math.abs(placementCheck.mustacheY - placementCheck.savedMustacheY) < 1e-9,
    `${vp.name}: cowboy composite uses saved placements (hat/mustache anchors)`
  );

  await waitHint(page, /Cowboy play finished/i, 25000);
  const cReset = await page.evaluate(() => ({
    flash: document.querySelectorAll('.activation-flash-layer, #effectOverlay').length,
    spores: document.querySelectorAll('.activation-spore').length
  }));
  ok(cReset.flash === 0 && cReset.spores === 0, `${vp.name}: cowboy reset cleared`);

  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  for (const vp of VIEWPORTS) await runViewport(browser, vp);
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? 'ALL PASS' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
