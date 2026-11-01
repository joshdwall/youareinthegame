import { chromium } from 'playwright';
const BASE = process.env.YAITG_BASE || 'http://127.0.0.1:8789';
let failures = 0;
function ok(c, m) {
  if (c) console.log('  PASS ', m);
  else { console.error('  FAIL ', m); failures++; }
}

const browser = await chromium.launch({ headless: true });

async function run(label, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(BASE + '/?cb=' + Date.now(), { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#mainCreature', { timeout: 20000 });
  await page.waitForFunction(() => window.__yaitgListenersReady === true, null, { timeout: 10000 });

  const cre = page.locator('#mainCreature');
  const drag = await cre.getAttribute('draggable');
  ok(drag === 'false', `${label} creature draggable=false`);

  // contextmenu on creature should be canceled
  const prevented = await page.evaluate(() => {
    const el = document.getElementById('mainCreature');
    let called = false;
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  ok(prevented === true, `${label} contextmenu defaultPrevented on creature`);

  // Click still fires (pending early clicks or effect)
  const before = await page.evaluate(() => window.__yaitgEarly?.pendingClicks?.() ?? -1);
  await cre.click({ force: true });
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => {
    // either early pending increased, or spore nodes appeared, or clickCount
    const pending = window.__yaitgEarly?.pendingClicks?.();
    const spores = document.querySelectorAll('.spore, .activation-spore, .activation-click-spore').length;
    const appClicks = window.mushroomPlatypusApp?.clickCount;
    return { pending, spores, appClicks };
  });
  ok(
    (typeof after.pending === 'number' && after.pending > before) ||
      after.spores > 0 ||
      (typeof after.appClicks === 'number' && after.appClicks > 0),
    `${label} click still works (${JSON.stringify(after)})`
  );

  await page.screenshot({ path: `tmp/image-protect-${label}.png`, fullPage: false });
  await page.close();
}

await run('desktop', { width: 1280, height: 720 });
await run('mobile', { width: 390, height: 844 });
await browser.close();
if (failures) process.exit(1);
console.log('ALL PASS');
