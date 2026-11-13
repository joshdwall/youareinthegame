#!/usr/bin/env node
/**
 * Vendor the pinned site-hub shared/communications release (config/comm-source.json) into this repo.
 * Cloudflare's Git build cannot clone the private site-hub repo, so the tagged tree is committed and
 * tests/communications-pin.test.mjs checks its hash against the pin. To upgrade: set tag + sha in
 * config/comm-source.json, run `node scripts/sync-communications.mjs`, commit. Never edit the vendored files by hand.
 *   server/  -> functions/_shared/communications/server/   (Pages Functions)
 *   client/  -> js/comm/                                      (static, browser)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeHash } from './comm-tree-hash.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(fs.readFileSync(path.join(root, 'config', 'comm-source.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'comm-'));
const sh = (a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
sh(['clone', '--quiet', '--depth', '1', '--branch', pin.tag, `https://github.com/${pin.repo}.git`, tmp]);
const sha = sh(['-C', tmp, 'rev-parse', 'HEAD']);
if (sha !== pin.sha) {
  console.error(`${pin.repo}@${pin.tag} is ${sha}, comm-source.json says ${pin.sha}. STOP.`);
  process.exit(2);
}
for (const [from, to] of Object.entries(pin.vendor)) {
  const dest = path.join(root, to);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(path.join(tmp, pin.path, from), dest, { recursive: true });
}
pin.treeHash = treeHash(root, Object.values(pin.vendor));
fs.writeFileSync(path.join(root, 'config', 'comm-source.json'), `${JSON.stringify(pin, null, 2)}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`vendored ${pin.repo}@${pin.tag} (${sha.slice(0, 7)}) treeHash ${pin.treeHash.slice(0, 12)}`);
