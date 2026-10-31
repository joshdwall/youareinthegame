#!/usr/bin/env node
/**
 * Vendor the exact enVivo desk menu shell pieces + mountEvScrollList into
 * cambio/vendor/envivo-ui/. Pin to ENVIVO_REV (default: sibling ../enVivo HEAD
 * or ENVIVO_PIN.json). Never invent look-alikes — copy the modules enVivo features import.
 *
 * On Cloudflare Pages builds: skip if ENVIVO_PIN.json already present unless FORCE_ENVIVO_UI_SYNC=1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..');
const OUT = path.join(SITE_DIR, 'cambio', 'vendor', 'envivo-ui');
const PIN_FILE = path.join(OUT, 'ENVIVO_PIN.json');

const FILES = [
  'shared/ui/ev-scroll-list/mount.mjs',
  'shared/ui/ev-scroll-list/defaults.mjs',
  'shared/ui/ev-scroll-list/toolbar.mjs',
  'shared/ui/ev-scroll-list/autofit.mjs',
  'shared/ui/ev-scroll-list/ev-scroll-list.css',
  'shared/ui/coreui-card-table.mjs',
  'shared/ui/desk-list.mjs',
  'shared/ui/desk-list-sort.mjs',
  'shared/ui/vendor/coreui-recipes.bundle.mjs',
  'shared/tokens/envivo-tokens.css'
];

function resolveEnvivoRoot() {
  if (process.env.ENVIVO_ROOT) return path.resolve(process.env.ENVIVO_ROOT);
  for (const cand of [
    path.resolve(SITE_DIR, '..', 'enVivo'),
    path.resolve(SITE_DIR, '..', 'envivo'),
    path.resolve(SITE_DIR, '..', 'ev')
  ]) {
    if (fs.existsSync(path.join(cand, 'shared', 'ui', 'ev-scroll-list', 'mount.mjs'))) return cand;
  }
  return null;
}

function mapDest(rel) {
  if (rel.startsWith('shared/ui/')) return path.join(OUT, rel.slice('shared/ui/'.length));
  if (rel.startsWith('shared/tokens/')) return path.join(OUT, 'tokens', rel.slice('shared/tokens/'.length));
  throw new Error(`unmapped ${rel}`);
}

function main() {
  const force = process.env.FORCE_ENVIVO_UI_SYNC === '1';
  const pinExists = fs.existsSync(PIN_FILE);
  const root = resolveEnvivoRoot();
  if (!force && pinExists && !root) {
    console.log('[sync-envivo-ui] vendor present — skip (set FORCE_ENVIVO_UI_SYNC=1 or ENVIVO_ROOT)');
    return;
  }
  if (!root) throw new Error('[sync-envivo-ui] enVivo root not found');
  const rev = (process.env.ENVIVO_REV || execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' })).trim();

  for (const rel of FILES) {
    const src = path.join(root, rel);
    if (!fs.existsSync(src)) throw new Error(`missing ${src}`);
    const dest = mapDest(rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  // Absolute skin href for /cambio/ pages
  const mountPath = path.join(OUT, 'ev-scroll-list', 'mount.mjs');
  let mount = fs.readFileSync(mountPath, 'utf8');
  mount = mount.replace(
    /link\.href = ['"][^'"]*ev-scroll-list\.css['"]/,
    "link.href = '/cambio/vendor/envivo-ui/ev-scroll-list/ev-scroll-list.css'"
  );
  fs.writeFileSync(mountPath, mount);

  // Keep sidebar-shell.css if already authored (not from enVivo wholesale)
  const shellCss = path.join(OUT, 'sidebar-shell.css');
  if (!fs.existsSync(shellCss)) {
    fs.writeFileSync(
      shellCss,
      `/* Cambio sidebar sizing over CoreUI .sidebar — see ENVIVO_PIN.json */\n:root{--cambio-sidebar-width:36rem;--cui-sidebar-occupy-start:var(--cambio-sidebar-width);}\n#sidebar.sidebar.sidebar-fixed{width:var(--cambio-sidebar-width);--cui-sidebar-occupy-start:var(--cambio-sidebar-width);z-index:40;display:flex;flex-direction:column;max-height:100vh;overflow:hidden;}\n#sidebar .sidebar-header{display:flex;align-items:center;gap:.5rem;flex:0 0 auto;padding:.55rem .75rem;}\n#sidebar .sidebar-brand-full{font-size:1.05rem;font-weight:700;white-space:nowrap;}\n#sidebar .cambio-sidebar-body{flex:1 1 auto;min-height:0;overflow:auto;padding:.5rem .55rem .75rem;}\n`
    );
  }

  const pin = {
    source: 'joshdwall/enVivo',
    rev,
    syncedAt: new Date().toISOString(),
    components: {
      menu: {
        markup: 'CoreUI #sidebar.sidebar.sidebar-fixed (apps/envivo-dashboard/index.html)',
        css: ['cdn @coreui/coreui@5.2.0', 'sidebar-shell.css', 'tokens/envivo-tokens.css']
      },
      scrollableList: {
        module: 'ev-scroll-list/mount.mjs',
        export: 'mountEvScrollList',
        enVivoPath: 'shared/ui/ev-scroll-list/mount.mjs'
      }
    },
    files: FILES
  };
  fs.writeFileSync(PIN_FILE, JSON.stringify(pin, null, 2) + '\n');
  console.log(`[sync-envivo-ui] pinned enVivo@${rev.slice(0, 12)} → ${OUT}`);
}

main();
