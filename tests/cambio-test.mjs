#!/usr/bin/env node
// Cambio admin smoke. Usage: node tests/cambio-test.mjs https://host
// Does not require Access if host serves /cambio publicly (pages.dev). On app. host expect Access redirect without cookies.
import { chromium } from 'playwright';
const U = (process.argv[2] || 'http://localhost:8788').replace(/\/$/, '');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const res = await page.goto(`${U}/cambio/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
const url = page.url();
const status = res?.status();
const accessWall = /cloudflareaccess\.com|Access/i.test(url) || status === 302 || await page.title().then(t => /Cloudflare Access|Sign in/i.test(t)).catch(() => false);
if (accessWall) {
  console.log('PASS accessEnforced (login wall or redirect)');
  console.log(`url=${url} status=${status}`);
  await page.screenshot({ path: '/workspace/cambio-access-wall.png' }).catch(() => {});
  await browser.close();
  process.exit(0);
}
await page.waitForSelector('#animList', { timeout: 15000 });
await page.waitForTimeout(800);
const checks = await page.evaluate(async () => {
  const labels = [...document.querySelectorAll('#animList .label')].map((e) => e.textContent.trim());
  const ghostLi = [...document.querySelectorAll('#animList li')].find((li) => /Ghost/i.test(li.textContent));
  const cowboyLi = [...document.querySelectorAll('#animList li')].find((li) => /Cowboy/i.test(li.textContent));
  const ghostPlayOnly = ghostLi && /play-only/i.test(ghostLi.textContent) && !/[>]Edit</.test(ghostLi.innerHTML) && !Array.from(ghostLi.querySelectorAll('button')).some((b) => b.textContent === 'Edit');
  const cowboyHasEdit = cowboyLi && Array.from(cowboyLi.querySelectorAll('button')).some((b) => b.textContent === 'Edit');
  // Play cowboy
  const playBtn = cowboyLi && [...cowboyLi.querySelectorAll('button')].find((b) => b.textContent === 'Play');
  if (playBtn) playBtn.click();
  await new Promise((r) => setTimeout(r, 1200));
  const propsAfterPlay = document.querySelectorAll('.cambio-prop').length;
  // Edit
  const editBtn = cowboyLi && [...cowboyLi.querySelectorAll('button')].find((b) => b.textContent === 'Edit');
  if (editBtn) editBtn.click();
  await new Promise((r) => setTimeout(r, 400));
  const editVisible = !document.getElementById('editSection').classList.contains('hidden');
  const elNames = [...document.querySelectorAll('#elementList .label')].map((e) => e.textContent);
  const transitionOpts = [...document.querySelectorAll('#transitionSelect option')].map((o) => o.value);
  return {
    labels,
    ghostPlayOnly,
    cowboyHasEdit,
    propsAfterPlay,
    editVisible,
    elNames,
    transitionOpts,
    hasCreature: !!document.getElementById('mainCreature')
  };
});
const results = {
  hasGhostAndCowboy: checks.labels.includes('Ghost') && checks.labels.includes('Cowboy'),
  ghostPlayOnly: !!checks.ghostPlayOnly,
  cowboyEditable: !!checks.cowboyHasEdit,
  playShowsProps: checks.propsAfterPlay >= 3,
  editMenu: checks.editVisible && checks.elNames.some((n) => /hat/i.test(n)) && checks.elNames.some((n) => /mustache/i.test(n)),
  lightningOption: checks.transitionOpts.includes('lightning'),
  noErrors: errors.length === 0
};
let fail = 0;
for (const [k, v] of Object.entries(results)) {
  if (!v) fail++;
  console.log(`${v ? 'PASS' : 'FAIL'} ${k}`);
}
console.log(JSON.stringify({ checks, errors: errors.slice(0, 3) }));
await page.screenshot({ path: '/workspace/cambio-ui.png' });
await browser.close();
process.exit(fail ? 1 : 0);
