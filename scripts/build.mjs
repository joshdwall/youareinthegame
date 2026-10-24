#!/usr/bin/env node
/**
 * Stage youareinthegame static assets into dist/ for Cloudflare Pages (MVP + prod).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(SITE_DIR, 'dist');

const FILES = ['index.html', 'styles.css', 'script.js', 'mainConfig.js'];
const DIRS = [
  'effects',
  'img',
  'content',
  'assets',
  'runtime',
  'vignettes',
  'global-effects'
];

function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(rel) {
  const src = path.join(SITE_DIR, rel);
  const dest = path.join(OUT_DIR, rel);
  if (!fs.existsSync(src)) {
    console.warn(`[skip] missing: ${rel}`);
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function copyDir(rel) {
  const src = path.join(SITE_DIR, rel);
  const dest = path.join(OUT_DIR, rel);
  if (!fs.existsSync(src)) {
    console.warn(`[skip] missing dir: ${rel}/`);
    return;
  }
  fs.cpSync(src, dest, { recursive: true });
}

function main() {
  rmrf(OUT_DIR);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let count = 0;
  for (const rel of FILES) {
    if (copyFile(rel)) count += 1;
  }
  for (const rel of DIRS) {
    copyDir(rel);
    count += 1;
  }

  console.log(`[stage-pages] youareinthegame → dist (${count} roots)`);
}

main();
