/**
 * Cambio edit sidebar = same CoreUI/enVivo chrome as main sidebar + mountEvScrollList items.
 * Overlay-only; selecting an item selects it on stage; isolation still holds.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8788';
const OUT = '/workspace/capture/cambio-edit-sidebar';
const SHOTS = '/workspace/cambio-edit-sidebar-shots';
mkdirSync(OUT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

let failed = 0;
function ok(cond, msg) {
  if (cond) console.log('  PASS ', msg);
  else {
    failed++;
    console.log('  FAIL ', msg);
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`${BASE}/cambio/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#animListHost .ev-scroll-list-host, #animListHost table', { timeout: 30000 });

// Open Edit on cowboy
const editBtn = page.locator('#animListHost [data-act="edit"][data-id="cowboy"]').first();
await editBtn.click();
await page.waitForSelector('#editSection:not(.hidden)', { timeout: 10000 });
await page.waitForTimeout(400);

const mainHeader = await page.evaluate(() => {
  const side = document.getElementById('sidebar');
  const tog = side?.querySelector('.sidebar-header .header-toggler');
  const brand = side?.querySelector('.sidebar-header .sidebar-brand-full');
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const tCs = cs(tog);
  const bCs = cs(brand);
  const hCs = cs(side?.querySelector('.sidebar-header'));
  return {
    headerH: hCs ? parseFloat(hCs.height) : 0,
    brandFont: bCs?.fontSize,
    togW: tog?.getBoundingClientRect().width,
    brandText: brand?.textContent?.trim(),
    rowFont: getComputedStyle(document.documentElement).getPropertyValue('--ev-sl-row-font').trim() ||
      (() => {
        const cell = document.querySelector('#animListHost tbody td');
        return cell ? getComputedStyle(cell).fontSize : null;
      })()
  };
});

const editMetrics = await page.evaluate(() => {
  const side = document.getElementById('editSection');
  const tog = side?.querySelector('.sidebar-header .header-toggler');
  const brand = side?.querySelector('.sidebar-header .sidebar-brand-full, #editTitle');
  const header = side?.querySelector('.sidebar-header');
  const tR = tog?.getBoundingClientRect();
  const bR = brand?.getBoundingClientRect();
  const hCs = header ? getComputedStyle(header) : null;
  const bCs = brand ? getComputedStyle(brand) : null;
  const cell = document.querySelector('#editItemListHost tbody td');
  const btn = document.querySelector('#editItemListHost .btn-sm');
  const btnCs = btn ? getComputedStyle(btn) : null;
  const rows = [...document.querySelectorAll('#editItemListHost tbody tr')].filter(
    (tr) => tr.querySelector('td') && !tr.querySelector('.ev-hint')
  );
  const rowH = rows[0]?.getBoundingClientRect().height || 0;
  const wrap = (cell && getComputedStyle(cell).whiteSpace) || null;
  return {
    visible: side && !side.classList.contains('hidden') && getComputedStyle(side).visibility !== 'hidden',
    title: brand?.textContent?.trim(),
    headerH: hCs ? parseFloat(hCs.height) : 0,
    brandFont: bCs?.fontSize,
    overlap: !!(tR && bR && !(tR.right <= bR.left || bR.right <= tR.left || tR.bottom <= bR.top || bR.bottom <= tR.top)),
    gap: tR && bR ? bR.left - tR.right : null,
    hasList: !!document.getElementById('editItemListHost')?.querySelector('.ev-scroll-list-host, table'),
    rowCount: rows.length,
    rowH,
    cellNowrap: wrap === 'nowrap' || wrap === 'nowrap !important',
    cellWhiteSpace: wrap,
    btnRadius: btnCs?.borderRadius,
    btnFont: btnCs?.fontSize,
    rowFont: cell ? getComputedStyle(cell).fontSize : null,
    editingRoot: document.getElementById('cambioRoot')?.dataset?.editing,
    bodyEditing: document.body.classList.contains('cambio-editing'),
    bodyNarrow: document.body.classList.contains('sidebar-narrow'),
    htmlTheme: document.documentElement.getAttribute('data-coreui-theme')
  };
});

console.log('— Edit sidebar chrome —');
ok(editMetrics.visible, 'editSection visible');
ok(/cowboy/i.test(editMetrics.title || ''), `title is animation name (got ${editMetrics.title})`);
ok(editMetrics.overlap === false, `header toggler/brand no overlap (gap=${editMetrics.gap})`);
ok(Math.abs(editMetrics.headerH - mainHeader.headerH) <= 2, `header height matches main (${editMetrics.headerH} vs ${mainHeader.headerH})`);
ok(editMetrics.hasList, 'edit item mountEvScrollList present');
ok(editMetrics.rowCount >= 4, `item rows include overlays (+actions/effects) (got ${editMetrics.rowCount})`);
ok(editMetrics.btnRadius === '0px', `square buttons (got ${editMetrics.btnRadius})`);
ok(editMetrics.cellWhiteSpace === 'nowrap', `cells nowrap (got ${editMetrics.cellWhiteSpace})`);
ok(editMetrics.rowH > 0 && editMetrics.rowH <= 36, `compact row height (got ${editMetrics.rowH})`);
ok(editMetrics.rowFont && editMetrics.btnFont, `fonts row=${editMetrics.rowFont} btn=${editMetrics.btnFont}`);
ok(editMetrics.editingRoot === '1', 'data-editing on #cambioRoot');
ok(editMetrics.bodyEditing === true, 'body.cambio-editing (legacy badge)');
ok(editMetrics.bodyNarrow === false, 'body must not get sidebar-narrow');
ok(editMetrics.htmlTheme == null, 'html must not carry data-coreui-theme');

await page.screenshot({ path: `${OUT}/edit-sidebar-open.png`, fullPage: false });
writeFileSync(`${SHOTS}/edit-sidebar-open.png`, await page.screenshot({ fullPage: false }));

// Select mustache via list button
const mustacheSelect = page.locator('#editItemListHost [data-edit-act="select"][data-item-id="element:mustache"]').first();
await mustacheSelect.click();
await page.waitForTimeout(300);
const selected = await page.evaluate(() => {
  const prop = document.querySelector('.cambio-prop.selected');
  return {
    elementId: prop?.getAttribute('data-element-id'),
    selectedControls: !document.getElementById('selectedControls')?.classList.contains('hidden'),
    label: document.getElementById('selectedLabel')?.textContent
  };
});
ok(selected.elementId === 'mustache', `selecting row selects stage item (got ${selected.elementId})`);
ok(selected.selectedControls === true, 'selectedControls visible after select');

await page.screenshot({ path: `${OUT}/edit-item-selected.png`, fullPage: false });
writeFileSync(`${SHOTS}/edit-item-selected.png`, await page.screenshot({ fullPage: false }));

// Collapse edit sidebar via hamburger — overlay only
const stageBefore = await page.evaluate(() => {
  const s = document.getElementById('siteStage');
  const r = s.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, transform: getComputedStyle(s).transform };
});
await page.locator('#evEditSidebarToggle').click();
await page.waitForTimeout(350);
const collapsed = await page.evaluate(() => {
  const root = document.getElementById('cambioRoot');
  const side = document.getElementById('editSection');
  const s = document.getElementById('siteStage');
  const r = s.getBoundingClientRect();
  return {
    collapsed: root?.dataset?.editSidebarCollapsed,
    stillEditing: root?.dataset?.editing,
    bodyNarrow: document.body.classList.contains('sidebar-narrow'),
    visibility: getComputedStyle(side).visibility,
    stage: { x: r.x, y: r.y, w: r.width, h: r.height, transform: getComputedStyle(s).transform }
  };
});
ok(collapsed.collapsed === '1', `edit sidebar collapsed flag (got ${collapsed.collapsed})`);
ok(collapsed.stillEditing === '1', 'still editing after collapse');
ok(collapsed.bodyNarrow === false, 'collapse must not set body.sidebar-narrow');
ok(collapsed.visibility === 'hidden', `collapsed visibility hidden (got ${collapsed.visibility})`);
ok(
  collapsed.stage.w === stageBefore.w && collapsed.stage.h === stageBefore.h && collapsed.stage.transform === stageBefore.transform,
  'stage box unchanged after edit collapse'
);

await page.screenshot({ path: `${OUT}/edit-sidebar-collapsed.png`, fullPage: false });
writeFileSync(`${SHOTS}/edit-sidebar-collapsed.png`, await page.screenshot({ fullPage: false }));

// Reopen + Done
await page.locator('#cambioEditSidebarReopen').click();
await page.waitForTimeout(300);
await page.locator('#btnExitEdit').click();
await page.waitForTimeout(200);
const exited = await page.evaluate(() => ({
  hidden: document.getElementById('editSection')?.classList.contains('hidden'),
  editing: document.getElementById('cambioRoot')?.dataset?.editing,
  body: document.body.classList.contains('cambio-editing')
}));
ok(exited.hidden === true, 'Done hides editSection');
ok(exited.editing === '0', 'data-editing cleared');
ok(exited.body === false, 'body.cambio-editing cleared');

// Side-by-side main vs edit header (re-open for shot)
await editBtn.click();
await page.waitForTimeout(400);
const mainShot = await page.locator('#sidebar .sidebar-header').screenshot();
const editShot = await page.locator('#editSection .sidebar-header').screenshot();
writeFileSync(`${OUT}/main-header.png`, mainShot);
writeFileSync(`${OUT}/edit-header.png`, editShot);
writeFileSync(`${SHOTS}/main-header.png`, mainShot);
writeFileSync(`${SHOTS}/edit-header.png`, editShot);

import { spawnSync } from 'child_process';
writeFileSync('/tmp/compose-edit-headers.py', `
from PIL import Image
from pathlib import Path
out = Path('${OUT}')
shots = Path('${SHOTS}')
L = Image.open(out/'main-header.png').convert('RGB')
R = Image.open(out/'edit-header.png').convert('RGB')
h = max(L.height, R.height)
def fit(im):
    if im.height == h: return im
    return im.resize((max(1,int(im.width*h/im.height)), h), Image.Resampling.LANCZOS)
L, R = fit(L), fit(R)
c = Image.new('RGB', (L.width+R.width+8, h), (30,36,48))
c.paste(L,(0,0)); c.paste(R,(L.width+8,0))
c.save(out/'side-by-side-headers.png'); c.save(shots/'side-by-side-headers.png')
print('ok')
`)
const comp = spawnSync('python3', ['/tmp/compose-edit-headers.py'], { encoding: 'utf8' });
console.log(comp.stdout || '', comp.stderr || '');

writeFileSync(`${OUT}/metrics.json`, JSON.stringify({ mainHeader, editMetrics, selected, collapsed }, null, 2));

await browser.close();
if (failed) {
  console.log(`\n${failed} FAILURES`);
  process.exit(1);
}
console.log('\nALL PASS');
