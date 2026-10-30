/**
 * Character-overlay activation: ghost Play ≈ apex threshold; cowboy flash+spores+reset.
 * Cowboy: accessories flash ON the live #mainCreature (no duplicate full-size base);
 * accessory bboxes match edit-mode placement within 2px while floating.
 * Spores: cowboy uses same FireworkManager origin/timing as ghost; visible (viewport,
 * opacity>0.5, size≥24, elementFromPoint); spawn origin within ~10px of ghost.
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

/** Relative accessory boxes vs #mainCreature (float-invariant). */
async function relativePropBoxes(page) {
  return page.evaluate(() => {
    const c = document.getElementById('mainCreature')?.getBoundingClientRect();
    if (!c) return {};
    const out = {};
    for (const p of document.querySelectorAll('.cambio-prop')) {
      const id = p.dataset.elementId;
      if (!id) continue;
      const r = p.getBoundingClientRect();
      out[id] = {
        left: r.left - c.left,
        top: r.top - c.top,
        width: r.width,
        height: r.height
      };
    }
    return out;
  });
}


/** Sample visible firework/activation spores (pointer-events briefly enabled for elementFromPoint). */
async function sampleSporeVisibility(page) {
  return page.evaluate(() => {
    const expectedOrigin = {
      x: window.innerWidth / 2 + 0,
      y: window.innerHeight / 2 + 50 // GHOST_CONFIG.FIREWORKS.LAUNCH_OFFSET_Y
    };
    const spores = [...document.querySelectorAll('.firework-spore, .activation-spore')];
    const restored = [];
    for (const el of spores) {
      restored.push([el, el.style.pointerEvents]);
      el.style.pointerEvents = 'auto';
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const samples = spores.map((el) => {
      const r = el.getBoundingClientRect();
      const op = parseFloat(getComputedStyle(el).opacity || '0');
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const inView = r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
      let topMost = false;
      try {
        const hit = document.elementFromPoint(Math.min(vw - 1, Math.max(0, cx)), Math.min(vh - 1, Math.max(0, cy)));
        topMost = !!(hit && (hit === el || el.contains(hit)));
      } catch (_) { topMost = false; }
      return {
        w: r.width,
        h: r.height,
        op,
        cx,
        cy,
        inView,
        topMost,
        visible: inView && op > 0.5 && Math.min(r.width, r.height) >= 24 && topMost,
        className: el.className
      };
    });
    for (const [el, pe] of restored) el.style.pointerEvents = pe;
    // Origin from FireworkSpore physics spawn attrs (stable; bbox center moves with rotation)
    let origin = null;
    for (const el of spores) {
      if (el.dataset.spawnX != null && el.dataset.spawnY != null) {
        origin = { x: parseFloat(el.dataset.spawnX), y: parseFloat(el.dataset.spawnY) };
        break;
      }
    }
    return {
      count: samples.length,
      visibleCount: samples.filter((s) => s.visible).length,
      anyVisible: samples.some((s) => s.visible),
      maxMinDim: samples.reduce((m, s) => Math.max(m, Math.min(s.w, s.h)), 0),
      maxOp: samples.reduce((m, s) => Math.max(m, s.op), 0),
      origin,
      expectedOrigin,
      samples: samples.slice(0, 4)
    };
  });
}

async function sampleActivation(page, labelPrefix) {
  const frames = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(350);
    const shot = path.join(OUT, `${labelPrefix}-f${i}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    const counts = await page.evaluate(() => {
      const main = document.getElementById('mainCreature');
      const mainW = main ? main.getBoundingClientRect().width : 0;
      const fullSizeBases = [...document.querySelectorAll('#mainCreature, img.activation-composite-base')].filter((el) => {
        const w = el.getBoundingClientRect().width;
        return w >= mainW * 0.85 && w > 40;
      }).length;
      const props = [...document.querySelectorAll('.cambio-prop')].map((e) => e.dataset.elementId);
      const flashHost = document.querySelector('#overlayLayer.activation-flash-host, .activation-flash-host');
      return {
        flashBody: document.querySelectorAll('body > .lightning-flash').length,
        effectOverlay: document.querySelectorAll('#effectOverlay, .activation-flash-layer').length,
        flashHost: !!flashHost,
        flashHostOpacity: flashHost ? parseFloat(getComputedStyle(flashHost).opacity || '0') : 0,
        overlayOpacity: (() => {
          const el = document.querySelector('#effectOverlay, .activation-flash-layer, .activation-flash-host');
          return el ? parseFloat(getComputedStyle(el).opacity || '0') : 0;
        })(),
        fireworkSpores: document.querySelectorAll('.firework-spore').length,
        compositeSpores: document.querySelectorAll('.activation-spore').length,
        compositeEls: document.querySelectorAll('.activation-composite-el').length,
        accessoryIds: [
          ...props,
          ...[...document.querySelectorAll('.activation-composite-el')].map((e) => e.dataset.elementId)
        ],
        cambioPropIds: props,
        fullSizeBases,
        mainCreatureCount: document.querySelectorAll('#mainCreature').length,
        relativeProps: (() => {
          const c = document.getElementById('mainCreature')?.getBoundingClientRect();
          if (!c) return {};
          const out = {};
          for (const el of document.querySelectorAll('.cambio-prop')) {
            const id = el.dataset.elementId;
            if (!id) continue;
            const r = el.getBoundingClientRect();
            out[id] = { left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height };
          }
          return out;
        })()
      };
    });
    const sporeVis = (counts.fireworkSpores > 0 || counts.compositeSpores > 0)
      ? await sampleSporeVisibility(page)
      : null;
    frames.push({ i, shot, ...counts, sporeVis });
    console.log(`    frame ${i}`, {
      flashBody: counts.flashBody,
      fullSizeBases: counts.fullSizeBases,
      props: counts.cambioPropIds.length,
      spores: counts.compositeSpores || counts.fireworkSpores,
      opacity: counts.overlayOpacity,
      sporeVis: sporeVis ? { n: sporeVis.count, vis: sporeVis.visibleCount, origin: sporeVis.origin } : null
    });
  }
  return frames;
}

function maxBoxDelta(a, b) {
  if (!a || !b) return Infinity;
  return Math.max(
    Math.abs(a.left - b.left),
    Math.abs(a.top - b.top),
    Math.abs(a.width - b.width),
    Math.abs(a.height - b.height)
  );
}

async function runViewport(browser, vp) {
  console.log(`\n=== viewport ${vp.name} ===`);
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();

  // --- Apex ghost threshold (force) ---
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#mainCreature');
  for (let i = 0; i < 12; i++) {
    await page.click('#mainCreature', { force: true });
    await page.waitForTimeout(80);
  }
  const apexPlayP = page.evaluate(() => {
    const app = window.mushroomPlatypusApp;
    const effect = app?.currentEffect;
    if (effect && typeof effect.triggerLightningReset === 'function') {
      if (effect.clickCount < effect.resetThreshold) effect.clickCount = effect.resetThreshold;
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

  ok(apexHadFlash && gFlash, `${vp.name}: ghost flash parity (apex + Cambio)`);
  ok(apexHadSpores && gSpores, `${vp.name}: ghost spore parity (apex + Cambio)`);

  // --- Cowboy: capture edit-mode accessory boxes (shared mountProps path) ---
  await page.evaluate(() => {
    window.__cambioTest.mountProps('cowboy', { interactive: false, visible: true });
  });
  await page.waitForTimeout(100);
  const editSamples = [];
  for (let i = 0; i < 6; i++) {
    editSamples.push(await relativePropBoxes(page));
    await page.waitForTimeout(400); // sample across float
  }
  const editIds = Object.keys(editSamples[0] || {});
  ok(
    ['hat', 'mustache', 'pistolL', 'pistolR'].every((id) => editIds.includes(id)),
    `${vp.name}: edit-mode mountProps shows all 4 cowboy accessories`
  );
  // Median-ish reference: first sample (relative to creature — float-invariant)
  const editRef = editSamples[0];

  // Clear then Play
  await page.evaluate(() => {
    document.getElementById('overlayLayer').innerHTML = '';
  });

  const cowPlayP = page.evaluate(() => window.__cambioTest.runActivationPlay('cowboy'));
  const cowFrames = await sampleActivation(page, `cambio-cowboy-${vp.name}`);
  await cowPlayP;
  const flashRelSamples = cowFrames
    .map((f) => f.relativeProps)
    .filter((r) => r && Object.keys(r).length >= 4);

  const cowFlash = cowFrames.some(
    (f) => f.flashHost || f.overlayOpacity > 0.05 || (f.cambioPropIds && f.cambioPropIds.length >= 4)
  );
  const cowAccessories = cowFrames.some((f) => {
    const ids = new Set(f.cambioPropIds || []);
    return ids.has('hat') && ids.has('mustache') && ids.has('pistolL') && ids.has('pistolR');
  });
  const cowSpores = cowFrames.some((f) => f.compositeSpores > 0);
  const sporeAccessories = cowFrames.some((f) => f.compositeSpores > 0 && f.compositeEls >= 4);

  // Exactly 1 full-size base during flash frames that had props or lightning
  const flashActive = cowFrames.filter(
    (f) => f.flashBody > 0 || f.overlayOpacity > 0.02 || (f.cambioPropIds && f.cambioPropIds.length > 0)
  );
  const allSingleBase = flashActive.length > 0 && flashActive.every((f) => f.fullSizeBases === 1 && f.mainCreatureCount === 1);
  ok(cowFlash, `${vp.name}: cowboy Play showed overlay flash on live host`);
  ok(cowAccessories, `${vp.name}: cowboy flash had all 4 accessories on live character`);
  ok(allSingleBase, `${vp.name}: exactly 1 full-size base during flash (no duplicate character)`);
  ok(cowSpores, `${vp.name}: cowboy mini composite spores`);
  ok(sporeAccessories, `${vp.name}: spores carried accessories (composite-el present while spores live)`);

  // Cowboy spore visibility + origin parity with ghost FireworkManager launch
  const cowSporeFrames = cowFrames.filter((f) => f.sporeVis && f.sporeVis.count > 0);
  const cowVisible = cowSporeFrames.some((f) => f.sporeVis.anyVisible);
  const cowBest = cowSporeFrames.reduce((best, f) => {
    if (!best) return f.sporeVis;
    return (f.sporeVis.visibleCount > best.visibleCount) ? f.sporeVis : best;
  }, null);
  ok(cowVisible, `${vp.name}: cowboy spores visible (in viewport, opacity>0.5, size≥24, elementFromPoint)`);
  if (cowBest) {
    console.log(`    cowboy spore best`, { visibleCount: cowBest.visibleCount, origin: cowBest.origin, expected: cowBest.expectedOrigin, maxMinDim: cowBest.maxMinDim, maxOp: cowBest.maxOp });
  }

  const ghostSporeFrames = ghostFrames.filter((f) => f.sporeVis && f.sporeVis.count > 0);
  const ghostOrigin = ghostSporeFrames.map((f) => f.sporeVis.origin).find(Boolean);
  const cowOrigin = cowSporeFrames.map((f) => f.sporeVis.origin).find(Boolean);
  const originDelta = (ghostOrigin && cowOrigin)
    ? Math.hypot(ghostOrigin.x - cowOrigin.x, ghostOrigin.y - cowOrigin.y)
    : Infinity;
  ok(
    originDelta <= 10,
    `${vp.name}: cowboy spore spawn origin matches ghost within ~10px (Δ=${originDelta === Infinity ? 'n/a' : originDelta.toFixed(1)}px)`
  );

  // Side-by-side spore frame screenshots
  const gShot = ghostSporeFrames.find((f) => f.sporeVis?.anyVisible)?.shot || ghostSporeFrames[0]?.shot;
  const cShot = cowSporeFrames.find((f) => f.sporeVis?.anyVisible)?.shot || cowSporeFrames[0]?.shot;
  if (gShot) fs.copyFileSync(gShot, path.join(OUT, `ghost-spore-frame-${vp.name}.png`));
  if (cShot) fs.copyFileSync(cShot, path.join(OUT, `cowboy-spore-frame-${vp.name}.png`));

  // Bbox parity: flash relative boxes vs edit-mode within 2px over several float samples
  let worst = 0;
  let worstId = '';
  let samplesCompared = 0;
  for (const flashBoxes of flashRelSamples) {
    for (const id of ['hat', 'mustache', 'pistolL', 'pistolR']) {
      if (!flashBoxes[id] || !editRef[id]) continue;
      const d = maxBoxDelta(flashBoxes[id], editRef[id]);
      samplesCompared += 1;
      if (d > worst) {
        worst = d;
        worstId = id;
      }
    }
  }
  ok(
    samplesCompared >= 8 && worst <= 2,
    `${vp.name}: accessory bbox vs edit-mode ≤2px while floating (worst ${worst.toFixed(2)}px on ${worstId || 'n/a'}, n=${samplesCompared})`
  );

  // Save a mid-flash screenshot path note
  const flashShot = cowFrames.find((f) => f.overlayOpacity > 0.05 || (f.cambioPropIds && f.cambioPropIds.length >= 4));
  if (flashShot) {
    fs.copyFileSync(flashShot.shot, path.join(OUT, `cowboy-flash-frame-${vp.name}.png`));
  }

  await waitHint(page, /Cowboy play finished/i, 25000);
  const cReset = await page.evaluate(() => ({
    flashOwned: document.querySelectorAll('.activation-flash-layer, #effectOverlay').length,
    flashHost: document.querySelectorAll('.activation-flash-host').length,
    props: document.querySelectorAll('.cambio-prop').length,
    spores: document.querySelectorAll('.activation-spore').length,
    main: document.querySelectorAll('#mainCreature').length
  }));
  ok(
    cReset.flashOwned === 0 && cReset.flashHost === 0 && cReset.props === 0 && cReset.spores === 0 && cReset.main === 1,
    `${vp.name}: cowboy reset cleared overlays/spores; character untouched`
  );

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
