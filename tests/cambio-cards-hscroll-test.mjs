/**
 * Cambio cards + horizontal scroll:
 * - main + edit list wraps: overflow-x auto, scrollWidth can exceed clientWidth, scrollLeft works
 * - non-list settings live in .card; inputs not 100% width; vertical height reduced vs before
 * - isolation still holds
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'fs';

const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8788';
const OUT = process.env.SHOT_DIR || '/workspace/capture/cambio-cards-hscroll';
const SHOTS = process.env.SHOTS_DIR || '/workspace/cambio-cards-hscroll-shots';
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

const beforePath = `${OUT}/before-metrics.json`;
const before = existsSync(beforePath) ? JSON.parse(readFileSync(beforePath, 'utf8')) : null;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto(`${BASE}/cambio/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#mainCreature', { timeout: 20000 });
await page.waitForFunction(() => window.__cambioTest?.getState?.()?.manifest, null, { timeout: 20000 });
await page.evaluate(() => window.__cambioTest.setSidebarVisible(true, { persist: false }));
await page.waitForSelector('#animListHost table tbody tr.ev-sl-row, #animListHost table tbody tr', { timeout: 15000 });
await page.waitForTimeout(500);

async function measureListScroll(sel) {
  return page.evaluate((hostSel) => {
    const host = document.querySelector(hostSel);
    const wrap = host?.querySelector('.table-responsive, .ev-desk-list__scroll');
    const table = host?.querySelector('table.table');
    if (!wrap || !table) return { err: 'missing', hostSel };
    // Force content wider than wrap if natural width fits (still prove scroll works)
    let forced = false;
    let probe = table.querySelector('tbody td');
    const natural = { sw: wrap.scrollWidth, cw: wrap.clientWidth };
    // Need ≥40px scroll room for scrollLeft assertion (tiny natural overflow is not enough).
    if (wrap.scrollWidth < wrap.clientWidth + 40) {
      const col = table.querySelector('colgroup col');
      if (col) {
        const cur = parseFloat(col.style.width) || 80;
        col.style.width = `${cur + (wrap.clientWidth + 120 - wrap.scrollWidth)}px`;
        const cols = [...table.querySelectorAll('colgroup col')];
        const sum = cols.reduce((a, c) => a + (parseFloat(c.style.width) || 0), 0);
        table.style.width = `${sum}px`;
        forced = true;
      } else if (probe) {
        probe.style.minWidth = `${wrap.clientWidth + 120}px`;
        forced = true;
      }
    }
    const sw = wrap.scrollWidth;
    const cw = wrap.clientWidth;
    const ox = getComputedStyle(wrap).overflowX;
    const beforeLeft = wrap.scrollLeft;
    wrap.scrollLeft = 40;
    const afterLeft = wrap.scrollLeft;
    wrap.scrollLeft = beforeLeft;
    const cells = [...table.querySelectorAll('tbody tr:first-child td')].map((td) => getComputedStyle(td).whiteSpace);
    const theadSticky = [...table.querySelectorAll('thead th')].map((th) => getComputedStyle(th).position);
    return {
      ox,
      sw,
      cw,
      natural,
      forced,
      canOverflow: sw > cw + 1,
      scrolled: afterLeft >= 20,
      nowrap: cells.every((w) => w === 'nowrap' || w === 'pre'),
      theadSticky: theadSticky.every((p) => p === 'sticky'),
      tableW: table.getBoundingClientRect().width,
    };
  }, sel);
}

const mainScroll = await measureListScroll('#animListHost');
ok(!mainScroll.err, 'main list measurable');
ok(mainScroll.ox === 'auto' || mainScroll.ox === 'scroll', `main list overflow-x auto (got ${mainScroll.ox})`);
ok(mainScroll.canOverflow, `main list scrollWidth > clientWidth (${mainScroll.sw} > ${mainScroll.cw}, forced=${mainScroll.forced})`);
ok(mainScroll.scrolled, 'main list horizontal scrollLeft works');
ok(mainScroll.nowrap, 'main list cells nowrap');
ok(mainScroll.theadSticky, 'main list thead sticky (header aligned while scrolling)');

const site = await page.evaluate(() => {
  const root = document.getElementById('siteSettings');
  const card = root?.querySelector('.card');
  const body = root?.querySelector('.card-body');
  // View-mode height first (pencils closed) — compares to before-metrics
  const viewH = root?.getBoundingClientRect().height ?? 0;
  const viewCardH = card?.getBoundingClientRect().height ?? 0;
  const inputs = [...(root?.querySelectorAll('input, select') || [])];
  // reveal edit fields to measure widths
  root?.querySelectorAll('.ie-row').forEach((row) => {
    row.classList.add('is-editing');
    row.querySelector('.ie-view')?.classList.add('hidden');
    row.querySelector('.ie-edit')?.classList.remove('hidden');
  });
  const widths = inputs.map((el) => {
    const cardW = body?.getBoundingClientRect().width || 1;
    return {
      id: el.id,
      type: el.type || el.tagName,
      w: el.getBoundingClientRect().width,
      cssW: getComputedStyle(el).width,
      pctOfCard: el.getBoundingClientRect().width / cardW,
    };
  });
  return {
    h: viewH,
    cardH: viewCardH,
    editH: root?.getBoundingClientRect().height ?? 0,
    cards: root?.querySelectorAll('.card').length ?? 0,
    hasCompact: !!body?.classList.contains('cambio-settings-compact'),
    widths,
    cardBodyDisplay: body ? getComputedStyle(body).display : null,
  };
});

ok(site.cards >= 1, `site settings inside .card (count=${site.cards})`);
ok(site.hasCompact, 'site settings card-body has cambio-settings-compact');
ok(site.cardBodyDisplay === 'flex', `site settings compact is flex (got ${site.cardBodyDisplay})`);
const wideInputs = site.widths.filter((w) => w.w > 0 && w.pctOfCard >= 0.95);
ok(wideInputs.length === 0, `site inputs not ~100% card width (bad=${JSON.stringify(wideInputs)})`);
const numInputs = site.widths.filter((w) => w.type === 'number' && w.w > 0);
ok(numInputs.every((w) => w.w <= 80), `number inputs content-sized ≤80px (${numInputs.map((w) => w.w).join(',')})`);

if (before?.before?.siteH) {
  ok(site.h < before.before.siteH - 4 || site.cardH < before.before.siteH - 4,
    `site settings height reduced (${site.h}/${site.cardH} vs before ${before.before.siteH})`);
}

await page.locator('#sidebar').screenshot({ path: `${OUT}/after-main-sidebar.png` });
await page.locator('#siteSettings').screenshot({ path: `${OUT}/after-site-settings.png` });

// Edit sidebar
await page.locator('#animListHost [data-act="edit"][data-id="cowboy"]').first().click();
await page.waitForTimeout(500);
await page.waitForSelector('#editSection.show, #editPanel', { timeout: 10000 });
await page.waitForSelector('#editItemListHost table tbody tr', { timeout: 15000 });
await page.waitForTimeout(400);

const editScroll = await measureListScroll('#editItemListHost');
ok(!editScroll.err, 'edit list measurable');
ok(editScroll.ox === 'auto' || editScroll.ox === 'scroll', `edit list overflow-x auto (got ${editScroll.ox})`);
ok(editScroll.canOverflow, `edit list scrollWidth > clientWidth (${editScroll.sw} > ${editScroll.cw}, forced=${editScroll.forced})`);
ok(editScroll.scrolled, 'edit list horizontal scrollLeft works');
ok(editScroll.nowrap, 'edit list cells nowrap');

const editCards = await page.evaluate(() => {
  const animCard = document.getElementById('editAnimSettings');
  const selected = document.getElementById('selectedControls');
  // ensure selected visible
  if (selected?.classList.contains('hidden')) selected.classList.remove('hidden');
  const topH = animCard?.getBoundingClientRect().height ?? 0;
  const selectedH = selected?.getBoundingClientRect().height ?? 0;
  // open one pencil to check input width
  const rot = selected?.querySelector('[data-mode="rotation"]');
  rot?.classList.add('is-editing');
  rot?.querySelector('.ie-view')?.classList.add('hidden');
  rot?.querySelector('.ie-edit')?.classList.remove('hidden');
  const num = document.getElementById('rotationNum');
  const sel = document.getElementById('transitionSelect');
  // open transition edit
  const tr = document.getElementById('transitionRow');
  tr?.classList.add('is-editing');
  tr?.querySelector('.ie-view')?.classList.add('hidden');
  tr?.querySelector('.ie-edit')?.classList.remove('hidden');
  const cardW = animCard?.querySelector('.card-body')?.getBoundingClientRect().width || 1;
  return {
    animIsCard: animCard?.classList.contains('card'),
    selectedIsCard: selected?.classList.contains('card'),
    animHasCompact: !!animCard?.querySelector('.cambio-settings-compact'),
    selectedHasCompact: !!selected?.querySelector('.cambio-settings-compact'),
    topH,
    selectedH,
    rotationNumW: num?.getBoundingClientRect().width ?? 0,
    transitionSelectW: sel?.getBoundingClientRect().width ?? 0,
    transitionSelectPct: (sel?.getBoundingClientRect().width ?? 0) / cardW,
    cardsInPanel: document.getElementById('editPanel')?.querySelectorAll('.card').length ?? 0,
  };
});

ok(editCards.animIsCard, 'edit animation settings is .card');
ok(editCards.selectedIsCard, 'selected controls is .card');
ok(editCards.animHasCompact && editCards.selectedHasCompact, 'edit cards use cambio-settings-compact');
ok(editCards.rotationNumW > 0 && editCards.rotationNumW <= 80, `rotation number content-sized (${editCards.rotationNumW})`);
ok(editCards.transitionSelectPct < 0.95, `transition select not 100% width (pct=${editCards.transitionSelectPct.toFixed(2)})`);
ok(editCards.cardsInPanel >= 3, `edit panel has ≥3 cards including list (got ${editCards.cardsInPanel})`);

if (before?.beforeEdit?.topSettingsH) {
  ok(editCards.topH < before.beforeEdit.topSettingsH - 4,
    `edit top settings height reduced (${editCards.topH} vs before ${before.beforeEdit.topSettingsH})`);
}
if (before?.selectedBefore?.h) {
  ok(editCards.selectedH < before.selectedBefore.h - 8,
    `selected controls height reduced (${editCards.selectedH} vs before ${before.selectedBefore.h})`);
}

const iso = await page.evaluate(() => ({
  bodyNarrow: document.body.classList.contains('sidebar-narrow') || document.body.classList.contains('cambio-sidebar-collapsed'),
  htmlTheme: document.documentElement.getAttribute('data-coreui-theme'),
  rootTheme: document.getElementById('cambioRoot')?.getAttribute('data-coreui-theme'),
}));
ok(iso.bodyNarrow === false, 'isolation: body not sidebar-narrow');
ok(!iso.htmlTheme, `isolation: html has no data-coreui-theme (got ${iso.htmlTheme})`);
ok(iso.rootTheme === 'dark', 'isolation: theme on #cambioRoot');

await page.locator('#editSection').screenshot({ path: `${OUT}/after-edit-sidebar.png` });
await page.locator('#editAnimSettings').screenshot({ path: `${OUT}/after-edit-anim-settings.png` });
await page.locator('#selectedControls').screenshot({ path: `${OUT}/after-selected-controls.png` });
await page.screenshot({ path: `${OUT}/after-full.png`, fullPage: false });

const after = { site, editCards, mainScroll, editScroll, iso, before };
writeFileSync(`${OUT}/after-metrics.json`, JSON.stringify(after, null, 2));
for (const f of ['after-main-sidebar.png', 'after-edit-sidebar.png', 'after-site-settings.png', 'after-selected-controls.png', 'before-main-sidebar.png', 'before-edit-sidebar.png']) {
  try { copyFileSync(`${OUT}/${f}`, `${SHOTS}/${f}`); } catch {}
}

await browser.close();
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
console.log('Heights before→after site:', before?.before?.siteH, '→', site.h);
console.log('Heights before→after edit top:', before?.beforeEdit?.topSettingsH, '→', editCards.topH);
console.log('Heights before→after selected:', before?.selectedBefore?.h, '→', editCards.selectedH);
process.exit(failures ? 1 : 0);
