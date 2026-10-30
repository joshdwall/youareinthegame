#!/usr/bin/env node
/**
 * Cambio admin smoke against the Access-gated custom domain.
 * Usage: node tests/cambio-test.mjs https://app.youareinthegame.com
 * Expectation without cookies: Cloudflare Access login wall (same IdP as enVivo).
 * Does NOT use or accept pages.dev hosts.
 */
import { chromium } from 'playwright';

const raw = (process.argv[2] || 'https://app.youareinthegame.com').replace(/\/$/, '');
if (/\.pages\.dev$/i.test(new URL(raw).hostname)) {
  console.error('FAIL: pages.dev hosts are forbidden for Cambio verification');
  process.exit(2);
}

const U = raw;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const res = await page.goto(`${U}/cambio/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(1500);
const url = page.url();
const title = await page.title().catch(() => '');
const accessWall =
  /cloudflareaccess\.com/i.test(url) ||
  /Sign in|Cloudflare Access/i.test(title) ||
  (res && res.status() === 302);

console.log(`${accessWall ? 'PASS' : 'FAIL'} accessWall`);
console.log(`url=${url}`);
console.log(`title=${title}`);
await page.screenshot({ path: '/workspace/cambio-access-login.png', fullPage: true }).catch(() => {});
await browser.close();
process.exit(accessWall ? 0 : 1);
