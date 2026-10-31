/**
 * previewObjectActions (default false):
 * - Click preview / previewClick must NOT emit muzzle flashes
 * - Real activate/Play MUST emit muzzle flashes
 */
import { chromium } from 'playwright';

const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8788';
let failures = 0;
function ok(c, m) { if (c) console.log('  PASS ', m); else { console.error('  FAIL ', m); failures++; } }

async function startFlashCounter(page) {
  await page.evaluate(() => {
    window.__flashCount = { n: 0 };
    if (window.__flashObs) try { window.__flashObs.disconnect(); } catch (_) {}
    window.__flashObs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLElement && node.classList?.contains('activation-muzzle-flash')) {
            window.__flashCount.n += 1;
          }
        }
      }
    });
    window.__flashObs.observe(document.body, { childList: true, subtree: true });
  });
}
async function readFlashCounter(page, ms = 2200) {
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    try { window.__flashObs?.disconnect(); } catch (_) {}
    return { ...window.__flashCount };
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(`${BASE}/cambio/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#mainCreature', { timeout: 20000 });
await page.waitForFunction(() => window.__cambioTest?.getState?.()?.manifest, null, { timeout: 15000 });

// Confirm default flag
const flag = await page.evaluate(() => {
  const a = (window.__cambioTest.getState().runtimeConfig?.animations || window.__cambioTest.getState().manifest.animations)
    .find((x) => x.id === 'cowboy');
  return a?.previewObjectActions;
});
ok(flag === false || flag == null, `cowboy.previewObjectActions default false/undefined (got ${flag})`);

// Preview click — no object actions
await startFlashCounter(page);
await page.evaluate(() => window.__cambioTest.previewClick('cowboy'));
const preview = await readFlashCounter(page, 2400);
console.log('preview flashes', preview);
ok(preview.n === 0, `previewClick emits 0 muzzle flashes (got ${preview.n})`);

// Spores/overlays should still appear
const sporeCount = await page.evaluate(() => document.querySelectorAll('.activation-click-spore, .spore.activation-click-spore').length);
// May have cleaned up already; also check during a fresh preview with immediate count
await page.evaluate(() => {
  window.__sporeSeen = 0;
  if (window.__sporeObs) try { window.__sporeObs.disconnect(); } catch (_) {}
  window.__sporeObs = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLElement && (node.classList.contains('activation-click-spore') || node.classList.contains('spore'))) {
          window.__sporeSeen += 1;
        }
      }
    }
  });
  window.__sporeObs.observe(document.body, { childList: true, subtree: true });
});
await page.evaluate(() => window.__cambioTest.previewClick('cowboy'));
await page.waitForTimeout(400);
const spores = await page.evaluate(() => {
  try { window.__sporeObs?.disconnect(); } catch (_) {}
  return window.__sporeSeen;
});
ok(spores >= 4, `previewClick still shows overlay spores (got ${spores})`);

// Real Play — object actions DO run
await startFlashCounter(page);
await page.evaluate(() => window.__cambioTest.runActivationPlay?.('cowboy') || window.__cambioTest.playAnimation?.('cowboy'));
const play = await readFlashCounter(page, 2800);
console.log('play flashes', play);
ok(play.n >= 4, `real Play emits muzzle flashes (got ${play.n})`);

await browser.close();
console.log('\nfailures:', failures);
process.exit(failures ? 1 : 0);
