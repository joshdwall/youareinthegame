/**
 * Cambio content-fit columns + sidebar normalize:
 * - mountEvScrollList cols use fit:'content' (no % widths); measure without grow-to-fill
 * - th/col width ≈ max(header, body cell); table width = sum; h-scroll when overflow
 * - both sidebars: uniform btn height/font; uniform input height; #cambioRoot tokens
 * - isolation still holds
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync } from 'fs';

const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8788';
const OUT = process.env.SHOT_DIR || '/workspace/capture/cambio-colfit-normalize';
const SHOTS = process.env.SHOTS_DIR || '/workspace/cambio-colfit-normalize-shots';
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

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto(`${BASE}/cambio/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#mainCreature', { timeout: 20000 });
await page.waitForFunction(() => window.__cambioTest?.getState?.()?.manifest, null, { timeout: 20000 });
await page.evaluate(() => window.__cambioTest.setSidebarVisible(true, { persist: false }));
await page.waitForSelector('#animListHost table tbody tr', { timeout: 15000 });
await page.waitForTimeout(500);

const main = await page.evaluate(() => {
  const host = document.querySelector('#animListHost');
  const wrap = host?.querySelector('.table-responsive, .ev-desk-list__scroll');
  const table = host?.querySelector('table.table');
  const cols = [...(table?.querySelectorAll('colgroup col') || [])].map((c) => c.style.width);
  const ths = [...(table?.querySelectorAll('thead th') || [])].map((th, i) => {
    const w = th.getBoundingClientRect().width;
    // body cell width for same column
    const tds = [...table.querySelectorAll(`tbody tr:not(.ev-sl-pad) td:nth-child(${i + 1})`)]
      .filter((td) => td.colSpan <= 1)
      .map((td) => td.getBoundingClientRect().width);
    const maxTd = tds.length ? Math.max(...tds) : 0;
    return {
      text: th.textContent.trim(),
      w,
      maxTd,
      // slack vs widest body cell (content-fit should keep th ≈ maxTd)
      slackVsBody: Math.abs(w - maxTd),
      colW: cols[i] || null,
    };
  });
  const sumCols = cols.reduce((a, c) => a + (parseFloat(c) || 0), 0);
  const btns = [...document.querySelectorAll('#sidebar .btn, #sidebar .ie-btn')]
    .filter((b) => b.getBoundingClientRect().height > 0)
    .map((b) => ({
      h: Math.round(b.getBoundingClientRect().height * 10) / 10,
      fs: getComputedStyle(b).fontSize,
    }));
  const inputs = [...document.querySelectorAll('#sidebar input[type="number"], #sidebar select')]
    .filter((el) => el.getBoundingClientRect().height > 0)
    .map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10);
  // prove h-scroll
  const natural = { sw: wrap.scrollWidth, cw: wrap.clientWidth };
  let forced = false;
  if (wrap.scrollWidth <= wrap.clientWidth + 1) {
    const probe = table.querySelector('tbody td');
    if (probe) {
      probe.style.minWidth = `${wrap.clientWidth + 120}px`;
      forced = true;
    }
  }
  const beforeLeft = wrap.scrollLeft;
  wrap.scrollLeft = 40;
  const afterLeft = wrap.scrollLeft;
  wrap.scrollLeft = beforeLeft;
  const tokens = getComputedStyle(document.getElementById('cambioRoot'));
  return {
    tableW: table.getBoundingClientRect().width,
    tableStyleW: table.style.width,
    tableLayout: table.style.tableLayout,
    minW: table.style.minWidth,
    sumCols,
    cols,
    ths,
    ox: getComputedStyle(wrap).overflowX,
    natural,
    forced,
    canOverflow: wrap.scrollWidth > wrap.clientWidth + 1,
    scrolled: afterLeft >= 20,
    btnHeights: [...new Set(btns.map((b) => b.h))],
    btnFonts: [...new Set(btns.map((b) => b.fs))],
    inputHeights: [...new Set(inputs)],
    tokens: {
      ctrlH: tokens.getPropertyValue('--cambio-ctrl-h').trim(),
      fsCtrl: tokens.getPropertyValue('--cambio-fs-ctrl').trim(),
      fsLabel: tokens.getPropertyValue('--cambio-fs-label').trim(),
    },
  };
});

ok(main.cols.length >= 4, `main colgroup present (${main.cols.length} cols)`);
ok(main.tableLayout === 'fixed', `main table-layout fixed after measure (got ${main.tableLayout})`);
ok(main.minW === '0px' || main.minW === '0' || !main.minW || main.minW === '',
  `main table minWidth not 100% (got ${main.minW})`);
ok(Math.abs(main.tableW - main.sumCols) < 3,
  `main table width ≈ sum of content cols (${main.tableW} ≈ ${main.sumCols})`);
ok(main.ox === 'auto' || main.ox === 'scroll', `main overflow-x auto (got ${main.ox})`);
ok(main.canOverflow, `main can h-scroll (${main.natural.sw} vs ${main.natural.cw}, forced=${main.forced})`);
ok(main.scrolled, 'main scrollLeft works');
// Weight was 219px with stretch — content-fit should be far smaller
const weight = main.ths.find((t) => t.text.startsWith('Weight'));
ok(weight && weight.w < 140, `Weight col content-fit (w=${weight?.w}, was ~219 stretched)`);
ok(weight && weight.slackVsBody < 8, `Weight th ≈ body cell slack=${weight?.slackVsBody}`);
for (const th of main.ths) {
  ok(th.slackVsBody < 8, `col "${th.text}" th≈body slack=${th.slackVsBody.toFixed(1)} (w=${th.w.toFixed(0)} maxTd=${th.maxTd.toFixed(0)})`);
}
ok(main.btnHeights.length === 1, `main buttons same height (${main.btnHeights})`);
ok(main.btnFonts.length === 1, `main buttons same font-size (${main.btnFonts})`);
ok(main.inputHeights.length === 1, `main inputs same height (${main.inputHeights})`);
ok(main.tokens.ctrlH === '1.55rem', `--cambio-ctrl-h token set (${main.tokens.ctrlH})`);
ok(main.tokens.fsCtrl === '0.7rem', `--cambio-fs-ctrl token set (${main.tokens.fsCtrl})`);

await page.locator('#sidebar').screenshot({ path: `${OUT}/after-main-sidebar.png` });
await page.locator('#animListHost').screenshot({ path: `${OUT}/after-anim-list.png` });

// Edit sidebar
await page.locator('#animListHost [data-act="edit"][data-id="cowboy"]').first().click();
await page.waitForTimeout(700);
await page.waitForSelector('#editItemListHost table tbody tr', { timeout: 10000 });

const edit = await page.evaluate(() => {
  const host = document.querySelector('#editItemListHost');
  const wrap = host?.querySelector('.table-responsive, .ev-desk-list__scroll');
  const table = host?.querySelector('table.table');
  const cols = [...(table?.querySelectorAll('colgroup col') || [])].map((c) => c.style.width);
  const ths = [...(table?.querySelectorAll('thead th') || [])].map((th, i) => {
    const w = th.getBoundingClientRect().width;
    const tds = [...table.querySelectorAll(`tbody tr:not(.ev-sl-pad) td:nth-child(${i + 1})`)]
      .filter((td) => td.colSpan <= 1)
      .map((td) => td.getBoundingClientRect().width);
    const maxTd = tds.length ? Math.max(...tds) : 0;
    return { text: th.textContent.trim(), w, maxTd, slackVsBody: Math.abs(w - maxTd), colW: cols[i] };
  });
  const sumCols = cols.reduce((a, c) => a + (parseFloat(c) || 0), 0);
  const btns = [...document.querySelectorAll('#editSection .btn, #editSection .ie-btn')]
    .filter((b) => b.getBoundingClientRect().height > 0)
    .map((b) => ({
      t: b.textContent.trim().slice(0, 20),
      h: Math.round(b.getBoundingClientRect().height * 10) / 10,
      fs: getComputedStyle(b).fontSize,
    }));
  // select first item for selectedControls
  document.querySelector('#editItemListHost [data-edit-act="select"]')?.click();
  return {
    tableW: table.getBoundingClientRect().width,
    sumCols,
    minW: table.style.minWidth,
    ths,
    cols,
    ox: getComputedStyle(wrap).overflowX,
    canOverflow: wrap.scrollWidth > wrap.clientWidth + 1 || true, // allow force below
    btnHeights: [...new Set(btns.map((b) => b.h))],
    btnFonts: [...new Set(btns.map((b) => b.fs))],
    btns,
  };
});
await page.waitForTimeout(400);

const selected = await page.evaluate(() => {
  const sc = document.querySelector('#selectedControls');
  const visible = sc && !sc.classList.contains('hidden') && getComputedStyle(sc).display !== 'none';
  const btns = [...(sc?.querySelectorAll('.btn, .ie-btn') || [])]
    .filter((b) => b.getBoundingClientRect().height > 0)
    .map((b) => ({
      t: b.textContent.trim().slice(0, 24),
      h: Math.round(b.getBoundingClientRect().height * 10) / 10,
      fs: getComputedStyle(b).fontSize,
    }));
  // open edit rows so inputs show
  sc?.querySelectorAll('.ie-row').forEach((row) => {
    row.classList.add('is-editing');
    row.querySelector('.ie-view')?.classList.add('hidden');
    row.querySelector('.ie-edit')?.classList.remove('hidden');
  });
  const inputs = [...(sc?.querySelectorAll('input[type="number"], select') || [])]
    .filter((el) => el.getBoundingClientRect().height > 0)
    .map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10);
  return {
    visible,
    btnHeights: [...new Set(btns.map((b) => b.h))],
    btnFonts: [...new Set(btns.map((b) => b.fs))],
    inputHeights: [...new Set(inputs)],
    btns,
    inputCount: inputs.length,
  };
});

ok(edit.cols.length >= 3, `edit colgroup present (${edit.cols.length})`);
ok(Math.abs(edit.tableW - edit.sumCols) < 3, `edit table width ≈ sum cols (${edit.tableW} ≈ ${edit.sumCols})`);
ok(edit.minW === '0px' || edit.minW === '0' || !edit.minW || edit.minW === '',
  `edit minWidth not 100% (${edit.minW})`);
for (const th of edit.ths) {
  ok(th.slackVsBody < 8, `edit col "${th.text}" th≈body slack=${th.slackVsBody.toFixed(1)}`);
}
ok(edit.btnHeights.length === 1, `edit buttons same height (${edit.btnHeights})`);
ok(edit.btnFonts.length === 1, `edit buttons same font (${edit.btnFonts})`);
ok(selected.visible, 'selected controls visible');
ok(selected.btnHeights.length === 1, `selected btns same height (${selected.btnHeights})`);
ok(selected.btnFonts.length === 1, `selected btns same font (${selected.btnFonts})`);
if (selected.inputCount > 0) {
  ok(selected.inputHeights.length === 1, `selected inputs same height (${selected.inputHeights})`);
  ok(selected.inputHeights[0] === edit.btnHeights[0],
    `selected input height matches btn height (${selected.inputHeights[0]} vs ${edit.btnHeights[0]})`);
}

const iso = await page.evaluate(() => ({
  bodyNarrow: document.body.classList.contains('sidebar-narrow') || document.body.classList.contains('cambio-sidebar-collapsed'),
  htmlTheme: document.documentElement.getAttribute('data-coreui-theme'),
  rootTheme: document.getElementById('cambioRoot')?.getAttribute('data-coreui-theme'),
  bodyPadLeft: getComputedStyle(document.body).paddingLeft,
}));
ok(iso.bodyNarrow === false, 'isolation: body not sidebar-narrow');
ok(!iso.htmlTheme, `isolation: html has no data-coreui-theme (got ${iso.htmlTheme})`);
ok(iso.rootTheme === 'dark', 'isolation: theme on #cambioRoot');
ok(iso.bodyPadLeft === '0px', `isolation: body padding-left 0 (got ${iso.bodyPadLeft})`);

await page.locator('#editSection').screenshot({ path: `${OUT}/after-edit-sidebar.png` });
await page.locator('#selectedControls').screenshot({ path: `${OUT}/after-selected-controls.png` });
await page.screenshot({ path: `${OUT}/after-full.png`, fullPage: false });

const after = { main, edit, selected, iso };
writeFileSync(`${OUT}/after-metrics.json`, JSON.stringify(after, null, 2));
for (const f of [
  'after-main-sidebar.png', 'after-anim-list.png', 'after-edit-sidebar.png',
  'after-selected-controls.png', 'before-main-sidebar.png', 'before-edit-sidebar.png',
  'before-anim-list.png', 'before-selected-controls.png', 'after-full.png',
]) {
  try { copyFileSync(`${OUT}/${f}`, `${SHOTS}/${f}`); } catch {}
}

await browser.close();
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
