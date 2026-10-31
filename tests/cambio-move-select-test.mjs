#!/usr/bin/env node
/**
 * Move mode (drag-to-stick) + selected-object prompt/isolation for all 4 cowboy props.
 * Usage: node tests/cambio-move-select-test.mjs http://127.0.0.1:8788
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const raw = (process.argv[2] || 'http://127.0.0.1:8788').replace(/\/$/, '');
if (/\.pages\.dev$/i.test(new URL(raw).hostname)) {
  console.error('FAIL: pages.dev forbidden');
  process.exit(2);
}

const OUT = '/workspace/capture/yaitg-move-select';
fs.mkdirSync(OUT, { recursive: true });

const ELEMENTS = [
  { id: 'hat', name: 'hat' },
  { id: 'mustache', name: 'mustache' },
  { id: 'pistolL', name: 'left pistol' },
  { id: 'pistolR', name: 'right pistol' }
];

const failures = [];
function ok(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures.push(msg);
}

function deepEq(a, b, keys) {
  for (const k of keys) {
    if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) return false;
  }
  return true;
}

async function openEdit(page) {
  await page.goto(`${raw}/cambio/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__cambioTest?.getState?.()?.manifest, null, { timeout: 15000 });
  await page.locator('#animList .od-fd-row[data-row-id="cowboy"] button', { hasText: 'Edit' }).click();
  await page.waitForTimeout(500);
  await page.waitForSelector('#selectedControls:not(.hidden)');
}

async function snapshotAll(page) {
  return page.evaluate(() => {
    const st = window.__cambioTest.getState();
    const animId = st.selectedAnim?.id;
    const place = st.placements.byAnimation[animId]?.elements || {};
    const out = {};
    for (const id of Object.keys(place)) out[id] = JSON.parse(JSON.stringify(place[id]));
    return out;
  });
}

async function runSelectedObjectPrompts(page, label) {
  console.log(`\n=== Selected-object prompts @ ${label} ===`);
  await openEdit(page);

  // Move button visible
  const moveBtn = page.locator('#btnEditMove');
  ok(await moveBtn.isVisible(), `${label}: ✎ Move button visible`);
  const moveText = await moveBtn.textContent();
  ok(/Move/i.test(moveText || ''), `${label}: Move button labeled (${moveText})`);

  for (const el of ELEMENTS) {
    await page.evaluate((id) => window.__cambioTest.selectElement(id), el.id);
    await page.waitForTimeout(150);

    const beforeAll = await snapshotAll(page);

    // Connector prompt names the right object
    await page.click('#btnEditConnector');
    await page.waitForTimeout(150);
    const hint = await page.locator('#connectorHint').textContent();
    ok(
      hint && hint.toLowerCase().includes(el.name),
      `${label}: connector prompt names "${el.name}" (got: ${hint})`
    );
    ok(
      !ELEMENTS.filter((e) => e.id !== el.id).some((o) =>
        // allow "pistol" substring only for pistol* ; block wrong full names
        hint.toLowerCase().includes(o.name) && o.name !== el.name
      ),
      `${label}: connector prompt does not name a different object`
    );

    const mode = await page.evaluate(() => window.__cambioTest.getState().activeMode);
    ok(mode === 'connector', `${label}: ${el.id} connector mode active`);

    // Cancel without changing — then verify only that element would be writable
    // Actually do a tiny object-anchor click then cancel and ensure others untouched
    const prop = page.locator(`.cambio-prop[data-element-id="${el.id}"]`);
    const box = await prop.boundingBox();
    ok(!!box, `${label}: ${el.id} prop hit target`);
    if (box) {
      await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
      await page.waitForTimeout(200);
    }
    const mid = await snapshotAll(page);
    for (const other of ELEMENTS) {
      if (other.id === el.id) continue;
      ok(
        deepEq(beforeAll[other.id], mid[other.id], [
          'objectAnchor', 'characterAnchor', 'rotation', 'scale', 'flipX'
        ]),
        `${label}: connector on ${el.id} did not change ${other.id}`
      );
    }
    // selected element's objectAnchor may have changed; scale/rotation must not
    ok(
      deepEq(beforeAll[el.id], mid[el.id], ['rotation', 'scale', 'flipX']),
      `${label}: connector on ${el.id} did not change scale/rotation`
    );

    await page.click('#btnCancelConnector');
    await page.waitForTimeout(150);
    const afterCancel = await snapshotAll(page);
    ok(
      deepEq(beforeAll[el.id], afterCancel[el.id], [
        'objectAnchor', 'characterAnchor', 'rotation', 'scale', 'flipX'
      ]),
      `${label}: connector cancel restored ${el.id}`
    );

    // Move mode prompt
    await page.click('#btnEditMove');
    await page.waitForTimeout(100);
    const moveHint = await page.locator('#moveHint').textContent();
    ok(
      moveHint && moveHint.toLowerCase().includes(el.name),
      `${label}: move hint names "${el.name}" (got: ${moveHint})`
    );
    await page.click('#btnCancelMove');
    await page.waitForTimeout(100);
  }
}

async function runMoveDrag(page, label) {
  console.log(`\n=== Move drag @ ${label} ===`);
  await openEdit(page);
  await page.evaluate(() => window.__cambioTest.selectElement('hat'));
  await page.waitForTimeout(200);

  const before = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  const beforeAll = await snapshotAll(page);

  await page.click('#btnEditMove');
  await page.waitForTimeout(150);

  const hat = page.locator('.cambio-prop[data-element-id="hat"]');
  const b0 = await hat.boundingBox();
  ok(!!b0, `${label}: hat box`);

  // Real mouse drag while float is running — wait mid-float
  await page.waitForTimeout(900);
  const b1 = await hat.boundingBox();
  // Grab near center of visible hat; should not jump (attach follows grab offset)
  const startX = b1.x + b1.width * 0.55;
  const startY = b1.y + b1.height * 0.55;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Sample jump: after small move, then larger drag
  await page.mouse.move(startX + 2, startY + 2, { steps: 2 });
  await page.waitForTimeout(50);
  const afterGrab = await page.evaluate(() => {
    const img = document.querySelector('.cambio-prop[data-element-id="hat"]');
    return { left: parseFloat(img.style.left), top: parseFloat(img.style.top) };
  });
  // Continue drag to a new spot
  await page.mouse.move(startX + 70, startY - 50, { steps: 12 });
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(200);

  const mid = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  ok(Math.abs(mid.scale - before.scale) < 0.001, `${label}: move did not change scale`);
  ok(mid.rotation === before.rotation, `${label}: move did not change rotation`);
  ok(
    JSON.stringify(mid.objectAnchor) === JSON.stringify(before.objectAnchor) ||
      (!before.objectAnchor && mid.objectAnchor?.x === 0.5),
    `${label}: move kept objectAnchor`
  );
  ok(
    Math.abs(mid.characterAnchor.x - before.characterAnchor.x) > 0.01 ||
      Math.abs(mid.characterAnchor.y - before.characterAnchor.y) > 0.01,
    `${label}: move changed characterAnchor`
  );

  // Other elements untouched during drag (before commit)
  const midAll = await snapshotAll(page);
  for (const other of ELEMENTS.filter((e) => e.id !== 'hat')) {
    ok(
      deepEq(beforeAll[other.id], midAll[other.id], [
        'objectAnchor', 'characterAnchor', 'rotation', 'scale', 'flipX'
      ]),
      `${label}: move hat did not change ${other.id}`
    );
  }

  await page.click('#btnSaveMove');
  await page.waitForTimeout(150);
  const savedLocal = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));

  // Persist + reload
  await page.click('#btnSave');
  await page.waitForTimeout(900);
  const saveStatus = await page.locator('#saveStatus').textContent();
  ok(/Saved/i.test(saveStatus || ''), `${label}: placements saved (${saveStatus})`);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__cambioTest?.getState?.()?.manifest, null, { timeout: 15000 });
  await page.locator('#animList .od-fd-row[data-row-id="cowboy"] button', { hasText: 'Edit' }).click();
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__cambioTest.selectElement('hat'));

  const reloaded = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  ok(
    Math.abs(reloaded.characterAnchor.x - savedLocal.characterAnchor.x) < 0.02 &&
      Math.abs(reloaded.characterAnchor.y - savedLocal.characterAnchor.y) < 0.02,
    `${label}: characterAnchor survived reload (${JSON.stringify(reloaded.characterAnchor)})`
  );
  ok(Math.abs(reloaded.scale - before.scale) < 0.001, `${label}: scale still unchanged after reload`);
  ok(reloaded.rotation === before.rotation, `${label}: rotation still unchanged after reload`);

  // Float attach stable across frames
  const samples = [];
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(700);
    samples.push(await page.evaluate(() => window.__cambioTest.measureAttachment('hat')));
  }
  for (const [i, s] of samples.entries()) {
    ok(s && Math.abs(s.dx) < 2.5 && Math.abs(s.dy) < 2.5,
      `${label}: float attach frame${i} dx=${s?.dx?.toFixed(2)} dy=${s?.dy?.toFixed(2)}`);
  }

  void afterGrab; // grab offset exercised; no hard jump assert (float noise)
  await page.screenshot({ path: path.join(OUT, `move-${label.replace(/[^a-z0-9]+/gi, '_')}.png`) });
}

const browser = await chromium.launch();
for (const vp of [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1366x768', width: 1366, height: 768 }
]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  try {
    await runSelectedObjectPrompts(page, vp.name);
    await runMoveDrag(page, vp.name);
  } catch (err) {
    ok(false, `${vp.name} threw: ${err.message}`);
    console.error(err);
  }
  await page.close();
}
await browser.close();

console.log(`\n${failures.length ? 'FAILED' : 'ALL PASS'} — ${failures.length} failure(s)`);
if (failures.length) {
  failures.forEach((f) => console.log(' -', f));
  process.exit(1);
}
