/**
 * Cambio sidebar expand/collapse must not affect the public stage underneath.
 * Compares bounding rects, computed styles, canvas/stage size, and screenshots
 * expanded vs collapsed; also spot-checks against the public apex site.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8788';
const PUBLIC = process.env.YAITG_PUBLIC || 'https://youareinthegame.com';
const OUT = process.env.SHOT_DIR || '/workspace/capture/cambio-isolate';
mkdirSync(OUT, { recursive: true });

let failures = 0;
function ok(c, m) {
  if (c) console.log('  PASS ', m);
  else {
    console.error('  FAIL ', m);
    failures++;
  }
}

function snapHash(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

async function measureStage(page) {
  return page.evaluate(() => {
    const stage = document.getElementById('siteStage') || document.querySelector('.container');
    const creature = document.getElementById('mainCreature') || document.querySelector('.creature');
    const badge = document.getElementById('sporeSticker') || document.querySelector('.spore-sticker');
    const body = document.body;
    const html = document.documentElement;
    const cs = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        margin: s.margin,
        padding: s.padding,
        transform: s.transform,
        width: s.width,
        height: s.height,
        bg: s.backgroundColor,
        position: s.position,
        left: s.left,
        right: s.right,
      };
    };
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      bodyClasses: [...body.classList].sort(),
      htmlClasses: [...html.classList].sort(),
      htmlTheme: html.getAttribute('data-coreui-theme'),
      bodyBg: getComputedStyle(body).backgroundColor,
      bodyTransform: getComputedStyle(body).transform,
      occupyStart: getComputedStyle(body).getPropertyValue('--cui-sidebar-occupy-start').trim(),
      occupyEnd: getComputedStyle(body).getPropertyValue('--cui-sidebar-occupy-end').trim(),
      stage: cs(stage),
      creature: cs(creature),
      badge: cs(badge),
    };
  });
}

function nearlyEqual(a, b, eps = 1) {
  return Math.abs(a - b) <= eps;
}

function compareMetrics(a, b, label) {
  ok(a.viewport.w === b.viewport.w && a.viewport.h === b.viewport.h, `${label}: viewport identical`);
  ok(a.bodyBg === b.bodyBg, `${label}: body background identical (${a.bodyBg})`);
  ok(a.bodyTransform === b.bodyTransform, `${label}: body transform identical`);
  ok(
    !a.bodyClasses.includes('sidebar-narrow') && !b.bodyClasses.includes('sidebar-narrow'),
    `${label}: body never has sidebar-narrow`
  );
  ok(
    !a.bodyClasses.includes('cambio-sidebar-collapsed') && !b.bodyClasses.includes('cambio-sidebar-collapsed'),
    `${label}: body never has cambio-sidebar-collapsed`
  );
  ok(a.htmlTheme == null && b.htmlTheme == null, `${label}: html has no data-coreui-theme`);

  for (const key of ['stage', 'creature', 'badge']) {
    const ra = a[key]?.rect;
    const rb = b[key]?.rect;
    if (!ra || !rb) {
      ok(false, `${label}: missing ${key} rect`);
      continue;
    }
    ok(
      nearlyEqual(ra.x, rb.x) && nearlyEqual(ra.y, rb.y) && nearlyEqual(ra.w, rb.w) && nearlyEqual(ra.h, rb.h),
      `${label}: ${key} rect identical (${JSON.stringify(ra)} vs ${JSON.stringify(rb)})`
    );
    ok(a[key].transform === b[key].transform, `${label}: ${key} transform identical`);
    ok(a[key].margin === b[key].margin, `${label}: ${key} margin identical`);
    ok(a[key].width === b[key].width && a[key].height === b[key].height, `${label}: ${key} computed size identical`);
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

// Track window resize — collapse must not fire resize
let resizeCount = 0;
await page.exposeFunction('__noteResize', () => {
  resizeCount += 1;
});
await page.addInitScript(() => {
  window.addEventListener('resize', () => window.__noteResize?.());
});

await page.goto(`${BASE}/cambio/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#mainCreature', { timeout: 20000 });
await page.waitForFunction(() => window.__cambioTest?.getState?.()?.manifest, null, { timeout: 20000 });

// Freeze float/transitions so expand↔collapse identity is not timing noise
await page.addStyleTag({
  content: `html.cambio-freeze-anims *, html.cambio-freeze-anims *::before, html.cambio-freeze-anims *::after {
    animation: none !important; transition: none !important; caret-color: transparent !important;
  }`
});
await page.evaluate(() => {
  document.documentElement.classList.add('cambio-freeze-anims');
  document.getAnimations?.().forEach((a) => { try { a.pause(); a.currentTime = 0; } catch {} });
});

// Force expanded
await page.evaluate(() => window.__cambioTest.setSidebarVisible(true, { persist: false }));
await page.waitForTimeout(300);
resizeCount = 0; // reset after initial layout

const expandedMetrics = await measureStage(page);
// Full-viewport shots (chrome visible — for human review; expected to differ only in overlay)
await page.screenshot({ path: `${OUT}/stage-sidebar-expanded.png`, fullPage: false });
writeFileSync(`${OUT}/metrics-expanded.json`, JSON.stringify(expandedMetrics, null, 2));

// Stage pixel identity: briefly hide overlay chrome so we capture the page underneath only
async function shotUnderlyingStage(name) {
  await page.evaluate(() => {
    const r = document.getElementById('cambioRoot');
    if (r) r.style.display = 'none';
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#siteStage').boundingBox();
  const buf = await page.screenshot({ path: `${OUT}/${name}`, clip: box });
  await page.evaluate(() => {
    const r = document.getElementById('cambioRoot');
    if (r) r.style.display = '';
  });
  return buf;
}
const stageShotExp = await shotUnderlyingStage('siteStage-expanded.png');

ok(expandedMetrics.htmlTheme == null, 'html has no coreui theme attr');
ok(
  await page.evaluate(() => document.getElementById('cambioRoot')?.getAttribute('data-coreui-theme') === 'dark'),
  'coreui theme lives on #cambioRoot'
);
ok(
  await page.evaluate(() => document.getElementById('sidebar')?.classList.contains('sidebar-overlaid')),
  'sidebar has sidebar-overlaid'
);

// Collapse via hamburger
await page.click('#evSidebarToggle');
await page.waitForTimeout(350);

const collapsedMetrics = await measureStage(page);
await page.screenshot({ path: `${OUT}/stage-sidebar-collapsed.png`, fullPage: false });
writeFileSync(`${OUT}/metrics-collapsed.json`, JSON.stringify(collapsedMetrics, null, 2));
const stageShotCol = await shotUnderlyingStage('siteStage-collapsed.png');

compareMetrics(expandedMetrics, collapsedMetrics, 'expanded↔collapsed');

ok(resizeCount === 0, `collapse did not fire window resize (count=${resizeCount})`);

const hashExp = snapHash(stageShotExp);
const hashCol = snapHash(stageShotCol);
ok(hashExp === hashCol, `siteStage screenshot hash identical (${hashExp} vs ${hashCol})`);

// Clicks still reach the creature behind the overlay when sidebar collapsed
const clickHit = await page.evaluate(() => {
  const c = document.getElementById('mainCreature');
  let hits = 0;
  const on = () => {
    hits += 1;
  };
  c.addEventListener('click', on);
  c.click();
  c.removeEventListener('click', on);
  return hits;
});
ok(clickHit === 1, 'creature click works with sidebar collapsed');

// Re-expand and confirm still identical
await page.click('#cambioSidebarReopen');
await page.waitForTimeout(300);
const reexpanded = await measureStage(page);
compareMetrics(expandedMetrics, reexpanded, 'expanded↔reexpanded');

// Public site comparison (stage geometry / creature size)
const pub = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await pub.goto(PUBLIC + '/', { waitUntil: 'networkidle', timeout: 60000 });
await pub.waitForSelector('.creature, #mainCreature', { timeout: 20000 });
const publicMetrics = await measureStage(pub);
writeFileSync(`${OUT}/metrics-public.json`, JSON.stringify(publicMetrics, null, 2));
await pub.screenshot({ path: `${OUT}/public-site.png`, fullPage: false });

const ec = expandedMetrics.creature?.rect;
const pc = publicMetrics.creature?.rect;
ok(!!ec && !!pc, 'creature rects present on cambio + public');
if (ec && pc) {
  ok(nearlyEqual(ec.w, pc.w, 2) && nearlyEqual(ec.h, pc.h, 2), `creature size matches public (cambio ${ec.w}x${ec.h} vs public ${pc.w}x${pc.h})`);
  // Centers should be near viewport center on both
  ok(nearlyEqual(ec.x + ec.w / 2, 700, 40), `cambio creature roughly centered (cx=${ec.x + ec.w / 2})`);
  ok(nearlyEqual(pc.x + pc.w / 2, 700, 40), `public creature roughly centered (cx=${pc.x + pc.w / 2})`);
}
ok(expandedMetrics.bodyBg === publicMetrics.bodyBg, `body sage matches public (${expandedMetrics.bodyBg} vs ${publicMetrics.bodyBg})`);

await pub.close();
await browser.close();

console.log('\nfailures:', failures);
console.log('shots under', OUT);
process.exit(failures ? 1 : 0);
