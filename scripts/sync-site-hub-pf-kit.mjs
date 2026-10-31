#!/usr/bin/env node
/**
 * Vendor site-hub site-kit desk helpers + styles into cambio/vendor/pf-kit/
 * the same way assemble-site copies into sites/<id>/vendor/pf-kit/.
 *
 * ALWAYS pins to SITE_HUB_TAG (default site-hub-v2026.10.09) via `git archive`.
 * Never copies from a dirty / ahead working tree HEAD.
 *
 * Source repo: SITE_HUB_ROOT env, else sibling ../sh, else clone into .cache/site-hub.
 * On Cloudflare Pages builds (no sibling): skip if vendor/SITE_HUB_PIN.json already
 * present unless FORCE_PF_KIT_SYNC=1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..');
const TAG = process.env.SITE_HUB_TAG || 'site-hub-v2026.10.09';
const OUT = path.join(SITE_DIR, 'cambio', 'vendor', 'pf-kit');
const PIN_FILE = path.join(OUT, 'SITE_HUB_PIN.json');

const FILES = [
  'helpers/esc.mjs',
  'helpers/desk-list.mjs',
  'helpers/desk-controls.mjs',
  'helpers/desk-table.mjs',
  'helpers/desk-sort.mjs',
  'helpers/desk-page.mjs',
  'constants/pf-dom-contract.mjs',
  'styles/pf-semantic-tokens.css',
  'styles/pf-platform-defaults.css',
  'styles/pf-desk-shell.css',
  'styles/pf-desk-table.css',
  'styles/pf-desk-controls.css',
  'styles/pf-desk-fold.css',
  'styles/pf-desk-elevation.css',
  'styles/pf-desk-card-shell.css',
  'styles/pf-desk-page.css',
  'themes/bs-desk-dark/tokens.css'
];

function resolveSiteHubGitDir() {
  if (process.env.SITE_HUB_ROOT) return path.resolve(process.env.SITE_HUB_ROOT);
  const sibling = path.resolve(SITE_DIR, '..', 'sh');
  if (fs.existsSync(path.join(sibling, '.git')) || fs.existsSync(path.join(sibling, 'shared', 'site-kit'))) {
    return sibling;
  }
  const cache = path.join(SITE_DIR, '.cache', 'site-hub');
  if (!fs.existsSync(path.join(cache, '.git'))) {
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    if (fs.existsSync(cache)) fs.rmSync(cache, { recursive: true, force: true });
    console.log(`[sync-pf-kit] cloning joshdwall/site-hub @ ${TAG} → ${cache}`);
    execSync(`git clone --depth 1 --branch ${TAG} https://github.com/joshdwall/site-hub.git ${cache}`, {
      stdio: 'inherit'
    });
  }
  return cache;
}

function stripQueryVersionImports(filePath) {
  if (!filePath.endsWith('.mjs') && !filePath.endsWith('.js')) return;
  let text = fs.readFileSync(filePath, 'utf8');
  const next = text.replace(/(from\s+['"][^'"]+)\?v=[^'"]+(['"])/g, '$1$2');
  if (next !== text) fs.writeFileSync(filePath, next);
}

function main() {
  const force = process.env.FORCE_PF_KIT_SYNC === '1';
  const pinExists = fs.existsSync(PIN_FILE);
  const hasLocalGit =
    process.env.SITE_HUB_ROOT ||
    fs.existsSync(path.resolve(SITE_DIR, '..', 'sh', 'shared', 'site-kit'));
  if (!force && pinExists && !hasLocalGit) {
    console.log('[sync-pf-kit] vendor present — skip (set FORCE_PF_KIT_SYNC=1 or SITE_HUB_ROOT to refresh)');
    return;
  }

  const hub = resolveSiteHubGitDir();
  let rev;
  try {
    rev = execSync(`git -C "${hub}" rev-parse ${TAG}^{commit}`, { encoding: 'utf8' }).trim();
  } catch (err) {
    throw new Error(`site-hub tag ${TAG} not found in ${hub}: ${err.message}`);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-kit-'));
  try {
    execSync(`git -C "${hub}" archive ${TAG} shared/site-kit | tar -x -C "${tmp}"`, { stdio: 'pipe' });
    const kit = path.join(tmp, 'shared', 'site-kit');
    if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    for (const rel of FILES) {
      const src = path.join(kit, rel);
      if (!fs.existsSync(src)) throw new Error(`missing site-kit file at ${TAG}: ${rel}`);
      const dest = path.join(OUT, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      stripQueryVersionImports(dest);
    }
    const pin = {
      tag: TAG,
      rev,
      syncedAt: new Date().toISOString(),
      source: `joshdwall/site-hub@${rev} (tag ${TAG})`,
      files: FILES
    };
    fs.writeFileSync(PIN_FILE, `${JSON.stringify(pin, null, 2)}\n`);
    console.log(`[sync-pf-kit] ${TAG} (${rev.slice(0, 7)}) → cambio/vendor/pf-kit (${FILES.length} files)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
