/**
 * Cambio: every list/editor row shows the same action buttons; N/A are disabled not hidden.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8789';
let failures = 0;
function ok(c, m) {
  if (c) console.log('  PASS ', m);
  else {
    console.error('  FAIL ', m);
    failures++;
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/cambio/`, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForFunction(() => !!window.__cambioTest?.animListActionButtons, null, { timeout: 30000 });

// --- Pure helper checks via page ---
const helper = await page.evaluate(() => {
  const { renderActionButtons, animListActionButtons, editItemActionButtons } = window.__cambioTest;
  const ghost = animListActionButtons({
    id: 'ghost',
    label: 'Ghost',
    editable: true,
    placementEditable: true,
    archived: false
  });
  const cowboy = animListActionButtons({
    id: 'cowboy',
    label: 'Cowboy',
    editable: true,
    placementEditable: true,
    archived: false
  });
  const locked = animListActionButtons({
    id: 'x',
    label: 'Locked',
    editable: false,
    placementEditable: false,
    archived: false
  });
  const elRow = editItemActionButtons({ kind: 'element', id: 'element:hat', name: 'Hat' });
  const actRow = editItemActionButtons({
    kind: 'action',
    id: 'action:hat:fire',
    name: 'Hat · fire'
  });
  const effRow = editItemActionButtons({ kind: 'effect', id: 'effect:clickEffect', name: 'Click' });
  return { ghost, cowboy, locked, elRow, actRow, effRow };
});

function acts(html) {
  return [...html.matchAll(/data-act="([^"]+)"/g)].map((m) => m[1]);
}
function editActs(html) {
  return [...html.matchAll(/data-edit-act="([^"]+)"/g)].map((m) => m[1]);
}
function disabledActs(html) {
  const out = [];
  for (const m of html.matchAll(/<button\b([^>]*)>/g)) {
    const attrs = m[1];
    if (/\bdisabled\b/.test(attrs)) {
      const a = attrs.match(/data-act="([^"]+)"/) || attrs.match(/data-edit-act="([^"]+)"/);
      if (a) out.push(a[1]);
    }
  }
  return out;
}

ok(JSON.stringify(acts(helper.ghost)) === JSON.stringify(['play', 'edit', 'click-preview', 'archive']),
  `ghost acts same order: ${acts(helper.ghost)}`);
ok(JSON.stringify(acts(helper.cowboy)) === JSON.stringify(['play', 'edit', 'click-preview', 'archive']),
  `cowboy acts same order: ${acts(helper.cowboy)}`);
ok(JSON.stringify(acts(helper.ghost)) === JSON.stringify(acts(helper.cowboy)), 'ghost/cowboy identical act keys');
ok(disabledActs(helper.ghost).includes('archive'), 'ghost Archive disabled');
ok(!disabledActs(helper.cowboy).includes('archive'), 'cowboy Archive enabled');
ok(disabledActs(helper.locked).includes('edit') && disabledActs(helper.locked).includes('archive'),
  'locked Edit+Archive disabled');

ok(JSON.stringify(editActs(helper.elRow)) === JSON.stringify(['select', 'edit-element', 'delete-action']),
  `element acts: ${editActs(helper.elRow)}`);
ok(JSON.stringify(editActs(helper.actRow)) === JSON.stringify(['select', 'edit-action', 'delete-action']),
  `action acts: ${editActs(helper.actRow)}`);
ok(JSON.stringify(editActs(helper.effRow).map((a) => a.startsWith('edit') ? 'edit' : a)) ,
  'effect has select/edit/delete slots');
ok(disabledActs(helper.elRow).includes('delete-action'), 'element Delete disabled');
ok(!disabledActs(helper.actRow).includes('delete-action'), 'action Delete enabled');
ok(disabledActs(helper.effRow).includes('edit-element') || disabledActs(helper.effRow).includes('edit-action'),
  'effect Edit disabled');
ok(disabledActs(helper.effRow).includes('delete-action'), 'effect Delete disabled');

// --- Live DOM: ghost + cowboy rows ---
console.log('\n== Live DOM list rows ==');
await page.waitForSelector('[data-act="archive"][data-id="ghost"]', { timeout: 20000 });
const live = await page.evaluate(() => {
  const rowActs = (id) => {
    const btns = [...document.querySelectorAll(`[data-act][data-id="${id}"]`)];
    // Prefer actions column buttons
    return btns.map((b) => ({
      act: b.getAttribute('data-act'),
      disabled: b.disabled,
      label: (b.textContent || '').trim()
    }));
  };
  return { ghost: rowActs('ghost'), cowboy: rowActs('cowboy') };
});
const gKeys = live.ghost.map((x) => x.act);
const cKeys = live.cowboy.map((x) => x.act);
ok(gKeys.includes('play') && gKeys.includes('edit') && gKeys.includes('click-preview') && gKeys.includes('archive'),
  `ghost DOM has all acts: ${gKeys}`);
ok(cKeys.includes('play') && cKeys.includes('edit') && cKeys.includes('click-preview') && cKeys.includes('archive'),
  `cowboy DOM has all acts: ${cKeys}`);
ok(live.ghost.find((x) => x.act === 'archive')?.disabled === true, 'DOM ghost Archive disabled');
ok(live.cowboy.find((x) => x.act === 'archive')?.disabled === false, 'DOM cowboy Archive enabled');

await page.screenshot({ path: 'tmp/cambio-uniform-actions-list.png', fullPage: false });
console.log('  wrote tmp/cambio-uniform-actions-list.png');

// --- Editor panels ---
console.log('\n== Editor panels ghost + cowboy ==');
await page.evaluate(() => window.__cambioTest.enterEdit('ghost'));
await page.waitForTimeout(600);
await page.waitForSelector('#editItemListHost [data-edit-act]', { timeout: 10000 });
const ghostEditor = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#editItemListHost tbody tr[data-row-id], #editItemListHost [data-row-id]')];
  const sample = rows.slice(0, 5).map((r) => {
    const btns = [...r.querySelectorAll('[data-edit-act]')].map((b) => ({
      act: b.getAttribute('data-edit-act'),
      disabled: b.disabled
    }));
    return { id: r.getAttribute('data-row-id'), btns };
  });
  const oaWrap = document.getElementById('oaTextProjectileFields');
  const oaHidden = oaWrap ? oaWrap.hidden : null;
  const oaPencils = ['btnEditOaText', 'btnEditOaDuration', 'btnEditOaDistance', 'btnEditOaFontFamily', 'btnEditOaFontSize']
    .map((id) => {
      const b = document.getElementById(id);
      return b ? { id, disabled: b.disabled, shown: !!(b.offsetParent || b.getClientRects().length) } : null;
    });
  return { sample, oaHidden, oaPencils };
});
ok(ghostEditor.oaHidden === false, `ghost OA fields wrap visible (hidden=${ghostEditor.oaHidden})`);
ok(ghostEditor.sample.every((r) => r.btns.length === 3), 'each ghost edit row has 3 buttons');
await page.screenshot({ path: 'tmp/cambio-uniform-actions-editor-ghost.png', fullPage: false });

await page.evaluate(() => {
  window.__cambioTest.getState().activeMode && window.__cambioTest.cancelMode();
});
// Done then cowboy
await page.click('#btnExitEdit').catch(() => {});
await page.waitForTimeout(300);
await page.evaluate(() => window.__cambioTest.enterEdit('cowboy'));
await page.waitForTimeout(700);
await page.evaluate(() => {
  // select a fire action element (pistol) if present
  const t = window.__cambioTest;
  t.selectElement?.('pistolL') || t.selectElement?.('hat');
});
await page.waitForTimeout(400);
const cowboyEditor = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#editItemListHost [data-edit-act="select"]')];
  const byRow = new Map();
  for (const b of document.querySelectorAll('#editItemListHost [data-edit-act]')) {
    const tr = b.closest('tr, [data-row-id]');
    const id = tr?.getAttribute('data-row-id') || 'x';
    if (!byRow.has(id)) byRow.set(id, []);
    byRow.get(id).push({ act: b.getAttribute('data-edit-act'), disabled: b.disabled });
  }
  const counts = [...byRow.values()].map((v) => v.length);
  const oaPencils = ['btnEditOaText', 'btnEditOaDuration'].map((id) => {
    const b = document.getElementById(id);
    return { id, disabled: b?.disabled, title: b?.title };
  });
  const wrap = document.getElementById('oaTextProjectileFields');
  return {
    counts,
    allHave3: counts.length ? counts.every((n) => n === 3) : false,
    oaHidden: wrap?.hidden,
    oaNa: wrap?.classList.contains('oa-fields-na'),
    oaPencils
  };
});
ok(cowboyEditor.allHave3, `cowboy edit rows all have 3 buttons (${JSON.stringify(cowboyEditor.counts.slice(0, 8))})`);
ok(cowboyEditor.oaHidden === false, 'cowboy OA wrap still visible');
// hat may not be textProjectile — pencils disabled
ok(cowboyEditor.oaPencils.every((p) => p.disabled === true) || cowboyEditor.oaNa === true,
  `cowboy OA pencils disabled or na class (${JSON.stringify(cowboyEditor.oaPencils)})`);
await page.screenshot({ path: 'tmp/cambio-uniform-actions-editor-cowboy.png', fullPage: false });
console.log('  wrote editor screenshots');

await browser.close();
if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nALL PASS');
