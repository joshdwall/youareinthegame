/**
 * Full Edit button opens right-rail editor; hamburger toggles entire sidebar.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8788';
const OUT = process.env.SHOT_DIR || '/workspace/capture/edit-hamburger';
mkdirSync(OUT, { recursive: true });

let failures = 0;
function ok(c, m) {
  if (c) console.log('  PASS ', m);
  else {
    console.error('  FAIL ', m);
    failures++;
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`${BASE}/cambio/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#mainCreature', { timeout: 20000 });
await page.waitForFunction(() => window.__cambioTest?.getState?.()?.manifest, null, { timeout: 20000 });

// Ensure sidebar expanded for first shot
await page.evaluate(() => window.__cambioTest.setSidebarVisible(true, { persist: false }));
await page.waitForTimeout(200);

const editBtn = page.locator('[data-act="edit"][data-id="cowboy"]').first();
ok(await editBtn.count() > 0, 'Edit button present for cowboy');
ok(await page.locator('#evSidebarToggle').count() === 1, 'hamburger #evSidebarToggle present');

await page.screenshot({ path: `${OUT}/sidebar-expanded.png`, fullPage: false });
console.log('shot', `${OUT}/sidebar-expanded.png`);

await editBtn.click();
await page.waitForTimeout(300);
const editing = await page.evaluate(() => ({
  body: document.body.classList.contains('cambio-editing'),
  editHidden: document.getElementById('editSection')?.classList.contains('hidden'),
  title: document.getElementById('editTitle')?.textContent
}));
ok(editing.body === true, 'body.cambio-editing after Edit');
ok(editing.editHidden === false, 'editSection visible');
ok(/cowboy/i.test(editing.title || ''), `editTitle shows cowboy (got ${editing.title})`);

await page.screenshot({ path: `${OUT}/full-editor-open.png`, fullPage: false });
console.log('shot', `${OUT}/full-editor-open.png`);

// Save placements (no-op change still OK)
await page.click('#btnSave');
await page.waitForTimeout(800);
const saveText = await page.locator('#saveStatus').textContent();
ok(!!saveText && !/error|fail/i.test(saveText), `Save placements status: ${saveText}`);

// Hamburger collapse
await page.click('#evSidebarToggle');
await page.waitForTimeout(250);
const collapsed = await page.evaluate(() => ({
  narrow: document.body.classList.contains('sidebar-narrow'),
  sideW: document.getElementById('sidebar')?.getBoundingClientRect().width || 0,
  stored: localStorage.getItem('cambio.sidebar.show')
}));
ok(collapsed.narrow === true, 'body.sidebar-narrow after hamburger');
ok(collapsed.sideW < 8, `sidebar width ~0 when collapsed (got ${collapsed.sideW})`);
ok(collapsed.stored === '0', `persisted cambio.sidebar.show=0 (got ${collapsed.stored})`);

await page.screenshot({ path: `${OUT}/sidebar-collapsed.png`, fullPage: false });
console.log('shot', `${OUT}/sidebar-collapsed.png`);

// Reopen via floating button
await page.click('#cambioSidebarReopen');
await page.waitForTimeout(250);
const expanded = await page.evaluate(() => ({
  narrow: document.body.classList.contains('sidebar-narrow'),
  sideW: document.getElementById('sidebar')?.getBoundingClientRect().width || 0,
  stored: localStorage.getItem('cambio.sidebar.show')
}));
ok(expanded.narrow === false, 'sidebar expanded again');
ok(expanded.sideW > 200, `sidebar width restored (got ${expanded.sideW})`);
ok(expanded.stored === '1', `persisted show=1 (got ${expanded.stored})`);

await browser.close();
if (failures) {
  console.error(`FAILED ${failures}`);
  process.exit(1);
}
console.log('ALL PASS');
