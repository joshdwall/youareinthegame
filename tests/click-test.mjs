#!/usr/bin/env node
// Ghost-only click gate (restored Replit implementation). Usage: node tests/click-test.mjs <https://host>
// - creature click => ghost spores (ghost sprite) and nothing else (no cannons/lightning/react ring)
// - background click => default spores
// - no text selection / caret / focus on the play surface
import { chromium } from 'playwright';
const U = (process.argv[2] || 'http://localhost:8788').replace(/\/$/, '');
const FORBIDDEN = /cannon|lightning|feather|creature-react|character-accessory|effect-overlay-cannon/;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/api/')) errors.push(`${r.status()} ${r.url()}`); });
await page.addInitScript(() => {
  window.__n = [];
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) window.__n.push({ c: String(n.className || ''), src: n.src || n.querySelector?.('img')?.src || n.style?.backgroundImage || '' }); })
    .observe(document, { childList: true, subtree: true });
});
await page.goto(`${U}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const pt = await page.evaluate(() => { const r = document.getElementById('mainCreature').getBoundingClientRect(); window.__n = []; return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(400);
const cr = await page.evaluate(() => window.__n.splice(0));
await page.mouse.click(60, 60);
await page.waitForTimeout(400);
const bg = await page.evaluate(() => window.__n.splice(0));
await page.mouse.click(40, 40, { clickCount: 3 });
await page.mouse.move(40, 40); await page.mouse.down(); await page.mouse.move(900, 700); await page.mouse.up();
const sel = await page.evaluate(() => ({ text: getSelection().toString(), us: getComputedStyle(document.body).userSelect, active: document.activeElement?.tagName }));
const ghost = cr.filter((n) => /ghost/.test(n.src)).length;
const bad = [...cr, ...bg].filter((n) => FORBIDDEN.test(n.c)).map((n) => n.c);
const bgSpores = bg.filter((n) => /spore/.test(n.c) && !/ghost/.test(n.src)).length;
const checks = {
  ghostOnCreatureClick: ghost >= 3,
  noOtherEffects: bad.length === 0,
  defaultSporesOnBackground: bgSpores >= 3,
  noSelection: sel.text === '' && sel.us === 'none' && sel.active === 'BODY',
  noErrors: errors.length === 0
};
let fail = 0;
for (const [k, v] of Object.entries(checks)) { if (!v) fail++; console.log(`${v ? 'PASS' : 'FAIL'} ${k}`); }
console.log(`ghostNodes=${ghost} bgSpores=${bgSpores} forbidden=${[...new Set(bad)].join(',') || 'none'} errors=${errors.slice(0, 2).join(' | ') || 'none'}`);
if (process.env.SHOT) { await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(250); await page.screenshot({ path: process.env.SHOT }); }
await browser.close();
process.exit(fail ? 1 : 0);
