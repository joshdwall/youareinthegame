/**
 * Cambio sidebar header + mountEvScrollList must match enVivo defaults:
 * - header toggler/brand do not overlap
 * - single-row cells (nowrap), square buttons (border-radius 0)
 * - font sizes / row height match enVivo fixture
 * - no horizontal overflow in the list table
 * Isolation (body classes / stage) stays intact.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { createHash } from 'crypto';

const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8788';
const OUT = process.env.SHOT_DIR || '/workspace/capture/cambio-envivo-sizes';
const SHOTS = process.env.SHOTS_DIR || '/workspace/cambio-envivo-sizes-shots';
mkdirSync(OUT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

let failures = 0;
function ok(c, m) {
  if (c) console.log('  PASS ', m);
  else {
    console.error('  FAIL ', m);
    failures++;
  }
}
function near(a, b, tol, label) {
  const d = Math.abs(a - b);
  ok(d <= tol, `${label}: ${a} ≈ ${b} (Δ=${d.toFixed(2)}, tol=${tol})`);
}

async function measureHeader(page) {
  return page.evaluate(() => {
    const tog = document.querySelector('#sidebar .sidebar-header .header-toggler');
    const brand = document.querySelector('#sidebar .sidebar-header .sidebar-brand-full, #sidebar .sidebar-header #cambioSidebarBrand, #evSidebarBrand');
    const header = document.querySelector('#sidebar .sidebar-header');
    if (!tog || !brand || !header) return { err: 'missing header parts' };
    const tr = tog.getBoundingClientRect();
    const br = brand.getBoundingClientRect();
    const hr = header.getBoundingClientRect();
    const overlap = !(tr.right <= br.left || br.right <= tr.left || tr.bottom <= br.top || br.bottom <= tr.top);
    return {
      tog: { x: tr.x, y: tr.y, w: tr.width, h: tr.height, right: tr.right, left: tr.left },
      brand: { x: br.x, y: br.y, w: br.width, h: br.height, left: br.left, right: br.right },
      header: { h: hr.height, w: hr.width },
      overlap,
      gap: br.left - tr.right,
    };
  });
}

async function measureList(page) {
  return page.evaluate(() => {
    const host = document.querySelector('.ev-scroll-list-host');
    const table = host?.querySelector('table.table');
    const row = table?.querySelector('tbody tr.ev-sl-row');
    const th = table?.querySelector('thead th');
    const btn = host?.querySelector('.btn-sm, .cambio-row-actions .btn');
    const title = host?.querySelector('.ev-desk-list__title, .card-header .ev-desk-list__title, .card-header');
    if (!host || !table || !row) return { err: 'missing list', host: !!host, table: !!table, row: !!row };
    const cs = (el) => {
      const s = getComputedStyle(el);
      return {
        fontSize: s.fontSize,
        paddingTop: s.paddingTop,
        paddingBottom: s.paddingBottom,
        borderRadius: s.borderRadius,
        whiteSpace: s.whiteSpace,
        height: el.getBoundingClientRect().height,
        lineHeight: s.lineHeight,
      };
    };
    const scroll = host.querySelector('.table-responsive, .ev-desk-list__scroll') || table.parentElement;
    const overflowX = scroll ? scroll.scrollWidth - scroll.clientWidth : 0;
    const cells = [...row.querySelectorAll('td')].map((td) => {
      const s = getComputedStyle(td);
      return {
        whiteSpace: s.whiteSpace,
        h: td.getBoundingClientRect().height,
        textOverflow: s.textOverflow,
      };
    });
    const rowH = row.getBoundingClientRect().height;
    const wraps = cells.some((c) => c.whiteSpace !== 'nowrap' && c.whiteSpace !== 'pre');
    return {
      rowFont: cs(row).fontSize,
      rowH,
      thFont: th ? cs(th).fontSize : null,
      thH: th ? th.getBoundingClientRect().height : null,
      btn: btn
        ? {
            ...cs(btn),
            radius: getComputedStyle(btn).borderRadius,
            fontSize: getComputedStyle(btn).fontSize,
          }
        : null,
      titleFont: title ? getComputedStyle(title).fontSize : null,
      overflowX,
      wraps,
      cells,
      vars: {
        rowFont: getComputedStyle(host).getPropertyValue('--ev-sl-row-font').trim(),
        headFont: getComputedStyle(host).getPropertyValue('--ev-sl-head-font').trim(),
        rowPadY: getComputedStyle(host).getPropertyValue('--ev-sl-row-pad-y').trim(),
      },
    };
  });
}

async function isolationOk(page) {
  return page.evaluate(() => {
    const body = document.body;
    return {
      bodyNarrow: body.classList.contains('sidebar-narrow') || body.classList.contains('cambio-sidebar-collapsed'),
      htmlTheme: document.documentElement.getAttribute('data-coreui-theme'),
      rootTheme: document.getElementById('cambioRoot')?.getAttribute('data-coreui-theme'),
    };
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

console.log('— enVivo reference fixture —');
await page.goto(`${BASE}/cambio/envivo-ref/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => window.__envivoRefReady === true, null, { timeout: 20000 });
await page.waitForSelector('.ev-scroll-list-host table.table tbody tr.ev-sl-row', { timeout: 15000 });
const envivoHeader = await measureHeader(page);
const envivoList = await measureList(page);
ok(!envivoHeader.err, `enVivo header measurable`);
ok(envivoHeader.overlap === false, `enVivo header no overlap (gap=${envivoHeader.gap})`);
ok(envivoHeader.gap > 4, `enVivo toggler/brand gap > 4px (got ${envivoHeader.gap})`);
ok(envivoList && !envivoList.err, `enVivo list measurable`);
ok(envivoList.btn?.radius === '0px', `enVivo btn border-radius 0 (got ${envivoList.btn?.radius})`);
ok(envivoList.wraps === false, 'enVivo cells nowrap');
await page.locator('#sidebar').screenshot({ path: `${OUT}/envivo-sidebar.png` });
await page.locator('#sidebar .sidebar-header').screenshot({ path: `${OUT}/envivo-header.png` });
await page.locator('.ev-scroll-list-host').screenshot({ path: `${OUT}/envivo-list.png` });
writeFileSync(`${OUT}/envivo-metrics.json`, JSON.stringify({ header: envivoHeader, list: envivoList }, null, 2));

console.log('— Cambio —');
await page.goto(`${BASE}/cambio/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#mainCreature', { timeout: 20000 });
await page.waitForFunction(() => window.__cambioTest?.getState?.()?.manifest, null, { timeout: 20000 });
await page.evaluate(() => window.__cambioTest.setSidebarVisible(true, { persist: false }));
await page.waitForTimeout(300);
await page.waitForSelector('.ev-scroll-list-host table.table tbody tr.ev-sl-row', { timeout: 15000 });

const cambioHeader = await measureHeader(page);
const cambioList = await measureList(page);
const iso = await isolationOk(page);

ok(!cambioHeader.err, 'Cambio header measurable');
ok(cambioHeader.overlap === false, `Cambio header no overlap (gap=${cambioHeader.gap})`);
ok(cambioHeader.gap > 4, `Cambio toggler/brand gap > 4px (got ${cambioHeader.gap})`);
near(cambioHeader.header.h, envivoHeader.header.h, 2, 'header height vs enVivo');

ok(!cambioList.err, 'Cambio list measurable');
ok(cambioList.wraps === false, 'Cambio cells nowrap (single row)');
ok(cambioList.btn?.radius === '0px', `Cambio btn border-radius 0 (got ${cambioList.btn?.radius})`);
ok(cambioList.overflowX <= 2, `Cambio list no horizontal overflow (scrollΔ=${cambioList.overflowX})`);

// Font sizes: match enVivo computed (or CSS vars)
near(parseFloat(cambioList.rowFont), parseFloat(envivoList.rowFont), 0.5, 'row font-size vs enVivo');
near(parseFloat(cambioList.thFont), parseFloat(envivoList.thFont), 0.5, 'thead font-size vs enVivo');
// Compact industrial: Cambio btn/row must match scroll-list chrome (≤ CoreUI default btn-sm)
ok(parseFloat(cambioList.btn.fontSize) <= parseFloat(envivoList.btn.fontSize) + 0.1,
  `Cambio btn font-size ≤ enVivo/CoreUI btn-sm (${cambioList.btn.fontSize} ≤ ${envivoList.btn.fontSize})`);
ok(parseFloat(cambioList.btn.fontSize) <= 12.0, `Cambio btn font-size ≤ 12px compact (got ${cambioList.btn.fontSize})`);
// Cambio rows include select/input controls so may be a few px taller than text-only fixture
ok(cambioList.rowH <= envivoList.rowH + 8, `Cambio row height within +8px of enVivo text row (${cambioList.rowH} vs ${envivoList.rowH})`);
ok(cambioList.rowH >= 22 && cambioList.rowH <= 36, `Cambio row height in compact band 22–36px (got ${cambioList.rowH})`);
ok(cambioList.vars.rowFont === '0.82rem' || cambioList.vars.rowFont === '', ` --ev-sl-row-font default (got ${cambioList.vars.rowFont})`);
ok(cambioList.vars.headFont === '0.66rem' || cambioList.vars.headFont === '', ` --ev-sl-head-font default (got ${cambioList.vars.headFont})`);

ok(iso.bodyNarrow === false, 'body must not get sidebar-narrow');
ok(iso.htmlTheme == null || iso.htmlTheme === '', `html must not carry data-coreui-theme (got ${iso.htmlTheme})`);
ok(iso.rootTheme === 'dark', 'theme on #cambioRoot');

await page.locator('#sidebar').screenshot({ path: `${OUT}/cambio-sidebar.png` });
await page.locator('#sidebar .sidebar-header').screenshot({ path: `${OUT}/cambio-header.png` });
await page.locator('.ev-scroll-list-host').screenshot({ path: `${OUT}/cambio-list.png` });
await page.screenshot({ path: `${OUT}/cambio-full.png`, fullPage: false });
writeFileSync(`${OUT}/cambio-metrics.json`, JSON.stringify({ header: cambioHeader, list: cambioList, iso }, null, 2));

// Side-by-side composites via sharp if available, else copy both
for (const f of ['envivo-sidebar.png', 'cambio-sidebar.png', 'envivo-header.png', 'cambio-header.png', 'envivo-list.png', 'cambio-list.png']) {
  try { copyFileSync(`${OUT}/${f}`, `${SHOTS}/${f}`); } catch {}
}

import { spawnSync } from 'child_process';
const r = spawnSync('python3', ['tests/compose-side-by-side.py', OUT, SHOTS], { encoding: 'utf8' });
console.log(r.stdout || '');
if (r.status) console.error('composite failed', r.stderr);


await browser.close();
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
