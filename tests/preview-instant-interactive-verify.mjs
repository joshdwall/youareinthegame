/**
 * Preview verification: FCP→clickable, mobile spore clamp screenshots, cowboy scale.
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const PREVIEW = process.env.PREVIEW_URL || 'https://preview-instant-interactive.youareinthegame-web.pages.dev';
const OUT = "/workspace/yaitg-preview-verify";;
fs.mkdirSync(OUT, { recursive: true });

async function measureClickable(page, label) {
  const result = await page.evaluate(async () => {
    const startNav = performance.timing?.navigationStart || performance.timeOrigin;
    // Wait for FCP
    let fcp = null;
    try {
      const entries = performance.getEntriesByType('paint');
      const f = entries.find((e) => e.name === 'first-contentful-paint');
      fcp = f ? f.startTime : null;
    } catch (_) {}
    if (fcp == null) {
      await new Promise((r) => {
        const po = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.name === 'first-contentful-paint') {
              fcp = e.startTime;
              po.disconnect();
              r();
            }
          }
        });
        po.observe({ type: 'paint', buffered: true });
        setTimeout(r, 3000);
      });
    }
    // Poll for listeners ready mark / flag
    const t0 = performance.now();
    let readyAt = null;
    for (let i = 0; i < 200; i++) {
      if (window.__yaitgListenersReady || performance.getEntriesByName('yaitg-listeners-ready').length) {
        readyAt = performance.now();
        break;
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    const mark = performance.getEntriesByName('yaitg-listeners-ready')[0];
    const markTime = mark ? mark.startTime : null;
    // Try a click immediately after ready
    const creature = document.getElementById('mainCreature');
    const container = document.querySelector('.container');
    let sporesBefore = document.querySelectorAll('.spore').length;
    if (creature) {
      creature.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 200, clientY: 300 }));
    }
    await new Promise((r) => setTimeout(r, 50));
    let sporesAfter = document.querySelectorAll('.spore').length;
    return {
      fcp,
      markTime,
      readyPollMs: readyAt != null ? readyAt - t0 : null,
      fcpToMark: fcp != null && markTime != null ? markTime - fcp : null,
      fcpToReadyFlag: fcp != null && readyAt != null ? readyAt - fcp : null,
      listenersReadyFlag: !!window.__yaitgListenersReady,
      sporesBefore,
      sporesAfter,
      effectsReady: !!window.mushroomPlatypusApp?.effectsReady
    };
  });
  console.log(label, JSON.stringify(result, null, 2));
  return result;
}

async function sporeClampShot(page, name) {
  await page.waitForSelector('#mainCreature', { timeout: 15000 });
  // Force default burst at near-edge
  await page.evaluate(() => {
    const c = document.querySelector('.container');
    const rect = c.getBoundingClientRect();
    // click near top-left and bottom-right via synthetic default burst if available
    const evt = (x, y) => {
      c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    };
    evt(20, 20);
    evt(rect.width - 20, rect.height - 20);
    evt(rect.width / 2, rect.height / 2);
  });
  await page.waitForTimeout(120);
  const metrics = await page.evaluate(() => {
    const spores = [...document.querySelectorAll('.spore')];
    const vw = window.innerWidth, vh = window.innerHeight;
    let onScreen = 0;
    const boxes = spores.map((s) => {
      const r = s.getBoundingClientRect();
      // estimate end position via CSS vars
      const tx = parseFloat(getComputedStyle(s).getPropertyValue('--tx')) || 0;
      const ty = parseFloat(getComputedStyle(s).getPropertyValue('--ty')) || 0;
      const endCx = r.left + r.width / 2; // mid-animation approx
      const mid = {
        left: r.left, top: r.top, right: r.right, bottom: r.bottom, tx, ty
      };
      const mostlyIn =
        r.left < vw && r.right > 0 && r.top < vh && r.bottom > 0;
      if (mostlyIn) onScreen++;
      return mid;
    });
    return { count: spores.length, onScreen, vw, vh, sample: boxes.slice(0, 5) };
  });
  const shot = path.join(OUT, name);
  await page.screenshot({ path: shot, fullPage: true });
  return { shot, metrics };
}

async function cowboyScaleShot(page) {
  // Wait for effects + try to force cowboy upcoming if possible
  await page.waitForFunction(() => window.mushroomPlatypusApp?.effectsReady === true, null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(async () => {
    // Prefer setting upcoming via hook if exposed
    try {
      const mod = await import('/runtime/public/thresholdActivation.js');
      // Can't easily set upcoming; just click creature many times for composite if cowboy is queued
    } catch (_) {}
    const creature = document.getElementById('mainCreature');
    const rect = creature.getBoundingClientRect();
    for (let i = 0; i < 3; i++) {
      creature.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      }));
      await new Promise((r) => setTimeout(r, 80));
    }
  });
  await page.waitForTimeout(200);
  const scaleInfo = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.activation-click-spore, .spore')];
    const sizes = nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { w: r.width, h: r.height, cls: n.className };
    }).filter((s) => s.w > 0);
    sizes.sort((a, b) => b.w - a.w);
    return {
      creatureW: document.getElementById('mainCreature')?.getBoundingClientRect().width,
      top: sizes.slice(0, 8),
      clickEffectScaleHint: 0.15
    };
  });
  const shot = path.join(OUT, 'cowboy-or-click-spores-desktop.png');
  await page.screenshot({ path: shot, fullPage: true });
  return { shot, scaleInfo };
}

const browser = await chromium.launch({ headless: true });
const report = { preview: PREVIEW, at: new Date().toISOString(), timings: {}, shots: [] };

// Cold-ish desktop
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 60000 });
  report.timings.desktop = await measureClickable(page, 'desktop');
  const clamp = await sporeClampShot(page, 'desktop-spore-clamp.png');
  report.shots.push(clamp);
  const cow = await cowboyScaleShot(page);
  report.shots.push(cow);
  await context.close();
}

// Warm desktop
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 60000 });
  report.timings.desktopWarm = await measureClickable(page, 'desktop-warm');
  await context.close();
}

// Mobile 390x844
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: devices['iPhone 12'].userAgent
  });
  const page = await context.newPage();
  await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 60000 });
  report.timings.mobile = await measureClickable(page, 'mobile');
  const clamp = await sporeClampShot(page, 'mobile-390x844-spore-clamp.png');
  report.shots.push(clamp);
  // second burst mid-screen
  await page.evaluate(() => {
    const c = document.querySelector('.container');
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 195, clientY: 422 }));
  });
  await page.waitForTimeout(150);
  const shot2 = path.join(OUT, 'mobile-390x844-spores-mid.png');
  await page.screenshot({ path: shot2, fullPage: true });
  report.shots.push({ shot: shot2 });
  await context.close();
}

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('\n=== SUMMARY ===');
console.log(JSON.stringify({
  preview: PREVIEW,
  fcpToMark_desktop: report.timings.desktop?.fcpToMark,
  fcpToMark_warm: report.timings.desktopWarm?.fcpToMark,
  fcpToMark_mobile: report.timings.mobile?.fcpToMark,
  mobileOnScreen: report.shots.find(s => s.shot?.includes('mobile-390x844-spore-clamp'))?.metrics
}, null, 2));
await browser.close();
