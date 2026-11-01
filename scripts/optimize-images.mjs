#!/usr/bin/env node
/**
 * Optimize site images into a consistent budget (default ≤150 KiB).
 * Uses sharp. Idempotent: rewrites WebP/AVIF/PNG siblings for known heroes.
 *
 * Usage: node scripts/optimize-images.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry-run');
const budget = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/image-budget.json'), 'utf8'));
const MAX = budget.maxBytes || 153600;

const JOBS = [
  {
    kind: 'sticker',
    src: 'img/Now With Spores Large Image Circular Blue Orange.png',
    outs: [
      { rel: 'img/now-with-spores.webp', format: 'webp', maxEdge: 256, quality: 82 },
      { rel: 'img/now-with-spores.avif', format: 'avif', maxEdge: 256, quality: 50 },
      { rel: 'img/now-with-spores.png', format: 'png', maxEdge: 256, quality: 80 }
    ]
  },
  {
    kind: 'creature',
    src: 'img/mushroom-platypus.png',
    outs: [
      { rel: 'img/mushroom-platypus.webp', format: 'webp', maxEdge: 800, quality: 82 },
      // keep PNG fallback resized if over budget
      { rel: 'img/mushroom-platypus.png', format: 'png', maxEdge: 800, quality: 80, replaceSrc: true }
    ]
  },
  {
    kind: 'overlay',
    src: 'effects/spore/ghost/img/ghost-platypus.png',
    outs: [
      { rel: 'effects/spore/ghost/img/ghost-platypus.webp', format: 'webp', maxEdge: 800, quality: 82 },
      { rel: 'effects/spore/ghost/img/ghost-platypus.png', format: 'png', maxEdge: 800, quality: 80, replaceSrc: true }
    ]
  },
  {
    kind: 'prop',
    src: 'assets/characters/pirate-mushroom/hat.png',
    outs: [
      { rel: 'assets/characters/pirate-mushroom/hat.webp', format: 'webp', maxEdge: 512, quality: 82 },
      { rel: 'assets/characters/pirate-mushroom/hat.png', format: 'png', maxEdge: 512, quality: 80, replaceSrc: true }
    ]
  }
];

async function encode(inputBuf, { format, maxEdge, quality }) {
  let pipeline = sharp(inputBuf, { failOn: 'none' }).rotate();
  const meta = await sharp(inputBuf, { failOn: 'none' }).metadata();
  const w = meta.width || maxEdge;
  const h = meta.height || maxEdge;
  if (Math.max(w, h) > maxEdge) {
    pipeline = pipeline.resize({
      width: w >= h ? maxEdge : undefined,
      height: h > w ? maxEdge : undefined,
      fit: 'inside',
      withoutEnlargement: true
    });
  }
  if (format === 'webp') pipeline = pipeline.webp({ quality, effort: 6 });
  else if (format === 'avif') pipeline = pipeline.avif({ quality, effort: 4 });
  else if (format === 'png') pipeline = pipeline.png({ compressionLevel: 9, palette: true, quality });
  else if (format === 'jpeg') pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  return pipeline.toBuffer();
}

async function ensureUnderBudget(inputBuf, spec) {
  let quality = spec.quality;
  let maxEdge = spec.maxEdge;
  let buf = await encode(inputBuf, { ...spec, quality, maxEdge });
  let guard = 0;
  while (buf.length > MAX && guard < 8) {
    guard++;
    if (quality > 50) quality -= 8;
    else maxEdge = Math.max(64, Math.floor(maxEdge * 0.85));
    buf = await encode(inputBuf, { ...spec, quality, maxEdge });
  }
  return { buf, quality, maxEdge };
}

async function main() {
  const report = [];
  for (const job of JOBS) {
    const srcPath = path.join(ROOT, job.src);
    if (!fs.existsSync(srcPath)) {
      console.warn(`[skip] missing ${job.src}`);
      continue;
    }
    const input = fs.readFileSync(srcPath);
    const before = input.length;
    for (const out of job.outs) {
      const { buf, quality, maxEdge } = await ensureUnderBudget(input, out);
      const dest = path.join(ROOT, out.rel);
      if (!DRY) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
      }
      report.push({
        kind: job.kind,
        src: job.src,
        out: out.rel,
        before,
        after: buf.length,
        format: out.format,
        quality,
        maxEdge
      });
      console.log(
        `${out.rel}: ${(before / 1024).toFixed(1)}KB → ${(buf.length / 1024).toFixed(1)}KB (${out.format}, q=${quality}, edge≤${maxEdge})`
      );
    }
  }
  const reportPath = path.join(ROOT, 'config/image-optimize-last-run.json');
  if (!DRY) fs.writeFileSync(reportPath, JSON.stringify({ at: new Date().toISOString(), report }, null, 2));
  console.log(DRY ? '[dry-run] no files written' : `wrote ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
