/**
 * Action point editor isolation: writes only objectActions; Cancel restores snapshot.
 */
import { chromium } from 'playwright';

const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8788';
let failures = 0;
function ok(c, m) { if (c) console.log('  PASS ', m); else { console.error('  FAIL ', m); failures++; } }

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(`${BASE}/cambio/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#mainCreature', { timeout: 20000 });
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
  const t = window.__cambioTest;
  if (!t) return { err: 'no __cambioTest' };
  await t.enterEdit('cowboy');
  t.selectElement?.('pistolL');
  // ensure selected
  const st0 = t.getState().placements.byAnimation.cowboy.elements.pistolL;
  const snapScale = st0.scale;
  const snapRot = st0.rotation;
  const snapCA = JSON.stringify(st0.characterAnchor);
  const snapOA = JSON.stringify(st0.objectAnchor);

  t.enterMode('action');
  // mutate draft only
  const draft = t.getActionDraft();
  if (!draft) return { err: 'no draft' };
  draft.point = { x: 0.11, y: 0.22 };
  draft.direction = 135;
  // mid-mode: placement objectActions should still be old until commit
  const mid = t.getState().placements.byAnimation.cowboy.elements.pistolL;
  const midActions = JSON.stringify(mid.objectActions || null);
  const midScale = mid.scale;
  t.commitMode();
  const after = t.getState().placements.byAnimation.cowboy.elements.pistolL;
  const fire = (after.objectActions || []).find((a) => a.type === 'fire');

  // Cancel isolation
  t.enterMode('action');
  const d2 = t.getActionDraft();
  d2.point = { x: 0.9, y: 0.9 };
  d2.direction = 10;
  t.cancelMode();
  const cancelled = t.getState().placements.byAnimation.cowboy.elements.pistolL;
  const fire2 = (cancelled.objectActions || []).find((a) => a.type === 'fire');

  return {
    snapScale, midScale, afterScale: after.scale,
    snapRot, afterRot: after.rotation,
    snapCA, afterCA: JSON.stringify(after.characterAnchor),
    snapOA, afterOA: JSON.stringify(after.objectAnchor),
    fire,
    fire2,
    midActions
  };
});

console.log(result);
ok(!result.err, `editor ran (${result.err || 'ok'})`);
ok(result.midScale === result.snapScale, 'scale unchanged during action mode');
ok(result.afterScale === result.snapScale, 'scale unchanged after commit');
ok(result.afterRot === result.snapRot, 'rotation unchanged after commit');
ok(result.afterCA === result.snapCA, 'characterAnchor unchanged');
ok(result.afterOA === result.snapOA, 'objectAnchor unchanged');
ok(result.fire?.point?.x === 0.11 && result.fire?.direction === 135, 'commit wrote fire action');
ok(result.fire2?.point?.x === 0.11 && result.fire2?.direction === 135, 'cancel restored prior committed action (not draft 0.9)');

// Desk list / sidebar present
const chrome = await page.evaluate(() => ({
  sidebar: !!document.getElementById('sidebar'),
  brand: document.getElementById('cambioSidebarBrand')?.textContent,
  desk: !!document.querySelector('.pf-desk-list-unit'),
  search: !!document.querySelector('.pf-desk-list-search'),
  meta: !!document.getElementById('animListHost'),
  actionBtn: !!document.getElementById('btnEditAction')
}));
console.log(chrome);
ok(chrome.sidebar && chrome.brand === 'Cambio', 'site-hub od-sidebar brand is Cambio once');
ok(chrome.desk && chrome.search, 'SITE-HUB desk list present');
ok(chrome.actionBtn, 'Action point pencil present');

await browser.close();
console.log('\nfailures:', failures);
process.exit(failures ? 1 : 0);
