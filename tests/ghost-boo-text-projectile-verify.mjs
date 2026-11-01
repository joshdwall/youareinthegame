/**
 * Preview verify: ghost climax shoots BOO textProjectiles from spore mouths.
 * Desktop + 390x844. Manual/preview only — not in npm run verify.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8789';
const OUT = path.resolve(__dirname, '../tmp/ghost-boo-verify');
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
function ok(c, m) {
  if (c) console.log('  PASS ', m);
  else { console.error('  FAIL ', m); failures++; }
}

async function forceGhostClimax(page) {
  await page.evaluate(async () => {
    const effect = window.__yaitgEffect;
    const mod = await import('/runtime/public/thresholdActivation.js');
    const ghost = (await (await fetch('/api/animations')).json()).animations?.find((a) => a.id === 'ghost')
      || { id: 'ghost', playMode: 'legacy-ghost' };
    mod.setUpcomingForTests?.({ id: 'ghost', anim: ghost });
    await mod.prepareUpcoming?.(document.getElementById('mainCreature'));
    effect.finaleInProgress = false;
    effect.lightningSequenceActive = false;
    // Fire and forget — climax runs async (lightning then fireworks)
    void effect.triggerLightningReset();
  });
}

async function runViewport(label, w, h) {
  console.log(`\n== ${label} ${w}x${h} ==`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.addInitScript(() => { document.documentElement.dataset.yaitgAllowForce = '1'; });
  await page.goto(`${BASE}/?force=ghost&t=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#mainCreature', { timeout: 20000 });
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    window.__booCount = { n: 0, texts: [] };
    if (window.__booObs) try { window.__booObs.disconnect(); } catch (_) {}
    window.__booObs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList?.contains('activation-text-projectile')) {
            window.__booCount.n += 1;
            window.__booCount.texts.push((node.textContent || '').trim());
          }
        }
      }
    });
    window.__booObs.observe(document.body, { childList: true, subtree: true });
  });

  await forceGhostClimax(page);

  let shot = false;
  let peak = { n: 0, texts: [], live: [], spores: 0, weight: null, color: null };
  // Lightning ~2–3s then staggered firework launches — poll up to ~6s
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    const snap = await page.evaluate(() => {
      const liveNodes = [...document.querySelectorAll('.activation-text-projectile')];
      const live = liveNodes.map((el) => (el.textContent || '').trim());
      let weight = null, color = null, transform = null;
      if (liveNodes[0]) {
        const cs = getComputedStyle(liveNodes[0]);
        weight = cs.fontWeight;
        color = cs.color;
        transform = cs.textTransform;
      }
      return {
        n: window.__booCount?.n || 0,
        texts: (window.__booCount?.texts || []).slice(),
        live,
        spores: document.querySelectorAll('.firework-spore').length,
        weight,
        color,
        transform
      };
    });
    if (snap.n >= peak.n) peak = snap;
    if (!shot && snap.live.length > 0) {
      await page.screenshot({ path: path.join(OUT, `${label}-boo.png`), fullPage: false });
      shot = true;
    }
    if (peak.n >= 4 && shot) break;
  }
  if (!shot) {
    await page.screenshot({ path: path.join(OUT, `${label}-miss.png`), fullPage: false });
  }

  console.log({
    peakN: peak.n,
    texts: peak.texts.slice(0, 8),
    spores: peak.spores,
    weight: peak.weight,
    color: peak.color
  });

  ok(peak.n >= 1, `${label}: at least one BOO (got ${peak.n})`);
  ok(peak.texts.some((t) => t.toUpperCase() === 'BOO'), `${label}: text content BOO`);
  if (peak.weight != null) {
    ok(Number(peak.weight) >= 700 || peak.weight === 'bold', `${label}: bold (${peak.weight})`);
  } else {
    ok(false, `${label}: could not sample live font-weight`);
  }
  if (peak.color) {
    // black ≈ rgb(0, 0, 0)
    ok(/rgb\(\s*0,\s*0,\s*0\s*\)/.test(peak.color), `${label}: black color (${peak.color})`);
  }
  if (peak.transform) {
    ok(peak.transform === 'uppercase', `${label}: uppercase`);
  }

  await browser.close();
  return peak;
}

await runViewport('desktop', 1366, 768);
await runViewport('mobile', 390, 844);

console.log('\nScreenshots in', OUT);
console.log(fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).join(', '));
if (failures) {
  console.error(`\nFAILED (${failures})`);
  process.exit(1);
}
console.log('\nALL PASS');
