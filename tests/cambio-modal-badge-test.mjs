#!/usr/bin/env node
/**
 * Modal pencil isolation + connector mouse clicks + badge BR verify.
 * Usage: node tests/cambio-modal-badge-test.mjs http://127.0.0.1:8788
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

const OUT = '/workspace/capture/yaitg-modal-badge';
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
function ok(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures.push(msg);
}

function fieldsOf(el) {
  if (!el) return null;
  return {
    objectAnchor: el.objectAnchor,
    characterAnchor: el.characterAnchor,
    rotation: el.rotation,
    scale: el.scale,
    transition: el.transition,
    flipX: el.flipX
  };
}

function deepEq(a, b, keys) {
  for (const k of keys) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
  }
  return true;
}

async function openCowboyEdit(page) {
  await page.goto(`${raw}/cambio/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__cambioTest?.getState?.()?.manifest, null, { timeout: 15000 });
  await page.locator('#animList .od-fd-row[data-row-id="cowboy"] button', { hasText: 'Edit' }).click();
  await page.waitForTimeout(500);
  await page.waitForSelector('#selectedControls:not(.hidden)');
}

async function runModalIsolation(page, label) {
  console.log(`\n=== Modal isolation @ ${label} ===`);
  await openCowboyEdit(page);

  // Baseline
  const baseline = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  ok(baseline && typeof baseline.scale === 'number', `${label}: baseline hat snapshot`);

  // --- Size mode: change scale, cancel → scale restored; other fields untouched during save path ---
  await page.click('#btnEditSize');
  await page.waitForTimeout(150);
  const modeSize = await page.evaluate(() => window.__cambioTest.getState().activeMode);
  ok(modeSize === 'size', `${label}: size mode active`);

  const beforeSize = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  await page.evaluate(() => {
    const sl = document.getElementById('scaleSlider');
    sl.value = '0.85';
    sl.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(100);
  const midSize = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  ok(Math.abs(midSize.scale - 0.85) < 0.001, `${label}: size mode wrote scale=${midSize.scale}`);
  ok(deepEq(beforeSize, midSize, ['objectAnchor', 'characterAnchor', 'rotation', 'flipX']),
    `${label}: size mode did not touch other fields`);

  await page.click('#btnCancelSize');
  await page.waitForTimeout(150);
  const afterCancelSize = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  ok(Math.abs(afterCancelSize.scale - beforeSize.scale) < 0.001, `${label}: size cancel restored scale`);
  ok(deepEq(beforeSize, afterCancelSize, ['objectAnchor', 'characterAnchor', 'rotation', 'scale', 'flipX']),
    `${label}: size cancel full restore`);

  // Size save path
  await page.click('#btnEditSize');
  await page.evaluate(() => {
    const sl = document.getElementById('scaleSlider');
    sl.value = '0.55';
    sl.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const othersBeforeSave = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  await page.click('#btnSaveSize');
  await page.waitForTimeout(150);
  const afterSaveSize = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  ok(Math.abs(afterSaveSize.scale - 0.55) < 0.001, `${label}: size save kept scale`);
  ok(deepEq(othersBeforeSave, afterSaveSize, ['objectAnchor', 'characterAnchor', 'rotation', 'flipX']),
    `${label}: size save left other fields alone`);

  // --- Rotation mode cancel ---
  await page.click('#btnEditRotation');
  const beforeRot = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  await page.evaluate(() => {
    const sl = document.getElementById('rotationSlider');
    sl.value = '42';
    sl.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const midRot = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  ok(midRot.rotation === 42, `${label}: rotation mode wrote rotation`);
  ok(deepEq(beforeRot, midRot, ['objectAnchor', 'characterAnchor', 'scale', 'flipX']),
    `${label}: rotation mode isolated`);
  await page.click('#btnCancelRotation');
  const afterCancelRot = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  ok(afterCancelRot.rotation === beforeRot.rotation, `${label}: rotation cancel restored`);

  // --- Connector mode with REAL mouse clicks ---
  const beforeConn = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  await page.click('#btnEditConnector');
  await page.waitForTimeout(200);
  const pick1 = await page.evaluate(() => window.__cambioTest.getState().connectorPick);
  ok(pick1 === 'object', `${label}: connector step1 object pick`);

  const hatBox = await page.locator('.cambio-prop[data-element-id="hat"]').boundingBox();
  ok(!!hatBox, `${label}: hat box for click`);
  // Click near brim (lower-center of hat bbox)
  await page.mouse.click(hatBox.x + hatBox.width * 0.5, hatBox.y + hatBox.height * 0.85);
  await page.waitForTimeout(250);
  const st1 = await page.evaluate(() => window.__cambioTest.getState());
  ok(st1.connectorPick === 'character', `${label}: after object click → character pick (got ${st1.connectorPick})`);
  ok(st1.activeMode === 'connector', `${label}: still in connector mode`);
  const afterObj = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  ok(deepEq(beforeConn, afterObj, ['characterAnchor', 'rotation', 'scale', 'flipX']),
    `${label}: object pick wrote only objectAnchor`);

  // Character click — creature must receive it (passthrough)
  const creatureBox = await page.locator('#mainCreature').boundingBox();
  ok(!!creatureBox, `${label}: creature box`);
  await page.mouse.click(
    creatureBox.x + creatureBox.width * 0.5,
    creatureBox.y + creatureBox.height * 0.12
  );
  await page.waitForTimeout(250);
  const st2 = await page.evaluate(() => window.__cambioTest.getState());
  ok(st2.connectorPick === null, `${label}: after character click pick done (got ${st2.connectorPick})`);
  const afterChar = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  ok(
    Math.abs(afterChar.characterAnchor.y - beforeConn.characterAnchor.y) > 0.01 ||
    Math.abs(afterChar.characterAnchor.x - beforeConn.characterAnchor.x) > 0.01 ||
    Math.abs(afterChar.objectAnchor.x - beforeConn.objectAnchor.x) > 0.01 ||
    Math.abs(afterChar.objectAnchor.y - beforeConn.objectAnchor.y) > 0.01,
    `${label}: connectors changed after two clicks`
  );
  ok(Math.abs(afterChar.scale - beforeConn.scale) < 0.001, `${label}: connector mode did NOT change scale`);
  ok(afterChar.rotation === beforeConn.rotation, `${label}: connector mode did NOT change rotation`);

  // Cancel connector → restore snapshot from mode enter
  // Re-enter and cancel without saving
  await page.click('#btnCancelConnector');
  await page.waitForTimeout(150);
  const afterCancelConn = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  ok(deepEq(beforeConn, afterCancelConn, ['objectAnchor', 'characterAnchor', 'rotation', 'scale', 'flipX']),
    `${label}: connector cancel restored full snapshot`);

  // Position mode: drag should only change characterAnchor
  await page.click('#btnEditMove');
  const beforePos = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  const hat2 = await page.locator('.cambio-prop[data-element-id="hat"]').boundingBox();
  await page.mouse.move(hat2.x + hat2.width / 2, hat2.y + hat2.height / 2);
  await page.mouse.down();
  await page.mouse.move(hat2.x + hat2.width / 2 + 40, hat2.y + hat2.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const midPos = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  ok(deepEq(beforePos, midPos, ['objectAnchor', 'rotation', 'scale', 'flipX']),
    `${label}: position drag isolated`);
  await page.click('#btnCancelMove');
  const afterCancelPos = await page.evaluate(() => window.__cambioTest.snapshotElement('hat'));
  ok(deepEq(beforePos, afterCancelPos, ['objectAnchor', 'characterAnchor', 'rotation', 'scale', 'flipX']),
    `${label}: position cancel restored`);

  await page.screenshot({ path: path.join(OUT, `cambio-modal-${label.replace(/[^a-z0-9]+/gi, '_')}.png`) });
}

async function runBadgeChecks(browser) {
  console.log('\n=== Badge bottom-right (apex) ===');
  for (const vp of [
    { name: 'desktop-1400', width: 1400, height: 900 },
    { name: 'mobile-390', width: 390, height: 844 }
  ]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(`${raw}/`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(600);
    const info = await page.evaluate(() => {
      const el = document.querySelector('.spore-sticker');
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        position: cs.position,
        right: cs.right,
        bottom: cs.bottom,
        left: cs.left,
        top: cs.top,
        width: r.width,
        height: r.height,
        x: r.x,
        y: r.y,
        vw: window.innerWidth,
        vh: window.innerHeight,
        badgeRight: cs.getPropertyValue('--badge-right').trim(),
        badgeBottom: cs.getPropertyValue('--badge-bottom').trim(),
        badgeSize: cs.getPropertyValue('--badge-size').trim(),
        pointerEvents: cs.pointerEvents,
        cursor: cs.cursor
      };
    });
    ok(!!info, `badge present @ ${vp.name}`);
    ok(info?.position === 'fixed', `badge fixed @ ${vp.name} (got ${info?.position})`);
    // Bottom-right: near right and bottom edges
    const rightGap = info.vw - (info.x + info.width);
    const bottomGap = info.vh - (info.y + info.height);
    ok(rightGap >= -2 && rightGap < 80, `badge near right @ ${vp.name} (gap=${rightGap?.toFixed(1)})`);
    ok(bottomGap >= -2 && bottomGap < 80, `badge near bottom @ ${vp.name} (gap=${bottomGap?.toFixed(1)})`);
    ok(info.x > info.vw * 0.4, `badge on right half @ ${vp.name}`);
    ok(info.y > info.vh * 0.4, `badge on bottom half @ ${vp.name}`);
    ok(info.pointerEvents === 'none', `badge pointer-events:none @ ${vp.name} (got ${info.pointerEvents})`);
    ok(!info.cursor || info.cursor === 'default' || info.cursor === 'auto',
      `badge no pointer cursor @ ${vp.name} (got ${info.cursor})`);
    console.log(`  badge ${vp.name}:`, JSON.stringify(info));
    await page.screenshot({ path: path.join(OUT, `apex-badge-${vp.name}.png`) });
    await page.close();
  }

  // Cambio with edit rail open — badge should clear the rail
  console.log('\n=== Badge on Cambio (edit open) ===');
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await openCowboyEdit(page);
  const badgeCambio = await page.evaluate(() => {
    const el = document.querySelector('.spore-sticker');
    const rail = document.querySelector('.cambio-rail-right');
    const r = el.getBoundingClientRect();
    const rr = rail.getBoundingClientRect();
    return {
      badgeRight: r.x + r.width,
      railLeft: rr.x,
      overlap: r.x + r.width > rr.x + 2 && r.y + r.height > rr.y
    };
  });
  ok(badgeCambio.badgeRight <= badgeCambio.railLeft + 2,
    `badge clears right rail (badgeRight=${badgeCambio.badgeRight?.toFixed(1)} railLeft=${badgeCambio.railLeft?.toFixed(1)})`);
  const peCambio = await page.evaluate(() => getComputedStyle(document.querySelector('.spore-sticker')).pointerEvents);
  ok(peCambio === 'none', `Cambio badge pointer-events:none (got ${peCambio})`);
  await page.screenshot({ path: path.join(OUT, 'cambio-badge-edit.png') });
  await page.close();

  // Click-through: badge must not eat clicks (apex) — elementFromPoint is not the badge;
  // clicking badge coords must NOT raise character clickCount / pulse as creature.
  console.log('\n=== Badge non-interactive click-through (apex) ===');
  const page2 = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page2.goto(`${raw}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page2.waitForTimeout(600);
  const hit = await page2.evaluate(() => {
    const el = document.querySelector('.spore-sticker');
    const r = el.getBoundingClientRect();
    const cx = Math.floor(r.x + r.width / 2);
    const cy = Math.floor(r.y + r.height / 2);
    const top = document.elementFromPoint(cx, cy);
    return {
      cx, cy,
      topTag: top?.tagName,
      topClass: top?.className,
      isBadge: !!(top && (top.classList?.contains('spore-sticker') || top.id === 'sporeSticker')),
      pe: getComputedStyle(el).pointerEvents,
      cursor: getComputedStyle(el).cursor
    };
  });
  ok(hit.pe === 'none', `apex elementFromPoint pe none (${hit.pe})`);
  ok(!hit.isBadge, `apex elementFromPoint under badge is NOT badge (got ${hit.topTag}.${hit.topClass})`);
  const before = await page2.evaluate(() => window.app?.getStats?.()?.clickCount ?? window.__yaitgApp?.clickCount ?? null);
  await page2.mouse.click(hit.cx, hit.cy);
  await page2.waitForTimeout(200);
  const after = await page2.evaluate(() => window.app?.getStats?.()?.clickCount ?? window.__yaitgApp?.clickCount ?? null);
  // If app exposes clickCount, it must not bump from a badge-coord click that hits background
  // (creature is center; badge is BR). If API missing, pe/elementFromPoint already prove non-interactive.
  if (before != null && after != null) {
    ok(after === before, `badge click did not increment creature clickCount (${before}→${after})`);
  } else {
    ok(true, `clickCount API absent — pe/elementFromPoint covered (${before})`);
  }
  await page2.screenshot({ path: path.join(OUT, 'apex-badge-clickthrough.png') });
  await page2.close();
}

const browser = await chromium.launch();

for (const vp of [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1366x768', width: 1366, height: 768 }
]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  try {
    await runModalIsolation(page, vp.name);
  } catch (err) {
    ok(false, `${vp.name} threw: ${err.message}`);
    console.error(err);
  }
  await page.close();
}

await runBadgeChecks(browser);

await browser.close();

console.log(`\n${failures.length ? 'FAILED' : 'ALL PASS'} — ${failures.length} failure(s)`);
if (failures.length) {
  failures.forEach((f) => console.log(' -', f));
  process.exit(1);
}
