#!/usr/bin/env node
// Real-browser click test: every vignette must spawn effect elements on creature clicks,
// and every transition must fire on the 100th click. Usage: node tests/click-test.mjs <https://host>
import { chromium } from 'playwright';
const U = (process.argv[2] || 'http://localhost:8788').replace(/\/$/, '');
const CASES = [
  { character: 'mushroom', vignette: 'spores', clicks: 8 },
  { character: 'pirate-mushroom', vignette: 'cannons', clicks: 8 },
  { character: 'mushroom', vignette: 'ghost-storm', clicks: 8 },
  { character: 'mushroom', vignette: 'spores', transition: 'lightning', clicks: 100 },
  { character: 'pirate-mushroom', vignette: 'cannons', transition: 'feather-poof', clicks: 100 }
];
const browser = await chromium.launch();
let fail = 0;
for (const c of CASES) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    window.__added = 0; window.__classes = new Set();
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { window.__added++; if (typeof n.className === 'string' && n.className) window.__classes.add(n.className.split(' ')[0]); } })
      .observe(document, { childList: true, subtree: true });
  });
  const q = new URLSearchParams({ character: c.character, vignette: c.vignette, ...(c.transition ? { transition: c.transition } : {}) });
  await page.goto(`${U}/?${q}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000); // let the harness auto-demo finish
  const base = await page.evaluate(() => window.__added);
  let atLast = 0;
  for (let i = 1; i <= c.clicks; i++) {
    if (i === c.clicks) atLast = await page.evaluate(() => window.__added);
    await page.click('#mainCreature', { force: true, position: { x: 60 + (i % 5) * 10, y: 60 } });
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ added: window.__added, classes: [...window.__classes], anims: document.getAnimations().length }));
  const clickDelta = r.added - base, lastDelta = r.added - atLast;
  const ok = errors.length === 0 && clickDelta >= 3 && (!c.transition || lastDelta >= 1);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.character}/${c.vignette}${c.transition ? '+' + c.transition : ''} clicks=${c.clicks} effectNodes=${clickDelta}${c.transition ? ` after100th=${lastDelta}` : ''} classes=${r.classes.slice(0, 8).join(',')}${errors.length ? ' errors=' + errors.slice(0, 2).join(' | ') : ''}`);
  await page.close();
}
await browser.close();
process.exit(fail ? 1 : 0);
