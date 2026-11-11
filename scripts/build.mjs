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

const FILES = ['_routes.json', '_headers', 'index.html', 'styles.css', 'script.js', 'mainConfig.js', 'favicon.ico', 'favicon.png', 'favicon.svg', 'apple-touch-icon.png'];
const DIRS = [
  'effects',
  'img',
  'content',
  'assets',
  'runtime',
  'js'
  ,'worldmap', 'contact'
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


const MODULE_CACHE_BUST = 'spore-timing2';

function bustImportUrl(spec) {
  if (!spec || /^(https?:|data:|blob:)/i.test(spec)) return spec;
  if (!/\.js(?:\?|$)/.test(spec)) return spec;
  if (/[?&]v=/.test(spec)) return spec;
  return `${spec}${spec.includes('?') ? '&' : '?'}v=${MODULE_CACHE_BUST}`;
}

function bustStagedModuleImports(root) {
  const skip = new Set(['.git']);
  const walk = (dir, out = []) => {
    for (const name of fs.readdirSync(dir)) {
      if (skip.has(name)) continue;
      const abs = path.join(dir, name);
      const st = fs.statSync(abs);
      if (st.isDirectory()) walk(abs, out);
      else if (name.endsWith('.js')) out.push(abs);
    }
    return out;
  };
  const reFrom = /(\bfrom\s+)(['"`])([^'"`]+?)\2/g;
  const reImport = /(\bimport\s*\(\s*)(['"`])([^'"`]+?)\2(\s*\))/g;
  let files = 0;
  for (const file of walk(root)) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (rel.startsWith('assets/') || rel.startsWith('node_modules/')) continue;
    const src = fs.readFileSync(file, 'utf8');
    const next = src
      .replace(reFrom, (m, pre, q, spec) => `${pre}${q}${bustImportUrl(spec)}${q}`)
      .replace(reImport, (m, pre, q, spec, post) => `${pre}${q}${bustImportUrl(spec)}${q}${post}`);
    if (next !== src) {
      fs.writeFileSync(file, next);
      files += 1;
    }
  }
  return MODULE_CACHE_BUST;
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

  const cacheBust = bustStagedModuleImports(OUT_DIR);
  console.log(`[stage-pages] youareinthegame → dist (${count} roots, module ?v=${cacheBust})`);
}

main();
