#!/usr/bin/env node
/**
 * Fail if any scanned image exceeds the site image budget (default 150 KiB).
 * Usage: node scripts/check-image-budget.mjs [--root dist]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const scanRoot = path.resolve(ROOT, rootIdx >= 0 ? args[rootIdx + 1] : '.');
const budget = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/image-budget.json'), 'utf8'));
const MAX = budget.maxBytes || 153600;
const allow = new Set(budget.allowlist || []);

const EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);

function shouldIgnore(rel) {
  const n = rel.replace(/\\/g, '/');
  if (n.includes('node_modules/') || n.includes('.git/') || n.includes('capture/') || n.includes('test-results/') || n.startsWith('dist/') || n.includes('/dist/')) return true;
  if (n.includes('cambio/vendor/')) return true;
  // Legacy oversized source kept for provenance; optimized siblings are what ship in HTML.
  if (n.endsWith('Now With Spores Large Image Circular Blue Orange.png')) return true;
  return false;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const rel = path.relative(scanRoot, abs);
    if (shouldIgnore(rel)) continue;
    if (ent.isDirectory()) walk(abs, out);
    else if (EXT.has(path.extname(ent.name).toLowerCase())) out.push(abs);
  }
  return out;
}

const files = walk(scanRoot);
const offenders = [];
const rows = [];
for (const abs of files) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  const size = fs.statSync(abs).size;
  rows.push({ rel, size });
  if (size > MAX && !allow.has(rel)) offenders.push({ rel, size });
}

rows.sort((a, b) => b.size - a.size);
console.log(`Image budget check: max ${MAX} bytes (${(MAX / 1024).toFixed(1)} KiB); scanned ${rows.length} under ${path.relative(ROOT, scanRoot) || '.'}`);
for (const r of rows.slice(0, 15)) {
  const flag = r.size > MAX ? ' FAIL' : ' ok';
  console.log(`  ${String(r.size).padStart(9)}  ${r.rel}${flag}`);
}
if (offenders.length) {
  console.error(`\n${offenders.length} image(s) over budget:`);
  for (const o of offenders) console.error(`  ${o.rel}: ${o.size} bytes`);
  process.exit(1);
}
console.log('All images within budget.');
