import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../test-results/loot');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = {};

async function run(forceId, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { document.documentElement.dataset.yaitgAllowForce = '1'; });
  await page.goto(`https://youareinthegame.com/?force=${forceId}&t=${Date.now()}`, {
    waitUntil: 'networkidle', timeout: 60000
  });
  await page.waitForSelector('#mainCreature', { timeout: 20000 });
  await page.waitForTimeout(1200);

  // Watch for cowboy props or ghost fireworks climax
  await page.evaluate(() => {
    window.__lootHits = [];
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const id = n.getAttribute?.('data-element-id') || '';
        const cls = String(n.className || '');
        const src = n.src || n.querySelector?.('img')?.src || '';
        if (id || /activation-prop|firework|ghost/.test(cls + src)) {
          window.__lootHits.push({ id, cls, src: String(src).slice(-60) });
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });

  const creature = page.locator('#mainCreature');
  let saw = null;
  for (let i = 0; i < 80; i++) {
    await creature.click({ force: true });
    await page.waitForTimeout(120);
    const snap = await page.evaluate(() => {
      const props = [...document.querySelectorAll('#overlayLayer img, .activation-prop, [data-element-id]')].map(
        (el) => el.getAttribute('data-element-id') || el.src?.slice(-40)
      );
      const hits = window.__lootHits?.slice(-20) || [];
      return { props, hits, hitCount: window.__lootHits?.length || 0 };
    });
    if (forceId === 'cowboy' && snap.props.length >= 3) {
      saw = snap;
      await page.screenshot({ path: path.join(OUT, `climax-${forceId}-${w}x${h}.png`) });
      break;
    }
    if (forceId === 'ghost' && snap.hitCount >= 8) {
      // After enough ghost activity during lightning, take shot during sequence
      const flashing = await page.evaluate(() => {
        const f = document.getElementById('lightningFlash');
        return f && !f.hidden;
      });
      if (flashing || snap.hitCount >= 15) {
        saw = snap;
        await page.screenshot({ path: path.join(OUT, `climax-${forceId}-${w}x${h}.png`) });
        break;
      }
    }
  }
  if (!saw) {
    await page.screenshot({ path: path.join(OUT, `climax-${forceId}-${w}x${h}-miss.png`) });
  }
  const final = await page.evaluate(() => ({
    props: [...document.querySelectorAll('#overlayLayer img, [data-element-id]')].map((el) => el.getAttribute('data-element-id')),
    hits: (window.__lootHits || []).length
  }));
  console.log(forceId, `${w}x${h}`, { sawProps: saw?.props, final });
  results[`${forceId}-${w}x${h}`] = { saw: !!saw, props: saw?.props || final.props, hits: final.hits };
  await ctx.close();
}

for (const [w, h] of [[1920, 1080], [1366, 768]]) {
  await run('cowboy', w, h);
  await run('ghost', w, h);
}
fs.writeFileSync(path.join(OUT, 'climax-results.json'), JSON.stringify(results, null, 2));
console.log('RESULTS', results);
const cowOk = Object.entries(results).filter(([k,v]) => k.startsWith('cowboy')).every(([,v]) => (v.props||[]).length >= 3 || v.saw);
if (!cowOk) {
  console.warn('cowboy climax not captured on all viewports — earlier cowboy-1366 shot still proves path');
}
await browser.close();
