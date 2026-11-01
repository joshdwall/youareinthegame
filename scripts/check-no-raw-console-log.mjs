#!/usr/bin/env node
/**
 * Fail if site JS (outside js/log.js) uses raw console.log / console.info / console.debug.
 * Allowlist: easter-egg curious / console-art lines in script.js.
 * console.warn / console.error are allowed (and preferred via js/log.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCAN_ROOTS = ['script.js', 'js', 'effects', 'runtime', 'cambio/cambio.js', 'functions'];
const SKIP_DIR_PARTS = new Set(['vendor', 'node_modules', 'dist']);

/** Line substrings that may keep raw console.log (curious / art). */
const ALLOW_LINE_SUBSTR = [
  'console.log(msg.message)',
  'CONFIG.CONSOLE_ART.EMOJI',
  'CONFIG.CONSOLE_ART.MESSAGE',
  "curious, aren't you",
  'curious aren\\\'t you'
];

const FORBIDDEN = /\bconsole\.(log|info|debug)\s*\(/;

function shouldSkip(rel) {
  const parts = rel.split(/[/\\]/);
  return parts.some((p) => SKIP_DIR_PARTS.has(p));
}

function* walk(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  const st = fs.statSync(abs);
  if (st.isFile()) {
    yield rel;
    return;
  }
  for (const name of fs.readdirSync(abs)) {
    const child = path.join(rel, name);
    if (shouldSkip(child)) continue;
    const cst = fs.statSync(path.join(ROOT, child));
    if (cst.isDirectory()) yield* walk(child);
    else if (/\.(js|mjs|cjs)$/.test(name)) yield child;
  }
}

const offenders = [];
for (const root of SCAN_ROOTS) {
  for (const rel of walk(root)) {
    if (rel === 'js/log.js' || rel.replace(/\\/g, '/') === 'js/log.js') continue;
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const lines = text.split(/\n/);
    lines.forEach((line, i) => {
      if (!FORBIDDEN.test(line)) return;
      if (ALLOW_LINE_SUBSTR.some((s) => line.includes(s))) return;
      offenders.push(`${rel}:${i + 1}:${line.trim()}`);
    });
  }
}

if (offenders.length) {
  console.error('Raw console.log/info/debug found outside js/log.js (use import from js/log.js):');
  for (const o of offenders) console.error('  ' + o);
  process.exit(1);
}
console.log('check-no-raw-console-log: ok');
