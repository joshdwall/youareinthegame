#!/usr/bin/env node
/**
 * Smoke — YAITG animation SSOT: registries, modules, assets, previewDemo contract.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const vignettes = readJson('content/vignettes-registry.json');
const effects = readJson('content/global-effects-registry.json');
const chars = readJson('content/characters-registry.json');

assert.ok(chars.characters?.length);
assert.ok(vignettes.vignettes?.length);
assert.ok(effects.effects?.length);

const assetChecks = [];

for (const v of vignettes.vignettes) {
  const modRel = String(v.module).replace(/^\.\//, '');
  assert.ok(exists(modRel), `missing vignette module ${modRel}`);
  if (v.projectile?.sprite) {
    assetChecks.push(v.projectile.sprite);
  }
  if (v.props?.cannonSprite) {
    assetChecks.push(v.props.cannonSprite);
  }

  const modUrl = pathToFileURL(path.join(root, modRel)).href;
  const mod = await import(modUrl);
  const Cls = mod.default;
  assert.equal(typeof Cls, 'function', `default export ${v.id}`);
  assert.equal(typeof Cls.prototype.init, 'function', `${v.id}.init`);
  assert.equal(typeof Cls.prototype.onSporeClick, 'function', `${v.id}.onSporeClick`);
  assert.equal(typeof Cls.prototype.previewDemo, 'function', `${v.id}.previewDemo required for harness Preview`);
}

for (const e of effects.effects) {
  const modRel = String(e.module).replace(/^\.\//, '');
  assert.ok(exists(modRel), `missing effect module ${modRel}`);
  if (e.meta?.sprite) assetChecks.push(e.meta.sprite);
  const modUrl = pathToFileURL(path.join(root, modRel)).href;
  const mod = await import(modUrl);
  assert.equal(typeof mod.default, 'function', `effect ${e.id}`);
  assert.equal(typeof mod.default.prototype.play, 'function', `${e.id}.play`);
}

for (const a of [
  'effects/spore/mushroom-platypus-spores.png',
  'effects/spore/ghost/img/mushroom-platypus-ghost-spores.png',
  'effects/spore/ghost/img/ghost-platypus.png',
  'effects/spore/ghost/effect.css',
  'effects/spore/finale.css',
  ...assetChecks
]) {
  assert.ok(exists(a), `missing asset ${a}`);
}

// Cannons assets must NOT be copies of the default spore (silent visual fail)
function sha256(rel) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
}
const sporeHash = sha256('effects/spore/mushroom-platypus-spores.png');
const cannonHash = sha256('assets/vignettes/cannons/cannon.png');
const pirateHash = sha256('assets/vignettes/cannons/pirate-spore.png');
assert.notEqual(cannonHash, sporeHash, 'cannon.png must be distinct from default spore');
assert.notEqual(pirateHash, sporeHash, 'pirate-spore.png must be distinct from default spore');
assert.notEqual(cannonHash, pirateHash, 'cannon and pirate-spore should differ');

const cannonsSrc = fs.readFileSync(path.join(root, 'vignettes/cannons/effect.js'), 'utf8');
assert.match(cannonsSrc, /fireOutward|fireMode|spawnRing/);
assert.match(cannonsSrc, /previewDemo/);

// Lightning must use ghost play helper (not stub white div only)
const lightningSrc = fs.readFileSync(path.join(root, 'global-effects/lightning/effect.js'), 'utf8');
assert.match(lightningSrc, /GHOST_CONFIG/);
assert.match(lightningSrc, /lightning-flash/);
assert.doesNotMatch(lightningSrc, /global-lightning-flash/);

const scriptSrc = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
assert.match(scriptSrc, /runHarnessPreview/);
assert.match(scriptSrc, /previewDemo/);

console.log(
  '[verify-yaitg-animation-preview] OK',
  vignettes.vignettes.map((v) => v.id).join(','),
  '+',
  effects.effects.map((e) => e.id).join(',')
);
