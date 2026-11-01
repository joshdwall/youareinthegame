/**
 * Preview verify: ghost BOO (longer hold) + cowboy guns over a few cycles.
 * Desktop + 390x844. Manual/preview only.
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

async function forceClimax(page, animId) {
  await page.evaluate(async (id) => {
    const effect = window.__yaitgEffect;
    const mod = await import('/runtime/public/thresholdActivation.js');
    const data = await (await fetch('/api/animations')).json();
    const anim = data.animations?.find((a) => a.id === id)
      || (id === 'ghost' ? { id: 'ghost', playMode: 'legacy-ghost' } : null);
    if (!anim) throw new Error('anim not found: ' + id);
    mod.setUpcomingForTests?.({ id, anim });
    await mod.prepareUpcoming?.(document.getElementById('mainCreature'));
    effect.finaleInProgress = false;
    effect.lightningSequenceActive = false;
    void effect.triggerLightningReset();
  }, animId);
}

async function observeAndCapture(page, label, kind) {
  await page.evaluate((k) => {
    window.__oaCount = { n: 0, texts: [], kinds: [] };
    if (window.__oaObs) try { window.__oaObs.disconnect(); } catch (_) {}
    window.__oaObs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (k === 'boo' && node.classList?.contains('activation-text-projectile')) {
            window.__oaCount.n += 1;
            window.__oaCount.texts.push((node.textContent || '').trim());
            window.__oaCount.kinds.push('boo');
          }
          if (k === 'fire' && (
            node.classList?.contains('activation-muzzle-flash')
            || node.classList?.contains('activation-bullet')
            || node.classList?.contains('muzzle-flash')
            || node.getAttribute?.('data-fire-projectile') != null
            || node.className?.toString?.().includes('fire')
          )) {
            window.__oaCount.n += 1;
            window.__oaCount.kinds.push('fire');
          }
        }
      }
    });
    window.__oaObs.observe(document.body, { childList: true, subtree: true });
  }, kind);

  await forceClimax(page, kind === 'boo' ? 'ghost' : 'cowboy');

  let shot = false;
  let peak = { n: 0, texts: [], live: 0, spores: 0, weight: null, color: null, durationMs: null, holdRatio: null };
  const loops = kind === 'boo' ? 50 : 45;
  for (let i = 0; i < loops; i++) {
    await page.waitForTimeout(150);
    const snap = await page.evaluate((k) => {
      const liveBoo = [...document.querySelectorAll('.activation-text-projectile')];
      const liveFire = [...document.querySelectorAll(
        '.activation-muzzle-flash, .activation-bullet, [data-fire-projectile], .muzzle-flash'
      )];
      // Also count any absolute tips created by fireOnce
      const fireExtra = [...document.querySelectorAll('.activation-composite .activation-projectile, .activation-spore [class*="bullet"], .activation-spore [class*="muzzle"]')];
      let weight = null, color = null, durationMs = null;
      if (k === 'boo' && liveBoo[0]) {
        const cs = getComputedStyle(liveBoo[0]);
        weight = cs.fontWeight;
        color = cs.color;
        const anims = liveBoo[0].getAnimations?.() || [];
        if (anims[0]?.effect?.getTiming) {
          durationMs = anims[0].effect.getTiming().duration;
        }
      }
      return {
        n: window.__oaCount?.n || 0,
        texts: (window.__oaCount?.texts || []).slice(),
        live: k === 'boo' ? liveBoo.length : Math.max(liveFire.length, fireExtra.length),
        spores: document.querySelectorAll('.firework-spore, .activation-spore').length,
        weight,
        color,
        durationMs,
        prepared: window.__yaitgPrepared || null
      };
    }, kind);
    if (snap.n >= peak.n) peak = { ...peak, ...snap };
    if (!shot && (snap.live > 0 || snap.n > 0)) {
      await page.screenshot({ path: path.join(OUT, `${label}-${kind}.png`), fullPage: false });
      shot = true;
    }
    if (peak.n >= (kind === 'boo' ? 3 : 2) && shot) break;
  }
  if (!shot) {
    await page.screenshot({ path: path.join(OUT, `${label}-${kind}-miss.png`), fullPage: false });
  }

  // Read placements config from page for duration assertion
  const cfg = await page.evaluate(async () => {
    try {
      const r = await fetch('/content/cambio-placements.json');
      const j = await r.json();
      const oa = j?.byAnimation?.ghost?.elements?.ghostBody?.objectActions?.[0];
      return { durationMs: oa?.durationMs, holdRatio: oa?.holdRatio, type: oa?.type };
    } catch (e) {
      return { error: String(e) };
    }
  });

  console.log({ label, kind, peakN: peak.n, live: peak.live, spores: peak.spores, weight: peak.weight, color: peak.color, durationMsAnim: peak.durationMs, cfg });

  if (kind === 'boo') {
    ok(peak.n >= 1, `${label}: BOO count >=1 (got ${peak.n})`);
    ok(peak.texts.some((t) => t.toUpperCase() === 'BOO'), `${label}: text BOO`);
    if (peak.weight != null) ok(Number(peak.weight) >= 700 || peak.weight === 'bold', `${label}: bold`);
    if (peak.color) ok(/rgb\(\s*0,\s*0,\s*0\s*\)/.test(peak.color), `${label}: black`);
    ok(cfg.durationMs >= 1100 && cfg.durationMs <= 1300, `${label}: config durationMs ~1200 (${cfg.durationMs})`);
    ok(cfg.holdRatio != null && cfg.holdRatio > 0, `${label}: holdRatio set (${cfg.holdRatio})`);
    if (peak.durationMs != null) {
      ok(peak.durationMs >= 1100 && peak.durationMs <= 1300, `${label}: live anim durationMs (${peak.durationMs})`);
    }
  } else {
    // Cowboy: spores should exist; fire visuals may be brief — also accept spore composites with pistols
    const hasGuns = await page.evaluate(() => {
      return document.querySelectorAll('[data-element-id="pistolL"], [data-element-id="pistolR"]').length;
    });
    ok(peak.spores >= 1 || peak.n >= 1 || hasGuns >= 1, `${label}: cowboy spores/guns activity (spores=${peak.spores}, fireN=${peak.n}, guns=${hasGuns})`);
    ok(peak.n >= 1 || hasGuns >= 1, `${label}: fire OA or pistol nodes present (fireN=${peak.n}, guns=${hasGuns})`);
  }
  return peak;
}

async function runViewport(label, w, h) {
  console.log(`\n== ${label} ${w}x${h} ==`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.addInitScript(() => { document.documentElement.dataset.yaitgAllowForce = '1'; });
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#mainCreature', { timeout: 20000 });
  await page.waitForTimeout(600);

  // Cycle 1: ghost BOO
  await observeAndCapture(page, `${label}-c1`, 'boo');
  await page.waitForTimeout(500);

  // Cycle 2: cowboy guns
  await observeAndCapture(page, `${label}-c2`, 'fire');
  await page.waitForTimeout(500);

  // Cycle 3: ghost again
  await observeAndCapture(page, `${label}-c3`, 'boo');

  await browser.close();
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
