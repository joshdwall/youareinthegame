/**
 * Cambio: ghost Edit exposes textProjectile OA fields; placements PUT/GET round-trips.
 */
import { chromium } from 'playwright';

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

// --- API round-trip ---
{
  console.log('\n== placements API round-trip (ghost textProjectile) ==');
  const get0 = await fetch(`${BASE}/api/cambio/placements`, { cache: 'no-store' });
  ok(get0.ok, `GET placements ${get0.status}`);
  const j0 = await get0.json();
  const body = j0.placements || j0;
  if (!body.byAnimation) body.byAnimation = {};
  if (!body.byAnimation.ghost) {
    body.byAnimation.ghost = {
      transitionId: 'lightning',
      elements: {
        ghostBody: {
          objectAnchor: { x: 0.5, y: 0.5 },
          characterAnchor: { x: 0.5, y: 0.5 },
          rotation: 0,
          scale: 1,
          flipX: false,
          objectActions: []
        }
      }
    };
  }
  const el = body.byAnimation.ghost.elements.ghostBody || (body.byAnimation.ghost.elements.ghostBody = {});
  const marker = `TEST${Date.now() % 100000}`;
  const durationMs = 1337;
  el.objectActions = [
    {
      type: 'textProjectile',
      point: { x: 0.5, y: 0.6 },
      direction: -90,
      text: marker,
      color: '#000000',
      fontWeight: '700',
      fontFamily: 'Georgia, serif',
      fontSizeRatio: 0.42,
      durationMs,
      holdRatio: 0.4,
      distanceRatio: 0.71,
      scaleFrom: 0.65,
      scaleTo: 1.15,
      pattern: 'once',
      appliesTo: ['spore']
    }
  ];
  const put = await fetch(`${BASE}/api/cambio/placements`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      byAnimation: body.byAnimation
    })
  });
  ok(put.ok, `PUT placements ${put.status}`);
  const get1 = await fetch(`${BASE}/api/cambio/placements`, { cache: 'no-store' });
  const j1 = await get1.json();
  const act =
    j1.placements?.byAnimation?.ghost?.elements?.ghostBody?.objectActions?.find(
      (a) => a.type === 'textProjectile'
    ) ||
    j1.byAnimation?.ghost?.elements?.ghostBody?.objectActions?.find(
      (a) => a.type === 'textProjectile'
    );
  ok(act?.text === marker, `round-trip text=${act?.text} (want ${marker})`);
  ok(+act?.durationMs === durationMs, `round-trip durationMs=${act?.durationMs}`);
  ok(+act?.distanceRatio === 0.71, `round-trip distanceRatio=${act?.distanceRatio}`);
  ok(act?.fontFamily === 'Georgia, serif', `round-trip fontFamily=${act?.fontFamily}`);
}

// --- Cambio UI: ghost Edit + OA fields ---
{
  console.log('\n== Cambio ghost OA editor UI ==');
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${BASE}/cambio/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#mainCreature', { timeout: 20000 });
  await page.waitForTimeout(800);

  // Prefer test hook (stable); also assert Edit button unlocked in list
  await page.waitForFunction(() => !!window.__cambioTest?.enterEdit, null, { timeout: 20000 });
  const editBtnCount = await page.locator('[data-act="edit"][data-id="ghost"]').count();
  ok(editBtnCount > 0, 'ghost Edit button present (unlocked)');
  await page.evaluate(() => {
    window.__cambioTest.enterEdit('ghost');
    window.__cambioTest.selectElement('ghostBody');
  });
  await page.waitForTimeout(500);
  const oaWrap = page.locator('#oaTextProjectileFields');
  const fieldsVisible = await oaWrap.isVisible().catch(() => false);
  ok(fieldsVisible, 'oaTextProjectileFields visible for ghost');

  for (const id of ['oaTextView', 'oaDurationView', 'oaDistanceView', 'oaFontFamilyView', 'oaFontSizeView']) {
    const el = page.locator(`#${id}`);
    const txt = (await el.textContent().catch(() => ''))?.trim() || '';
    ok(!!txt && txt !== '—', `${id} shows value (${txt})`);
  }

  // Edit duration in isolation
  await page.click('#btnEditOaDuration');
  await page.waitForSelector('.ie-row[data-mode="oaDuration"].is-editing', { timeout: 5000 });
  await page.fill('#oaDurationInput', '1450');
  // Confirm other pencils disabled
  const otherDisabled = await page.locator('#btnEditOaText').isDisabled();
  ok(otherDisabled, 'editing duration disables other pencils');
  await page.click('#btnSaveOaDuration');
  await page.waitForTimeout(300);
  const durView = (await page.locator('#oaDurationView').textContent()) || '';
  ok(durView.includes('1450'), `duration view updated (${durView})`);

  // Screenshot
  await page.screenshot({
    path: 'tmp/ghost-cambio-oa-editor.png',
    fullPage: false
  });
  console.log('  wrote tmp/ghost-cambio-oa-editor.png');

  await page.close();
}

await browser.close();
if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll Cambio ghost OA checks passed');
