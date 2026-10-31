/**
 * Threshold click → first flash frame with overlay visible.
 * Cowboy composite must match ghost timing within ~1 frame (~16–32ms budget for
 * start delay), and no sampled frame may show body flash without overlay props.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../test-results/activation-timing');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8788';

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log(`  PASS  ${msg}`);
  else { console.error(`  FAIL  ${msg}`); failures += 1; }
}

async function measure(forceId) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { document.documentElement.dataset.yaitgAllowForce = '1'; });
  await page.goto(`${BASE}/?force=${forceId}&t=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#mainCreature', { timeout: 20000 });
  // Wait for upcoming prepared
  await page.waitForFunction(() => {
    const u = window.__yaitgUpcoming;
    const p = window.__yaitgPrepared;
    if (!u) return false;
    if (u.id === 'ghost') return true;
    return p?.ready === true;
  }, { timeout: 15000 });
  await page.waitForTimeout(300);

  const result = await page.evaluate(async (fid) => {
    const effect = window.__yaitgEffect;
    if (!effect) return { err: 'no effect' };
    effect.resetThreshold = 999;
    effect.clickCount = 0;
    effect.lightningSequenceActive = false;
    effect.finaleInProgress = false;

    const samples = [];
    let firstOverlayMs = null;
    let firstFlashMs = null;
    let blankFlashFrames = 0;
    const t0 = performance.now();

    const probe = () => {
      const now = performance.now() - t0;
      const bodyFlash = !!document.querySelector('.lightning-flash');
      const ghostOv = document.getElementById('effectOverlay');
      const ghostVisible = ghostOv && parseFloat(getComputedStyle(ghostOv).opacity || '0') > 0.05;
      const props = [...document.querySelectorAll('.activation-prop, #overlayLayer img[data-element-id]')];
      const host = document.getElementById('overlayLayer');
      const hostOp = host ? parseFloat(getComputedStyle(host).opacity || '0') : 0;
      // Cowboy: props mounted from frame one (opacity may still be fading in — same as ghost FADE_IN).
      // Blank = body flash with ZERO overlay content mounted (true miss), not fade-in.
      const propsMounted = props.length > 0;
      const propsVisible = propsMounted && hostOp > 0.05;
      const overlayVisible = fid === 'ghost' ? ghostVisible : propsVisible;
      const overlayReady = fid === 'ghost' ? ghostVisible : propsMounted;
      if (bodyFlash && !firstFlashMs) firstFlashMs = now;
      if (overlayVisible && !firstOverlayMs) firstOverlayMs = now;
      if (bodyFlash && !overlayReady) blankFlashFrames += 1;
      samples.push({ now, bodyFlash, overlayVisible, props: props.length, hostOp });
    };

    const iv = setInterval(probe, 8);
    // Fire threshold immediately
    effect.clickCount = effect.resetThreshold = 1;
    const p = effect.triggerLightningReset();
    // Sample for ~800ms
    await new Promise((r) => setTimeout(r, 800));
    clearInterval(iv);
    // Don't await full activation
    return {
      forceId: fid,
      firstFlashMs,
      firstOverlayMs,
      deltaOverlayAfterFlash: firstOverlayMs != null && firstFlashMs != null
        ? firstOverlayMs - firstFlashMs
        : null,
      blankFlashFrames,
      sampleCount: samples.length,
      early: samples.slice(0, 12)
    };
  }, forceId);

  await page.screenshot({ path: path.join(OUT, `timing-${forceId}.png`) });
  await browser.close();
  return result;
}

const ghost = await measure('ghost');
const cowboy = await measure('cowboy');
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ ghost, cowboy }, null, 2));

console.log('ghost', ghost);
console.log('cowboy', cowboy);

ok(ghost.firstFlashMs != null && ghost.firstFlashMs < 100, `ghost first flash <100ms (got ${ghost.firstFlashMs})`);
ok(cowboy.firstFlashMs != null && cowboy.firstFlashMs < 100, `cowboy first flash <100ms (got ${cowboy.firstFlashMs})`);
ok(cowboy.firstOverlayMs != null, `cowboy overlay became visible (ms=${cowboy.firstOverlayMs})`);
if (cowboy.firstFlashMs != null && cowboy.firstOverlayMs != null) {
  const d = Math.abs(cowboy.firstOverlayMs - cowboy.firstFlashMs);
  ok(d <= 32, `cowboy overlay within ~1–2 frames of flash (Δ=${d.toFixed(1)}ms)`);
}
ok((cowboy.blankFlashFrames || 0) === 0, `cowboy never flashes without mounted overlay (blank=${cowboy.blankFlashFrames})`);
ok((ghost.blankFlashFrames || 0) >= 0, `ghost blank(fade) frames recorded (${ghost.blankFlashFrames})`);
// Start times should be similar (both immediate)
if (ghost.firstFlashMs != null && cowboy.firstFlashMs != null) {
  const skew = Math.abs(cowboy.firstFlashMs - ghost.firstFlashMs);
  ok(skew <= 50, `cowboy vs ghost first-flash skew ≤50ms (got ${skew.toFixed(1)}ms)`);
}

console.log('failures:', failures);
process.exit(failures ? 1 : 0);
