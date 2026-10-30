#!/usr/bin/env node
/**
 * Local Cambio connector/rotation/layout verify (wrangler pages dev).
 * Usage: node tests/cambio-connectors-test.mjs http://127.0.0.1:8788
 * Forbidden: pages.dev hosts.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const raw = (process.argv[2] || 'http://127.0.0.1:8788').replace(/\/$/, '');
const host = new URL(raw).hostname;
if (/\.pages\.dev$/i.test(host)) {
  console.error('FAIL: pages.dev hosts forbidden');
  process.exit(2);
}

const OUT = '/workspace/capture/yaitg-cambio-connectors';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const failures = [];

function ok(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures.push(msg);
}

await page.goto(`${raw}/cambio/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(800);

// Layout: left rail + real sage stage
const leftRail = await page.locator('.cambio-rail-left').boundingBox();
const editHidden = await page.locator('#editSection').evaluate((el) => el.classList.contains('hidden'));
const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
ok(leftRail && leftRail.x < 40, 'left rail far left');
ok(editHidden, 'edit rail hidden until Edit');
ok(/122,\s*181,\s*160|122,\s*181,\s*160/.test(bodyBg) || bodyBg.includes('122'), `sage body bg (${bodyBg})`);

await page.screenshot({ path: path.join(OUT, '01-list.png'), fullPage: true });

// Enter cowboy edit
await page.locator('#animList li[data-id="cowboy"] button', { hasText: 'Edit' }).click();
await page.waitForTimeout(600);
const editVisible = !(await page.locator('#editSection').evaluate((el) => el.classList.contains('hidden')));
const rightRail = await page.locator('.cambio-rail-right').boundingBox();
ok(editVisible, 'edit rail visible after Edit');
ok(rightRail && rightRail.x > 1000, `edit rail far right (x=${rightRail?.x})`);

// Character should not be covered by rails — creature center in middle band
const creatureBox = await page.locator('#mainCreature').boundingBox();
ok(creatureBox && creatureBox.x > 250 && creatureBox.x + creatureBox.width < 1150, `creature clear of rails (x=${creatureBox?.x})`);

await page.screenshot({ path: path.join(OUT, '02-edit-hat.png'), fullPage: true });

// Hat horizontal: naturalWidth > naturalHeight
const hatAspect = await page.evaluate(async () => {
  const img = document.querySelector('.cambio-prop[data-element-id="hat"]');
  if (!img) return null;
  if (!img.complete) await new Promise((r) => { img.onload = r; });
  return { nw: img.naturalWidth, nh: img.naturalHeight, w: img.getBoundingClientRect().width, h: img.getBoundingClientRect().height };
});
ok(hatAspect && hatAspect.nw > hatAspect.nh, `hat asset landscape (${hatAspect?.nw}x${hatAspect?.nh})`);
ok(hatAspect && hatAspect.w > hatAspect.h, `hat displayed wider than tall (${hatAspect?.w?.toFixed(1)}x${hatAspect?.h?.toFixed(1)})`);

// Rotation works
await page.evaluate(() => window.__cambioTest.setRotation('hat', 25));
await page.waitForTimeout(100);
const rot = await page.evaluate(() => window.__cambioTest.measureAttachment('hat'));
ok(rot && rot.rotation === 25, `rotation set to 25 (got ${rot?.rotation})`);
await page.screenshot({ path: path.join(OUT, '03-hat-rotated.png'), fullPage: true });
await page.evaluate(() => window.__cambioTest.setRotation('hat', 0));

// Two-click connector: set objectAnchor off-center, characterAnchor known
await page.evaluate(() => {
  window.__cambioTest.setConnectors('hat', { x: 0.5, y: 0.9 }, { x: 0.5, y: 0.1 });
});
await page.waitForTimeout(100);

// Sample attachment at 2+ float frames
const samples = [];
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(700); // float period 4s; sample across frames
  const m = await page.evaluate(() => window.__cambioTest.measureAttachment('hat'));
  samples.push(m);
}
console.log('attachment samples', JSON.stringify(samples, null, 2));
for (const [i, s] of samples.entries()) {
  ok(s && Math.abs(s.dx) < 2.5 && Math.abs(s.dy) < 2.5, `attach frame${i} dx=${s?.dx?.toFixed(2)} dy=${s?.dy?.toFixed(2)}`);
}

// Float parenting: prop and creature should share similar translateY delta across frames
const floatCheck = await page.evaluate(async () => {
  const creature = document.getElementById('mainCreature');
  const hat = document.querySelector('.cambio-prop[data-element-id="hat"]');
  const r1c = creature.getBoundingClientRect();
  const r1h = hat.getBoundingClientRect();
  await new Promise((r) => setTimeout(r, 1000));
  const r2c = creature.getBoundingClientRect();
  const r2h = hat.getBoundingClientRect();
  return {
    dCreature: r2c.top - r1c.top,
    dHat: r2h.top - r1h.top,
    // hat attach point vs creature should stay stable relative
  };
});
const floatDelta = Math.abs(floatCheck.dCreature - floatCheck.dHat);
ok(floatDelta < 3, `float parenting delta ${floatDelta.toFixed(2)} (creature ${floatCheck.dCreature.toFixed(2)} hat ${floatCheck.dHat.toFixed(2)})`);

await page.screenshot({ path: path.join(OUT, '04-connectors.png'), fullPage: true });

// Save / reload via localhost API (unauthed allowed)
const saveResult = await page.evaluate(async () => {
  document.getElementById('btnSave').click();
  await new Promise((r) => setTimeout(r, 800));
  return document.getElementById('saveStatus').textContent;
});
ok(/Saved/i.test(saveResult), `save status: ${saveResult}`);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.locator('#animList li[data-id="cowboy"] button', { hasText: 'Edit' }).click();
await page.waitForTimeout(500);
const reloaded = await page.evaluate(() => {
  const st = window.__cambioTest.getState();
  return st.placements?.byAnimation?.cowboy?.elements?.hat;
});
ok(reloaded?.characterAnchor?.y === 0.1, `reload characterAnchor.y=${reloaded?.characterAnchor?.y}`);
ok(reloaded?.objectAnchor?.y === 0.9, `reload objectAnchor.y=${reloaded?.objectAnchor?.y}`);
ok(reloaded && !('x' in reloaded && !reloaded.characterAnchor), 'migrated shape (no bare legacy-only)');

await page.screenshot({ path: path.join(OUT, '05-after-reload.png'), fullPage: true });

await browser.close();
if (failures.length) {
  console.error('FAILURES:', failures);
  process.exit(1);
}
console.log('ALL PASS');
process.exit(0);
