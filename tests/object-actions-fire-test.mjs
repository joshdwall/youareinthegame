/**
 * objectActions fire: Cambio Play + forced public cowboy spores emit alternating muzzle flashes.
 */
import { chromium } from 'playwright';

const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8788';
let failures = 0;
function ok(c, m) { if (c) console.log('  PASS ', m); else { console.error('  FAIL ', m); failures++; } }

const browser = await chromium.launch({ headless: true });

async function startFlashCounter(page) {
  await page.evaluate(() => {
    window.__flashCount = { n: 0, left: 0, right: 0 };
    if (window.__flashObs) try { window.__flashObs.disconnect(); } catch (_) {}
    window.__flashObs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList?.contains('activation-muzzle-flash')) {
            window.__flashCount.n += 1;
            const id = node.getAttribute('data-fire-for') || '';
            if (id === 'pistolL') window.__flashCount.left += 1;
            if (id === 'pistolR') window.__flashCount.right += 1;
          }
        }
      }
    });
    window.__flashObs.observe(document.body, { childList: true, subtree: true });
  });
}
async function readFlashCounter(page, ms = 2500) {
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    try { window.__flashObs?.disconnect(); } catch (_) {}
    return { ...window.__flashCount };
  });
}

// --- Cambio Play ---
{
  console.log('\n== Cambio Play cowboy fire ==');
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(`${BASE}/cambio/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#mainCreature', { timeout: 20000 });
  await page.waitForTimeout(600);
  await startFlashCounter(page);
  await page.evaluate(() => window.__cambioTest?.runActivationPlay?.('cowboy'));
  const r = await readFlashCounter(page, 2800);
  console.log(r);
  ok(r.n >= 4, `Cambio Play produced muzzle flashes (got ${r.n})`);
  ok(r.left >= 1 && r.right >= 1, `both pistols fired (L=${r.left} R=${r.right})`);
  await page.close();
}

// --- Public force=cowboy ---
{
  console.log('\n== Public force=cowboy fire ==');
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.addInitScript(() => { document.documentElement.dataset.yaitgAllowForce = '1'; });
  await page.goto(`${BASE}/?force=cowboy&t=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#mainCreature', { timeout: 20000 });
  await page.waitForTimeout(1200);
  await startFlashCounter(page);
  await page.evaluate(async () => {
    const effect = window.__yaitgEffect;
    const mod = await import('/runtime/public/thresholdActivation.js');
    const cowboy = (await (await fetch('/api/animations')).json()).animations?.find((a) => a.id === 'cowboy');
    mod.setUpcomingForTests?.({ id: 'cowboy', anim: cowboy });
    await mod.prepareUpcoming?.(document.getElementById('mainCreature'));
    effect.finaleInProgress = false;
    effect.lightningSequenceActive = false;
    effect.triggerLightningReset();
  });
  const r = await readFlashCounter(page, 3000);
  console.log(r);
  ok(r.n >= 4, `public cowboy produced muzzle flashes (got ${r.n})`);
  ok(r.left >= 1 && r.right >= 1, `public both pistols (L=${r.left} R=${r.right})`);
  await page.close();
}

await browser.close();
console.log('\nfailures:', failures);
process.exit(failures ? 1 : 0);
