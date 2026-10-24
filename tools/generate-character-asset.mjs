#!/usr/bin/env node
/**
 * Generate or register a character/vignette image asset (MVP: copy placeholder or user file).
 *
 * Usage:
 *   node tools/generate-character-asset.mjs --site youareinthegame --character pirate-mushroom --asset hat --from path/to/hat.png
 *   node tools/generate-character-asset.mjs --site youareinthegame --vignette cannons --asset cannon --prompt "pirate cannon side view"
 *
 * --prompt is recorded in registry meta; local AI generation is Phase 3 (ComfyUI/Replicate adapter).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = {
    site: 'youareinthegame',
    character: null,
    vignette: null,
    asset: null,
    from: null,
    prompt: null
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--site' && argv[i + 1]) out.site = argv[++i];
    else if (a === '--character' && argv[i + 1]) out.character = argv[++i];
    else if (a === '--vignette' && argv[i + 1]) out.vignette = argv[++i];
    else if (a === '--asset' && argv[i + 1]) out.asset = argv[++i];
    else if (a === '--from' && argv[i + 1]) out.from = argv[++i];
    else if (a === '--prompt' && argv[i + 1]) out.prompt = argv[++i];
  }
  if (!out.asset) throw new Error('--asset <name> required');
  if (!out.character && !out.vignette) {
    throw new Error('--character <id> or --vignette <id> required');
  }
  return out;
}

function defaultDest(args) {
  if (args.character) {
    return path.join('assets', 'characters', args.character, `${args.asset}.png`);
  }
  return path.join('assets', 'vignettes', args.vignette, `${args.asset}.png`);
}

function defaultSource(args) {
  const spore = path.join(SITE_DIR, 'effects', 'spore', 'mushroom-platypus-spores.png');
  const mushroom = path.join(SITE_DIR, 'img', 'mushroom-platypus.png');
  if (fs.existsSync(spore)) return spore;
  if (fs.existsSync(mushroom)) return mushroom;
  throw new Error('No placeholder source image found in site');
}

function main() {
  const args = parseArgs(process.argv);
  const relDest = defaultDest(args);
  const dest = path.join(SITE_DIR, relDest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (args.from) {
    const src = path.resolve(args.from);
    if (!fs.existsSync(src)) throw new Error(`Source not found: ${src}`);
    fs.copyFileSync(src, dest);
    console.log(`[generate-character-asset] copied → ${relDest}`);
  } else if (args.prompt) {
    const src = defaultSource(args);
    fs.copyFileSync(src, dest);
    console.log(`[generate-character-asset] prompt logged; placeholder copied → ${relDest}`);
    console.log(`[generate-character-asset] prompt: ${args.prompt}`);
    console.log('[generate-character-asset] Phase 3: wire ComfyUI/Replicate provider here.');
  } else {
    const src = defaultSource(args);
    fs.copyFileSync(src, dest);
    console.log(`[generate-character-asset] placeholder → ${relDest}`);
  }

  console.log(`[generate-character-asset] Update characters-registry / vignettes-registry paths if needed.`);
}

main();
